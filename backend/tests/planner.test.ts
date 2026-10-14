import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, coordinateDistanceMeters, defaultSettings } from '../services/planner';
import type { ShopLocation, SourceOrder } from '../services/planner';
import { calculateDeliveryFee, calculateDeliveryFeeSatang, satangToBaht } from '../services/pricing';

const shop: ShopLocation = { latitude: 16.246, longitude: 103.251 };
function order(id: number, quantity = 1, overrides: Partial<SourceOrder> = {}): SourceOrder {
  return {
    id, customer_id: id, customer_name: `Customer ${id}`, customer_phone: '0800000000',
    address: null, latitude: shop.latitude + id * 0.0001, longitude: shop.longitude,
    quantity, delivery_date: '2026-10-09', ...overrides,
  };
}
function matrix(size: number, distance = 1000): number[][] {
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => i === j ? 0 : distance));
}

test('30 orders are covered exactly once with no more than three per rider and valid ETAs', () => {
  const orders = Array.from({ length: 30 }, (_, i) => order(i + 1, i % 3 + 1));
  const distances = matrix(31, 300);
  for (let i = 1; i < distances.length; i++) distances[0]![i] = 700 + i * 10;
  const originalOrders = structuredClone(orders);
  const originalDistances = structuredClone(distances);
  const plan = buildPlan(orders, shop, distances);
  const covered = plan.jobs.flatMap(job => job.order_ids).sort((a, b) => a - b);
  assert.deepEqual(covered, orders.map(item => item.id));
  assert.equal(new Set(covered).size, 30);
  for (const job of plan.jobs) {
    assert.ok(job.order_ids.length >= 1 && job.order_ids.length <= 3);
    assert.equal(job.total_boxes, job.order_ids.reduce((sum, id) => sum + orders.find(item => item.id === id)!.quantity, 0));
    assert.deepEqual(job.stops.map(stop => stop.order_id), job.order_ids);
    assert.deepEqual(job.stops.map(stop => stop.sequence_no), job.order_ids.map((_, i) => i + 1));
    assert.ok(job.stops.every(stop => Number.isFinite(stop.elapsed_minutes) && stop.elapsed_minutes <= 55));
    assert.equal(job.delivery_fee, calculateDeliveryFee(job.total_boxes, job.distance_m));
    assert.ok(Number.isInteger(job.distance_m));
  }
  assert.equal(plan.summary.order_count, 30);
  assert.equal(plan.summary.total_boxes, 60);
  assert.equal(plan.summary.rider_count, plan.jobs.length);
  assert.equal(plan.summary.total_distance_m, plan.jobs.reduce((sum, job) => sum + job.distance_m, 0));
  assert.equal(plan.summary.revenue, 3900);
  assert.equal(plan.summary.food_cost, 2400);
  assert.equal(plan.summary.delivery_fee, plan.jobs.reduce((sum, job) => sum + Math.round(job.delivery_fee * 100), 0) / 100);
  assert.equal(plan.summary.estimated_profit, (150000 - Math.round(plan.summary.delivery_fee * 100)) / 100);
  assert.equal(plan.summary.last_delivery_minutes, Math.max(...plan.jobs.flatMap(job => job.stops.map(stop => stop.elapsed_minutes))));
  assert.deepEqual(orders, originalOrders);
  assert.deepEqual(distances, originalDistances);
});

test('uses directed distances and checks delivery permutations instead of input order', () => {
  const distances = [
    [0, 1200, 1000, 1100],
    [1200, 0, 800, 20],
    [1000, 20, 0, 900],
    [1100, 800, 800, 0],
  ];
  const plan = buildPlan([order(1, 2), order(2, 2), order(3, 2)], shop, distances);
  assert.equal(plan.jobs.length, 1);
  assert.deepEqual(plan.jobs[0]!.order_ids, [2, 1, 3]);
  assert.equal(plan.jobs[0]!.distance_m, 1040);
  assert.equal(plan.jobs[0]!.delivery_fee, 27.48);
  assert.deepEqual(plan.jobs[0]!.stops.map(stop => stop.elapsed_minutes), [4, 6.04, 8.08]);
});

test('fee includes one callout and all carried boxes over the entire one-way job', () => {
  const distances = [[0, 2000, 2000, 2000], [2000, 0, 0, 0], [2000, 0, 0, 0], [2000, 0, 0, 0]];
  const plan = buildPlan([order(1, 2), order(2, 2), order(3, 2)], shop, distances);
  assert.deepEqual(plan.summary, {
    order_count: 3, total_boxes: 6, rider_count: 1, total_distance_m: 2000,
    revenue: 390, food_cost: 240, delivery_fee: 39, estimated_profit: 111, last_delivery_minutes: 10,
  });
});

test('rounds whole meters before fees and ETAs, then sums rounded job satang', () => {
  const plan = buildPlan([order(1), order(2)], shop, [[0, 10003.4, 10003.4], [10003.4, 0, 20000], [10003.4, 20000, 0]]);
  assert.equal(plan.jobs.length, 2);
  assert.ok(plan.jobs.every(job => job.distance_m === 10003 && job.delivery_fee === 35.01));
  assert.equal(plan.summary.delivery_fee, 70.02);
  assert.equal(plan.summary.total_distance_m, 20006);
  assert.equal(plan.summary.last_delivery_minutes, 10003 / 500 + 2);
});

