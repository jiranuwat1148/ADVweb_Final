import { Router } from "express";
import { conn } from "./dbconnect";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

export const orderRouter = Router();

orderRouter.get("/", async (_req, res) => {
  try {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT
         o.id,
         o.customer_id,
         c.name AS customer_name,
         c.phone AS customer_phone,
         o.quantity,
         DATE_FORMAT(o.delivery_date, '%Y-%m-%d') AS delivery_date,
         o.status
       FROM orders AS o
       JOIN customer AS c ON c.id = o.customer_id
       ORDER BY o.id DESC`
    );

    res.json(rows);
  } catch (error) {
    console.error("GET /api/orders:", error);

    res.status(500).json({
      message: "อ่านข้อมูลออเดอร์ไม่สำเร็จ",
    });
  }
});

orderRouter.get("/:id", async (req, res) => {
  const orderId = Number(req.params.id);

  if (
    !Number.isSafeInteger(orderId) ||
    orderId < 1 ||
    orderId > 4294967295
  ) {
    res.status(400).json({ message: "เลขออเดอร์ไม่ถูกต้อง" });
    return;
  }

  try {
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT
         o.id,
         o.customer_id,
         c.name AS customer_name,
         c.phone AS customer_phone,
         o.quantity,
         DATE_FORMAT(o.delivery_date, '%Y-%m-%d') AS delivery_date,
         o.status
       FROM orders AS o
       JOIN customer AS c ON c.id = o.customer_id
       WHERE o.id = ?`,
      [orderId]
    );

    if (rows.length === 0) {
      res.status(404).json({ message: "ไม่พบออเดอร์" });
      return;
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("GET /api/orders/:id:", error);
    res.status(500).json({ message: "อ่านข้อมูลออเดอร์ไม่สำเร็จ" });
  }
});

