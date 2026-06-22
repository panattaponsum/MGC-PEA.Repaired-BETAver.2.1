# คำอธิบายโค้ดโปรเจค MGC-PEA.Repaired-BETAver.2.1

เอกสารนี้อธิบายภาพรวม หลักการทำงาน และความเชื่อมโยงของไฟล์หลักในโปรเจคเว็บแอปสำหรับบริหารจัดการทรัพย์สินและประวัติอุปกรณ์ชำรุดของระบบ Microgrid/ระบบกักเก็บพลังงานของ กฟภ.

## 1. ภาพรวมโปรเจค

โปรเจคนี้เป็นเว็บแอปแบบ Static Frontend ที่เปิดจาก `index.html` และทำงานหลักด้วย `main.js` โดยเชื่อมต่อบริการ Firebase ฝั่ง Client โดยตรง ได้แก่ Authentication, Firestore และ Storage

ไฟล์สำคัญมีดังนี้

| ไฟล์ | หน้าที่ |
|---|---|
| `index.html` | โครงสร้างหน้าเว็บ, Layout, Modal, Tab, Image map, การโหลดไลบรารีภายนอก และโหลด `main.js` |
| `main.js` | Logic ทั้งหมดของระบบ เช่น Login, สิทธิ์ผู้ใช้, CRUD ข้อมูลอุปกรณ์, Import/Export, Dashboard, Report และ Realtime listener |
| รูปภาพ `.jpg/.png/.bmp` | ใช้เป็นแผนผัง/ภาพประกอบของแต่ละไซต์และโลโก้ |
| ไฟล์ `.docx` | ใช้เป็นแบบฟอร์ม/รายงานต้นแบบสำหรับการแจ้งอุปกรณ์ชำรุด |
| `README.md` | ชื่อโปรเจคแบบย่อ |

## 2. สถาปัตยกรรมโดยรวม

ผู้ใช้เปิดหน้าเว็บผ่านเบราว์เซอร์ จากนั้น `index.html` โหลด CSS/JS ภายนอกและ `main.js` เมื่อผู้ใช้ Login ด้วย Google ระบบจะอ่านสิทธิ์จาก Firestore collection `users` แล้วเปิดเมนูตาม Role หลังจากนั้นข้อมูลอุปกรณ์จะถูกอ่าน/เขียนใน Firestore ภายใต้โครงสร้าง `sites/{siteKey}/devices/{deviceName}` และไฟล์แนบจะถูกอัปโหลดไปยัง Firebase Storage

โครงสร้างข้อมูลหลักโดยสรุปคือ

```text
Firebase
├─ users/{email}
│  ├─ role: admin | editor | engineer | viewer
│  ├─ allowedSites: string[]
│  └─ profile fields
├─ sites/{siteKey}
│  ├─ devices/{deviceName}
│  │  ├─ records: ประวัติการชำรุด/ซ่อม/รับทราบ
│  │  └─ assetInfo: ข้อมูลทรัพย์สินและประกัน
│  └─ registry/config
└─ activityLogs/{logId}
```

## 3. `index.html` ทำอะไร

### 3.1 ส่วนหัวและ Style

ไฟล์ `index.html` กำหนดภาษาไทย (`lang="th"`), viewport, title, โหลด Google Fonts, SweetAlert2 CSS และ Tailwind CDN จากนั้นกำหนด `tailwind.config` เพื่อเพิ่ม font family และสีของแบรนด์/สถานะ

CSS ภายในไฟล์ใช้กำหนดหน้าตา เช่น Header แบบ gradient, Card shadow, Form modal, ปุ่มหลัก, Badge สถานะประกัน, Tab และโหมด `viewer-mode` ที่ซ่อนภาพ/แผนผังสำหรับผู้ใช้ที่ไม่มีสิทธิ์ดูข้อมูลเชิงภาพ

### 3.2 โครงหน้าเว็บ

ส่วน Body แบ่งเป็นองค์ประกอบหลัก:

