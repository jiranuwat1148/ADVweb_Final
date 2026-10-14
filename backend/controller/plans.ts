import { Router } from "express";
import { randomBytes } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { conn } from "./dbconnect";
import { withDispatchTransaction, assertDateOpen } from "../services/dispatch-db";
import { HttpError, sendApiError } from "../services/errors";
import { isDeliveryDate, parseId, deliveryTime } from "../services/validation";
import { buildPlan, defaultSettings, coordinateDistanceMeters } from "../services/planner";
import type { ShopLocation, SourceOrder } from "../services/planner";
import { buildDistanceMatrix, getRouteDetails } from "../services/routing";
import { calculateDeliveryFeeSatang, satangToBaht } from "../services/pricing";
import { readPendingOrders, sourceFingerprint } from "../services/plan-source";
import type { StoredPlan } from "../services/plan-source";
import { readPlan, publicPlan, validatePlanCoverage } from "../services/plan-repository";

export const planRouter = Router();
const colors = ["#D97058", "#8B75C9", "#5F91CB", "#D7A45C", "#217A54", "#C15B82"];

function getShop(body: Record<string, unknown>): ShopLocation {
  const value = body.shop as Partial<ShopLocation> | undefined;
  const latitude = value?.latitude ?? (process.env.SHOP_LATITUDE ? Number(process.env.SHOP_LATITUDE) : undefined);
  const longitude = value?.longitude ?? (process.env.SHOP_LONGITUDE ? Number(process.env.SHOP_LONGITUDE) : undefined);
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, "ระบุ shop.latitude และ shop.longitude เป็นพิกัดร้านที่ถูกต้อง");
  }
  return { latitude, longitude };
}

async function routesForJobs(jobs: { order_ids: number[] }[], source: SourceOrder[], shop: ShopLocation, mode: "road" | "straight_line") {
  const byId = new Map(source.map(order => [order.id, order]));
  const result: Awaited<ReturnType<typeof getRouteDetails>>[] = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor++;
      const orders = jobs[index]!.order_ids.map(id => byId.get(id)!);
      result[index] = await getRouteDetails(orders, shop, mode);
    }
  }
  await Promise.all([worker(), worker()]);
  return result;
}

