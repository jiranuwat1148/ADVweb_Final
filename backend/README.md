# Backend เที่ยงไว: API ครบ 16 เส้น

ใช้ Node.js + Express + TypeScript + MySQL บน Aiven สำหรับมินิโปรเจกต์จัดส่งมื้อเที่ยง
Frontend อยู่ที่โฟลเดอร์ราก repository และใช้ Angular proxy /api มาที่ port 3000

## เริ่มใช้งาน

สำหรับฐานข้อมูลใหม่ ให้รัน sql/schema.sql ในโปรแกรมจัดการ MySQL ก่อน และคัดลอก .env.example เป็น .env แล้วกรอกการเชื่อมต่อของตัวเอง

เปิด Terminal ในโฟลเดอร์ backend ของ repository แล้วรันตามลำดับ:

```powershell
npm install
npm run db:migrate
npm run auth:setup
npm run dev
```

ถ้ามี node_modules อยู่แล้ว ข้าม npm install ได้

- db:migrate เพิ่มช่อง plan_json ใน delivery_plans หากยังไม่มี ไม่ล้างข้อมูล และรันซ้ำได้
- auth:setup ให้ตั้งชื่อผู้ใช้และรหัสผ่านเจ้าของร้านเอง รหัสผ่านอย่างน้อย 12 ตัวอักษรและไม่แสดงขณะพิมพ์ สคริปต์เก็บเฉพาะ password hash ใน .env พร้อมรักษาค่าเชื่อมต่อ DB เดิม
- ต้อง restart backend หลังตั้ง/เปลี่ยนบัญชี
- ถ้ายังไม่ตั้งบัญชี API เจ้าของร้านจะตอบ 503 เพื่อแจ้งให้ตั้งค่าก่อน
- ไม่ต้องเพิ่มตารางผู้ใช้ เพราะใช้บัญชีเจ้าของร้านหนึ่งบัญชีสำหรับขอบเขตนี้

ใช้ .env.example เป็นตัวอย่างการตั้งค่าเท่านั้น อย่าคัดลอกทับ .env ที่เชื่อม Aiven ได้อยู่แล้ว

## รายการ API

Base URL: http://localhost:3000

| Method | URL | หน้าที่ | สิทธิ์ |
|---|---|---|---|
| POST | /api/auth/login | เข้าสู่ระบบเจ้าของร้าน | ไม่ต้องมี token |
| GET | /api/customers | ลูกค้าทั้งหมด | เจ้าของร้าน |
| GET | /api/customers/:id | ลูกค้าคนเดียว | เจ้าของร้าน |
| POST | /api/customers | เพิ่มลูกค้า | เจ้าของร้าน |
| PUT | /api/customers/:id | แก้ไขลูกค้า | เจ้าของร้าน |
| DELETE | /api/customers/:id | ลบลูกค้าที่ไม่มีออเดอร์อ้างอิง | เจ้าของร้าน |
| GET | /api/orders | ออเดอร์ทั้งหมด กรอง ?date=YYYY-MM-DD&status=PENDING ได้ | เจ้าของร้าน |
| GET | /api/orders/:id | ออเดอร์เดียว | เจ้าของร้าน |
| POST | /api/orders | เพิ่มออเดอร์ | เจ้าของร้าน |
| PUT | /api/orders/:id | แก้จำนวนกล่องและวันส่งของออเดอร์ PENDING | เจ้าของร้าน |
| DELETE | /api/orders/:id | ลบ/ยกเลิกออเดอร์ PENDING | เจ้าของร้าน |
| POST | /api/orders/simulate | จำลองออเดอร์ 20–30 รายการ | เจ้าของร้าน |
| POST | /api/plans | คำนวณและบันทึกแผน DRAFT | เจ้าของร้าน |
| GET | /api/plans/:id | รายละเอียดแผน ใบงาน เส้นทาง และต้นทุน | เจ้าของร้าน |
| POST | /api/plans/:id/confirm | ยืนยันแผนและเปลี่ยนออเดอร์เป็น ASSIGNED | เจ้าของร้าน |
| POST | /api/rider/jobs/lookup | ค้นหาใบงานด้วย job_code | ไม่ต้องมี token เจ้าของร้าน |

ในช่อง URL ของโปรแกรมทดสอบ ใส่เฉพาะ http://localhost:3000/api/... ส่วน GET/POST/PUT/DELETE เลือกในช่อง Method

## ทดลองครบหนึ่งรอบ

ใช้วันที่ส่งจริงตามเวลาไทยแทน YYYY-MM-DD ในตัวอย่าง

### 1. เข้าสู่ระบบ

