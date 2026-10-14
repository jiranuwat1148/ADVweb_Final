import { conn } from "../controller/dbconnect";
import type { RowDataPacket } from "mysql2";

async function main(): Promise<void> {
  try {
    const [db] = await conn.execute<RowDataPacket[]>("SELECT DATABASE() AS db_name");
    if (db[0]?.db_name !== "delivery_app") {
      throw new Error("ตั้ง DB_NAME=delivery_app ก่อนรัน migration เพื่อป้องกันการแก้ผิดฐานข้อมูล");
    }
    const [columns] = await conn.execute<RowDataPacket[]>(
      `SELECT DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_plans' AND COLUMN_NAME = 'plan_json'`,
    );
    if (columns.length) {
      if (columns[0]?.DATA_TYPE !== "json") throw new Error("plan_json มีอยู่แล้วแต่ชนิดไม่ใช่ JSON กรุณาตรวจตาราง");
      console.log("delivery_plans.plan_json พร้อมใช้งานแล้ว");
    } else {
      await conn.execute("ALTER TABLE delivery_plans ADD COLUMN plan_json JSON NULL");
      console.log("เพิ่ม delivery_plans.plan_json JSON แล้ว; ข้อมูลเดิมยังอยู่ครบ");
    }
  } finally {
    await conn.end();
  }
}
main().catch(error => {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  console.error(code ? `Migration ไม่สำเร็จ (${code})` : String(error.message));
  process.exitCode = 1;
});
