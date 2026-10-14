import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { conn } from "./dbconnect";
import { createRateLimiter } from "../middleware/rate-limit";
import { readPlan } from "../services/plan-repository";
import { todayInBangkok } from "../services/validation";
import { HttpError, sendApiError } from "../services/errors";

export const riderRouter = Router();

riderRouter.post("/", createRateLimiter(30, 15 * 60 * 1000), async (req, res) => {
  const raw = req.body?.job_code;
  if (typeof raw !== "string" || !/^[A-Za-z0-9-]{5,32}$/.test(raw.trim())) {
    res.status(400).json({ message: "กรุณากรอก job_code ให้ถูกต้อง" });
    return;
  }
  const code = raw.trim().toUpperCase();
  try {
    // Match only confirmed jobs on their delivery day. Wrong, draft, and
    // expired codes have the same response and expose no customer data.
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT j.id, j.plan_id FROM delivery_jobs j JOIN delivery_plans p ON p.id = j.plan_id
       WHERE j.job_code = ? AND p.status = 'CONFIRMED' AND p.delivery_date = ? LIMIT 1`,
      [code, todayInBangkok()],
    );
    const row = rows[0];
    if (!row) throw new HttpError(404, "ไม่พบใบงานที่เปิดใช้งานในวันนี้");
    const plan = await readPlan(conn, Number(row.plan_id));
    const job = plan.jobs.find(job => job.id === Number(row.id));
    if (!job) throw new HttpError(404, "ไม่พบใบงานที่เปิดใช้งานในวันนี้");
    res.json({
      delivery_date: plan.delivery_date, departure_at: plan.departure_at,
      deadline_at: plan.deadline_at, routing_mode: plan.routing_mode,
      is_simulation: plan.is_simulation, shop: plan.shop, job,
    });
  } catch (error) {
    sendApiError(res, error, "ค้นหาใบงานไม่สำเร็จ", "POST /api/rider/jobs/lookup");
  }
});
