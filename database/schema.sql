-- Lunch Dispatch: MySQL 8.4, InnoDB, utf8mb4.
-- Import once into an empty lunch_dispatch database. This script deletes no data.
-- DATETIME values are Bangkok local time; configure every backend connection likewise.
CREATE DATABASE IF NOT EXISTS lunch_dispatch
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE lunch_dispatch;
SET NAMES utf8mb4;
SET time_zone = '+07:00';

CREATE TABLE users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  CONSTRAINT ck_users_active CHECK (is_active IN (0, 1))
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  zone VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT ck_customers_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT ck_customers_lng CHECK (longitude BETWEEN -180 AND 180),
  CONSTRAINT ck_customers_active CHECK (is_active IN (0, 1)),
  CONSTRAINT ck_customers_version CHECK (version >= 1)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  delivery_date DATE NOT NULL,
  quantity TINYINT UNSIGNED NOT NULL,
  status ENUM('PENDING', 'ASSIGNED', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_orders_customer (customer_id),
  KEY ix_orders_date_status (delivery_date, status),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_orders_quantity CHECK (quantity BETWEEN 1 AND 3),
  CONSTRAINT ck_orders_version CHECK (version >= 1)
) ENGINE=InnoDB;

CREATE TABLE delivery_plans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_by INT UNSIGNED NOT NULL,
  delivery_date DATE NOT NULL,
  departure_at DATETIME NOT NULL,
  deadline_at DATETIME NOT NULL,
  status ENUM('DRAFT', 'CONFIRMED') NOT NULL DEFAULT 'DRAFT',
  -- One confirmed plan per day; multiple NULL values allow multiple drafts.
  confirmed_delivery_date DATE GENERATED ALWAYS AS (
    CASE WHEN status = 'CONFIRMED' THEN delivery_date ELSE NULL END
  ) STORED,
  confirmed_at DATETIME NULL,
  price_per_box_sat INT UNSIGNED NOT NULL DEFAULT 6500,
  food_cost_per_box_sat INT UNSIGNED NOT NULL DEFAULT 4000,
  call_fee_sat INT UNSIGNED NOT NULL DEFAULT 1500,
  rate_per_box_km_sat INT UNSIGNED NOT NULL DEFAULT 200,
  shop_latitude DECIMAL(10,7) NOT NULL DEFAULT 16.2450000,
  shop_longitude DECIMAL(10,7) NOT NULL DEFAULT 103.2500000,
  safety_buffer_minutes TINYINT UNSIGNED NOT NULL DEFAULT 5,
  route_mode ENUM('APPROXIMATE', 'ROAD') NOT NULL DEFAULT 'APPROXIMATE',
  settings_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_confirmed_date (confirmed_delivery_date),
  KEY ix_plans_date_status (delivery_date, status),
  KEY ix_plans_creator (created_by),
  CONSTRAINT fk_plans_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_plans_dates CHECK (
    DATE(departure_at) = delivery_date AND DATE(deadline_at) = delivery_date
    AND deadline_at > departure_at
  ),
  CONSTRAINT ck_plans_buffer CHECK (
    TIMESTAMPDIFF(MINUTE, departure_at, deadline_at) > safety_buffer_minutes
  ),
  CONSTRAINT ck_plans_confirmation CHECK (
    (status = 'DRAFT' AND confirmed_at IS NULL)
    OR (status = 'CONFIRMED' AND confirmed_at IS NOT NULL)
  ),
  CONSTRAINT ck_plans_shop_lat CHECK (shop_latitude BETWEEN -90 AND 90),
  CONSTRAINT ck_plans_shop_lng CHECK (shop_longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

CREATE TABLE delivery_jobs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id INT UNSIGNED NOT NULL,
  job_code VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  color CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  distance_m INT UNSIGNED NOT NULL,
  geometry_json JSON NULL,
  valid_until DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_jobs_code (job_code),
  -- Referenced by the composite foreign key in delivery_stops.
  UNIQUE KEY uq_jobs_id_plan (id, plan_id),
  KEY ix_jobs_plan (plan_id),
  CONSTRAINT fk_jobs_plan FOREIGN KEY (plan_id)
    REFERENCES delivery_plans (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE delivery_stops (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id INT UNSIGNED NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  sequence_no TINYINT UNSIGNED NOT NULL,
  estimated_delivery_at DATETIME NOT NULL,
  -- Snapshot fields preserve the work sheet and support stale-plan checks.
  order_version INT UNSIGNED NOT NULL,
  customer_version INT UNSIGNED NOT NULL,
  quantity_snapshot TINYINT UNSIGNED NOT NULL,
  customer_name_snapshot VARCHAR(100) NOT NULL,
  phone_snapshot VARCHAR(20) NOT NULL,
  address_snapshot VARCHAR(500) NOT NULL,
  latitude_snapshot DECIMAL(10,7) NOT NULL,
  longitude_snapshot DECIMAL(10,7) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stops_job_sequence (job_id, sequence_no),
  UNIQUE KEY uq_stops_plan_order (plan_id, order_id),
  KEY ix_stops_job_plan (job_id, plan_id),
  KEY ix_stops_order (order_id),
  CONSTRAINT fk_stops_job_plan FOREIGN KEY (job_id, plan_id)
    REFERENCES delivery_jobs (id, plan_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_stops_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Only slots 1,2,3 exist, and each slot is unique per job: at most 3 stops.
  CONSTRAINT ck_stops_sequence CHECK (sequence_no BETWEEN 1 AND 3),
  CONSTRAINT ck_stops_quantity CHECK (quantity_snapshot BETWEEN 1 AND 3),
  CONSTRAINT ck_stops_order_version CHECK (order_version >= 1),
  CONSTRAINT ck_stops_customer_version CHECK (customer_version >= 1),
  CONSTRAINT ck_stops_lat CHECK (latitude_snapshot BETWEEN -90 AND 90),
  CONSTRAINT ck_stops_lng CHECK (longitude_snapshot BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- Views calculate totals instead of keeping duplicate money/count columns.
-- Empty jobs are omitted; the backend must reject plans containing empty jobs.
CREATE VIEW v_job_summary AS
SELECT j.id AS job_id, j.plan_id, j.job_code, j.color, j.distance_m,
       s.total_orders, s.total_boxes, s.last_delivery_at,
       TIMESTAMPDIFF(SECOND, p.departure_at, s.last_delivery_at) AS duration_seconds,
       CAST(ROUND(p.call_fee_sat
         + p.rate_per_box_km_sat * s.total_boxes * j.distance_m / 1000, 0)
         AS SIGNED) AS delivery_cost_sat
FROM delivery_jobs AS j
JOIN delivery_plans AS p ON p.id = j.plan_id
JOIN (
  SELECT job_id, COUNT(*) AS total_orders,
         SUM(quantity_snapshot) AS total_boxes,
         MAX(estimated_delivery_at) AS last_delivery_at
  FROM delivery_stops GROUP BY job_id
) AS s ON s.job_id = j.id;

CREATE VIEW v_plan_summary AS
SELECT p.id AS plan_id, p.delivery_date, p.status,
       COALESCE(s.total_jobs, 0) AS total_jobs,
       COALESCE(s.total_orders, 0) AS total_orders,
       COALESCE(s.total_boxes, 0) AS total_boxes,
       COALESCE(s.total_distance_m, 0) AS total_distance_m,
       s.last_delivery_at,
       COALESCE(s.total_boxes, 0) * p.price_per_box_sat AS revenue_sat,
       COALESCE(s.total_boxes, 0) * p.food_cost_per_box_sat AS food_cost_sat,
       COALESCE(s.delivery_cost_sat, 0) AS delivery_cost_sat,
       CAST(COALESCE(s.total_boxes, 0) * p.price_per_box_sat AS SIGNED)
         - CAST(COALESCE(s.total_boxes, 0) * p.food_cost_per_box_sat AS SIGNED)
         - CAST(COALESCE(s.delivery_cost_sat, 0) AS SIGNED) AS profit_sat
FROM delivery_plans AS p
LEFT JOIN (
  SELECT plan_id, COUNT(*) AS total_jobs,
         SUM(total_orders) AS total_orders, SUM(total_boxes) AS total_boxes,
         SUM(distance_m) AS total_distance_m,
         MAX(last_delivery_at) AS last_delivery_at,
         SUM(delivery_cost_sat) AS delivery_cost_sat
  FROM v_job_summary GROUP BY plan_id
) AS s ON s.plan_id = p.id;
