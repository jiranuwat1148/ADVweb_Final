-- Run once after schema.sql on a fresh database. All customer data is fictional.
-- No login account or confirmed jobs are seeded. Create users via the backend
-- with a real password hash, then have the planner create draft jobs.
USE lunch_dispatch;
SET NAMES utf8mb4;
SET time_zone = '+07:00';
START TRANSACTION;

INSERT INTO customers (name, phone, address, latitude, longitude, zone)
VALUES ('ลูกค้าทดสอบ A', '0800000001', 'ที่อยู่จำลองใกล้มหาวิทยาลัยมหาสารคาม',
        16.2480000, 103.2520000, 'ขามเรียง');
SET @demo_customer_a = LAST_INSERT_ID();

INSERT INTO customers (name, phone, address, latitude, longitude, zone)
VALUES ('ลูกค้าทดสอบ B', '0800000002', 'ที่อยู่จำลองใกล้มหาวิทยาลัยมหาสารคาม',
        16.2500000, 103.2540000, 'ขามเรียง');
SET @demo_customer_b = LAST_INSERT_ID();

INSERT INTO customers (name, phone, address, latitude, longitude, zone)
VALUES ('ลูกค้าทดสอบ C', '0800000003', 'ที่อยู่จำลองใกล้มหาวิทยาลัยมหาสารคาม',
        16.2460000, 103.2560000, 'ขามเรียง');
SET @demo_customer_c = LAST_INSERT_ID();

INSERT INTO orders (customer_id, delivery_date, quantity)
VALUES (@demo_customer_a, CURRENT_DATE(), 2),
       (@demo_customer_b, CURRENT_DATE(), 2),
       (@demo_customer_c, CURRENT_DATE(), 2);

COMMIT;
