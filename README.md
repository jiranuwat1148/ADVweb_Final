# เที่ยงไว — Angular + Express + MySQL

มินิโปรเจกต์จัดเส้นทางและแบ่งงานไรเดอร์ส่งข้าวกล่องมื้อเที่ยง

## โครงสร้าง

```text
src/                       Angular Frontend
public/                    รูปและฟอนต์
frontend-ui-skeleton/      แบบ HTML/CSS จาก Figma สำหรับอ้างอิง
backend/
  controller/              API ทั้ง 16 เส้นและการเชื่อมฐานข้อมูล
  services/                จัดเส้นทาง คำนวณเงิน และบันทึกแผน
  middleware/              ตรวจ login และจำกัดการเรียก
  scripts/                 ตั้งบัญชี อัปเดตฐานข้อมูล และรันทดสอบ
  sql/schema.sql           CREATE DATABASE และ 5 ตาราง
  sql/001-plan-json.sql     เพิ่ม plan_json สำหรับฐานข้อมูลเดิม
  sql/er-diagram.md         ER Diagram
  tests/                   ทดสอบ Backend โดยไม่เขียน Aiven จริง
```

ไฟล์ API อยู่ใน backend/controller/ และ app.ts ผูก Router จากตำแหน่งนี้

## ติดตั้งและเปิด Backend

ใช้ Node.js 22 หรือ 24 หลัง Clone ให้เปิด Terminal ที่โฟลเดอร์ repository แล้วรัน:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

แก้ .env ให้ตรงกับ MySQL/Aiven ของตัวเอง: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME=delivery_app และ DB_CA_PATH
ใช้ ca.pem ของบริการนั้น โค้ดเชื่อมฐานข้อมูลผ่าน TLS

- ฐานข้อมูลใหม่: เปิด backend/sql/schema.sql ในโปรแกรมจัดการ MySQL แล้วรัน จะสร้าง delivery_app และตารางทั้ง 5 ตาราง
- ฐานข้อมูลเดิมจากเวอร์ชันก่อน: ใช้ npm run db:migrate เพื่อเพิ่ม delivery_plans.plan_json โดยไม่ล้างข้อมูล
- หากมี .env ที่ตั้งไว้แล้ว ให้รักษาไฟล์เดิมแทนการคัดลอกทับ

ตั้งบัญชีเจ้าของร้านและเปิด Backend:

```powershell
npm run auth:setup
npm run dev
```

Backend เปิดที่ http://localhost:3000
ดูตัวอย่าง request/response และขั้นตอนทดสอบใน [คู่มือ Backend](backend/README.md)

## ติดตั้งและเปิด Frontend

เปิด Terminal อีกอันที่โฟลเดอร์ repository:

```powershell
npm ci
npm start
```

เปิด http://127.0.0.1:4200 Angular dev proxy ส่ง /api ไป Backend ที่ port 3000

Frontend ปัจจุบันมีหน้าภาพรวม ลูกค้า ออเดอร์ และตัวอย่างใบงานไรเดอร์จาก Figma
โค้ด HttpClient มี 11 เส้นสำหรับลูกค้าและออเดอร์
**ยังต้องเพิ่มขั้นตอน login และแนบ Authorization: Bearer TOKEN เพื่อใช้กับ Backend 16 เส้นชุดนี้**
ส่วนปุ่มคำนวณ/ยืนยันแผนและใบงานไรเดอร์บน Frontend ยังต้องเชื่อม API เพิ่ม จึงยังไม่ได้เปิดใช้งานจริงจากหน้าเว็บ
ทดสอบ Backend ได้ด้วยโปรแกรมทดสอบ API ตามคู่มือใน backend/README.md

## API Backend 16 เส้น

| Method | Path | หน้าที่ |
|---|---|---|
| POST | /api/auth/login | เจ้าของร้านเข้าสู่ระบบ |
| GET | /api/customers | รายชื่อลูกค้า |
| GET | /api/customers/:id | ลูกค้าคนเดียว |
| POST | /api/customers | เพิ่มลูกค้า |
| PUT | /api/customers/:id | แก้ไขลูกค้า |
| DELETE | /api/customers/:id | ลบลูกค้า |
| GET | /api/orders | รายการออเดอร์ กรอง date/status ได้ |
| GET | /api/orders/:id | ออเดอร์เดียว |
| POST | /api/orders | เพิ่มออเดอร์ |
| PUT | /api/orders/:id | แก้จำนวนกล่องและวันส่ง |
| DELETE | /api/orders/:id | ลบ/ยกเลิกออเดอร์ PENDING |
| POST | /api/orders/simulate | จำลองออเดอร์ 20–30 รายการ |
| POST | /api/plans | จัดเส้นทาง คำนวณต้นทุน และบันทึก DRAFT |
| GET | /api/plans/:id | ดูแผน ใบงาน เส้นทาง และกำไร |
| POST | /api/plans/:id/confirm | ยืนยันแผนและมอบหมายออเดอร์ |
| POST | /api/rider/jobs/lookup | ไรเดอร์ค้นหาใบงานด้วยรหัส |

API ลูกค้า ออเดอร์ และแผนต้องมี token เจ้าของร้าน ส่วน login และ rider lookup ไม่ต้องมี token นี้
ใบงานละไม่เกิน 3 ออเดอร์ ออเดอร์ละ 1–3 กล่อง และลูกค้าอยู่ในรัศมีร้าน 3 กม.

## ตรวจโค้ด

Frontend จากโฟลเดอร์ repository:

```powershell
npm run build
npm test -- --watch=false
```

Backend:

```powershell
cd backend
npm run typecheck
npm test
```

ชุดทดสอบใช้ฐานข้อมูลและ HTTP mocks ไม่เพิ่มออเดอร์หรือยืนยันแผนบน Aiven จริง
Frontend proxy ใช้ตอนพัฒนา หากนำเว็บขึ้นออนไลน์ต้องกำหนด /api ให้ชี้ไป Backend ของทีม