POST /api/auth/login

```json
{
  "username": "ชื่อที่ตั้งด้วย auth:setup",
  "password": "รหัสผ่านที่ตั้งเอง"
}
```

ได้ 200 พร้อม token, token_type, expires_in และ user
เก็บ token จาก response แล้วเพิ่ม Headers ใน API เจ้าของร้านทุกเส้น:

```text
Content-Type: application/json
Authorization: Bearer TOKEN_ที่ได้จากการ_login
```

Token มีอายุ 8 ชั่วโมงโดยค่าเริ่มต้น และหมดอายุเมื่อ restart backend เพราะเก็บ session ในหน่วยความจำของ backend เครื่องเดียว
จำกัดการ login 20 ครั้งต่อ IP ใน 15 นาที หากเกินตอบ 429 พร้อม Retry-After

### 2. ตรวจลูกค้าและออเดอร์

```text
GET /api/customers
GET /api/orders?date=YYYY-MM-DD&status=PENDING
```

ลูกค้าและออเดอร์ยังคืน JSON array ตามรูปแบบเดิม
เพิ่มออเดอร์ด้วย POST /api/orders:

```json
{
  "customer_id": 1,
  "quantity": 2,
  "delivery_date": "YYYY-MM-DD"
}
```

ใช้ customer_id ที่มีจริง จำนวนกล่องต้องเป็นจำนวนเต็ม 1–3
สำหรับ POST /api/orders/simulate ใช้:

```json
{
  "count": 24,
  "delivery_date": "YYYY-MM-DD"
}
```

แต่ละครั้งเพิ่มชุดออเดอร์ใหม่ จึงอย่ากดซ้ำหากไม่ต้องการเพิ่มอีกชุด

### 3. สร้างแผน

POST /api/plans

```json
{
  "delivery_date": "YYYY-MM-DD",
  "shop": {
    "latitude": 16.245,
    "longitude": 103.251
  },
  "routing_mode": "straight_line"
}
```

เปลี่ยนพิกัดตัวอย่างให้เป็นร้านจริง ลูกค้าทุกออเดอร์ต้องอยู่ในรัศมี 3 กม.
หรือกำหนด SHOP_LATITUDE และ SHOP_LONGITUDE ใน .env แล้วไม่ต้องส่ง shop ทุกครั้ง

- straight_line คือโหมดจำลอง ใช้ระยะเส้นตรงและคืน is_simulation=true
- road เป็นโหมดเริ่มต้น ใช้ถนนจาก OSRM และตรวจระยะของเส้นทางสุดท้ายเพื่อคำนวณค่าส่งและเวลาให้ตรงกับเส้นบนแผนที่ ถ้าบริการหาเส้นทางไม่ได้จะตอบ 502 โดยไม่บันทึกแผนและไม่เปลี่ยนไปใช้เส้นตรงเอง
- ขอบเขตนี้รองรับออเดอร์ PENDING ไม่เกิน 60 รายการต่อแผน
- ออกส่งพร้อมกัน 11:30 น. ส่งมอบ 2 นาทีต่อจุด ความเร็วสมมติ 30 กม./ชม. และเผื่อเวลา 5 นาที จึงตั้งเป้าส่งเสร็จภายใน 12:25 น.
- ใบงานละไม่เกิน 3 ออเดอร์ ไม่ใช่ 3 กล่อง
- ค่าส่งต่อใบงาน = 15 + 2 × กล่องรวม × ระยะกิโลเมตร คิดจากร้านถึงลูกค้าคนสุดท้าย ไม่รวมขากลับร้าน
- ขาย 65 บาท/กล่อง ต้นทุนอาหาร 40 บาท/กล่อง
- รวมงานเฉพาะเมื่อช่วยลดค่าส่ง อัลกอริทึม greedy เป็นแผนแนะนำ ไม่รับประกันคำตอบที่ถูกที่สุดทุกกรณี

ได้ 201 พร้อม id, status=DRAFT, summary และ jobs
เงินใน response เป็นบาท ระยะทางเป็นเมตร เวลาที่คืนเป็นวัน/เวลาท้องถิ่นกรุงเทพฯ
GeoJSON ใช้ [longitude, latitude] ส่วน Leaflet ต้องแปลงเป็น [latitude, longitude]

### 4. ดูและยืนยันแผน

```text
GET /api/plans/ID_ที่ได้
POST /api/plans/ID_ที่ได้/confirm
```