orderRouter.post("/", async (req, res) => {
  // รับข้อมูลที่ส่งมาใน BODY
  const { customer_id, quantity, delivery_date } = req.body ?? {};

  // ตรวจสอบเลขลูกค้า
  if (
    typeof customer_id !== "number" ||
    !Number.isSafeInteger(customer_id) ||
    customer_id < 1 ||
    customer_id > 4294967295
  ) {
    res.status(400).json({
      message: "เลขลูกค้าต้องเป็นจำนวนเต็มบวก",
    });
    return;
  }

  // แต่ละออเดอร์สั่งได้ 1–3 กล่อง ตามโจทย์
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 3
  ) {
    res.status(400).json({
      message: "จำนวนข้าวต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 3 กล่อง",
    });
    return;
  }

  // ตรวจสอบรูปแบบวันที่ เช่น 2026-10-05
  if (
    typeof delivery_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)
  ) {
    res.status(400).json({
      message: "วันที่ส่งต้องอยู่ในรูปแบบ YYYY-MM-DD",
    });
    return;
  }

  // ตรวจสอบว่าวันที่นั้นมีอยู่จริง
  const parsedDate = new Date(`${delivery_date}T00:00:00.000Z`);

  if (
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== delivery_date ||
    delivery_date < "1000-01-01"
  ) {
    res.status(400).json({
      message: "วันที่ส่งไม่ถูกต้อง",
    });
    return;
  }

  try {
    // เพิ่มออเดอร์ โดยกำหนดสถานะเริ่มต้นเป็น PENDING
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO orders
       (customer_id, quantity, delivery_date, status)
       VALUES (?, ?, ?, 'PENDING')`,
      [customer_id, quantity, delivery_date]
    );

    res.status(201).json({
      message: "เพิ่มออเดอร์เรียบร้อยแล้ว",
      id: result.insertId,
    });
  } catch (error) {
    // Foreign Key จะตรวจว่ามีลูกค้าหมายเลขนี้จริงไหม
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_NO_REFERENCED_ROW_2"
    ) {
      res.status(404).json({
        message: "ไม่พบลูกค้าที่ระบุ",
      });
      return;
    }

    console.error("POST /api/orders:", error);

    res.status(500).json({
      message: "เพิ่มออเดอร์ไม่สำเร็จ",
    });
  }
});

orderRouter.put("/:id", async (req, res) => {
  const orderId = Number(req.params.id);
  const { quantity, delivery_date } = req.body ?? {};

  // ตรวจสอบเลขออเดอร์จาก URL
  if (
    !Number.isSafeInteger(orderId) ||
    orderId < 1 ||
    orderId > 4294967295
  ) {
    res.status(400).json({
      message: "เลขออเดอร์ไม่ถูกต้อง",
    });
    return;
  }

  // ตรวจสอบจำนวนกล่อง
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 3
  ) {
    res.status(400).json({
      message: "จำนวนข้าวต้องเป็นจำนวนเต็มตั้งแต่ 1 ถึง 3 กล่อง",
    });
    return;
  }

  // ตรวจสอบรูปแบบวันที่
  if (
    typeof delivery_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)
  ) {
    res.status(400).json({
      message: "วันที่ส่งต้องอยู่ในรูปแบบ YYYY-MM-DD",
    });
    return;
  }

  // ตรวจสอบว่าวันที่มีอยู่จริง
  const parsedDate = new Date(`${delivery_date}T00:00:00.000Z`);

  if (
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== delivery_date ||
    delivery_date < "1000-01-01"
  ) {
    res.status(400).json({
      message: "วันที่ส่งไม่ถูกต้อง",
    });
    return;
  }

  try {
    // แก้เฉพาะออเดอร์ที่ยังไม่ได้อยู่ในแผนจัดส่ง
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE orders
       SET quantity = ?, delivery_date = ?
       WHERE id = ?
         AND status = 'PENDING'
         AND NOT EXISTS (
           SELECT 1
           FROM delivery_stops
           WHERE order_id = ?
         )`,
      [quantity, delivery_date, orderId, orderId]
    );

    // ถ้าไม่มีแถวถูกเปลี่ยน ต้องตรวจสอบสาเหตุ
    if (result.affectedRows === 0) {
      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT
           o.id,
           o.status,
           EXISTS (
             SELECT 1
             FROM delivery_stops AS s
             WHERE s.order_id = o.id
           ) AS has_stops
         FROM orders AS o
         WHERE o.id = ?`,
        [orderId]
      );

      const order = rows[0];

      if (!order) {
        res.status(404).json({
          message: "ไม่พบออเดอร์",
        });
        return;
      }

      if (
        order.status !== "PENDING" ||
        Number(order.has_stops) === 1
      ) {
        res.status(409).json({
          message:
            "แก้ไขได้เฉพาะออเดอร์ PENDING ที่ยังไม่อยู่ในแผนจัดส่ง",
        });
        return;
      }

      // ถ้าข้อมูลใหม่เหมือนเดิม ถือว่าบันทึกสำเร็จได้
    }

    res.json({
      message: "แก้ไขออเดอร์เรียบร้อยแล้ว",
      id: orderId,
    });
  } catch (error) {
    console.error("PUT /api/orders/:id:", error);

    res.status(500).json({
      message: "แก้ไขออเดอร์ไม่สำเร็จ",
    });
  }
});

orderRouter.delete("/:id", async (req, res) => {
  const orderId = Number(req.params.id);

  // ตรวจสอบเลขออเดอร์
  if (
    !Number.isSafeInteger(orderId) ||
    orderId < 1 ||
    orderId > 4294967295
  ) {
    res.status(400).json({
      message: "เลขออเดอร์ไม่ถูกต้อง",
    });
    return;
  }

  try {
    const [result] = await conn.execute<ResultSetHeader>(
      "DELETE FROM orders WHERE id = ?",
      [orderId]
    );

    // ไม่มีแถวถูกลบ แปลว่าไม่พบออเดอร์
    if (result.affectedRows === 0) {
      res.status(404).json({
        message: "ไม่พบออเดอร์",
      });
      return;
    }

    res.json({
      message: "ลบออเดอร์เรียบร้อยแล้ว",
      id: orderId,
    });
  } catch (error) {
    // ออเดอร์ที่มีจุดส่งอยู่แล้ว จะติด Foreign Key
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_ROW_IS_REFERENCED_2"
    ) {
      res.status(409).json({
        message: "ออเดอร์นี้อยู่ในแผนจัดส่งแล้ว จึงลบไม่ได้",
      });
      return;
    }

    console.error("DELETE /api/orders/:id:", error);

    res.status(500).json({
      message: "ลบออเดอร์ไม่สำเร็จ",
    });
  }
});

orderRouter.post("/simulate", async (req, res) => {
  const { count, delivery_date } = req.body ?? {};

  // ตรวจสอบจำนวนออเดอร์
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 20 ||
    count > 30
  ) {
    res.status(400).json({
      message: "จำนวนออเดอร์ต้องเป็นจำนวนเต็มตั้งแต่ 20 ถึง 30",
    });
    return;
  }

  // ตรวจสอบรูปแบบวันที่
  if (
    typeof delivery_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(delivery_date)
  ) {
    res.status(400).json({
      message: "วันที่ส่งต้องอยู่ในรูปแบบ YYYY-MM-DD",
    });
    return;
  }

  const parsedDate = new Date(`${delivery_date}T00:00:00.000Z`);

  if (
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== delivery_date ||
    delivery_date < "1000-01-01"
  ) {
    res.status(400).json({
      message: "วันที่ส่งไม่ถูกต้อง",
    });
    return;
  }

  try {
    // อ่านเลขลูกค้า โดยสุ่มลำดับ
    const [customers] = await conn.execute<RowDataPacket[]>(
      "SELECT id FROM customer ORDER BY RAND()"
    );

    // ต้องมีลูกค้าพอ เพื่อเลือกคนละคนในชุดนี้
    if (customers.length < count) {
      res.status(400).json({
        message: `ต้องมีลูกค้าอย่างน้อย ${count} คน แต่ตอนนี้มี ${customers.length} คน`,
      });
      return;
    }

    // เลือกลูกค้าตามจำนวนที่ต้องการ
    const selectedCustomers = customers.slice(0, count);

    const values: (number | string)[] = [];
    let totalBoxes = 0;

    for (const customer of selectedCustomers) {
      // สุ่มจำนวนกล่องเป็น 1, 2 หรือ 3
      const quantity = Math.floor(Math.random() * 3) + 1;

      values.push(Number(customer.id), quantity, delivery_date);
      totalBoxes += quantity;
    }

    // สร้างชุดเครื่องหมาย ? สำหรับแต่ละออเดอร์
    const placeholders = selectedCustomers
      .map(() => "(?, ?, ?, 'PENDING')")
      .join(", ");

    // เพิ่มออเดอร์ทั้งหมดด้วยคำสั่งเดียว
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO orders
       (customer_id, quantity, delivery_date, status)
       VALUES ${placeholders}`,
      values
    );

    res.status(201).json({
      message: "จำลองออเดอร์เรียบร้อยแล้ว",
      created_orders: result.affectedRows,
      total_boxes: totalBoxes,
      delivery_date,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_NO_REFERENCED_ROW_2"
    ) {
      res.status(409).json({
        message: "ข้อมูลลูกค้าเปลี่ยนระหว่างสร้างออเดอร์ กรุณาลองใหม่",
      });
      return;
    }

    console.error("POST /api/orders/simulate:", error);

    res.status(500).json({
      message: "จำลองออเดอร์ไม่สำเร็จ",
    });
  }
});

