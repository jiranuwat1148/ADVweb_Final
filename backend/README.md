# Backend ระบบส่งข้าวกล่อง

โค้ดจากโปรเจกต์ `node-express-mysql` ใช้ Node.js, Express, TypeScript และ MySQL2 เชื่อมต่อ MySQL บน Aiven

## เริ่มใช้งานบน Windows

เปิด Terminal ในโฟลเดอร์ `backend` แล้วติดตั้ง dependencies:

```bat
npm ci
```

สร้างไฟล์ตั้งค่าจากตัวอย่าง:

```bat
copy .env.example .env
```

เปิด `.env` แล้วกรอกข้อมูลจาก Aiven:

- `DB_HOST`: Host ของ MySQL
- `DB_PORT`: Port ของ MySQL ตัวอย่างตั้งไว้เป็น `19992` ให้ใช้ค่าจริงของบริการ
- `DB_USER`: Username
- `DB_PASSWORD`: Password
- `DB_NAME`: ฐานข้อมูลที่มีตาราง `customer` สำหรับโปรเจกต์นี้ใช้ `delivery_app`
- `DB_CA_PATH`: ตำแหน่งไฟล์ CA certificate ตัวอย่างใช้ `./ca.pem`
- `PORT`: Port ของ API ตัวอย่างใช้ `3000`

นำ CA certificate ของบริการ Aiven มาวางในโฟลเดอร์ `backend` ตั้งชื่อ `ca.pem` แล้วบันทึก `.env` ด้วย `Ctrl + S`

ไฟล์ `.env`, certificate, `node_modules` และผลลัพธ์การ build ถูกยกเว้นด้วย `.gitignore` ให้แต่ละคนตั้งค่าบนเครื่องของตนเอง

## เปิด API ระหว่างพัฒนา

รันคำสั่งจากโฟลเดอร์ `backend` เพื่อให้โปรแกรมหา `.env` และ `ca.pem` เจอ:

```bat
npx ts-node-dev --respawn --transpile-only server.ts
```

หรือใช้คำสั่งที่ใช้ระหว่างเรียน:

```bat
npx tsx watch server.ts
```

`tsx` ยังไม่ได้อยู่ใน dependencies ของโปรเจกต์ คำสั่ง `npx` อาจให้ยืนยันการดาวน์โหลดก่อนใช้งานครั้งแรก

## ตรวจ TypeScript และ build

ตรวจชนิดข้อมูล:

```bat
npx tsc --noEmit
```

สร้างไฟล์ JavaScript แล้วเปิด API:

```bat
npx tsc
node dist/server.js
```

## API ที่มีในโค้ด

| Method | Path | การใช้งาน |
| --- | --- | --- |
| GET | `/api/customers` | อ่านลูกค้าทั้งหมด |
| GET | `/api/customers/:id` | อ่านลูกค้าตาม id |
| POST | `/api/customers` | เพิ่มลูกค้า |
| PUT | `/api/customers/:id` | แก้ไขลูกค้า |

ตัวอย่าง URL สำหรับอ่านลูกค้า: `http://localhost:3000/api/customers`

สำหรับ POST และ PUT ตั้ง header เป็น `Content-Type: application/json` แล้วส่งข้อมูลในช่อง BODY:

```json
{
  "name": "ธนวัฒน์ ใจดี",
  "phone": "0800002001",
  "address": "หอพักใกล้มหาวิทยาลัย ต.ขามเรียง",
  "latitude": 16.245,
  "longitude": 103.251
}
```

PUT ใช้ id ของลูกค้าที่มีอยู่จริงใน URL และส่งข้อมูลทั้งชุด

ฐานข้อมูลต้องมีตาราง `customer` และคอลัมน์ `id`, `name`, `phone`, `address`, `latitude`, `longitude` ดู SQL ของโปรเจกต์ในโฟลเดอร์ `database` ของ repository