1. Header สำหรับ Login/Logout, แสดงชื่อผู้ใช้, Role และตัวนับ Auto logout
2. `loginPrompt` สำหรับแสดงข้อความก่อน Login
3. `appContent` สำหรับเนื้อหาหลักหลัง Login
4. ตัวเลือกไซต์ เช่น เกาะพะลวย, แม่สะเรียง, เบตง, พร้าว
5. Tab หลัก 3 หน้า: แผนผัง, ประวัติชำรุด, รายการทรัพย์สิน
6. Modal หลายชุด เช่น บันทึกเหตุการณ์, ข้อมูลทรัพย์สิน, จัดการผู้ใช้, Activity log, Report, และจัดการกลุ่มทรัพย์สิน

### 3.3 แผนผังอุปกรณ์

หน้าแผนผังใช้รูปภาพและ HTML image map (`<map>`/`<area>`) เพื่อให้ผู้ใช้คลิกบริเวณอุปกรณ์บนภาพแล้วเปิดฟอร์มบันทึกข้อมูลของอุปกรณ์นั้น ๆ นอกจากนี้ยังมี `overlay-container-*` สำหรับวาดกรอบสถานะบนอุปกรณ์ เช่น ปกติ, ผิดปกติ, ชำรุด

### 3.4 ไลบรารีภายนอก

ท้ายไฟล์ `index.html` โหลดไลบรารีเหล่านี้:

- Firebase v8: app, firestore, auth, storage
- SweetAlert2: popup/alert
- Chart.js: กราฟ Dashboard
- image-map-resizer: ปรับ scale image map เมื่อหน้าจอเปลี่ยน
- PizZip + Docxtemplater + FileSaver: สร้าง/ดาวน์โหลดรายงาน Word
- SheetJS/XLSX: Import/Export Excel
- `main.js`: Logic ของโปรเจค

## 4. `main.js` ทำอะไร

### 4.1 การเชื่อมต่อ Firebase

ตอนต้นไฟล์กำหนด `firebaseConfig` แล้ว initialize Firebase ถ้ายังไม่เคย initialize จากนั้นสร้างตัวแปรอ้างอิงบริการหลัก:

- `db` สำหรับ Firestore
- `auth` สำหรับ Firebase Authentication
- `storage` สำหรับ Firebase Storage
- `devicesCol` สำหรับ collection `devices` เดิม/ส่วนกลาง

### 4.2 ตัวแปรสถานะของแอป

ระบบเก็บ state ฝั่ง Client เช่น ไซต์ปัจจุบัน (`currentSiteKey`), อุปกรณ์ปัจจุบัน (`currentDevice`), record ที่กำลังแก้ (`editIndex`), หน้าปัจจุบันของตาราง, ผู้ใช้ปัจจุบัน, role, allowed sites, ข้อมูล profile และ cache สถานะอุปกรณ์

### 4.3 ฟังก์ชันวันที่และเวลา

มีฟังก์ชันแปลงวันที่หลายรูปแบบเพื่อรองรับข้อมูลไทยและข้อมูลจาก Excel เช่น:

- `formatThaiDate()` แสดงวันที่เป็น พ.ศ.
- `formatThaiDateTime()` แสดงวันเวลาแบบไทย
- `parseThaiDateToStandard()` แปลงวันที่ไทย/Excel/ISO เป็น `YYYY-MM-DD`
- `parseThaiDateTimeToTS()` แปลงวันเวลาเป็น timestamp

### 4.4 สิทธิ์การใช้งาน

ระบบแยกสิทธิ์ด้วย Role:

- `admin`: ทำได้ทุกอย่าง รวมถึงจัดการผู้ใช้และข้อมูลทรัพย์สิน
- `editor`: แก้ไขข้อมูลตามไซต์ที่ได้รับสิทธิ์
- `engineer`: รับทราบ/ปิดงานซ่อมตามไซต์ที่ได้รับสิทธิ์
- `viewer`: ดูข้อมูลจำกัด และถูกซ่อนข้อมูลเชิงภาพบางส่วน

ฟังก์ชันหลักคือ `hasWriteAccess()`, `hasEngineerSiteAccess()`, `canAcknowledgeIssue()` และ `canMarkFixed()` ซึ่งถูกเรียกก่อนเปิดปุ่ม/บันทึก/นำเข้า/แก้ไขข้อมูล

