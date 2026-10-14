import type { Pool, PoolConnection } from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { conn } from "../controller/dbconnect";
import { HttpError } from "./errors";

const lockName = "CONCAT('lunch:', LEFT(SHA2(DATABASE(), 256), 32))";

// All writes use the same database-specific lock. This keeps confirmation and
// customer/order edits from racing, without introducing another table.
export async function withDispatchTransaction<T>(
  work: (db: PoolConnection) => Promise<T>,
  pool: Pick<Pool, "getConnection"> = conn,
): Promise<T> {
  const db = await pool.getConnection();
  let locked = false;
  let started = false;
  let destroyed = false;
  try {
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT GET_LOCK(${lockName}, 5) AS acquired`);
    if (Number(rows[0]?.acquired) !== 1) {
      throw new HttpError(503, "ระบบกำลังบันทึกข้อมูล กรุณาลองอีกครั้ง");
    }
    locked = true;
    await db.beginTransaction();
    started = true;
    const value = await work(db);
    await db.commit();
    started = false;
    return value;
  } catch (error) {
    if (started) {
      try { await db.rollback(); } catch { db.destroy(); destroyed = true; }
    }
    throw error;
  } finally {
    if (locked && !destroyed) {
      try {
        const [rows] = await db.execute<RowDataPacket[]>(`SELECT RELEASE_LOCK(${lockName}) AS released`);
        if (Number(rows[0]?.released) !== 1) { db.destroy(); destroyed = true; }
      } catch { db.destroy(); destroyed = true; }
    }
    if (!destroyed) db.release();
  }
}

export async function assertDateOpen(db: PoolConnection, date: string): Promise<void> {
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM delivery_plans WHERE delivery_date = ? AND status = 'CONFIRMED' LIMIT 1",
    [date],
  );
  if (rows.length) throw new HttpError(409, "วันนี้มีแผนที่ยืนยันแล้ว ไม่สามารถเปลี่ยนออเดอร์ได้");
}
