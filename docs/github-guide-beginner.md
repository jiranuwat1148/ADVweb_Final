# คู่มือ GitHub แบบเริ่มจากศูนย์ — ทีม ADVweb_Final

คู่มือนี้สำหรับทีม 4 คนที่ทำระบบส่งข้าวกล่อง ใช้ Windows และ **GitHub Desktop** เป็นหลัก อ่านแล้วกดตามทีละข้อได้ ไม่ต้องพิมพ์คำสั่ง Git

**เจ้าของโปรเจกต์:** ทำข้อ 1–4 แล้วทำข้อ 5 เป็นต้นไปเหมือนเพื่อน

**เพื่อนในทีม:** ทำข้อ 1 จากนั้นเริ่มข้อ 5 ได้เลย หลังรับคำเชิญ

ชื่อ repository ในตัวอย่างคือ `ADVweb_Final` และชื่อเจ้าของตามภาพคือ `jiranuwat1148` หากสร้างด้วยชื่ออื่น ให้ใช้ชื่อจริงของทีมแทน

## จำแค่ภาพนี้ก่อน

คิดว่าโปรเจกต์เป็นสมุดงานกลุ่ม:

| คำบนหน้าจอ | แปลแบบง่าย | ใช้เมื่อไร |
|---|---|---|
| Repository หรือ Repo | กล่องเก็บโปรเจกต์ | ทีมใช้กล่องเดียวกัน |
| Clone | เอาโปรเจกต์จาก GitHub มาไว้ในเครื่อง | ครั้งแรกของแต่ละเครื่อง |
| Branch | แยกพื้นที่ทำงานของเรา | ก่อนเริ่มงานใหม่ |
| `main` | งานหลักที่ทีมรวมไว้แล้ว | ใช้เป็นจุดเริ่มของงานใหม่ |
| Commit | บันทึกชุดการแก้ไขพร้อมตั้งชื่อ | ทำงานเสร็จเป็นช่วง ๆ |
| Push | ส่งสิ่งที่ Commit แล้วขึ้น GitHub | ให้เพื่อนเห็นงาน |
| Fetch | ตรวจว่าบน GitHub มีงานใหม่ไหม | ก่อนรับงานล่าสุด |
| Pull | รับงานบน GitHub ลงเครื่อง | อัปเดตงานใน branch ที่เลือก |
| Pull Request หรือ PR | ขอให้เพื่อนตรวจและรวมงาน | ส่งงานเข้า `main` |
| Merge | รวมงานจาก branch หนึ่งเข้าอีก branch | หลังตรวจงานแล้ว |

**กด Save ใน VS Code → Commit ใน GitHub Desktop → Push ขึ้น GitHub เป็นคนละขั้นตอน**

Save อย่างเดียวเพื่อนยังไม่เห็นงาน และ Commit อย่างเดียวงานยังอยู่ในเครื่องเรา ดูตัวอย่างขั้นตอนจริงในข้อ 6–8 ([คู่มือ Commit ของ GitHub](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop))

## 1. เตรียมของ — ทุกคนทำครั้งเดียว