### 4.5 ข้อมูลไซต์และรายการอุปกรณ์

ตัวแปร `sites` เป็น master data ของไซต์ทั้งหมด โดยแต่ละไซต์มี `name` และ `devices` เช่น เกาะพะลวย, แม่สะเรียง, เบตง และพร้าว ส่วน `OTHER_SUBDEVICES` ใช้สำหรับกรณีเลือกอุปกรณ์ `other` แล้วต้องระบุ sub-device เพิ่มเติม และ `sitePrefixes` ใช้สร้างรหัสอัตโนมัติ เช่น `KPL-000001`

### 4.6 การอ่าน/เขียน Firestore

ฟังก์ชันกลุ่มนี้เป็น Data Access Layer แบบง่าย:

- `getSiteCollection(siteKey)` คืนค่า collection `sites/{siteKey}/devices`
- `getDeviceRecords(siteKey, device)` อ่าน `records` ของอุปกรณ์
- `saveDeviceRecords(siteKey, device, records)` บันทึก records กลับ Firestore
- `getAllDevicesDocs(siteKey)` อ่านเอกสารอุปกรณ์ทั้งหมดในไซต์
- `generateAutoId(siteKey)` หาเลข customId ล่าสุดแล้วสร้างเลขถัดไป

หลักการคือเอกสาร 1 ตัวแทนอุปกรณ์ 1 รายการ และ field `records` เป็น array ของประวัติการชำรุด/ซ่อม

### 4.7 Modal บันทึกเหตุการณ์

เมื่อผู้ใช้คลิกอุปกรณ์จากแผนผังหรือตาราง ระบบเรียก `openForm(deviceName)` เพื่อกำหนด `currentDevice`, โหลดข้อมูลทรัพย์สิน, โหลดประวัติ และแสดง modal ฟอร์ม ภายในฟอร์มมีข้อมูลสำคัญ ได้แก่ ผู้แจ้ง, สถานะ, วันที่เกิดเหตุ, รายละเอียด, ไฟล์แนบ, วันที่ซ่อมเสร็จ, ค่าใช้จ่าย, เลขที่ใบสั่ง, เอกสารอ้างอิง, วิธีแก้ไข และไฟล์หลังซ่อม

การบันทึกใช้ `saveData()` ซึ่งตรวจสิทธิ์, ตรวจข้อมูล, อัปโหลดไฟล์ถ้ามี, เพิ่มหรือแก้ไข record ใน array, บันทึก Firestore, สร้าง log, อัปเดตตาราง/overlay และส่ง email notification ตามเงื่อนไข

### 4.8 การจัดการข้อมูลทรัพย์สิน

ส่วน Asset modal ใช้เก็บข้อมูลประจำอุปกรณ์ เช่น Serial, Model, PEA No., ราคา, ผู้ผลิต, สถานที่ติดตั้ง, รูปภาพ, วันเริ่ม/สิ้นสุดประกัน ระบบคำนวณสถานะประกันด้วย `getWarrantyStatus()` และแสดงผลด้วย `getWarrantyStatusHTML()`

`loadAssetData()` โหลด `assetInfo` จาก Firestore ส่วน `saveAssetData()` บันทึก `assetInfo` กลับไปในเอกสารอุปกรณ์เดิม

### 4.9 ตารางสรุปและ Dashboard

`updateDeviceSummary()` อ่านข้อมูลอุปกรณ์ทั้งหมดของไซต์ปัจจุบัน สรุปจำนวนอุปกรณ์ทั้งหมด, ปกติ, มีปัญหา แล้วสร้างแถวในตารางตาม filter/search/sort/date range นอกจากนี้ยังเปิด record ด้วยการคลิกแถวได้

`renderDashboardCharts()` ใช้ Chart.js สร้างกราฟ เช่น อันดับอุปกรณ์ที่ชำรุดบ่อย และเวลาเฉลี่ยซ่อม

### 4.10 Overlay สถานะบนแผนผัง

`updateDeviceStatusOverlays(siteKey, useCache)` อ่านสถานะล่าสุดของอุปกรณ์แต่ละตัว แล้วสร้าง element overlay ซ้อนบนภาพแผนผัง สถานะหลักคือ:

- `normal`: กรอบเขียว
- `abnormal`: กรอบส้มกระพริบ
- `down`: สัญลักษณ์กากบาทแดงกระพริบ

CSS ใน `index.html` เป็นตัวกำหนดสี/animation ของ overlay ส่วน `main.js` เป็นตัวคำนวณตำแหน่งและสถานะ

### 4.11 Realtime listener

`setupRealtimeListener(siteKey)` ใช้ Firestore `onSnapshot()` เพื่อฟังการเปลี่ยนแปลงของ collection อุปกรณ์ในไซต์ปัจจุบัน เมื่อข้อมูลเปลี่ยนจะเรียก `updateDeviceSummary()` และ `updateDeviceStatusOverlays()` ทำให้ตารางและแผนผังอัปเดตทันที

### 4.12 Import/Export Excel

`importData(event)` อ่านไฟล์ `.xlsx` ด้วย SheetJS แล้วแยกข้อมูลจาก sheet ประวัติการชำรุดและข้อมูลทรัพย์สิน จากนั้นส่งให้ `processAndSaveImport()` เพื่อบันทึกแบบ batch ลง Firestore และข้าม record ที่มี ID ซ้ำ

`exportAllDataExcel()` รวมข้อมูลประวัติ, ข้อมูลทรัพย์สิน และ activity log แล้วสร้างไฟล์ Excel ให้ดาวน์โหลด

### 4.13 รายการทรัพย์สินและการจัดกลุ่ม

หน้า Asset Registry ใช้ `loadAssetRegistry()` โหลดข้อมูลอุปกรณ์และกลุ่ม แล้ว `renderRegistryContent()` แสดงรายการแบบจัดกลุ่ม ผู้ใช้ที่มีสิทธิ์สามารถเพิ่มกลุ่ม, เปลี่ยนชื่อกลุ่ม, ลบกลุ่ม และย้ายอุปกรณ์เข้ากลุ่มผ่าน `assignDeviceToGroup()`, `openAddGroupModal()`, `openRenameGroupModal()`, `confirmGroupAction()` และ `deleteGroup()`

### 4.14 การจัดการผู้ใช้และ Activity Log

Admin สามารถเปิดหน้าจัดการผู้ใช้เพื่อเปลี่ยน Role, ข้อมูล profile และ allowed sites ได้ ระบบมีการสร้าง activity log เมื่อเกิดเหตุการณ์สำคัญ เช่น Login, บันทึกข้อมูล, แก้ไขผู้ใช้, ลบข้อมูล และ export/import

### 4.15 Report

`printReport()` โหลดประวัติการชำรุดของไซต์แล้วให้ผู้ใช้เลือกรายการที่จะออกรายงาน จากนั้น `generateSelectedReport()` สร้าง HTML รายงานโดยรวมข้อมูลอุปกรณ์, assetInfo, ประวัติซ่อม, รูปก่อน/หลังซ่อม, ผู้รับทราบ และผู้แจ้ง ก่อนส่งให้ `buildReportDocumentHtml()` เพื่อสร้างเอกสารสำหรับพิมพ์/บันทึก

## 5. Flow การทำงานหลัก

### 5.1 Flow Login

```text
ผู้ใช้กด Login
→ Firebase Google Auth
→ onAuthStateChanged ทำงาน
→ อ่าน users/{email}
→ กำหนด role/profile/allowedSites
→ applyRoleRestrictions()
→ switchSite(default)
→ setupRealtimeListener(site)
→ แสดง appContent
```

### 5.2 Flow บันทึกเหตุชำรุด

```text
คลิกอุปกรณ์บนแผนผัง/ตาราง
→ openForm(device)
→ โหลด assetInfo + records
→ ผู้ใช้กรอกสถานะ/รายละเอียด/ไฟล์
→ saveData()
→ ตรวจสิทธิ์และ validate
→ uploadFileToStorage() ถ้ามีไฟล์
→ saveDeviceRecords()
→ createLog()
→ updateDeviceSummary()
→ updateDeviceStatusOverlays()
→ sendEmailNotify() ตามเงื่อนไข
```

### 5.3 Flow Dashboard/Overlay