planRouter.post("/", async (req, res) => {
  try {
    const body = req.body ?? {};
    if (!isDeliveryDate(body.delivery_date)) throw new HttpError(400, "วันที่ส่งต้องเป็นวันที่จริงในรูปแบบ YYYY-MM-DD");
    const date: string = body.delivery_date;
    const shop = getShop(body);
    const mode = body.routing_mode ?? "road";
    if (mode !== "road" && mode !== "straight_line") throw new HttpError(400, "routing_mode ต้องเป็น road หรือ straight_line");
    const source = await readPendingOrders(conn, date);
    if (!source.length) throw new HttpError(400, "ไม่มีออเดอร์ PENDING ในวันที่เลือก");
    if (source.length > 60) throw new HttpError(400, "มินิโปรเจกต์นี้รองรับไม่เกิน 60 ออเดอร์ต่อแผน");
    for (const order of source) {
      let distance: number;
      try { distance = coordinateDistanceMeters(shop, order); }
      catch { throw new HttpError(422, `พิกัดลูกค้าของออเดอร์ ${order.id} ไม่ถูกต้อง`); }
      if (distance > 3000) throw new HttpError(422, `ลูกค้าของออเดอร์ ${order.id} อยู่นอกรัศมีร้าน 3 กิโลเมตร`);
    }
    let matrix: number[][];
    try { matrix = await buildDistanceMatrix(source, shop, mode); }
    catch { throw new HttpError(502, "บริการคำนวณเส้นทางไม่พร้อม กรุณาลองใหม่ หรือเลือกโหมด straight_line สำหรับจำลอง"); }
    let calculation: ReturnType<typeof buildPlan>;
    try { calculation = buildPlan(source, shop, matrix); }
    catch (error) { throw new HttpError(422, error instanceof Error ? error.message : "ไม่สามารถสร้างแผนที่ส่งทันเวลาได้"); }
    let geometry: Awaited<ReturnType<typeof routesForJobs>>;
    try { geometry = await routesForJobs(calculation.jobs, source, shop, mode); }
    catch { throw new HttpError(502, "อ่านเส้นทางสำหรับแผนที่ไม่สำเร็จ ยังไม่ได้บันทึกแผน กรุณาลองใหม่"); }
    // The grouping uses the matrix; final fees and ETAs use the actual drawn route.
    let deliveryFeeSatang = 0;
    let totalDistance = 0;
    let lastElapsed = 0;
    for (let index = 0; index < calculation.jobs.length; index++) {
      const job = calculation.jobs[index]!;
      const route = geometry[index]!;
      job.distance_m = Math.round(route.distance_m);
      let traveled = 0;
      for (let stopIndex = 0; stopIndex < job.stops.length; stopIndex++) {
        traveled += route.leg_distances_m[stopIndex]!;
        const elapsed = Math.round(traveled) / (defaultSettings.speed_kmh * 1000 / 60) + (stopIndex + 1) * defaultSettings.service_minutes;
        if (elapsed > 60 - defaultSettings.buffer_minutes) throw new HttpError(422, "เส้นทางจริงส่งไม่ทันเวลาที่กำหนด กรุณาคำนวณใหม่");
        job.stops[stopIndex]!.elapsed_minutes = elapsed;
        lastElapsed = Math.max(lastElapsed, elapsed);
      }
      const fee = calculateDeliveryFeeSatang(job.total_boxes, job.distance_m);
      job.delivery_fee = satangToBaht(fee);
      deliveryFeeSatang += fee;
      totalDistance += job.distance_m;
    }
    calculation.summary.total_distance_m = totalDistance;
    calculation.summary.delivery_fee = satangToBaht(deliveryFeeSatang);
    calculation.summary.estimated_profit = satangToBaht(calculation.summary.total_boxes * (65 - 40) * 100 - deliveryFeeSatang);
    calculation.summary.last_delivery_minutes = lastElapsed;
    const stored: StoredPlan = {
      version: 1, shop, settings: { ...defaultSettings }, routing_mode: mode,
      source_fingerprint: sourceFingerprint(source), source, calculation,
    };
    const plan = await withDispatchTransaction(async db => {
      await assertDateOpen(db, date);
      const current = await readPendingOrders(db, date, true);
      if (sourceFingerprint(current) !== stored.source_fingerprint) throw new HttpError(409, "ออเดอร์หรือข้อมูลลูกค้าเปลี่ยนระหว่างคำนวณ กรุณาคำนวณใหม่");
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO delivery_plans (delivery_date, departure_at, deadline_at, status, plan_json)
         VALUES (?, ?, ?, 'DRAFT', ?)`,
        [date, `${date} 11:30:00`, `${date} 12:30:00`, JSON.stringify(stored)],
      );
      for (let index = 0; index < calculation.jobs.length; index++) {
        const job = calculation.jobs[index]!;
        const [createdJob] = await db.execute<ResultSetHeader>(
          `INSERT INTO delivery_jobs (plan_id, job_code, color, distance_m, geometry_json) VALUES (?, ?, ?, ?, ?)`,
          [created.insertId, `LX-${randomBytes(12).toString("hex").toUpperCase()}`, colors[index % colors.length]!, job.distance_m, JSON.stringify(geometry[index]!.geometry)],
        );
        for (const stop of job.stops) {
          await db.execute(
            `INSERT INTO delivery_stops (job_id, order_id, sequence_no, estimated_delivery_at) VALUES (?, ?, ?, ?)`,
            [createdJob.insertId, stop.order_id, stop.sequence_no, deliveryTime(date, stop.elapsed_minutes)],
          );
        }
      }
      const saved = await readPlan(db, created.insertId);
      validatePlanCoverage(saved);
      return publicPlan(saved);
    });
    res.status(201).json(plan);
  } catch (error) {
    sendApiError(res, error, "สร้างแผนจัดส่งไม่สำเร็จ", "POST /api/plans");
  }
});

planRouter.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ message: "เลขแผนไม่ถูกต้อง" }); return; }
  try {
    const plan = await readPlan(conn, id);
    const current = plan.status === "DRAFT" ? await readPendingOrders(conn, plan.delivery_date) : [];
    const stale = plan.status === "DRAFT" && sourceFingerprint(current) !== plan.stored.source_fingerprint;
    res.json(publicPlan(plan, stale));
  } catch (error) {
    sendApiError(res, error, "อ่านแผนจัดส่งไม่สำเร็จ", "GET /api/plans/:id");
  }
});

planRouter.post("/:id/confirm", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) { res.status(400).json({ message: "เลขแผนไม่ถูกต้อง" }); return; }
  try {
    const result = await withDispatchTransaction(async db => {
      const plan = await readPlan(db, id, true);
      // A retry returns the existing jobs instead of generating duplicates.
      if (plan.status === "CONFIRMED") return { ...publicPlan(plan), already_confirmed: true };
      await assertDateOpen(db, plan.delivery_date);
      const source = await readPendingOrders(db, plan.delivery_date, true);
      if (sourceFingerprint(source) !== plan.stored.source_fingerprint) throw new HttpError(409, "แผนล้าสมัย ออเดอร์หรือข้อมูลลูกค้าเปลี่ยนแล้ว กรุณาคำนวณใหม่");
      validatePlanCoverage(plan);
      const ids = source.map(order => order.id);
      const [assigned] = await db.execute<ResultSetHeader>(
        `UPDATE orders SET status = 'ASSIGNED' WHERE status = 'PENDING' AND delivery_date = ? AND id IN (${ids.map(() => "?").join(",")})`,
        [plan.delivery_date, ...ids],
      );
      if (assigned.affectedRows !== ids.length) throw new HttpError(409, "ออเดอร์เปลี่ยนระหว่างยืนยัน กรุณาคำนวณใหม่");
      await db.execute("UPDATE delivery_plans SET status = 'CONFIRMED' WHERE id = ? AND status = 'DRAFT'", [id]);
      return { ...publicPlan({ ...plan, status: "CONFIRMED" }), already_confirmed: false };
    });
    res.json(result);
  } catch (error) {
    sendApiError(res, error, "ยืนยันแผนจัดส่งไม่สำเร็จ", "POST /api/plans/:id/confirm");
  }
});
