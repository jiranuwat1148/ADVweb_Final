import { BOX_PRICE_BAHT, FOOD_COST_BAHT, calculateDeliveryFeeSatang, satangToBaht } from './pricing';

export interface SourceOrder {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  quantity: number;
  delivery_date: string;
}

export interface ShopLocation { latitude: number; longitude: number; }
export interface PlannerSettings { speed_kmh: number; service_minutes: number; buffer_minutes: number; }
export const defaultSettings: Readonly<PlannerSettings> = Object.freeze({
  speed_kmh: 30, service_minutes: 2, buffer_minutes: 5,
});

export interface PlannedStop { order_id: number; sequence_no: number; elapsed_minutes: number; }
export interface PlannedJob {
  order_ids: number[];
  distance_m: number;
  total_boxes: number;
  delivery_fee: number;
  stops: PlannedStop[];
}
export interface PlanSummary {
  order_count: number;
  total_boxes: number;
  rider_count: number;
  total_distance_m: number;
  revenue: number;
  food_cost: number;
  delivery_fee: number;
  estimated_profit: number;
  last_delivery_minutes: number;
}
export interface PlannedResult { jobs: PlannedJob[]; summary: PlanSummary; }

const EARTH_RADIUS_METERS = 6371000;
const MAX_RADIUS_METERS = 3000;
const DELIVERY_WINDOW_MINUTES = 60;
const MAX_ORDERS_PER_JOB = 3;

function validateCoordinate(point: ShopLocation): void {
  if (!point || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) {
    throw new Error('พิกัดต้องเป็นตัวเลขละติจูด -90 ถึง 90 และลองจิจูด -180 ถึง 180');
  }
}

/** Great-circle distance, used only for the 3 km service-radius rule and explicit simulation. */
export function coordinateDistanceMeters(from: ShopLocation, to: ShopLocation): number {
  validateCoordinate(from);
  validateCoordinate(to);
  const radians = Math.PI / 180;
  const latitudeDelta = (to.latitude - from.latitude) * radians;
  const longitudeDelta = (to.longitude - from.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

function validateInputs(orders: SourceOrder[], shop: ShopLocation, matrix: number[][], settings: PlannerSettings): void {
  validateCoordinate(shop);
  if (!Array.isArray(orders) || orders.length === 0) throw new Error('ไม่มีออเดอร์สำหรับจัดเส้นทาง');
  if (!settings || !Number.isFinite(settings.speed_kmh) || settings.speed_kmh <= 0
    || !Number.isFinite(settings.service_minutes) || settings.service_minutes < 0
    || !Number.isFinite(settings.buffer_minutes) || settings.buffer_minutes < 0
    || settings.buffer_minutes >= DELIVERY_WINDOW_MINUTES) {
    throw new Error('ความเร็ว เวลาส่งมอบ หรือเวลาเผื่อสำหรับจัดเส้นทางไม่ถูกต้อง');
  }
  const orderIds = new Set<number>();
  const deliveryDate = orders[0]!.delivery_date;
  for (const order of orders) {
    if (!Number.isSafeInteger(order.id) || order.id < 1 || orderIds.has(order.id)) {
      throw new Error('เลขออเดอร์ต้องเป็นจำนวนเต็มบวกและไม่ซ้ำกัน');
    }
    orderIds.add(order.id);
    if (!Number.isInteger(order.quantity) || order.quantity < 1 || order.quantity > 3) {
      throw new Error(`ออเดอร์ ${order.id} ต้องมีอาหาร 1–3 กล่อง`);
    }
    if (order.delivery_date !== deliveryDate) throw new Error('ออเดอร์ในแผนต้องเป็นวันจัดส่งเดียวกัน');
    if (coordinateDistanceMeters(shop, order) > MAX_RADIUS_METERS + 0.001) {
      throw new Error(`ออเดอร์ ${order.id} อยู่นอกรัศมีจัดส่ง 3 กิโลเมตร`);
    }
  }
  const size = orders.length + 1;
  if (!Array.isArray(matrix) || matrix.length !== size) throw new Error('ขนาดตารางระยะทางไม่ตรงกับร้านและออเดอร์');
  for (let i = 0; i < size; i++) {
    const row = matrix[i];
    if (!Array.isArray(row) || row.length !== size) throw new Error('ขนาดแถวในตารางระยะทางไม่ถูกต้อง');
    for (let j = 0; j < size; j++) {
      const distance = row[j];
      if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
        throw new Error(`ระยะทางจากจุด ${i} ไป ${j} ใช้งานไม่ได้หรือหาเส้นทางไม่พบ`);
      }
      if (i === j && distance !== 0) throw new Error('ระยะทางจากจุดเดิมไปจุดเดิมต้องเป็นศูนย์');
    }
  }
}

interface Candidate {
  indices: number[];
  distance: number;
  boxes: number;
  feeSatang: number;
  elapsed: number[];
}

function permutations(values: number[]): number[][] {
  if (values.length === 1) return [[values[0]!]];
  return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
    .map(rest => [value, ...rest]));
}

function compareOrderIds(left: Candidate, right: Candidate, orders: SourceOrder[]): number {
  for (let i = 0; i < Math.min(left.indices.length, right.indices.length); i++) {
    const difference = orders[left.indices[i]!]!.id - orders[right.indices[i]!]!.id;
    if (difference !== 0) return difference;
  }
  return left.indices.length - right.indices.length;
}

