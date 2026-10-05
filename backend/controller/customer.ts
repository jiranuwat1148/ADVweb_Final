import { Router } from "express";
import { conn } from "./dbconnect";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

export const customerRouter = Router();

customerRouter.get("/", async (_req, res) => {
  try {
    const [rows] = await conn.execute(
      "SELECT id, name, phone, address, latitude, longitude FROM customer ORDER BY id"
    );

    res.json(rows);
  } catch (error) {
    console.error("GET /api/customers:", error);

    res.status(500).json({
      message: "อ่านข้อมูลลูกค้าไม่สำเร็จ",
    });
  }
});

customerRouter.get("/:id", async (req, res) => {
  const customerId = req.params.id;
  try {
    const [rows] = await conn.execute<RowDataPacket[]>(
      "SELECT * FROM customer WHERE id = ?",
      [customerId]
    );
    if (rows.length === 0) {
      res.status(404).json({
        message: "ไม่พบข้อมูลลูกค้า",
      });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    console.error("GET /api/customers/:id:", error);
    res.status(500).json({
      message: "อ่านข้อมูลลูกค้าไม่สำเร็จ",
    });
  }
});

customerRouter.post("/", async (req, res) => {
  const { name, phone, address, latitude, longitude } = req.body ?? {};
  if (
    typeof name !== "string" || // ถ้า name ไม่ใช่ข้อความ
    name.trim().length === 0 || // ถ้า name เป็นข้อความว่าง
    name.trim().length > 100 // ถ้า name เป็นข้อความยาวเกิน 100 ตัวอักษร
  ) {
    res.status(400).json({ message: "กรุณากรอกชื่อไม่เกิน 100 ตัวอักษร" });
    return;
  }
  if (
    typeof phone !== "string" ||
    phone.trim().length === 0 ||
    phone.trim().length > 20
  ) {
    res.status(400).json({ message: "กรุณากรอกเบอร์โทรไม่เกิน 20 ตัวอักษร" });
    return;
  }
  if (
    address !== undefined &&
    address !== null &&
    (typeof address !== "string" || address.trim().length > 500)
  ) {
    res.status(400).json({ message: "ที่อยู่ต้องเป็นข้อความไม่เกิน 500 ตัวอักษร" });
    return;
  }
  if (
    typeof latitude !== "number" || // ตรวจว่าพิกัดเป็นตัวเลข
    !Number.isFinite(latitude) || // ตรวจว่าพิกัดเป็นตัวเลข finite
    latitude < -90 || // ตรวจว่าพิกัด latitude อยู่ในช่วง -90 ถึง 90
    latitude > 90 || // ตรวจว่าพิกัด latitude อยู่ในช่วง -90 ถึง 90
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 || // ตรวจว่าพิกัด longitude อยู่ในช่วง -180 ถึง 180
    longitude > 180
  ) {
    res.status(400).json({ message: "พิกัด latitude หรือ longitude ไม่ถูกต้อง" });
    return;
  }
  const savedAddress =
    typeof address === "string" ? address.trim() || null : null;

  try {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO customer
       (name, phone, address, latitude, longitude)
       VALUES (?, ?, ?, ?, ?)`,
      [name.trim(), phone.trim(), savedAddress, latitude, longitude]
    );

    res.status(201).json({
      message: "เพิ่มลูกค้าเรียบร้อยแล้ว",
      id: result.insertId,
    });
  } catch (error) {
    console.error("POST /api/customers:", error);
    res.status(500).json({
      message: "เพิ่มลูกค้าไม่สำเร็จ",
    });
  }
});
customerRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || id > 4294967295) {
    res.status(400).json({ message: "id ลูกค้าไม่ถูกต้อง" });
    return;
  }
  const { name, phone, address, latitude, longitude } = req.body ?? {};

  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.trim().length > 100
  ) {
    res.status(400).json({ message: "กรุณากรอกชื่อไม่เกิน 100 ตัวอักษร" });
    return;
  }

  // 3. ตรวจเบอร์โทร: เก็บเป็นข้อความเพื่อรักษาเลข 0 ข้างหน้า
  if (
    typeof phone !== "string" ||
    phone.trim().length === 0 ||
    phone.trim().length > 20
  ) {
    res.status(400).json({ message: "กรุณากรอกเบอร์โทรไม่เกิน 20 ตัวอักษร" });
    return;
  }

  // 4. ที่อยู่เว้นว่างได้ แต่ถ้าส่งมาต้องเป็นข้อความไม่เกิน 500 ตัวอักษร
  if (
    address !== undefined &&
    address !== null &&
    (typeof address !== "string" || address.trim().length > 500)
  ) {
    res.status(400).json({ message: "ที่อยู่ต้องเป็นข้อความไม่เกิน 500 ตัวอักษร" });
    return;
  }

  // 5. ตรวจว่าพิกัดเป็นตัวเลขและอยู่ในช่วงที่ถูกต้อง
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    res.status(400).json({ message: "พิกัด latitude หรือ longitude ไม่ถูกต้อง" });
    return;
  }

  // 6. ถ้าไม่มีที่อยู่ ให้บันทึกเป็น NULL
  const savedAddress =
    typeof address === "string" ? address.trim() || null : null;

  try {
    // แก้ไขข้อมูลของลูกค้าที่มี id ตรงกับ URL
    const [result] = await conn.execute<ResultSetHeader>(
      `UPDATE customer
       SET name = ?,
           phone = ?,
           address = ?,
           latitude = ?,
           longitude = ?
       WHERE id = ?`,
      [
        name.trim(),
        phone.trim(),
        savedAddress,
        latitude,
        longitude,
        id,
      ]
    );

    // ถ้าไม่มีแถวได้รับผล ให้ตรวจว่าลูกค้ายังมีอยู่หรือไม่
    if (result.affectedRows === 0) {
      const [rows] = await conn.execute<RowDataPacket[]>(
        "SELECT id FROM customer WHERE id = ?",
        [id]
      );

      if (rows.length === 0) {
        res.status(404).json({ message: "ไม่พบลูกค้า" });
        return;
      }
    }

    // แก้ไขสำเร็จ หรือข้อมูลที่ส่งมาเหมือนข้อมูลเดิม
    res.status(200).json({
      message: "แก้ไขลูกค้าเรียบร้อยแล้ว",
      id,
    });
  } catch (error) {
    console.error("PUT /api/customers/:id:", error);

    res.status(500).json({
      message: "แก้ไขลูกค้าไม่สำเร็จ",
    });
  }
});
