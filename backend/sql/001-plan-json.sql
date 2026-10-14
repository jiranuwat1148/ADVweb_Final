-- สำหรับฐานข้อมูลเดิม; รันซ้ำได้ ไม่ลบข้อมูล
-- แนะนำใช้ npm run db:migrate เพราะตรวจชนิดช่องและฐานข้อมูลด้วย
USE delivery_app;
SET @plan_json_migration_sql = IF(
  EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'delivery_plans'
      AND COLUMN_NAME = 'plan_json'
  ),
  'SELECT ''delivery_plans.plan_json exists'' AS migration_status',
  'ALTER TABLE delivery_plans ADD COLUMN plan_json JSON NULL'
);
PREPARE plan_json_migration FROM @plan_json_migration_sql;
EXECUTE plan_json_migration;
DEALLOCATE PREPARE plan_json_migration;
-- เก็บพิกัดร้าน สมมติฐาน ผลคำนวณ และสำเนาข้อมูลต้นทาง
-- ไม่มีการเพิ่ม created_at/updated_at หรือตารางผู้ใช้
