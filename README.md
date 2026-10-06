# เที่ยงไว — Angular เชื่อม Express + MySQL

โฟลเดอร์นี้เป็น Angular Frontend ส่วน Express + MySQL Backend อยู่ที่ `E:\ADVweb\node-express-mysql` ใช้หน้าตาเดิมจาก Figma และ daisyUI

## ติดตั้งครั้งแรก

ติดตั้ง dependencies แยกกันในทั้งสองโฟลเดอร์:

```powershell
cd E:\ADVweb\node-express-mysql
npm ci
cd E:\ADVweb\frontend-ui-html-css
npm ci
```

ตั้งค่า `.env` และ `ca.pem` ในโฟลเดอร์ Backend เท่านั้น Frontend เรียก API ผ่าน `/api` โดยไม่ใช้รหัสผ่านฐานข้อมูล

## เปิดใช้งาน

เปิด Terminal สองอัน แล้วปล่อยให้ทั้งสองทำงานไว้

**Terminal 1: Backend**

```powershell
cd E:\ADVweb\node-express-mysql
npm run dev
```

**Terminal 2: Frontend**

```powershell
cd E:\ADVweb\frontend-ui-html-css
npm start
```

เปิด `http://127.0.0.1:4200` Angular จะส่งคำขอ `/api` ผ่าน dev proxy ไป Backend ที่ `http://127.0.0.1:3000` ซึ่งเชื่อมฐานข้อมูล Aiven อีกที หากเปลี่ยนพอร์ต Backend ให้แก้ `proxy.conf.json` ด้วย

## สิ่งที่ใช้ได้

- **ลูกค้า:** ค้นหาจากชื่อ/เบอร์/ที่อยู่ เลือกดูรายละเอียด เพิ่ม แก้ไข และลบพร้อมยืนยัน; เปิด Google Maps จากพิกัดที่เก็บจริง
- **ออเดอร์:** ค้นหา กรองวันที่/สถานะ ดูสรุป เพิ่ม แก้ไข ลบพร้อมยืนยัน และจำลอง 20–30 ออเดอร์
- **ภาพรวม:** จำนวนออเดอร์ จำนวนกล่อง และรายได้ประมาณการอัปเดตจากข้อมูล API; รายได้ใช้ราคากล่องละ 65 บาทตามแบบ
- แสดงสถานะโหลด รายการว่าง และข้อความผิดพลาดจาก Backend รวมถึงกรณีลบไม่ได้เพราะมีข้อมูลเกี่ยวข้อง (`409`)
- ฟอร์มแปลงค่าตัวเลขให้ตรงกับ Backend และปิดปุ่มระหว่างบันทึกเพื่อป้องกันการส่งซ้ำ

คำสั่งจำลองออเดอร์เพิ่มรายการใหม่ลงฐานข้อมูลทุกครั้ง ให้เลือกวันที่และจำนวนในฟอร์มก่อนกดยืนยัน

**เส้นทางและใบงานไรเดอร์ยังเป็นตัวอย่างจาก Figma** เพราะ Backend ปัจจุบันมี API ลูกค้าและออเดอร์เท่านั้น ปุ่มสร้าง/คำนวณ/ยืนยันแผนปิดไว้จนกว่าทีมจะเพิ่ม API ส่วนนี้ แผนที่ภาพวาดในหน้าลูกค้าเป็นตัวอย่างรูปแบบหน้าจอ; พิกัดข้อความและลิงก์ Google Maps ใช้ข้อมูลจริง

## โครงไฟล์ที่แก้ต่อได้

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/services/delivery-api.ts` | รวม HTTP requests ทั้ง 11 เส้นและแปลงพิกัด MySQL DECIMAL |
| `src/app/services/delivery-store.ts` | เก็บลูกค้า/ออเดอร์ร่วมกันและคำนวณสรุป |
| `src/app/pages/customers/` | หน้าลูกค้าและฟอร์ม |
| `src/app/pages/orders/` | หน้าออเดอร์และฟอร์มจำลอง |
| `src/app/app.ts`, `app.html` | เมนู ภาพรวม และหน้าไรเดอร์ตัวอย่าง |
| `src/styles/lunch-ui.css` | รูปแบบเดิมจาก Figma |
| `src/styles/integration.css` | ฟอร์มและสถานะที่เพิ่มสำหรับ API |
| `proxy.conf.json` | ส่ง `/api/**` ไปยัง `http://127.0.0.1:3000` |

`frontend-ui-skeleton/` เป็นชุด HTML/CSS ต้นฉบับที่เก็บไว้สำหรับอ้างอิง ตัวเว็บที่เชื่อม Backend แล้วอยู่ใน `src/` และต้องเปิดด้วย `npm start`

## API ที่เชื่อม

| Method | Path | การใช้งาน |
|---|---|---|
| GET | `/api/customers` | รายชื่อลูกค้า |
| GET | `/api/customers/:id` | รายละเอียดลูกค้า |
| POST | `/api/customers` | เพิ่มลูกค้า |
| PUT | `/api/customers/:id` | แก้ไขลูกค้า |
| DELETE | `/api/customers/:id` | ลบลูกค้า |
| GET | `/api/orders` | รายการออเดอร์ |
| GET | `/api/orders/:id` | รายละเอียดออเดอร์ (เติมใน Backend ชุดนี้) |
| POST | `/api/orders` | เพิ่มออเดอร์ |
| PUT | `/api/orders/:id` | แก้จำนวนกล่องและวันที่ส่ง |
| DELETE | `/api/orders/:id` | ลบออเดอร์ |
| POST | `/api/orders/simulate` | เพิ่มออเดอร์จำลอง |

`PUT` ออเดอร์แก้ได้เฉพาะ `PENDING` ที่ยังไม่อยู่ในแผนจัดส่ง ลูกค้าที่มีออเดอร์และออเดอร์ที่มีจุดส่งอาจลบไม่ได้ ข้อความปฏิเสธจาก Backend จะแสดงในฟอร์ม

## ตรวจโค้ด

```powershell
npm run build
npm test -- --watch=false
```

Unit tests ใช้ HTTP mocks และข้อมูลจำลอง ไม่เขียนลง Aiven การตรวจระบบจริงใช้ GET ผ่าน Frontend proxy

Proxy นี้ใช้ตอน `ng serve` หากนำ build ไปเปิดออนไลน์ ให้ตั้ง reverse proxy `/api` ไปยัง Backend ของทีมด้วย

การเชื่อมชุดนี้ไม่ได้เปลี่ยนตารางหรือ ER Diagram