1. มีบัญชี [GitHub](https://github.com/) ของตัวเอง คนละบัญชี
2. ติดตั้ง [GitHub Desktop](https://desktop.github.com/)
3. เปิด GitHub Desktop แล้วเลือก **Sign in to GitHub.com**
4. เข้าบัญชีของตัวเองในเบราว์เซอร์ แล้วอนุญาตให้ GitHub Desktop ใช้บัญชี
5. ถ้ามีหน้าตั้งชื่อและอีเมลสำหรับ Commit ให้ใช้ชื่อของตัวเองและอีเมลที่ผูกกับ GitHub
6. มีโปรแกรมแก้โค้ด เช่น VS Code และ Node.js สำหรับรันโปรเจกต์นี้

GitHub คือเว็บเก็บงาน ส่วน GitHub Desktop คือโปรแกรมที่ช่วยส่งและรับงานผ่านปุ่ม ([เริ่มต้นใช้ GitHub Desktop](https://docs.github.com/en/desktop/overview/getting-started-with-github-desktop))

## 2. สร้างกล่องเก็บงาน — เจ้าของทำคนเดียว

ถ้าสร้าง repository ไปแล้ว **ข้ามข้อนี้** ไม่ต้องสร้างซ้ำ

ที่หน้า **New repository** ตั้งค่าตามภาพที่ส่งมาได้:

| ช่อง | ใส่อะไร |
|---|---|
| Owner | บัญชีเจ้าของโปรเจกต์ |
| Repository name | `ADVweb_Final` |
| Description | `ระบบจัดเส้นทางและแบ่งงานไรเดอร์ส่งอาหารมื้อเที่ยง` |
| Visibility | Public ถ้าเปิดให้คนทั่วไปดู หรือ Private ถ้าให้เฉพาะผู้มีสิทธิ์ดู |
| Add README | ปิด |
| Add .gitignore | No .gitignore |
| Add license | No license |

กด **Create repository** ได้เลย เราจะนำ README และ `.gitignore` ที่อยู่ในโปรเจกต์เดิมขึ้นไปด้วย ([คู่มือสร้าง repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository))

## 3. เอาโปรเจกต์ขึ้นครั้งแรก — เจ้าของทำคนเดียว

### 3.1 เอา repository ว่างลงเครื่อง

1. เปิด GitHub Desktop
2. กด **File → Clone Repository**
3. เลือกแท็บ **URL**
4. วาง URL ของ repository เช่น `https://github.com/jiranuwat1148/ADVweb_Final`
5. ช่อง **Local Path** เลือกที่เก็บในเครื่อง เช่น `C:\Projects\ADVweb_Final`
6. กด **Clone**

ถ้าเพิ่งสร้าง repository จะยังไม่มีซอร์สโค้ด เป็นเรื่องปกติ ([คู่มือ Clone](https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-and-forking-repositories-from-github-desktop))

### 3.2 ใส่ไฟล์จาก ZIP

1. แตกไฟล์ `lunch-dispatch-website.zip` ที่ได้รับ
2. เปิดโฟลเดอร์ `lunch-dispatch` ที่แตกออกมา
3. คัดลอกไฟล์และโฟลเดอร์ข้างในไปวางใน `C:\Projects\ADVweb_Final`
4. คัดลอก `.gitignore` ไปด้วย ถ้ามองไม่เห็น ให้เปิดการแสดงไฟล์ซ่อนใน File Explorer
5. ไม่ต้องคัดลอก `node_modules`, `.angular` และ `dist` สำหรับการเก็บซอร์สของทีม

ให้ได้หน้าตาประมาณนี้ — **`package.json` อยู่ใน ADVweb_Final โดยตรง**:

```text
ADVweb_Final/
  .git/                 ← GitHub Desktop สร้างไว้ให้ ไม่ต้องแก้
  .gitignore
  README.md
  package.json
  package-lock.json
  angular.json
  tsconfig.json
  tsconfig.app.json
  preview.cjs
  public/
  scripts/
  src/
```

ไม่ต้องสร้าง `ADVweb_Final/lunch-dispatch/lunch-dispatch` ซ้อนหลายชั้น และไม่ต้องใส่ ZIP เป็นไฟล์เดียว เพราะเพื่อนต้องแก้ซอร์สข้างใน

`.gitignore` ของโปรเจกต์นี้มีรายการต่อไปนี้อยู่แล้ว:

```gitignore
node_modules/
dist/
.angular/
out-tsc/
*.log
```

### 3.3 บันทึกแล้วส่งขึ้น GitHub

1. กลับ GitHub Desktop เลือก **Current Repository → ADVweb_Final**
2. แท็บ **Changes** จะเห็นไฟล์ที่เพิ่งคัดลอกมา
3. ตรวจว่าไม่มีไฟล์ใน `node_modules` หรือ `.angular` เป็นพันไฟล์
4. ช่อง **Summary** พิมพ์ `เพิ่มโปรเจกต์ Angular เริ่มต้น`
5. กด **Commit to main** หรือปุ่ม Commit ที่แสดงชื่อ branch ปัจจุบัน
6. กด **Publish branch** ถ้าเป็นครั้งแรก หรือ **Push origin** ถ้ามีปุ่มนี้
7. เปิดหน้า repository บน GitHub แล้วรีเฟรช ต้องเห็น `src`, `package.json` และ `README.md`

**ถึงขั้นนี้งานอยู่บน GitHub แล้ว** ([วิธี Commit และ Push](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop), [วิธี Publish branch](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-branches-in-github-desktop))

คู่มือต่อไปใช้ `main` เป็นชื่อ branch หลัก หากของทีมชื่อ `master` ให้ใช้ `master` แทนทุกจุดที่เขียนว่า `main`

## 4. ชวนเพื่อนอีก 3 คน — เจ้าของทำคนเดียว

1. เปิดหน้า `ADVweb_Final` บนเว็บ GitHub
2. กด **Settings**
3. เลือก **Collaborators**
4. ถ้า GitHub ขอให้ยืนยันตัวตน ให้ทำตามหน้าจอ
5. กด **Add people**
6. ค้นหาชื่อบัญชี GitHub ของเพื่อน
7. ตรวจว่าบัญชีถูกคน แล้วกดเพิ่ม
8. ทำจนครบอีก 3 คน
9. เพื่อนเปิดคำเชิญจาก GitHub หรืออีเมล แล้วกด **Accept invitation**

ทุกคนใช้บัญชีของตัวเอง การเปิด Public ให้คนดูโค้ดได้ แต่เพื่อนต้องได้รับสิทธิ์ก่อนจึงส่งโค้ดเข้า repository นี้ได้ ([คู่มือเชิญเพื่อนร่วมทีม](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/inviting-collaborators-to-a-personal-repository))

## 5. เอางานลงเครื่องและเปิดเว็บ — เพื่อนทำครั้งแรก

รอให้เจ้าของเอาไฟล์ขึ้นเสร็จและรับคำเชิญก่อน เจ้าของที่ Clone ไปแล้วใช้โฟลเดอร์เดิมได้เลย

1. เปิด GitHub Desktop ที่เข้าบัญชีของตัวเองแล้ว
2. กด **File → Clone Repository → URL**
3. วาง URL ของ `ADVweb_Final`
4. เลือกโฟลเดอร์เก็บ เช่น `C:\Projects\ADVweb_Final`
5. กด **Clone**
6. เปิดโฟลเดอร์นี้ใน VS Code ด้วย **File → Open Folder**

ใช้ **Clone** สำหรับงานทีม เพื่อให้โฟลเดอร์เชื่อมกับ GitHub และส่งงานกลับได้ ([คู่มือ Clone](https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-and-forking-repositories-from-github-desktop))

ใน VS Code กด **Terminal → New Terminal** ตรวจว่าอยู่โฟลเดอร์ที่มี `package.json` แล้วพิมพ์ทีละบรรทัด:

```powershell
npm.cmd install
npm.cmd start
```

รอจนเว็บเริ่มทำงาน แล้วเปิด [http://127.0.0.1:4200](http://127.0.0.1:4200)

- บน Windows ใช้ `npm.cmd` เพื่อเลี่ยงปัญหา PowerShell บล็อก `npm.ps1`
- ติดตั้งแพ็กเกจครั้งแรกด้วย `npm.cmd install` และทำอีกครั้งเมื่อทีมเปลี่ยน dependencies
- ครั้งถัดไปเปิดเว็บด้วย `npm.cmd start`
- หยุดเว็บ: กลับ Terminal แล้วกด **Ctrl+C**
- ถ้ายังไม่มี Node.js ให้ติดตั้งก่อน โปรเจกต์นี้ทดสอบด้วย Node.js **24.18.0**

## 6. เริ่มทำงานของตัวเอง — ทำทุกครั้งที่เริ่มงานใหม่

ก่อนเปลี่ยน branch ให้ Save และ Commit งานที่ค้างใน branch เดิมให้เรียบร้อย ตรวจว่าแท็บ **Changes** ไม่มีงานค้าง

1. ใน GitHub Desktop กด **Current Branch → main**
2. กด **Fetch origin** เพื่อตรวจงานบน GitHub
3. ถ้ามีปุ่ม **Pull origin** ให้กด เพื่อรับงานหลักล่าสุด
4. กด **Current Branch → New Branch**
5. ตั้งชื่อบอกงาน เช่น `frontend/rider-page`
6. ถ้ามีช่องเลือกว่าจะเริ่มจาก branch ไหน ให้เลือก **main**
7. กด **Create Branch**
8. ตรวจด้านบนว่า Current Branch เป็นชื่อที่เพิ่งสร้าง
9. ไปแก้โค้ดใน VS Code ได้เลย

ข้อ 2–3 อัปเดต branch ที่เลือกอยู่ จึงต้องเลือก `main` ก่อนเริ่มงานใหม่ ([วิธี Fetch และ Pull](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop), [วิธีสร้าง branch](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-branches-in-github-desktop))

ตัวอย่างชื่อ branch สำหรับงานที่แบ่งไว้:

| สมาชิก | งาน | ตัวอย่าง branch |
|---|---|---|
| คนที่ 1 | ฐานข้อมูลและ API ลูกค้า/ออเดอร์ | `backend/customer-api` |
| คนที่ 2 | จัดเส้นทางและต้นทุน | `backend/route-planner` |
| คนที่ 3 | ภาพรวม แผนที่ และลูกค้า | `frontend/customer-page` |
| คนที่ 4 | ออเดอร์และหน้าไรเดอร์ | `frontend/rider-page` |

**หนึ่งงานใช้หนึ่ง branch** เช่น ทำหน้าไรเดอร์เสร็จและรวมงานแล้ว งานถัดไปสร้าง branch ใหม่จาก `main` ล่าสุด

Branch เป็นพื้นที่ทำงานแยกกัน แต่ถ้าแก้บรรทัดเดียวกันในไฟล์เดียวกัน ตอนรวมยังอาจชนกันได้ ให้ตกลงเจ้าของไฟล์กับทีมก่อน

## 7. ทำเสร็จแล้วส่งงานขึ้น — Commit + Push

ตัวอย่าง: เราแก้หน้าไรเดอร์ใน branch `frontend/rider-page`

1. ใน VS Code กด **Ctrl+S** เพื่อ Save ไฟล์ที่แก้ หรือ **File → Save All**
2. เปิดเว็บดูว่าปุ่มและหน้าที่แก้ใช้งานได้
3. กลับ GitHub Desktop ดูแท็บ **Changes**
4. คลิกไฟล์แต่ละไฟล์เพื่อดูสิ่งที่เปลี่ยน
5. เลือกเฉพาะไฟล์ที่เกี่ยวกับงานนี้
6. ช่อง **Summary** พิมพ์ เช่น `เพิ่มปุ่มนำทางในหน้าไรเดอร์`
7. กด **Commit to frontend/rider-page**
8. กด **Publish branch** ถ้ายังไม่เคยส่ง branch นี้ หรือ **Push origin** ถ้าเคยส่งแล้ว

**จบข้อนี้เพื่อนเห็น branch ของเราแล้ว แต่งานยังไม่ได้รวมเข้า `main`** ([คู่มือ Commit และ Push](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop), [คู่มือ Publish branch](https://docs.github.com/en/desktop/making-changes-in-a-branch/managing-branches-in-github-desktop))

ตัวอย่าง Summary ที่อ่านแล้วรู้ว่าเปลี่ยนอะไร:

```text
เพิ่มฟอร์มลูกค้า
แก้การคำนวณค่าส่ง
ปรับหน้าไรเดอร์ให้ใช้บนมือถือ
แก้ปุ่มยืนยันแผนไม่ทำงาน
```

## 8. ขอรวมงาน — สร้าง Pull Request

หลัง Push งานแล้ว:

1. ใน GitHub Desktop กด **Preview Pull Request**
2. ตรวจว่า **base** เป็น `main` และ branch งานเป็น `frontend/rider-page` หรือชื่อ branch ของเรา
3. กด **Create Pull Request** เพื่อเปิดเว็บ GitHub
4. ใส่ชื่อ เช่น `เพิ่มปุ่มนำทางในหน้าไรเดอร์`
5. ใส่คำอธิบายสั้น ๆ ตามตัวอย่างด้านล่าง
6. กด **Create pull request** บนเว็บ
7. ส่งลิงก์ PR ให้เพื่อนที่ช่วยตรวจงาน

ถ้าหาปุ่มใน Desktop ไม่เจอ เปิดเว็บ repository → **Pull requests → New pull request** แล้วเลือก **base: main** และ **compare: branch ของเรา**

ตัวอย่างคำอธิบายที่คัดลอกไปใช้ได้:

```text
ทำอะไร:
- เพิ่มปุ่มเปิดแผนที่ในใบงานไรเดอร์

ทดสอบแล้ว:
- กรอกเลขใบงานที่ยืนยันแล้วและเปิดใบงานได้
- กดปุ่มแล้วเปิดตำแหน่งลูกค้าถูกจุด
- หน้าจอมือถือไม่มีปุ่มล้นออกนอกจอ

อยากให้เพื่อนช่วยดู:
- ลำดับจุดส่งและข้อความบนปุ่ม
```

หากเพื่อนขอแก้ เพิ่มโค้ดใน branch เดิม → Commit → Push ได้เลย PR เดิมจะแสดงงานที่ส่งเพิ่ม ([คู่มือสร้าง Pull Request](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/creating-an-issue-or-pull-request-from-github-desktop))

## 9. ตรวจแล้วรวมงาน — เพื่อนอีกคนช่วยทำ

ตกลงกันในทีมว่าแต่ละ PR ต้องมีเพื่อนอย่างน้อย 1 คนตรวจ การเชิญ Collaborators อย่างเดียวไม่ได้ตั้งกฎนี้ให้อัตโนมัติ

1. เปิดลิงก์ PR ที่เพื่อนส่งมา
2. อ่านว่าทำอะไรและทดสอบอย่างไร
3. เปิดแท็บ **Files changed** ดูไฟล์ที่แก้
4. หากต้องลองรัน: Save และ Commit งานตัวเองให้เรียบร้อยก่อน → ใน Desktop กด Fetch → เลือก branch ของเพื่อน → เปิดเว็บทดสอบ
5. สำหรับ frontend ชุดนี้ รัน `npm.cmd test` และ `npm.cmd run build` ใน Terminal เมื่อพร้อมตรวจรวมงาน
6. ถ้าใช้งานได้และไม่มีงานที่ยังต้องแก้ ให้ผู้ที่ทีมตกลงเป็นคนรวมกด **Merge pull request → Confirm merge** บนเว็บ

งานนี้จะเข้า `main` บน GitHub แล้ว ถ้ารวมไม่ได้เพราะมี Conflict ดูข้อ 12 ([คู่มือ Merge Pull Request](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request))

คำสั่งทดสอบด้านบนเป็นของ frontend ที่ส่งให้แล้ว backend ที่ทีมจะพัฒนาให้เพิ่มวิธีตรวจใน README ของ backend เอง

## 10. รับงานที่รวมแล้ว — ทุกคนทำ

1. Save และ Commit งานค้างใน branch ของตัวเองก่อน
2. เลือก **Current Branch → main**
3. กด **Fetch origin**
4. ถ้ามี **Pull origin** ให้กด
5. ตอนนี้ `main` ในเครื่องเรามีงานล่าสุดแล้ว
6. เริ่มงานถัดไปโดยสร้าง branch ใหม่จาก `main` ตามข้อ 6

**Pull ตอนอยู่ branch ของตัวเอง ไม่ได้ดึงงานจาก `main` มาใส่ branch นั้นให้เอง** ([คู่มือ Sync branch](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop))

ถ้ายังทำงานใน branch เดิมไม่เสร็จ แต่ต้องรับงานจาก `main`:

1. Commit งานของตัวเองให้เรียบร้อย
2. อัปเดต `main` ตามขั้นตอนด้านบน
3. สลับกลับ branch ของตัวเอง
4. กด **Current Branch → Choose a branch to merge into [ชื่อ branch ของเรา]**
5. เลือก `main` แล้วกด **Merge main into [ชื่อ branch ของเรา]**
6. ถ้ามี Conflict ให้แก้ตามข้อ 12 ถ้าไม่มีก็ทดสอบและ Push

ดูชื่อปลายทางก่อนกด: ขั้นตอนนี้นำ `main` **เข้ามาใน branch งานของเรา** ([คู่มือ Merge branch ใน Desktop](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop))

## 11. กติกาง่าย ๆ ของทีม 4 คน

- เริ่มงานใหม่จาก `main` ที่อัปเดตแล้ว
- ทำงานใน branch ของตัวเอง และรวมผ่าน PR
- บอกเพื่อนก่อนแก้ไฟล์ส่วนกลาง เช่น router, `models.ts`, `package.json` และฐานข้อมูล
- แบ่งเจ้าของไฟล์ให้ชัด โดยเฉพาะ frontend ต้นแบบที่ยังรวมหลายหน้าใน `workspace.component`
- Commit แต่ละชุดให้บอกได้ว่าทำอะไร และ Push ก่อนเลิกทำงาน
- ไม่ต้องส่ง ZIP ไปมาทุกครั้งหลังเริ่มใช้ GitHub ให้ส่ง branch และ PR แทน
- ถ้ามีรหัสผ่านหรือ API key ในอนาคต เก็บไว้นอกซอร์สที่ส่งขึ้น GitHub และให้ทีมใช้ไฟล์ตัวอย่างที่ไม่มีค่าจริง

รูปแบบทำงานนี้เป็นข้อตกลงสำหรับทีมเรา ไม่จำเป็นต้องตั้งค่าขั้นสูงก่อนเริ่ม

## 12. ติดปัญหา ดูตรงนี้

### A. Commit แล้วเพื่อนยังไม่เห็น

ยังไม่ได้ส่งขึ้น GitHub ให้กด **Push origin** หรือ **Publish branch** แล้วให้เพื่อน Fetch และเลือก branch ให้ตรงกัน

### B. เปิด main แล้วไม่เห็นงานที่เพื่อน Push

งานอาจยังอยู่ใน branch ของเพื่อน ต้องรวม PR เข้า `main` ก่อนจึงจะเห็นใน `main`

### C. กด Push แล้วบอกไม่มีสิทธิ์ หรือชวนให้ Fork

ตรวจ 3 อย่าง: รับคำเชิญแล้วหรือยัง, GitHub Desktop ใช้บัญชีที่ได้รับเชิญหรือไม่, Clone มาจาก repository ของทีมถูกอันหรือไม่ การส่งงานในคู่มือนี้ใช้ repository ร่วมของทีม ([คู่มือสิทธิ์และการ Clone](https://docs.github.com/en/desktop/adding-and-cloning-repositories/cloning-and-forking-repositories-from-github-desktop))

### D. Push ไม่ผ่านเพราะบน GitHub มีงานใหม่กว่า

Commit งานให้เรียบร้อย → Fetch → Pull branch นั้น → แก้ Conflict ถ้ามี → ทดสอบ → Push อีกครั้ง ใช้การรับและรวมงานตามปกติก่อน ([คู่มือ Sync branch](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop))

### E. มีคำว่า Conflict

แปลว่า Git รวมบางบรรทัดให้เองไม่ได้ มักเกิดเมื่อสองคนแก้บริเวณเดียวกัน

1. ดูรายชื่อไฟล์ที่ Desktop บอกว่าชนกัน
2. เปิดไฟล์นั้นใน VS Code
3. คุยกับคนที่แก้ไฟล์เดียวกัน ว่าผลลัพธ์สุดท้ายควรเป็นอะไร
4. แก้ให้เหลือโค้ดที่ต้องการจริง ๆ อาจต้องรวมของทั้งสองคน
5. ลบเครื่องหมาย Conflict ให้หมด แล้ว Save
6. รันเว็บและทดสอบส่วนที่แก้
7. กลับ Desktop ทำขั้นตอน Merge ให้เสร็จตามปุ่มที่แสดง แล้ว Push

ตัวอย่างหน้าตาไฟล์ที่ชนกัน:

```text
  <<<<<<< HEAD
  ข้อความจาก branch ที่เรากำลังอยู่
  =======
  ข้อความจาก branch ที่นำมารวม
  >>>>>>> main
```

ผลลัพธ์สุดท้ายต้องไม่มี `<<<<<<<`, `=======` และ `>>>>>>>` เหลืออยู่ อย่าเลือกทั้งฝั่งแบบเดาสุ่ม เพราะอาจทำให้งานของเพื่อนหาย ([คู่มือรวม branch และจัดการ Conflict](https://docs.github.com/en/desktop/working-with-your-remote-repository-on-github-or-github-enterprise/syncing-your-branch-in-github-desktop))

### F. Changes มีไฟล์เป็นพันไฟล์

ตรวจว่ามี `.gitignore` อยู่ข้าง `package.json` และมี `node_modules/`, `.angular/`, `dist/` ตามข้อ 3 ก่อน Commit

ถ้าไฟล์พวกนี้ถูก Commit ไปแล้ว การเพิ่ม `.gitignore` อย่างเดียวไม่หยุดติดตามไฟล์เดิม ให้คนดูแล repository ช่วยนำไฟล์เหล่านั้นออกจากรายการที่ Git ติดตาม โดยเก็บไฟล์ที่ต้องใช้ในเครื่องไว้

### G. กด Discard ได้ไหม

**Discard Changes เอาการแก้ไขที่ยังไม่ได้ Commit ออกจากไฟล์ในเครื่อง** ใช้เมื่อแน่ใจว่าไม่ต้องการการแก้นั้น ก่อนกดให้ตรวจรายชื่อไฟล์และสำรองส่วนที่ยังอยากเก็บ ([คู่มือ Discard](https://docs.github.com/en/desktop/making-changes-in-a-branch/committing-and-reviewing-changes-to-your-project-in-github-desktop))

### H. เปิดเว็บไม่ขึ้น

- ไม่รู้จัก `npm.cmd`: ตรวจว่ามี Node.js แล้วเปิด VS Code ใหม่
- หา `package.json` ไม่เจอ: Terminal อยู่ผิดโฟลเดอร์ ให้เปิดโฟลเดอร์โปรเจกต์ตามข้อ 5
- แจ้งว่า port 4200 ถูกใช้: หยุดเว็บเก่าด้วย Ctrl+C ใน Terminal เดิม หรือใช้ `npm.cmd start -- --port 4201` แล้วเปิดพอร์ต 4201
- Repo ไม่มี `dist`: เป็นไปตาม `.gitignore` ให้ใช้ `npm.cmd start` สำหรับพัฒนา หรือ `npm.cmd run build` ก่อนใช้ `node preview.cjs`

### I. ส่งลิงก์ 127.0.0.1 ให้เพื่อนแล้วเปิดไม่ได้

`127.0.0.1` หมายถึงเครื่องของคนที่เปิดลิงก์ เพื่อนต้อง Clone แล้วรันเว็บบนเครื่องของตัวเองตามข้อ 5 การอัปโหลดโค้ดเข้า repository ยังไม่ได้ทำให้เว็บเปิดใช้งานออนไลน์โดยอัตโนมัติ

## 13. ลองรอบแรกด้วย README — ทุกคนฝึกได้

ใช้ branch ชื่อไม่ซ้ำกัน เช่น `practice/film-readme`

1. อัปเดต `main` แล้วสร้าง branch ฝึก
2. เปิด `README.md` ใน VS Code
3. เพิ่มหนึ่งบรรทัด เช่น `สมาชิกทีม: Film — ดูแลหน้าไรเดอร์`
4. Save → Commit → Publish branch
5. สร้าง PR ไป `main`
6. ให้เพื่อนตรวจและรวม
7. กลับ `main` → Fetch → Pull
8. เปิด README ถ้าเห็นบรรทัดของเราใน `main` แปลว่าทำครบหนึ่งรอบแล้ว

คนถัดไปเริ่มจาก `main` ล่าสุดก่อนฝึก เพื่อลดโอกาสแก้บรรทัดชนกัน

## ใบโพยสำหรับเปิดไว้ข้างจอ

**ก่อนทำงานใหม่**

```text
Commit งานค้าง → main → Fetch → Pull ถ้ามี → New Branch
```

**ส่งงานของเรา**

```text
แก้โค้ด → Save → ทดลองใช้ → Commit → Publish branch / Push → เปิด PR
```

**รวมงาน**

```text
เพื่อนตรวจ → แก้ถ้าจำเป็น → Merge PR → ทุกคนกลับ main → Fetch → Pull
```

**สี่คำที่ต้องแยกให้ออก**

```text
Save   = บันทึกไฟล์ที่แก้
Commit = บันทึกชุดการแก้ไขใน Git ที่เครื่องเรา
Push   = ส่ง Commit ขึ้น GitHub
Pull   = รับ Commit จาก GitHub ลง branch ที่เลือก
```

ชื่อปุ่มอาจต่างเล็กน้อยตามเวอร์ชันและสถานะ repository คู่มือนี้ตรวจเทียบเอกสาร GitHub วันที่ 1 ตุลาคม 2026