```text
Firestore records เปลี่ยน
→ onSnapshot()
→ updateDeviceSummary()
→ renderDashboardCharts()
→ updateDeviceStatusOverlays()
→ ผู้ใช้เห็นตาราง/กราฟ/แผนผังล่าสุด
```

### 5.4 Flow Import Excel

```text
ผู้ใช้เลือกไฟล์ .xlsx
→ FileReader อ่านไฟล์
→ XLSX แปลง sheet เป็น array/json
→ map คอลัมน์เป็น assetInfo/records
→ processAndSaveImport()
→ batch commit ไป Firestore
→ refresh ตารางและ overlay
```

## 6. ความหมายของข้อมูลสำคัญใน Record

Record ใน `records` ใช้เก็บเหตุการณ์ของอุปกรณ์ โดย field ที่พบได้ เช่น:

| Field | ความหมาย |
|---|---|
| `customId` | รหัสเหตุการณ์อัตโนมัติ เช่น KPL-000001 |
| `status` | สถานะเหตุการณ์ เช่น down, abnormal, ok |
| `brokenDate` | วันที่พบ/แจ้งเหตุชำรุด |
| `description` | รายละเอียดอาการเสีย |
| `brokenFileUrl` | URL ไฟล์/รูปก่อนซ่อมใน Storage |
| `fixedDate` | วันที่ซ่อมเสร็จ |
| `solution` | วิธีแก้ไข/ผลการซ่อม |
| `fixedFileUrl` | URL ไฟล์/รูปหลังซ่อม |
| `repairCost` | ค่าใช้จ่ายซ่อม |
| `acknowledgedBy` | ผู้รับทราบเหตุการณ์ |
| `acknowledgedAt` | เวลารับทราบ |

## 7. จุดเด่นของโปรเจค

- ใช้เว็บหน้าเดียว ทำให้ deploy ง่าย
- เชื่อม Firebase โดยตรง ไม่ต้องมี Backend แยก
- รองรับสิทธิ์ผู้ใช้หลายระดับ
- แสดงสถานะอุปกรณ์บนแผนผังจริงผ่าน image map และ overlay
- มีข้อมูลทรัพย์สินพร้อมประกัน
- รองรับ Import/Export Excel และรายงาน
- มี Realtime update จาก Firestore

## 8. ข้อควรระวัง/ข้อเสนอแนะ

1. Firebase config อยู่ใน Client เป็นเรื่องปกติของ Firebase Web แต่ต้องควบคุมความปลอดภัยด้วย Firestore/Storage Security Rules ให้รัดกุม
2. ข้อมูล records ถูกเก็บเป็น array ในเอกสารเดียว หาก record มากขึ้นมาก ๆ อาจชนข้อจำกัดขนาดเอกสาร Firestore ควรพิจารณาแยกเป็น subcollection ในอนาคต
3. Logic จำนวนมากอยู่ใน `main.js` ไฟล์เดียว ทำให้ดูแลยาก ควรแยก module เช่น auth, firestore, assets, reports, registry, charts
4. ควรย้ายค่า config/รายชื่อไซต์/รายการอุปกรณ์ ไปเป็นไฟล์ config หรือ Firestore เพื่อแก้ไขได้ง่าย
5. ควรเพิ่ม test หรือ validation layer เพิ่มเติม โดยเฉพาะ import Excel และสิทธิ์การบันทึก

## 9. สรุป

โปรเจคนี้คือระบบจัดการข้อมูลอุปกรณ์ Microgrid/BESS แบบ Frontend-only ที่ใช้ Firebase เป็น Backend-as-a-Service จุดเชื่อมโยงหลักคือ `index.html` ทำหน้าที่เป็นหน้าจอและโหลดไลบรารี ส่วน `main.js` ควบคุม state, สิทธิ์, การอ่านเขียน Firestore/Storage, การสรุปข้อมูล, การแสดงแผนผัง, การ import/export และการสร้างรายงาน ทุกฟีเจอร์เชื่อมผ่านตัวแปรไซต์ปัจจุบัน (`currentSiteKey`) และเอกสารอุปกรณ์ภายใต้ `sites/{siteKey}/devices/{deviceName}`
