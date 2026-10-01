-- Read-only query examples; replace demo inputs with backend parameter bindings.
USE lunch_dispatch;
SET time_zone = '+07:00';

-- 1. Orders available for planning today; version fields are copied into stops.
SELECT o.id, o.delivery_date, o.quantity, o.version AS order_version,
       c.id AS customer_id, c.name, c.phone, c.address,
       c.latitude, c.longitude, c.version AS customer_version
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE o.delivery_date = CURRENT_DATE() AND o.status = 'PENDING' AND c.is_active = 1
ORDER BY o.id;

-- 2. Compare draft plans; divide cents by 100 and metres by 1000 only for display.
SELECT plan_id, status, total_orders, total_boxes, total_jobs,
       total_distance_m / 1000 AS distance_km,
       revenue_sat / 100 AS revenue_baht,
       food_cost_sat / 100 AS food_cost_baht,
       delivery_cost_sat / 100 AS delivery_cost_baht,
       profit_sat / 100 AS profit_baht, last_delivery_at
FROM v_plan_summary WHERE delivery_date = CURRENT_DATE()
ORDER BY delivery_cost_sat, plan_id;

-- 3. Job lookup: the demo code intentionally matches no seeded job.
SET @demo_job_code = 'REPLACE_WITH_REAL_JOB_CODE';
SELECT j.job_code, j.color, js.total_boxes, j.distance_m, j.geometry_json,
       p.departure_at, p.deadline_at,
       s.sequence_no, s.order_id, s.quantity_snapshot,
       s.customer_name_snapshot, s.phone_snapshot, s.address_snapshot,
       s.latitude_snapshot, s.longitude_snapshot, s.estimated_delivery_at
FROM delivery_jobs AS j
JOIN delivery_plans AS p ON p.id = j.plan_id
JOIN v_job_summary AS js ON js.job_id = j.id
JOIN delivery_stops AS s ON s.job_id = j.id
WHERE j.job_code = @demo_job_code AND p.status = 'CONFIRMED'
  AND p.delivery_date = CURRENT_DATE() AND j.valid_until > NOW()
ORDER BY s.sequence_no;

-- 4. Recipe example, independent of seed data: 6 boxes, 2 km => fee 39, profit 111.
SELECT (1500 + ROUND(200 * 6 * 2000 / 1000, 0)) / 100 AS delivery_fee_baht,
       (6 * 6500 - 6 * 4000 - (1500 + ROUND(200 * 6 * 2000 / 1000, 0))) / 100
         AS profit_baht;
