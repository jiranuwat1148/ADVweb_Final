-- ระบบจัดเส้นทางส่งอาหาร: 5 ตารางตาม ER ฉบับเรียบง่าย
-- สำหรับ MySQL 8.0.16 ขึ้นไป (รวม MySQL 8.4)
-- เปิดไฟล์นี้ในโปรแกรมจัดการ MySQL แล้วรันสคริปต์ทั้งหมดหนึ่งครั้ง
-- สร้างฐานข้อมูล delivery_app; ไม่มีคำสั่งล้างข้อมูลหรือลบตาราง
-- ใช้กับฐานข้อมูลใหม่ หากมีตารางชื่อเดียวกันแล้วจะพบข้อผิดพลาด ให้ตรวจของเดิมก่อน
-- DATETIME ใช้เวลาท้องถิ่นกรุงเทพฯ; backend ตั้ง time_zone ในทุก connection ด้วย

CREATE DATABASE IF NOT EXISTS delivery_app
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE delivery_app;
SET NAMES utf8mb4;
SET time_zone = '+07:00';

-- 1. ข้อมูลลูกค้า
CREATE TABLE customer (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address VARCHAR(500) NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,

  PRIMARY KEY (id),
  CONSTRAINT chk_customer_latitude CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_customer_longitude CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- 2. ออเดอร์: ลูกค้าหนึ่งคนมีได้หลายออเดอร์
CREATE TABLE orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  quantity TINYINT UNSIGNED NOT NULL,
  delivery_date DATE NOT NULL,
  status ENUM('PENDING', 'ASSIGNED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',

  PRIMARY KEY (id),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_date_status (delivery_date, status),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customer (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_orders_quantity CHECK (quantity BETWEEN 1 AND 3)
) ENGINE=InnoDB;

-- 3. แผนจัดส่ง: เก็บทางเลือกหลายแผน และให้เจ้าของเลือกยืนยัน
CREATE TABLE delivery_plans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  delivery_date DATE NOT NULL,
  departure_at DATETIME NOT NULL,
  deadline_at DATETIME NOT NULL,
  status ENUM('DRAFT', 'CONFIRMED') NOT NULL DEFAULT 'DRAFT',

  PRIMARY KEY (id),
  KEY idx_delivery_plans_date_status (delivery_date, status),
  CONSTRAINT chk_delivery_plans_time CHECK (
    DATE(departure_at) = delivery_date
    AND DATE(deadline_at) = delivery_date
    AND deadline_at > departure_at
  )
) ENGINE=InnoDB;

-- 4. ใบงานไรเดอร์: หนึ่งแผนมีหลายใบงาน
CREATE TABLE delivery_jobs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id INT UNSIGNED NOT NULL,
  job_code VARCHAR(32) NOT NULL,
  color CHAR(7) NOT NULL,
  distance_m INT UNSIGNED NOT NULL,
  geometry_json JSON NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_delivery_jobs_job_code (job_code),
  KEY idx_delivery_jobs_plan (plan_id),
  CONSTRAINT fk_delivery_jobs_plan
    FOREIGN KEY (plan_id) REFERENCES delivery_plans (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- 5. จุดส่ง: เชื่อมใบงานกับออเดอร์ และบอกลำดับส่ง
CREATE TABLE delivery_stops (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  sequence_no TINYINT UNSIGNED NOT NULL,
  estimated_delivery_at DATETIME NOT NULL,

  PRIMARY KEY (id),
  -- มีได้เฉพาะลำดับ 1, 2, 3 และลำดับห้ามซ้ำในใบงานเดียวกัน
  -- จึงบังคับให้แต่ละใบงานมีจุดส่งได้สูงสุด 3 จุด
  UNIQUE KEY uq_delivery_stops_job_sequence (job_id, sequence_no),
  UNIQUE KEY uq_delivery_stops_job_order (job_id, order_id),
  KEY idx_delivery_stops_order (order_id),
  CONSTRAINT fk_delivery_stops_job
    FOREIGN KEY (job_id) REFERENCES delivery_jobs (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_delivery_stops_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_delivery_stops_sequence CHECK (sequence_no BETWEEN 1 AND 3)
) ENGINE=InnoDB;

-- กฎที่ backend ต้องตรวจเพิ่มเติม (ไม่เพิ่มฟิลด์หรือตารางใน ER):
-- 1. ลูกค้าอยู่ในรัศมี 3 กม. จากร้าน
-- 2. แผนครอบคลุมออเดอร์ที่ต้องส่งครบ และไม่ซ้ำระหว่างใบงานในแผนเดียวกัน
-- 3. วันส่งของออเดอร์ตรงกับแผน ทุกใบงานมีอย่างน้อย 1 จุด และลำดับไม่ข้าม
-- 4. ออก 11:30 น. และส่งครบภายใน 12:30 น.; ตรวจ ETA ทุกจุด
-- 5. ยืนยันได้หนึ่งแผนต่อวัน และยืนยัน/มอบหมายออเดอร์ใน transaction เดียว
-- 6. เมื่อต้นทางเปลี่ยนต้องคำนวณใหม่ ห้ามแก้ข้อมูลที่กระทบแผนที่ยืนยันแล้ว
-- 7. ไรเดอร์ค้นหาได้เฉพาะใบงานของแผน CONFIRMED ของวันนั้น
--
-- จำนวนกล่องรวม = SUM(orders.quantity) ตามออเดอร์ในใบงาน
-- ค่าส่งใบงาน (บาท) = 15 + 2 * จำนวนกล่องรวม * distance_m / 1000
-- ปัดค่าส่งแต่ละใบงานเป็น 2 ตำแหน่งก่อนนำมารวม
-- กำไรประมาณการ (บาท) = จำนวนกล่องรวมทั้งแผน * (65 - 40) - ค่าส่งรวม
-- ข้อมูลลูกค้าอ่านผ่าน delivery_stops -> orders -> customer
-- ไม่มี created_at, updated_at, version, ตารางผู้ใช้ หรือฟิลด์เสริมจากแบบเดิม
-- อ้างอิง CHECK: https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html
-- อ้างอิง FK: https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html
