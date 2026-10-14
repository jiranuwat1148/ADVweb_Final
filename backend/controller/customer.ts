import { Router } from "express";
import { conn } from "./dbconnect";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { withDispatchTransaction } from "../services/dispatch-db";
import { HttpError, sendApiError } from "../services/errors";
import { todayInBangkok } from "../services/validation";

export const customerRouter = Router();

interface CustomerInput {
  name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
}

function customerInput(body: unknown): CustomerInput {
  const fields = typeof body === "object" && body !== null
    ? body as Record<string, unknown>
    : {};
  const { name, phone, address, latitude, longitude } = fields;
  if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100) {
    throw new HttpError(400, "กรุณากรอกชื่อไม่เกิน 100 ตัวอักษร");
  }
  if (typeof phone !== "string" || phone.trim().length === 0 || phone.trim().length > 20) {
    throw new HttpError(400, "กรุณากรอกเบอร์โทรไม่เกิน 20 ตัวอักษร");
  }
  if (address !== undefined && address !== null &&
      (typeof address !== "string" || address.trim().length > 500)) {
    throw new HttpError(400, "ที่อยู่ต้องเป็นข้อความไม่เกิน 500 ตัวอักษร");
  }
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new HttpError(400, "พิกัด latitude หรือ longitude ไม่ถูกต้อง");
  }
  return {
    name: name.trim(),
    phone: phone.trim(),
    address: typeof address === "string" ? address.trim() || null : null,
    latitude,
    longitude,
  };
}

function customerId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) {
    throw new HttpError(400, "id ลูกค้าไม่ถูกต้อง");
  }
  return id;
}

customerRouter.get("/", async (_req, res) => {
  try {
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT id, name, phone, address, latitude, longitude FROM customer ORDER BY id"
    );
    res.json(rows);
  } catch (error) {
    sendApiError(res, error, "อ่านข้อมูลลูกค้าไม่สำเร็จ", "GET /api/customers");
  }
});

customerRouter.get("/:id", async (req, res) => {
  try {
    const id = customerId(req.params.id);
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT * FROM customer WHERE id = ?", [id]
    );
    if (rows.length === 0) throw new HttpError(404, "ไม่พบข้อมูลลูกค้า");
    res.json(rows[0]);
  } catch (error) {
    sendApiError(res, error, "อ่านข้อมูลลูกค้าไม่สำเร็จ", "GET /api/customers/:id");
  }
});

customerRouter.post("/", async (req, res) => {
  try {
    const input = customerInput(req.body);
    const result = await withDispatchTransaction(async db => {
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO customer (name, phone, address, latitude, longitude)
         VALUES (?, ?, ?, ?, ?)`,
        [input.name, input.phone, input.address, input.latitude, input.longitude]
      );
      return created;
    });
    res.status(201).json({ message: "เพิ่มลูกค้าเรียบร้อยแล้ว", id: result.insertId });
  } catch (error) {
    sendApiError(res, error, "เพิ่มลูกค้าไม่สำเร็จ", "POST /api/customers");
  }
});

customerRouter.put("/:id", async (req, res) => {
  try {
    const id = customerId(req.params.id);
    const input = customerInput(req.body);
    await withDispatchTransaction(async db => {
      const [customers] = await db.execute<RowDataPacket[]>(
        "SELECT id FROM customer WHERE id = ? FOR UPDATE", [id]
      );
      if (customers.length === 0) throw new HttpError(404, "ไม่พบลูกค้า");
      const [references] = await db.execute<RowDataPacket[]>(
        `SELECT EXISTS (
           SELECT 1 FROM orders AS o
           JOIN delivery_stops AS s ON s.order_id = o.id
           JOIN delivery_jobs AS j ON j.id = s.job_id
           JOIN delivery_plans AS p ON p.id = j.plan_id
           WHERE o.customer_id = ? AND p.status = 'CONFIRMED'
             AND p.delivery_date >= ?
         ) AS has_confirmed`,
        [id, todayInBangkok()]
      );
      if (Number(references[0]?.has_confirmed) === 1) {
        throw new HttpError(409, "แก้ไขลูกค้าไม่ได้ เนื่องจากอยู่ในแผนจัดส่งที่ยืนยันแล้ว");
      }
      await db.execute<ResultSetHeader>(
        `UPDATE customer
         SET name = ?, phone = ?, address = ?, latitude = ?, longitude = ?
         WHERE id = ?`,
        [input.name, input.phone, input.address, input.latitude, input.longitude, id]
      );
    });
    res.json({ message: "แก้ไขลูกค้าเรียบร้อยแล้ว", id });
  } catch (error) {
    sendApiError(res, error, "แก้ไขลูกค้าไม่สำเร็จ", "PUT /api/customers/:id");
  }
});

customerRouter.delete("/:id", async (req, res) => {
  try {
    const id = customerId(req.params.id);
    await withDispatchTransaction(async db => {
      const [deleted] = await db.execute<ResultSetHeader>(
        "DELETE FROM customer WHERE id = ?", [id]
      );
      if (deleted.affectedRows === 0) throw new HttpError(404, "ไม่พบลูกค้า");
      return deleted;
    });
    res.json({ message: "ลบลูกค้าเรียบร้อยแล้ว", id });
  } catch (error) {
    const safeError = typeof error === "object" && error !== null &&
      "code" in error && error.code === "ER_ROW_IS_REFERENCED_2"
      ? new HttpError(409, "ลบลูกค้าไม่ได้ เนื่องจากลูกค้านี้มีออเดอร์อยู่")
      : error;
    sendApiError(res, safeError, "ลบลูกค้าไม่สำเร็จ", "DELETE /api/customers/:id");
  }
});
