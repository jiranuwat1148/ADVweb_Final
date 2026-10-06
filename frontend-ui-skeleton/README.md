# โครงหน้าเว็บเที่ยงไว — HTML/CSS สำหรับให้ทีมทำต่อ

อ้างอิง Figma เดิม: [เที่ยงไว · Lunch Dispatch](https://www.figma.com/design/2lpTduvyNHCy7Smn0TgJrd)

มี 4 หน้าตามแบบ: ภาพรวมการจัดส่ง, ออเดอร์, ลูกค้าและพิกัด, ใบงานไรเดอร์บนมือถือ ใช้สีและตัวอักษร Noto Sans Thai / Manrope จากแบบเดิม พร้อมฟอนต์ในเครื่องและแผนที่ SVG ตัวอย่าง

## เปิดดูได้ทันที

ดับเบิลคลิก `preview/index.html` เมนูเปลี่ยนหน้าทำงานด้วย radio และ CSS ไม่ต้องติดตั้งอะไร การ์ด TW-1001 เปิดหน้าตัวอย่างใบงานได้ และกดชื่อเที่ยงไวในหน้าไรเดอร์เพื่อกลับภาพรวม

ใช้คีย์บอร์ดได้โดยกด Tab ไปที่เมนู แล้วกดลูกศรซ้าย/ขวาเพื่อเปลี่ยนหน้า เมื่ออยู่หน้าไรเดอร์บนมือถือ กรอบโฟกัสจะแสดงที่หัวหน้าแทนเมนูร้านที่ซ่อนไว้

ข้อมูล ตัวเลข เส้นทาง และเวลาเป็นตัวอย่างคงที่ ปุ่มเพิ่ม/แก้ไข/ลบ/จำลอง/คำนวณ/ยืนยัน/เปิดแผนที่/โทร รวมถึงการค้นหา ยังรอเพื่อนเชื่อม logic และ API

## ไฟล์สำหรับ Angular

| ไฟล์ในชุดนี้ | วางในโปรเจกต์ Angular |
|---|---|
| `angular/app.html` | `src/app/app.html` |
| `angular/app.css` | `src/app/app.css` |
| `angular/styles.css` | `src/styles.css` |
| `angular/styles/` ทั้งโฟลเดอร์ | `src/styles/` |
| `angular/index.html` | `src/index.html` สำหรับชื่อหน้าและภาษาไทย |

โปรเจกต์ `E:\ADVweb\delivery_fast` ได้รับไฟล์ HTML/CSS ชุดนี้แล้ว รันใน terminal:

```bat
cd /d E:\ADVweb\delivery_fast
npm start
```

เปิด `http://localhost:4200` โปรเจกต์มี Angular, Tailwind และ daisyUI อยู่แล้ว ใช้ `@plugin 'daisyui'` ใน global CSS พร้อม theme `lunch` ตามสี Figma

ชุดส่งต่อไม่มีไฟล์ `.ts` หรือ JavaScript สำหรับหน้าเว็บ ไม่ได้แก้ไฟล์ TypeScript เดิม ไม่เรียก Backend ไม่แก้ฐานข้อมูล และไม่ได้อัปขึ้น GitHub

ตรวจ `npm run build` ผ่านแล้ว และตรวจภาพใน Angular ทั้ง 4 หน้า รวมถึงใบงานไรเดอร์ขนาด 390/360 px ไฟล์ TypeScript เดิมทั้ง 6 ไฟล์มีค่า SHA-256 เท่าเดิม ภาพที่ตรวจไว้ดูได้ใน `preview/overview.jpg`, `orders.jpg`, `customers.jpg` และ `rider.jpg`

## ให้เพื่อนทำต่อ

HTML ของแต่ละหน้าแยกไว้ใน `fragments/overview.html`, `orders.html`, `customers.html`, `rider.html` และโครง sidebar อยู่ใน `fragments/shell-start.html` เมื่อนำไปแยกเป็น Angular component ให้ใช้ stylesheet ร่วมจาก `angular/styles/lunch-ui.css` และเปลี่ยน radio/CSS navigation เป็น Angular Router ตามที่ทีมออกแบบ

Map placeholder ใน fragment ใช้แทนด้วย SVG จาก `assets/dispatch-map.svg` หรือ `assets/customer-map.svg` ใน `angular/app.html` และพรีวิวใส่ SVG ไว้แล้ว จึงเปิดดูได้ทันที ทั้งสองเป็นภาพวาดตามแบบ ไม่ได้อ่านพิกัดจริงจากฐานข้อมูล

มี `TODO` และ `data-action` ไว้บอกตำแหน่งที่จะเชื่อม API ค่า `data-customer-id` และ `data-order-id` เป็นเลขตัวอย่าง ให้แทนด้วย `id` จาก Backend เมื่อดึงข้อมูลจริง รหัส `ORD-001` เป็นข้อความแสดงผลตัวอย่าง

| ส่วนหน้าจอ | API ที่ทีมเตรียมไว้ / งานที่ต้องต่อ |
|---|---|
| รายชื่อลูกค้าและข้อมูลลูกค้า | `GET /api/customers`, `GET /api/customers/:id` |
| เพิ่ม/แก้ไข/ลบลูกค้า | `POST /api/customers`, `PUT /api/customers/:id`, `DELETE /api/customers/:id` |
| รายการออเดอร์และรายละเอียด | `GET /api/orders`, `GET /api/orders/:id` |
| เพิ่ม/แก้ไข/ลบออเดอร์ | `POST /api/orders`, `PUT /api/orders/:id`, `DELETE /api/orders/:id` |
| ปุ่มจำลองออเดอร์ | `POST /api/orders/simulate` |
| ภาพรวมเส้นทางและใบงาน | รอสมาชิกที่รับผิดชอบจัดเส้นทางต่อ API และข้อมูล `delivery_plans`, `delivery_jobs`, `delivery_stops` |

ปุ่มเพิ่ม/แก้ไขมีโครงตำแหน่งตาม Figma แต่ยังไม่มีฟอร์ม modal ในแบบต้นฉบับ ให้ทีมสร้างฟอร์มและ validation ตอนเชื่อม API ภายหลัง

บนหน้าจอเล็ก เมนูร้านจะเปลี่ยนเป็นแนวนอน การ์ดเรียงใหม่ และตารางเลื่อนด้านข้างได้ หน้าของไรเดอร์ยึดขนาดต้นแบบ 390 px และปรับลงได้บนมือถือ

## แหล่งอ้างอิงและฟอนต์

ใช้ไฟล์ต้นฉบับที่สร้าง Figma และภาพอ้างอิงที่บันทึกไว้ในงานนี้ การอ่าน design context ล่าสุดผ่าน Figma MCP ติดโควตา Starter จึงไม่ได้ยืนยันการเปลี่ยนแปลงใน Figma หลังจากต้นแบบดังกล่าว

ฟอนต์นำมาจาก Google Fonts และแจกจ่ายพร้อม SIL Open Font License ใน `angular/styles/fonts/` สีหลัก #163E32, #217A54; พื้นหลัง #F6F8F5; เส้นขอบ #E4E9E3