Confirm ส่ง body {} ได้ ยืนยันแผนได้หนึ่งแผนต่อวัน
ถ้ากดยืนยันซ้ำจะคืนใบงานเดิมพร้อม already_confirmed=true
ถ้ามีการเพิ่ม ลบ ยกเลิก หรือแก้ไขออเดอร์/ข้อมูลลูกค้าระหว่างคำนวณกับยืนยัน จะตอบ 409 ให้คำนวณใหม่
ปุ่มคำนวณใหม่ใช้ POST /api/plans เส้นเดิมเพื่อสร้าง DRAFT อีกแผน
หากข้อมูลและระยะทางเหมือนเดิมจะได้การแบ่งงานเดิม ยังไม่ได้เพิ่มการสุ่มแผนทางเลือก

### 5. เปิดใบงานไรเดอร์

นำ job_code ของหนึ่งใบงานจากแผนที่ยืนยันแล้วมาใช้:

POST /api/rider/jobs/lookup

```json
{
  "job_code": "LX-รหัสที่ได้จากแผน"
}
```

ไรเดอร์ไม่ต้องส่ง Authorization ได้ข้อมูลเฉพาะใบงานนั้นและจุดส่งเรียงลำดับ
ใบงานใช้ได้เฉพาะวันส่งตามเวลาไทย หากยังเป็น DRAFT รหัสผิด หรือหมดวันส่ง ตอบ 404 โดยไม่เปิดเผยข้อมูลลูกค้า
จำกัด lookup 30 ครั้งต่อ IP ใน 15 นาที

## สิ่งที่ปรับจาก API เดิม

- API ลูกค้า ออเดอร์ และแผน ต้องแนบ Bearer token หลัง login
- Frontend เดิมต้องเพิ่มหน้าหรือขั้นตอน login และส่ง token ใน HttpClient จึงจะอ่านข้อมูลได้ โค้ด UI ยังไม่ได้เพิ่มขั้นตอนนี้ในงานเพิ่ม API
- GET /api/orders เพิ่ม date/status filter แบบ query parameter โดยไม่เปลี่ยน array response
- แก้ไขออเดอร์ที่อยู่ใน DRAFT ได้ แผนเดิมจะล้าสมัยและยืนยันไม่ได้
- DELETE ออเดอร์ที่ DRAFT อ้างอิงจะเปลี่ยนเป็น CANCELLED เพื่อรักษา FK และประวัติ; ออเดอร์ที่ไม่มีจุดส่งอ้างอิงลบจริง
- ห้ามแก้ ลบ หรือเพิ่มออเดอร์ในวันที่มีแผน CONFIRMED แล้ว
- ข้อมูลลูกค้าในใบงานเก็บเป็นสำเนา จึงไม่เปลี่ยนตามข้อมูลลูกค้าในอนาคต
- ห้ามแก้ลูกค้าที่อยู่ในแผนยืนยันของวันนี้หรืออนาคต; ประวัติแผนในอดีตไม่ล็อกลูกค้าถาวร
- ทุกการเขียนข้อมูลและยืนยันแผนใช้ transaction และล็อกเดียวกันของฐานข้อมูล ป้องกันแก้ข้อมูลกับยืนยันชนกัน
- แผนเดิมที่สร้างก่อนมี plan_json ไม่มีสำเนาต้นทาง จึงตอบ 409 เมื่อเปิด/ยืนยัน ต้องสร้างแผนใหม่จากออเดอร์ PENDING ที่ยังไม่ได้ยืนยัน

## ฐานข้อมูลและ ER

ยังมี 5 ตารางเดิมและความสัมพันธ์เดิม เพิ่มเพียง delivery_plans.plan_json JSON NULL
ดู sql/001-plan-json.sql สำหรับฐานข้อมูลเดิม, sql/schema.sql สำหรับฐานข้อมูลใหม่ และ sql/er-diagram.md สำหรับ ER ที่อัปเดตแล้ว
ไม่เพิ่ม created_at/updated_at และไม่เพิ่มตารางผู้ใช้

## ตรวจโค้ด

```powershell
npm run typecheck
npm test
```

Tests ใช้ฐานข้อมูลและบริการถนนจำลอง ไม่อ่าน .env จริง ไม่เพิ่มข้อมูล และไม่ยืนยันแผนบน Aiven

## อ้างอิงทางเทคนิค

การอ่านระยะถนนและรูปเส้นทางใช้ Table/Route API ตาม [เอกสาร OSRM](https://project-osrm.org/docs/v5.24.0/api/)
การเก็บ password hash ใช้ [Node.js scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)
การล็อกการเขียนข้อมูลใช้ [MySQL GET_LOCK / RELEASE_LOCK](https://dev.mysql.com/doc/refman/8.4/en/locking-functions.html)