test('keeps separate riders when merging would increase the store cost', () => {
  const plan = buildPlan([order(1, 3), order(2, 3)], shop, [[0, 1000, 1000], [1000, 0, 3000], [1000, 3000, 0]]);
  assert.equal(plan.jobs.length, 2);
  assert.equal(plan.summary.delivery_fee, 42);
});

test('deadline counts service time and buffer; exact 55 minute completion is allowed', () => {
  assert.equal(buildPlan([order(1)], shop, [[0, 26500], [26500, 0]]).summary.last_delivery_minutes, 55);
  assert.throws(() => buildPlan([order(1)], shop, [[0, 27000], [27000, 0]]), /ส่งไม่ทัน.*55/);
  assert.equal(buildPlan([order(1)], shop, [[0, 27000], [27000, 0]], { ...defaultSettings, buffer_minutes: 0 }).summary.last_delivery_minutes, 56);
});

test('infeasible merge is rejected while feasible individual jobs remain', () => {
  const plan = buildPlan([order(1), order(2)], shop, [[0, 1000, 1000], [1000, 0, 27000], [1000, 27000, 0]]);
  assert.equal(plan.jobs.length, 2);
  assert.ok(plan.jobs.every(job => job.stops[0]!.elapsed_minutes === 4));
});

test('rejects customers outside the three kilometer radius even when the supplied road matrix is short', () => {
  assert.throws(() => buildPlan([order(1, 1, { latitude: shop.latitude + 0.04 })], shop, matrix(2, 1)), /นอกรัศมี.*3/);
});

test('rejects empty orders, duplicate IDs, invalid quantities and mixed delivery dates', () => {
  assert.throws(() => buildPlan([], shop, [[0]]), /ไม่มีออเดอร์/);
  assert.throws(() => buildPlan([order(1), order(1)], shop, matrix(3)), /ไม่ซ้ำ/);
  assert.throws(() => buildPlan([order(0)], shop, matrix(2)), /เลขออเดอร์/);
  for (const quantity of [0, 4, 1.5, NaN]) {
    assert.throws(() => buildPlan([order(1, quantity)], shop, matrix(2)), /1–3/);
  }
  assert.throws(() => buildPlan([order(1), order(2, 1, { delivery_date: '2026-10-10' })], shop, matrix(3)), /วันจัดส่งเดียวกัน/);
});

test('rejects invalid coordinates and invalid settings', () => {
  for (const latitude of [NaN, Infinity, 91]) {
    assert.throws(() => buildPlan([order(1, 1, { latitude })], shop, matrix(2)), /พิกัด/);
  }
  assert.throws(() => buildPlan([order(1)], { latitude: 0, longitude: 181 }, matrix(2)), /พิกัด/);
  for (const settings of [
    { ...defaultSettings, speed_kmh: 0 }, { ...defaultSettings, service_minutes: -1 },
    { ...defaultSettings, buffer_minutes: 60 }, { ...defaultSettings, speed_kmh: NaN },
  ]) assert.throws(() => buildPlan([order(1)], shop, matrix(2), settings), /ไม่ถูกต้อง/);
});

test('rejects incomplete, unreachable, negative and nonzero-diagonal distance matrices', () => {
  assert.throws(() => buildPlan([order(1)], shop, [[0]]), /ขนาด/);
  assert.throws(() => buildPlan([order(1)], shop, [[0, 1], [1]]), /ขนาดแถว/);
  for (const distance of [NaN, Infinity, -1, null]) {
    assert.throws(() => buildPlan([order(1)], shop, [[0, distance], [1, 0]] as number[][]), /ใช้งานไม่ได้/);
  }
  assert.throws(() => buildPlan([order(1)], shop, [[1, 1], [1, 0]]), /ต้องเป็นศูนย์/);
});

test('great-circle radius distance is symmetric, handles identity and validates physical coordinates', () => {
  const from = { latitude: 0, longitude: 0 };
  const to = { latitude: 1, longitude: 0 };
  assert.ok(Math.abs(coordinateDistanceMeters(from, to) - 111194.9266) < 0.001);
  assert.equal(coordinateDistanceMeters(from, to), coordinateDistanceMeters(to, from));
  assert.equal(coordinateDistanceMeters(from, from), 0);
  assert.throws(() => coordinateDistanceMeters(from, { latitude: 91, longitude: 0 }), /พิกัด/);
});

test('pricing rejects invalid inputs and permits negative profit in integer satang conversion', () => {
  assert.equal(calculateDeliveryFeeSatang(6, 2000), 3900);
  assert.equal(calculateDeliveryFee(6, 2000), 39);
  assert.equal(satangToBaht(-1500), -15);
  assert.throws(() => calculateDeliveryFeeSatang(0, 1), /ไม่ถูกต้อง/);
  assert.throws(() => calculateDeliveryFeeSatang(1, -1), /ไม่ถูกต้อง/);
  assert.throws(() => calculateDeliveryFeeSatang(Number.MAX_SAFE_INTEGER, Number.MAX_VALUE), /เกินช่วง/);
  assert.throws(() => satangToBaht(1.1), /จำนวนเต็มสตางค์/);
});
