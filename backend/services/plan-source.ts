import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import type { SourceOrder, ShopLocation, PlannerSettings, PlannedResult } from "./planner";
import { HttpError } from "./errors";
import { isDeliveryDate } from "./validation";

export interface StoredPlan {
  version: 1;
  shop: ShopLocation;
  settings: PlannerSettings;
  routing_mode: "road" | "straight_line";
  source_fingerprint: string;
  source: SourceOrder[];
  calculation: PlannedResult;
}

export async function readPendingOrders(db: Pick<PoolConnection, "execute">, date: string, lock = false): Promise<SourceOrder[]> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT o.id, o.customer_id, o.quantity,
      DATE_FORMAT(o.delivery_date, '%Y-%m-%d') AS delivery_date,
      c.name AS customer_name, c.phone AS customer_phone, c.address,
      c.latitude, c.longitude
     FROM orders o JOIN customer c ON c.id = o.customer_id
     WHERE o.delivery_date = ? AND o.status = 'PENDING'
     ORDER BY o.id${lock ? " FOR UPDATE" : ""}`,
    [date],
  );
  return rows.map(row => ({
    id: Number(row.id), customer_id: Number(row.customer_id),
    quantity: Number(row.quantity), delivery_date: String(row.delivery_date),
    customer_name: String(row.customer_name), customer_phone: String(row.customer_phone),
    address: row.address === null ? null : String(row.address),
    latitude: Number(row.latitude), longitude: Number(row.longitude),
  }));
}

export function sourceFingerprint(source: SourceOrder[]): string {
  const canonical = [...source].sort((a, b) => a.id - b.id).map(row => [
    row.id, row.customer_id, row.quantity, row.delivery_date,
    row.customer_name, row.customer_phone, row.address, row.latitude, row.longitude,
  ]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function record(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function id(value: unknown): boolean { return finite(value) && Number.isSafeInteger(value) && value >= 1 && value <= 4294967295; }
function coordinate(value: unknown): boolean {
  return record(value) && finite(value.latitude) && Math.abs(value.latitude) <= 90 && finite(value.longitude) && Math.abs(value.longitude) <= 180;
}

export function decodeStoredPlan(value: unknown): StoredPlan {
  const invalid = () => new HttpError(409, "ข้อมูลแผนไม่ครบหรือไม่ถูกต้อง กรุณาคำนวณแผนใหม่");
  let stored: unknown;
  try { stored = typeof value === "string" ? JSON.parse(value) : value; }
  catch { throw invalid(); }
  if (!record(stored) || stored.version !== 1 || !coordinate(stored.shop) ||
      !record(stored.settings) || !finite(stored.settings.speed_kmh) || stored.settings.speed_kmh <= 0 ||
      !finite(stored.settings.service_minutes) || stored.settings.service_minutes < 0 ||
      !finite(stored.settings.buffer_minutes) || stored.settings.buffer_minutes < 0 || stored.settings.buffer_minutes >= 60 ||
      !["road", "straight_line"].includes(stored.routing_mode) ||
      typeof stored.source_fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(stored.source_fingerprint) ||
      !Array.isArray(stored.source) || stored.source.length < 1 || stored.source.length > 60) throw invalid();
  for (const order of stored.source) {
    if (!record(order) || !id(order.id) || !id(order.customer_id) || !coordinate(order) ||
        typeof order.customer_name !== "string" || !order.customer_name.trim() || order.customer_name.length > 100 ||
        typeof order.customer_phone !== "string" || !order.customer_phone.trim() || order.customer_phone.length > 20 ||
        !(order.address === null || (typeof order.address === "string" && order.address.length <= 500)) ||
        !Number.isInteger(order.quantity) || order.quantity < 1 || order.quantity > 3 || !isDeliveryDate(order.delivery_date)) throw invalid();
  }
  if (!record(stored.calculation) || !Array.isArray(stored.calculation.jobs) ||
      stored.calculation.jobs.length < 1 || stored.calculation.jobs.length > stored.source.length ||
      !record(stored.calculation.summary)) throw invalid();
  for (const job of stored.calculation.jobs) {
    if (!record(job) || !Array.isArray(job.order_ids) || job.order_ids.length < 1 || job.order_ids.length > 3 ||
        !job.order_ids.every(id) || !Number.isSafeInteger(job.distance_m) || job.distance_m < 0 || job.distance_m > 4294967295 ||
        !Number.isInteger(job.total_boxes) || job.total_boxes < 1 || job.total_boxes > 9 ||
        !finite(job.delivery_fee) || job.delivery_fee < 0 || !Array.isArray(job.stops) || job.stops.length !== job.order_ids.length) throw invalid();
    for (const stop of job.stops) {
      if (!record(stop) || !id(stop.order_id) || !Number.isInteger(stop.sequence_no) || stop.sequence_no < 1 || stop.sequence_no > 3 ||
          !finite(stop.elapsed_minutes) || stop.elapsed_minutes < 0 || stop.elapsed_minutes > 60 - stored.settings.buffer_minutes) throw invalid();
    }
  }
  const summary = stored.calculation.summary;
  for (const key of ["order_count", "total_boxes", "rider_count", "total_distance_m"]) {
    if (!Number.isSafeInteger(summary[key]) || summary[key] < 0) throw invalid();
  }
  for (const key of ["revenue", "food_cost", "delivery_fee", "estimated_profit", "last_delivery_minutes"]) {
    if (!finite(summary[key])) throw invalid();
  }
  const parsed = stored as unknown as StoredPlan;
  if (parsed.source_fingerprint !== sourceFingerprint(parsed.source)) throw invalid();
  return parsed;
}
