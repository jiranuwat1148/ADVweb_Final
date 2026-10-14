# ER Diagram ของ API ครบระบบ

เพิ่มแถว plan_json ชนิด JSON ใน delivery_plans เท่านั้น ยังใช้ 5 ตารางและเส้นความสัมพันธ์เดิม
บัญชีเจ้าของร้านหนึ่งบัญชีเก็บ username/password hash ใน .env จึงไม่เพิ่มตารางผู้ใช้

```mermaid
erDiagram
    customer ||--o{ orders : places
    orders ||--o{ delivery_stops : appears_in
    delivery_plans ||--o{ delivery_jobs : contains
    delivery_jobs ||--o{ delivery_stops : contains

    customer {
        int_unsigned id PK
        varchar100 name
        varchar20 phone
        varchar500 address
        decimal10_7 latitude
        decimal10_7 longitude
    }
    orders {
        int_unsigned id PK
        int_unsigned customer_id FK
        tinyint_unsigned quantity
        date delivery_date
        enum status
    }
    delivery_plans {
        int_unsigned id PK
        date delivery_date
        datetime departure_at
        datetime deadline_at
        enum status
        json plan_json
    }
    delivery_jobs {
        int_unsigned id PK
        int_unsigned plan_id FK
        varchar32 job_code UK
        char7 color
        int_unsigned distance_m
        json geometry_json
    }
    delivery_stops {
        int_unsigned id PK
        int_unsigned job_id FK
        int_unsigned order_id FK
        tinyint_unsigned sequence_no
        datetime estimated_delivery_at
    }
```

plan_json เก็บพิกัดร้าน สมมติฐานเวลา ผลคำนวณ และสำเนาลูกค้า/ออเดอร์พร้อม fingerprint
จึงตรวจแผนล้าสมัยก่อนยืนยันและรักษาข้อมูลเดิมของใบงานได้ โดยไม่เพิ่มฟิลด์ snapshot หลายช่อง

ออเดอร์เดียวอาจอยู่ใน DRAFT หลายแผนเพื่อเปรียบเทียบได้ แต่ backend อนุญาต CONFIRMED เพียงหนึ่งแผนต่อวัน
ใบงานมีจุดส่ง 1–3 จุด โดย sequence_no ไม่ซ้ำภายในใบงาน