function bestRoute(indices: number[], orders: SourceOrder[], matrix: number[][], settings: PlannerSettings): Candidate | undefined {
  const boxes = indices.reduce((sum, index) => sum + orders[index]!.quantity, 0);
  const metersPerMinute = settings.speed_kmh * 1000 / 60;
  const latestCompletion = DELIVERY_WINDOW_MINUTES - settings.buffer_minutes;
  let best: Candidate | undefined;
  for (const sequence of permutations(indices)) {
    let previous = 0;
    let distance = 0;
    let elapsed = 0;
    const completions: number[] = [];
    for (const [stopIndex, index] of sequence.entries()) {
      const next = index + 1;
      const leg = matrix[previous]![next]!;
      distance += leg;
      // Persistence stores whole meters. Use the rounded cumulative distance
      // consistently for ETA, and the rounded total for this job's fee.
      elapsed = Math.round(distance) / metersPerMinute + (stopIndex + 1) * settings.service_minutes;
      completions.push(elapsed);
      previous = next;
    }
    if (!Number.isFinite(distance) || !Number.isFinite(elapsed) || elapsed > latestCompletion + 1e-9) continue;
    const roundedDistance = Math.round(distance);
    const candidate: Candidate = { indices: sequence, distance: roundedDistance, boxes, feeSatang: calculateDeliveryFeeSatang(boxes, roundedDistance), elapsed: completions };
    if (!best || candidate.feeSatang < best.feeSatang
      || (candidate.feeSatang === best.feeSatang && candidate.distance < best.distance)
      || (candidate.feeSatang === best.feeSatang && candidate.distance === best.distance
        && compareOrderIds(candidate, best, orders) < 0)) best = candidate;
  }
  return best;
}

/**
 * Greedy cost-saving merge. Checks all <= 6 delivery permutations within each job.
 * Shop is matrix index 0; order i is index i+1. Directed distances remain directed.
 * Riders leave at 11:30 together; completion includes handing over food at each stop.
 * Charges stop at the final customer, without a return-to-shop leg.
 * This heuristic recommends a feasible lower-cost plan; it is not a global optimum.
 */
export function buildPlan(orders: SourceOrder[], shop: ShopLocation, matrix: number[][], settings: PlannerSettings = defaultSettings): PlannedResult {
  validateInputs(orders, shop, matrix, settings);
  const candidates = orders.map((order, index) => {
    const job = bestRoute([index], orders, matrix, settings);
    if (!job) throw new Error(`ออเดอร์ ${order.id} ส่งไม่ทันภายใน ${DELIVERY_WINDOW_MINUTES - settings.buffer_minutes} นาที`);
    return job;
  });
  while (true) {
    let bestMerge: { left: number; right: number; job: Candidate; saving: number } | undefined;
    for (let left = 0; left < candidates.length; left++) {
      for (let right = left + 1; right < candidates.length; right++) {
        const a = candidates[left]!;
        const b = candidates[right]!;
        if (a.indices.length + b.indices.length > MAX_ORDERS_PER_JOB) continue;
        const merged = bestRoute([...a.indices, ...b.indices], orders, matrix, settings);
        if (!merged) continue;
        const saving = a.feeSatang + b.feeSatang - merged.feeSatang;
        if (saving <= 0) continue;
        if (!bestMerge || saving > bestMerge.saving
          || (saving === bestMerge.saving && merged.indices.length > bestMerge.job.indices.length)
          || (saving === bestMerge.saving && merged.indices.length === bestMerge.job.indices.length
            && compareOrderIds(merged, bestMerge.job, orders) < 0)) {
          bestMerge = { left, right, job: merged, saving };
        }
      }
    }
    if (!bestMerge) break;
    candidates[bestMerge.left] = bestMerge.job;
    candidates.splice(bestMerge.right, 1);
  }

  const jobs: PlannedJob[] = candidates.map(job => ({
    order_ids: job.indices.map(index => orders[index]!.id),
    distance_m: job.distance,
    total_boxes: job.boxes,
    delivery_fee: satangToBaht(job.feeSatang),
    stops: job.indices.map((index, stopIndex) => ({
      order_id: orders[index]!.id, sequence_no: stopIndex + 1, elapsed_minutes: job.elapsed[stopIndex]!,
    })),
  }));
  const covered = jobs.flatMap(job => job.order_ids);
  if (covered.length !== orders.length || new Set(covered).size !== orders.length
    || orders.some(order => !covered.includes(order.id))
    || jobs.some(job => job.order_ids.length > MAX_ORDERS_PER_JOB
      || job.stops.length !== job.order_ids.length
      || job.stops.some((stop, i) => stop.order_id !== job.order_ids[i]
        || !Number.isFinite(stop.elapsed_minutes)
        || stop.elapsed_minutes > DELIVERY_WINDOW_MINUTES - settings.buffer_minutes + 1e-9))) {
    throw new Error('แผนจัดส่งมีออเดอร์ตกหล่น ซ้ำ หรือเวลาไม่ถูกต้อง');
  }
  const totalBoxes = orders.reduce((sum, order) => sum + order.quantity, 0);
  const revenueSatang = totalBoxes * BOX_PRICE_BAHT * 100;
  const foodCostSatang = totalBoxes * FOOD_COST_BAHT * 100;
  const feeSatang = candidates.reduce((sum, job) => sum + job.feeSatang, 0);
  return {
    jobs,
    summary: {
      order_count: orders.length,
      total_boxes: totalBoxes,
      rider_count: jobs.length,
      total_distance_m: candidates.reduce((sum, job) => sum + job.distance, 0),
      revenue: satangToBaht(revenueSatang),
      food_cost: satangToBaht(foodCostSatang),
      delivery_fee: satangToBaht(feeSatang),
      estimated_profit: satangToBaht(revenueSatang - foodCostSatang - feeSatang),
      last_delivery_minutes: Math.max(...candidates.map(job => job.elapsed[job.elapsed.length - 1]!)),
    },
  };
}
