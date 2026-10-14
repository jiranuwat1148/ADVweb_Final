import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { decodeStoredPlan } from "./plan-source";
import { HttpError } from "./errors";
import { deliveryTime } from "./validation";
import { calculateDeliveryFeeSatang, satangToBaht, BOX_PRICE_BAHT, FOOD_COST_BAHT } from "./pricing";

export async function readPlan(db: Pick<PoolConnection, "execute">, id: number, lock = false) {
  const [plans] = await db.execute<RowDataPacket[]>(
    `SELECT id, DATE_FORMAT(delivery_date, '%Y-%m-%d') AS delivery_date,
      DATE_FORMAT(departure_at, '%Y-%m-%d %H:%i:%s') AS departure_at,
      DATE_FORMAT(deadline_at, '%Y-%m-%d %H:%i:%s') AS deadline_at,
      status, plan_json FROM delivery_plans WHERE id = ?${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  const plan = plans[0];
  if (!plan) throw new HttpError(404, "ไม่พบแผนจัดส่ง");
  const stored = decodeStoredPlan(plan.plan_json);
  const [jobs] = await db.execute<RowDataPacket[]>(
    "SELECT id, job_code, color, distance_m, geometry_json FROM delivery_jobs WHERE plan_id = ? ORDER BY id", [id],
  );
  const [stops] = await db.execute<RowDataPacket[]>(
    `SELECT s.id, s.job_id, s.order_id, s.sequence_no,
      DATE_FORMAT(s.estimated_delivery_at, '%Y-%m-%d %H:%i:%s') AS estimated_delivery_at
     FROM delivery_stops s JOIN delivery_jobs j ON j.id = s.job_id
     WHERE j.plan_id = ? ORDER BY j.id, s.sequence_no`, [id],
  );
  const sourceById = new Map(stored.source.map(order => [order.id, order]));
  const outputJobs = jobs.map((job, index) => {
    const calculation = stored.calculation.jobs[index];
    if (!calculation) throw new HttpError(409, "ใบงานในแผนไม่ครบ กรุณาคำนวณใหม่");
    const outputStops = stops.filter(stop => Number(stop.job_id) === Number(job.id)).map(stop => {
      const order = sourceById.get(Number(stop.order_id));
      if (!order) throw new HttpError(409, "ข้อมูลจุดส่งไม่ตรงกับแผน กรุณาคำนวณใหม่");
      return {
        id: Number(stop.id), order_id: order.id, customer_id: order.customer_id,
        customer_name: order.customer_name, phone: order.customer_phone,
        address: order.address, latitude: order.latitude, longitude: order.longitude,
        quantity: order.quantity, sequence_no: Number(stop.sequence_no),
        estimated_delivery_at: String(stop.estimated_delivery_at),
      };
    });
    let geometry: unknown = job.geometry_json;
    if (typeof geometry === "string") {
      try { geometry = JSON.parse(geometry); } catch { geometry = null; }
    }
    return {
      id: Number(job.id), job_code: String(job.job_code), color: String(job.color),
      distance_m: Number(job.distance_m), total_boxes: calculation.total_boxes,
      delivery_fee: calculation.delivery_fee, geometry, stops: outputStops,
    };
  });
  const result = {
    id: Number(plan.id), delivery_date: String(plan.delivery_date),
    departure_at: String(plan.departure_at), deadline_at: String(plan.deadline_at),
    status: String(plan.status) as "DRAFT" | "CONFIRMED",
    routing_mode: stored.routing_mode, is_simulation: stored.routing_mode === "straight_line",
    shop: stored.shop, settings: stored.settings,
    summary: { ...stored.calculation.summary, estimated_finish_at: deliveryTime(String(plan.delivery_date), stored.calculation.summary.last_delivery_minutes) },
    jobs: outputJobs,
    stored,
  };
  validatePlanCoverage(result);
  return result;
}

export type PlanDetails = Awaited<ReturnType<typeof readPlan>>;

export function validatePlanCoverage(plan: PlanDetails): void {
  if (plan.departure_at !== `${plan.delivery_date} 11:30:00` || plan.deadline_at !== `${plan.delivery_date} 12:30:00` || !plan.jobs.length) {
    throw new HttpError(409, "เวลาออกส่งหรือข้อมูลแผนไม่ถูกต้อง กรุณาคำนวณใหม่");
  }
  const sourceIds = new Set(plan.stored.source.map(order => order.id));
  const seen = new Set<number>();
  let totalBoxes = 0;
  let totalDistance = 0;
  let feeSatang = 0;
  let lastElapsed = 0;
  if (sourceIds.size !== plan.stored.source.length || plan.jobs.length !== plan.stored.calculation.jobs.length) {
    throw new HttpError(409, "แผนมีรายการซ้ำหรือใบงานไม่ครบ");
  }
  if (plan.stored.source.some(order => order.delivery_date !== plan.delivery_date)) throw new HttpError(409, "วันที่ออเดอร์ไม่ตรงกับแผน");
  plan.jobs.forEach((job, index) => {
    const calculation = plan.stored.calculation.jobs[index]!;
    if (job.stops.length < 1 || job.stops.length > 3 || job.distance_m !== calculation.distance_m || job.stops.length !== calculation.order_ids.length) {
      throw new HttpError(409, "จำนวนจุดส่งหรือระยะทางในใบงานไม่ถูกต้อง");
    }
    const geometry = job.geometry as { type?: string; coordinates?: unknown } | null;
    if (!geometry || geometry.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 ||
        geometry.coordinates.some((point: unknown) => !Array.isArray(point) || point.length !== 2 ||
          typeof point[0] !== "number" || !Number.isFinite(point[0]) || Math.abs(point[0]) > 180 ||
          typeof point[1] !== "number" || !Number.isFinite(point[1]) || Math.abs(point[1]) > 90)) {
      throw new HttpError(409, "รูปเส้นทางในแผนไม่ถูกต้อง กรุณาคำนวณใหม่");
    }
    let jobBoxes = 0;
    let previousElapsed = -1;
    job.stops.forEach((stop, sequence) => {
      const expected = calculation.stops[sequence];
      if (!expected || seen.has(stop.order_id) || !sourceIds.has(stop.order_id) || stop.sequence_no !== sequence + 1 ||
          stop.order_id !== calculation.order_ids[sequence] || stop.quantity < 1 || stop.quantity > 3 ||
          expected.order_id !== stop.order_id || expected.sequence_no !== stop.sequence_no ||
          expected.elapsed_minutes <= previousElapsed || expected.elapsed_minutes > 60 - plan.settings.buffer_minutes ||
          stop.estimated_delivery_at !== deliveryTime(plan.delivery_date, expected.elapsed_minutes)) {
        throw new HttpError(409, "จุดส่งซ้ำ ข้อมูลไม่ตรง หรือส่งไม่ทันเวลา กรุณาคำนวณใหม่");
      }
      seen.add(stop.order_id);
      jobBoxes += stop.quantity;
      previousElapsed = expected.elapsed_minutes;
      lastElapsed = Math.max(lastElapsed, expected.elapsed_minutes);
    });
    const expectedFee = calculateDeliveryFeeSatang(jobBoxes, job.distance_m);
    if (jobBoxes !== job.total_boxes || job.delivery_fee !== satangToBaht(expectedFee)) throw new HttpError(409, "จำนวนกล่องหรือค่าส่งในใบงานไม่ตรงกัน");
    totalBoxes += jobBoxes;
    totalDistance += job.distance_m;
    feeSatang += expectedFee;
  });
  const summary = plan.summary;
  if (summary.order_count !== sourceIds.size || summary.total_boxes !== totalBoxes || summary.rider_count !== plan.jobs.length ||
      summary.total_distance_m !== totalDistance || summary.revenue !== totalBoxes * BOX_PRICE_BAHT ||
      summary.food_cost !== totalBoxes * FOOD_COST_BAHT || summary.delivery_fee !== satangToBaht(feeSatang) ||
      summary.estimated_profit !== satangToBaht(totalBoxes * (BOX_PRICE_BAHT - FOOD_COST_BAHT) * 100 - feeSatang) ||
      Math.abs(summary.last_delivery_minutes - lastElapsed) > 1e-9) {
    throw new HttpError(409, "ยอดรวมและเวลาในแผนไม่ตรงกับใบงาน กรุณาคำนวณใหม่");
  }
  if (seen.size !== sourceIds.size) throw new HttpError(409, "แผนยังครอบคลุมออเดอร์ไม่ครบ");
}

export function publicPlan(plan: PlanDetails, stale = false) {
  const { stored: _private, ...output } = plan;
  return { ...output, stale, can_confirm: plan.status === "DRAFT" && !stale };
}
