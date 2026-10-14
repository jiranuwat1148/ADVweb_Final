import { Router } from "express";
import { conn } from "./dbconnect";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { assertDateOpen, withDispatchTransaction } from "../services/dispatch-db";
import { HttpError, sendApiError } from "../services/errors";

export const orderRouter = Router();
const ORDER_STATUSES = new Set(["PENDING", "ASSIGNED", "CANCELLED"]);
const ORDER_SELECT = `SELECT
  o.id, o.customer_id, c.name AS customer_name, c.phone AS customer_phone,
  o.quantity, DATE_FORMAT(o.delivery_date, '%Y-%m-%d') AS delivery_date, o.status
  FROM orders AS o JOIN customer AS c ON c.id = o.customer_id`;

function orderId(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) {
    throw new HttpError(400, "เลขออเดอร์ไม่ถูกต้อง");
  }
  return id;
}

function quantityInput(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 3) {
    throw new HttpError(400, "จำนวนข้าวต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 3 กล่อง");
  }
  return value;
}

function dateInput(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    throw new HttpError(400, "วันที่ส่งต้องอยู่ในรูปแบบ YYYY-MM-DD");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ||
      value < "1000-01-01") {
    throw new HttpError(400, "วันที่ส่งไม่ถูกต้อง");
  }
  return value;
}

interface LockedOrder extends RowDataPacket {
  id: number;
  status: string;
  delivery_date: string;
  has_stops: number | string;
  has_confirmed: number | string;
}

async function lockedOrder(db: PoolConnection, id: number): Promise<LockedOrder> {
  const [rows] = await db.execute<LockedOrder[]>(
    `SELECT o.id, o.status,
       DATE_FORMAT(o.delivery_date, '%Y-%m-%d') AS delivery_date,
       EXISTS (SELECT 1 FROM delivery_stops AS s WHERE s.order_id = o.id) AS has_stops,
       EXISTS (
         SELECT 1 FROM delivery_stops AS s
         JOIN delivery_jobs AS j ON j.id = s.job_id
         JOIN delivery_plans AS p ON p.id = j.plan_id
         WHERE s.order_id = o.id AND p.status = 'CONFIRMED'
       ) AS has_confirmed
     FROM orders AS o WHERE o.id = ? FOR UPDATE`,
    [id]
  );
  if (!rows[0]) throw new HttpError(404, "ไม่พบออเดอร์");
  return rows[0];
}

orderRouter.get("/", async (req, res) => {
  try {
    const conditions: string[] = [];
    const values: string[] = [];
    if (req.query.date !== undefined) {
      conditions.push("o.delivery_date = ?");
      values.push(dateInput(req.query.date));
    }
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== "string" || !ORDER_STATUSES.has(req.query.status)) {
        throw new HttpError(400, "สถานะออเดอร์ต้องเป็น PENDING, ASSIGNED หรือ CANCELLED");
      }
      conditions.push("o.status = ?");
      values.push(req.query.status);
    }
    const where = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";
    const [rows] = await conn.execute<RowDataPacket[]>(
      ORDER_SELECT + where + " ORDER BY o.id DESC", values
    );
    res.json(rows);
  } catch (error) {
    sendApiError(res, error, "อ่านข้อมูลออเดอร์ไม่สำเร็จ", "GET /api/orders");
  }
});

orderRouter.get("/:id", async (req, res) => {
  try {
    const id = orderId(req.params.id);
    const [rows] = await conn.execute<RowDataPacket[]>(
      ORDER_SELECT + " WHERE o.id = ?", [id]
    );
    if (!rows[0]) throw new HttpError(404, "ไม่พบออเดอร์");
    res.json(rows[0]);
  } catch (error) {
    sendApiError(res, error, "อ่านข้อมูลออเดอร์ไม่สำเร็จ", "GET /api/orders/:id");
  }
});

orderRouter.post("/", async (req, res) => {
  try {
    const { customer_id, quantity, delivery_date } = req.body ?? {};
    if (typeof customer_id !== "number" || !Number.isSafeInteger(customer_id) ||
        customer_id < 1 || customer_id > 4294967295) {
      throw new HttpError(400, "เลขลูกค้าต้องเป็นจำนวนเต็มบวก");
    }
    const amount = quantityInput(quantity);
    const date = dateInput(delivery_date);
    const result = await withDispatchTransaction(async db => {
      await assertDateOpen(db, date);
      const [created] = await db.execute<ResultSetHeader>(
        `INSERT INTO orders (customer_id, quantity, delivery_date, status)
         VALUES (?, ?, ?, 'PENDING')`,
        [customer_id, amount, date]
      );
      return created;
    });
    res.status(201).json({ message: "เพิ่มออเดอร์เรียบร้อยแล้ว", id: result.insertId });
  } catch (error) {
    const safeError = typeof error === "object" && error !== null &&
      "code" in error && error.code === "ER_NO_REFERENCED_ROW_2"
      ? new HttpError(404, "ไม่พบลูกค้าที่ระบุ")
      : error;
    sendApiError(res, safeError, "เพิ่มออเดอร์ไม่สำเร็จ", "POST /api/orders");
  }
});

orderRouter.put("/:id", async (req, res) => {
  try {
    const id = orderId(req.params.id);
    const { quantity, delivery_date } = req.body ?? {};
    const amount = quantityInput(quantity);
    const date = dateInput(delivery_date);
    await withDispatchTransaction(async db => {
      const order = await lockedOrder(db, id);
      if (order.status !== "PENDING" || Number(order.has_confirmed) === 1) {
        throw new HttpError(409, "แก้ไขได้เฉพาะออเดอร์ PENDING ที่ยังไม่ยืนยันแผนจัดส่ง");
      }
      await assertDateOpen(db, order.delivery_date);
      if (date !== order.delivery_date) await assertDateOpen(db, date);
      await db.execute<ResultSetHeader>(
        "UPDATE orders SET quantity = ?, delivery_date = ? WHERE id = ?",
        [amount, date, id]
      );
    });
    res.json({ message: "แก้ไขออเดอร์เรียบร้อยแล้ว", id });
  } catch (error) {
    sendApiError(res, error, "แก้ไขออเดอร์ไม่สำเร็จ", "PUT /api/orders/:id");
  }
});

orderRouter.delete("/:id", async (req, res) => {
  try {
    const id = orderId(req.params.id);
    await withDispatchTransaction(async db => {
      const order = await lockedOrder(db, id);
      if (order.status !== "PENDING") {
        throw new HttpError(409, "ลบได้เฉพาะออเดอร์ PENDING");
      }
      if (Number(order.has_confirmed) === 1) {
        throw new HttpError(409, "ออเดอร์นี้อยู่ในแผนจัดส่งที่ยืนยันแล้ว จึงลบไม่ได้");
      }
      await assertDateOpen(db, order.delivery_date);
      if (Number(order.has_stops) === 1) {
        // เก็บแถวที่ DRAFT อ้างอิงไว้ เพื่อรักษา FK และประวัติแผน
        await db.execute<ResultSetHeader>(
          "UPDATE orders SET status = 'CANCELLED' WHERE id = ?", [id]
        );
      } else {
        await db.execute<ResultSetHeader>("DELETE FROM orders WHERE id = ?", [id]);
      }
    });
    res.json({ message: "ลบออเดอร์เรียบร้อยแล้ว", id });
  } catch (error) {
    const safeError = typeof error === "object" && error !== null &&
      "code" in error && error.code === "ER_ROW_IS_REFERENCED_2"
      ? new HttpError(409, "ออเดอร์นี้มีข้อมูลจัดส่งอ้างอิง จึงลบไม่ได้")
      : error;
    sendApiError(res, safeError, "ลบออเดอร์ไม่สำเร็จ", "DELETE /api/orders/:id");
  }
});

orderRouter.post("/simulate", async (req, res) => {
  try {
    const { count, delivery_date } = req.body ?? {};
    if (typeof count !== "number" || !Number.isInteger(count) || count < 20 || count > 30) {
      throw new HttpError(400, "จำนวนออเดอร์ต้องเป็นจำนวนเต็มตั้งแต่ 20 ถึง 30");
    }
    const date = dateInput(delivery_date);
    const result = await withDispatchTransaction(async db => {
      await assertDateOpen(db, date);
      const [customers] = await db.execute<RowDataPacket[]>(
        "SELECT id FROM customer ORDER BY RAND()"
      );
      if (customers.length < count) {
        throw new HttpError(400,
          "ต้องมีลูกค้าอย่างน้อย " + count + " คน แต่ตอนนี้มี " + customers.length + " คน");
      }
      const selected = customers.slice(0, count);
      const values: (number | string)[] = [];
      let totalBoxes = 0;
      for (const customer of selected) {
        const amount = Math.floor(Math.random() * 3) + 1;
        values.push(Number(customer.id), amount, date);
        totalBoxes += amount;
      }
      const placeholders = selected.map(() => "(?, ?, ?, 'PENDING')").join(", ");
      const [created] = await db.execute<ResultSetHeader>(
        "INSERT INTO orders (customer_id, quantity, delivery_date, status) VALUES " + placeholders,
        values
      );
      return { createdOrders: created.affectedRows, totalBoxes };
    });
    res.status(201).json({
      message: "จำลองออเดอร์เรียบร้อยแล้ว",
      created_orders: result.createdOrders,
      total_boxes: result.totalBoxes,
      delivery_date: date,
    });
  } catch (error) {
    const safeError = typeof error === "object" && error !== null &&
      "code" in error && error.code === "ER_NO_REFERENCED_ROW_2"
      ? new HttpError(409, "ข้อมูลลูกค้าเปลี่ยนระหว่างสร้างออเดอร์ กรุณาลองใหม่")
      : error;
    sendApiError(res, safeError, "จำลองออเดอร์ไม่สำเร็จ", "POST /api/orders/simulate");
  }
});

