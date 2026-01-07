// Firebase config
const firebaseConfig = {
apiKey: "AIzaSyCe-qS_uKPYASKJHHL0JuV4eCCzajbpzRY",
authDomain: "microgrid-th.firebaseapp.com",
projectId: "microgrid-th",
storageBucket: "microgrid-th.firebasestorage.app",
messagingSenderId: "88058740399",
appId: "1:88058740399:web:bbb38da765672dc4969e5a",
measurementId: "G-L45B835SV4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig); 
const db = firebase.firestore(); 
const auth = firebase.auth(); 
const devicesCol = db.collection("devices"); 

// Global Variables
let currentSiteKey = "ko-phaluay";
let currentDevice = null, editIndex = -1, chartInstance = null;
let currentPage = 1;
const pageSize = 7; 
let currentUser = null;
let currentUserRole = 'viewer'; // default role
const ADMIN_EMAIL = 'panattapon.sum@gmail.com'; // Hardcoded Admin

const sites = {
"ko-phaluay": {
name: "ไมโครกริดเกาะพะลวย อ.เกาะสมุย จ.สุราษฎร์ธานี",
devices: [
"HMI Server 1", "HMI Server 2", "Operation Station", "Printer", "Time Server", "MGC",
"Switch 1", "Switch 2", "Switch 3", "Switch 4", "Switch 5", "Switch 6", "Switch 7", "Switch 8",
"COV 1", "COV 2", "BCP", "PCS",
"Inverter 1", "Inverter 2", "Inverter 3", "Inverter 4", "Inverter 5",
"Inverter 6", "Inverter 7", "Inverter 8", "Inverter 9", "Inverter 10",
"DG 1", "DG 2", "DG Master",
"Gateway 1", "Gateway 2",
"Firewall 1", "Firewall 2", "Firewall 3"
]
},
"mae-sariang": {
name: "ไมโครกริดแม่สะเรียง อ.แม่สะเรียง จ.แม่ฮ่องสอน",
devices: [
"FireWall 1", "PCS-9893(2nd)", "HMI Display 1", "HMI Display 2", "HMI Main 1", "Cyber Security Manager", "Scada 1", "Scada 2", "Switch 1", "Switch 2", "Switch 3", "Switch 4", "Switch 5", "Switch 6", "Switch 7", "ETH Switch 1", "ETH Switch 2", "PCS-9892", "PCS-9893(1st)", "PCS-9799(1st)", "PCS-9799(2nd)", "MGC 1", "MGC 2", "ATS", "PCS-9794(1st)", "Diesel Local", "PCS-9794(2nd)", "PCS-9726", "PCS-9567C", "PCS 1", "PCS 2", "PCS 3", "PCS 4", "PCS 5", "PCS 6", "ETH Switch 3", "BMS 1", "BMS 2", "BMS 3", "BMS 4", "BMS 5", "BMS 6", "FRTU 1-15"
]
},
"betong": {
name: "ไมโครกริดเบตง อ.เบตง จ.ยะลา",
devices: [
"Operator HMI 24", "Operator HMI 27", "ETH Switch 1", "ETH Switch 2", "ETH Switch 3", "ETH Switch 4", "ETH Switch 6", "ETH Switch 7"
]
}
};

/** Helper function to escape HTML characters */
function escapeHtml(text) {
return String(text || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m)).replace(/\n/g, '<br>');
}

/** Returns the Firestore Collection reference for devices in the current site. */
function getSiteCollection(siteKey) {
return db.collection(`sites`).doc(siteKey).collection(`devices`);
}

/** Fetches and processes records for a specific device. */
async function getDeviceRecords(siteKey, device) {
const docRef = getSiteCollection(siteKey).doc(device); 
const snap = await docRef.get();
const recs = snap.exists ? (snap.data().records || []) : [];
for (const r of recs) {
if (typeof r.counted === 'undefined') r.counted = (r.status === 'down');
}
return recs;
}

/** Saves the updated records array back to Firestore. */
async function saveDeviceRecords(siteKey, device, records) {
    // 1. ตรวจสอบว่ามี Down ที่ยังไม่ได้แก้หรือไม่ (Logic ใหม่)
    const hasUnresolvedIssues = records.some(r => {
        // เช็คว่าเป็นสถานะ Down และ ไม่มีวันที่ซ่อม
        return r.status === 'down' && 
               (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null');
    });

    for (const r of records) {
        if (typeof r.counted === 'undefined') r.counted = (r.status === 'down');
    }
    
    records.sort((a, b) => a.ts - b.ts);
    // ใหม่: ถ้ามีรายการค้าง (Unresolved) ให้สถานะเป็น down ทันที, ถ้าไม่มีให้เป็น ok
    const currentStatus = hasUnresolvedIssues ? 'down' : 'ok';
    
    const downCount = records.filter(r => r.counted).length;
    const docRef = getSiteCollection(siteKey).doc(device);

    await docRef.set({ 
        records, 
        downCount,
        currentStatus: currentStatus 
    }, { merge: true });
}
async function getAllDevicesDocs(siteKey) {
return await getSiteCollection(siteKey).get();
}

function calculateDaysDifference(dateString1, dateString2) {
if (!dateString1) return 0;
if (isNaN(new Date(dateString1).getTime())) return 0;
const date1 = new Date(dateString1);
const date2 = dateString2 && !isNaN(new Date(dateString2).getTime()) ? new Date(dateString2) : new Date(); 
const _MS_PER_DAY = 1000 * 60 * 60 * 24;
const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
const diffDays = Math.ceil(Math.abs((utc2 - utc1) / _MS_PER_DAY));
return diffDays;
}

function formatDuration(days) {
if (days <= 0) return '0 วัน';
const YEARS_IN_DAYS = 365.25; 
const MONTHS_IN_DAYS = 30.44;
let remainingDays = days;
let parts = [];
const years = Math.floor(remainingDays / YEARS_IN_DAYS);
if (years > 0) { parts.push(`${years} ปี`); remainingDays -= years * YEARS_IN_DAYS; }
const months = Math.floor(remainingDays / MONTHS_IN_DAYS);
if (months > 0) { parts.push(`${months} เดือน`); remainingDays -= months * MONTHS_IN_DAYS; }
const finalDays = Math.ceil(remainingDays);
if (finalDays > 0 || (days > 0 && parts.length === 0)) { parts.push(`${finalDays} วัน`); }
return parts.join(' ');
}

function getWarrantyStatus(warrantyEnd) {
if (!warrantyEnd || !isValidDate(warrantyEnd)) return '-';
const today = new Date();
const endDate = new Date(warrantyEnd);
today.setHours(0, 0, 0, 0);
endDate.setHours(0, 0, 0, 0);
const diffTime = endDate.getTime() - today.getTime();
const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
if (diffDays < 0) return 'bad'; 
else if (diffDays <= 30) return 'warn'; 
else return 'ok'; 
}

function getWarrantyStatusHTML(status) {
switch (status) {
case 'ok': return '<span class="tag tag-warranty-ok">🛡️ รับประกัน</span>';
case 'warn': return '<span class="tag tag-warranty-warn">⚠️ ใกล้หมดประกัน</span>';
case 'bad': return '<span class="tag tag-warranty-bad">🚫 หมดประกัน</span>';
default: return '<span>-</span>';
}
}


// =========================================================================
// 💥 RBAC & Auth Functions 💥
// =========================================================================

/**
* เปิด/ปิดการใช้งานปุ่มที่ใช้เขียนข้อมูล ตาม Role
*/
function toggleWriteAccess(isLoggedIn) {
    const role = isLoggedIn ? currentUserRole : 'viewer';
    const isAdmin = role === 'admin';
    const isEditor = role === 'editor' || isAdmin; // Admin is also Editor

    // 1. ปุ่มเกี่ยวกับการบันทึก (Editor & Admin)
    const recordButtons = ['saveDataButton', 'clearDeviceButton', 'clearAllButton'];
    recordButtons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !isEditor;
            btn.title = isEditor ? '' : 'สิทธิ์ไม่เพียงพอ (ต้องการ Editor/Admin)';
            if (!isLoggedIn) btn.title = 'กรุณาลงชื่อเข้าใช้ก่อน';
        }
    });

    // 2. ปุ่มเกี่ยวกับทรัพย์สิน (Admin Only)
    const assetBtn = document.getElementById('saveAssetButton');
    if (assetBtn) {
        assetBtn.style.display = isAdmin ? 'inline-block' : 'none';
    }

    // 3. ปุ่ม Import/Manage (Admin Only for Import/Manage, Editor for Import)
    const importLabel = document.getElementById('importButtonLabel');
    if (importLabel) {
        // ให้ Editor Import ได้หรือไม่? ปกติถ้า Import Records ควรได้
        importLabel.style.display = isEditor ? 'inline-block' : 'none';
    }
    
    // 4. ปุ่ม Manage Users (Admin Only)
    const manageUsersBtn = document.getElementById('manageUsersBtn');
    if (manageUsersBtn) {
        manageUsersBtn.classList.toggle('hidden', !isAdmin);
    }
    
    // 5. แสดง Role Tag
    const roleDisplay = document.getElementById('userRoleDisplay');
    if (roleDisplay) {
        if (!isLoggedIn) roleDisplay.style.display = 'none';
        else {
            roleDisplay.style.display = 'inline-block';
            roleDisplay.textContent = role.toUpperCase();
            // สีตาม Role
            if (isAdmin) roleDisplay.className = 'tag tag-bad text-xs'; // Red
            else if (isEditor) roleDisplay.className = 'tag tag-warn text-xs'; // Yellow
            else roleDisplay.className = 'tag tag-ok text-xs'; // Green (Viewer)
        }
    }

    // อัปเดตช่องชื่อผู้ใช้
    const userNameInput = document.getElementById('userName');
    if (isLoggedIn && currentUser) {
        userNameInput.value = currentUser.email; 
        userNameInput.readOnly = true;
    } else {
        userNameInput.value = 'ผู้เยี่ยมชม (อ่านอย่างเดียว)';
        userNameInput.readOnly = true;
    }
    
    // Refresh UI parts if open
    if (document.getElementById('formModal').style.display === 'flex') {
        loadHistory(); 
    }
}

function login() {
const provider = new firebase.auth.GoogleAuthProvider();
auth.signInWithPopup(provider)
.then((result) => {
// Handled by onAuthStateChanged
}).catch((error) => {
console.error("Login Error:", error);
Swal.fire('Login ผิดพลาด', error.message, 'error');
});
}

window.logout = async function() {
    if (currentUser) {
        await createLog("AUTH_LOGOUT", "ผู้ใช้กดออกจากระบบ");
    }
    auth.signOut().then(() => {
        location.reload(); // รีเฟรชหน้าเพื่อเคลียร์สถานะ
    });
};

// บันทึกกิจกรรม
async function createLog(action, details) {
    await db.collection("activity_logs").add({
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        userEmail: currentUser ? currentUser.email : "Unknown",
        action: action,
        details: details,
        siteKey: currentSiteKey
    });
}

// ลบ Log ที่เก่ากว่า 6 เดือน (Retention Policy)
async function cleanOldLogs() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const snapshot = await db.collection("activity_logs")
        .where("timestamp", "<", sixMonthsAgo)
        .get();

    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    await createLog("SYSTEM_CLEANUP", `ล้างข้อมูล Log เก่าที่เกิน 6 เดือน (ลบออก ${snapshot.size} รายการ)`);
}
window.showActivityLogs = async function() {
    const modal = document.getElementById('logModal');
    const tableBody = document.getElementById('logTableBody');
    const filterValue = document.getElementById('logSiteFilter').value; // ดึงค่าจากตัวกรอง
    
    if (!modal || !tableBody) return;

    modal.classList.remove('hidden');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4">กำลังโหลดข้อมูล...</td></tr>';

    try {
        let query = db.collection("activity_logs").orderBy("timestamp", "desc");

        // ถ้าเลือกไซต์ใดไซต์หนึ่ง ให้ทำการ Filter เพิ่ม
        if (filterValue !== "all") {
            query = query.where("siteKey", "==", filterValue);
        }

        const snapshot = await query.limit(100).get();

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-slate-400">ไม่พบประวัติการใช้งาน</td></tr>';
            return;
        }

        let html = '';
        snapshot.forEach(doc => {
            const d = doc.data();
            const time = d.timestamp ? d.timestamp.toDate().toLocaleString('th-TH') : '-';
            
            // กำหนดสีให้ SiteKey เพื่อให้อ่านง่าย
            let siteBadge = 'text-gray-500';
            if(d.siteKey === 'ko-phaluay') siteBadge = 'text-blue-600 font-bold';
            if(d.siteKey === 'mae-sariang') siteBadge = 'text-green-600 font-bold';
            if(d.siteKey === 'betong') siteBadge = 'text-orange-600 font-bold';

            html += `
                <tr class="hover:bg-slate-50 border-b border-slate-100">
                    <td class="p-2 text-xs text-slate-500">${time}</td>
                    <td class="p-2 text-sm">${d.userEmail || 'System'}</td>
                    <td class="p-2 text-xs ${siteBadge}">${d.siteKey || '-'}</td> 
                    <td class="p-2 text-xs">
                        <span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold uppercase">${d.action}</span>
                    </td>
                    <td class="p-2 text-sm text-slate-600">${d.details}</td>
                </tr>
            `;
        });
        tableBody.innerHTML = html;

    } catch (error) {
        console.error("Log error:", error);
        // หากเกิด Error เกี่ยวกับ Index (เพราะมีการ Filter + Sort) 
        // ให้กดลิงก์ใน Console เพื่อสร้าง Index เพิ่มเติมได้เลยครับ
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-red-500">Error: ${error.message}</td></tr>`;
    }
};

function getActionClass(action) {
    if (action.includes('UPDATE')) return 'bg-blue-100 text-blue-700';
    if (action.includes('EDIT')) return 'bg-yellow-100 text-yellow-700';
    if (action.includes('DELETE')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
}
window.closeLogModal = function() {
    const modal = document.getElementById('logModal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

// =========================================================================
// UI and Form Functions
// =========================================================================

window.openForm = async function(deviceName) {
    currentDevice = deviceName; 
    editIndex = -1;
    document.getElementById('formTitle').textContent = `บันทึกข้อมูล: ${deviceName}`;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('formModal').style.display = 'flex';
    document.getElementById('editHint').classList.add('hidden');

    document.getElementById('warrantyStatusDisplay').innerHTML = 'กำลังโหลด...';
    document.getElementById('assetInfoDisplay').innerHTML = '';

    clearForm(); 
    await loadHistory(); 
}

window.closeForm = function() {
document.getElementById('overlay').style.display = 'none';
document.getElementById('formModal').style.display = 'none'; 
document.getElementById('assetModal').style.display = 'none';
}

function clearForm() {
    if (!currentUser) {
        document.getElementById('userName').value = 'ผู้เยี่ยมชม (อ่านอย่างเดียว)';
    } else {
        document.getElementById('userName').value = currentUser.email;
    }

    const statusSelect = document.getElementById('status');
    const fixedDateInput = document.getElementById('fixedDate'); 

    statusSelect.value = 'down'; 
    statusSelect.disabled = true; 

    fixedDateInput.value = '';
    fixedDateInput.disabled = true; 
    fixedDateInput.placeholder = "บันทึกข้อมูลชำรุดก่อน จึงจะระบุวันซ่อมได้";
    // --- เปลี่ยนสี Disabled ---
    fixedDateInput.classList.add('bg-gray-200', 'text-gray-500', 'cursor-not-allowed');

    document.getElementById('brokenDate').value = '';
    document.getElementById('description').value = '';
    
    editIndex = -1;
    document.getElementById('editHint').classList.add('hidden');
}
function isValidDate(str) {
if (!str) return false;
const d = new Date(str);
return d instanceof Date && !isNaN(d);
}

window.saveData = async function() {
    // 💥 RBAC CHECK: Editor or Admin Only
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Editor และ Admin เท่านั้นที่บันทึกข้อมูลได้', 'error');
        return false;
    }

    if (!currentUser || !currentDevice) return false;

    let statusVal = document.getElementById('status').value;
    const brokenDate = document.getElementById('brokenDate').value;
    const fixedDate = document.getElementById('fixedDate').value;

    if (isValidDate(brokenDate) && isValidDate(fixedDate)) {
        statusVal = 'ok';
    }

    if (editIndex < 0 && statusVal === 'ok' && (!brokenDate || !fixedDate)) {
        Swal.fire({ title: "ไม่อนุญาต", text: "การเพิ่มรายการใหม่ต้องเป็นสถานะ 'ชำรุด' เท่านั้น", icon: "warning" });
        return false;
    }

    const now = new Date(); now.setHours(0, 0, 0, 0); 
    if (brokenDate && isValidDate(brokenDate) && new Date(brokenDate) > now) {
        Swal.fire("วันที่ผิดพลาด", "วันที่ชำรุดอนาคตไม่ได้", "warning"); return false;
    }
    
    if (statusVal === 'down' && !isValidDate(brokenDate)) { Swal.fire("ข้อมูลไม่ครบ", "กรุณาเลือกวันที่ชำรุด", "warning"); return false; }
    if (statusVal === 'ok') {
        if (!isValidDate(brokenDate) || !isValidDate(fixedDate)) { Swal.fire("ข้อมูลไม่ครบ", "กรุณากรอกวันที่ให้ครบ", "warning"); return false; }
        if (new Date(brokenDate) > new Date(fixedDate)) { Swal.fire("วันที่ผิดพลาด", "วันที่ซ่อมแซมต้องหลังวันที่ชำรุด", "warning"); return false; }
    }

    let records = await getDeviceRecords(currentSiteKey, currentDevice); 

    const baseRec = {
        user: document.getElementById('userName').value || "ไม่ระบุ",
        status: statusVal, 
        brokenDate,
        fixedDate,
        description: document.getElementById('description').value,
        ts: Date.now(),
        counted: (statusVal === 'down') 
    };

    if (editIndex >= 0) {
        const originalRecord = records[editIndex];
        records[editIndex] = { ...originalRecord, ...baseRec, ts: originalRecord.ts };
        if (statusVal === 'ok' && originalRecord.status === 'down') records[editIndex].counted = true;
        editIndex = -1;
        document.getElementById('editHint').classList.add('hidden');
    } else {
        if (statusVal === 'ok' && brokenDate && fixedDate) baseRec.counted = true;
        records.push(baseRec);
    }

    await saveDeviceRecords(currentSiteKey, currentDevice, records);
    
    clearForm(); 
    await loadHistory();
    window.updateDeviceSummary(); 
    window.updateDeviceStatusOverlays(currentSiteKey); 
   
    if (statusVal === 'down' && editIndex < 0) { 
        sendEmailNotify('down', currentDevice, baseRec.description, baseRec.user, baseRec.brokenDate, records.filter(r => r.counted).length);
    }
    if (statusVal === 'ok') { 
        sendEmailNotify('fixed', currentDevice, baseRec.description, baseRec.user, baseRec.fixedDate, null);
    }

    Swal.fire("บันทึกเรียบร้อย", "", "success");
   let logAction = (editIndex >= 0) ? "EDIT_RECORD" : "ADD_RECORD";
    let logDetail = (editIndex >= 0) ? `แก้ไขข้อมูลประวัติของ ${currentDevice}` : `เพิ่มประวัติการชำรุดใหม่ให้ ${currentDevice}`;
    
    // บันทึก Log การบันทึกข้อมูล
    await createLog(logAction, logDetail);

    // บันทึก Log การเปลี่ยนสถานะ (ถ้ามี)
    const logStatusText = (statusVal === 'down') ? 'ชำรุด' : 'ใช้งานได้';
    await createLog("UPDATE_STATUS", `อุปกรณ์ ${currentDevice} มีสถานะเป็น: ${logStatusText}`);
    return true;
    
};

window.clearCurrentDevice = async function() {
if (currentUserRole !== 'editor' && currentUserRole !== 'admin') {
    Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ลบข้อมูล', 'error');
    return;
}
if (!currentDevice) return;
const result = await Swal.fire({
title: `ลบข้อมูล ${currentDevice}?`,
text: "คุณต้องการลบข้อมูลทั้งหมดของอุปกรณ์นี้ใช่หรือไม่?",
icon: 'warning',
showCancelButton: true,
confirmButtonColor: '#ef4444',
confirmButtonText: 'ใช่, ลบเลย!',
cancelButtonText: 'ยกเลิก'
});

if (result.isConfirmed) {
await getSiteCollection(currentSiteKey).doc(currentDevice).set({ records: [], downCount: 0, currentStatus: 'ok' }, { merge: true });
await loadHistory();
window.updateDeviceSummary(); 
window.updateDeviceStatusOverlays(currentSiteKey); 
Swal.fire("ลบเรียบร้อย", "", "success");
}
}

function updateAssetDisplays(assetInfo) {
const statusEl = document.getElementById('warrantyStatusDisplay');
const infoEl = document.getElementById('assetInfoDisplay');
if (assetInfo && assetInfo.warrantyEnd) {
const status = getWarrantyStatus(assetInfo.warrantyEnd);
statusEl.innerHTML = getWarrantyStatusHTML(status);
let infoParts = [];
if (assetInfo.model) infoParts.push(`รุ่น: ${escapeHtml(assetInfo.model)}`);
if (assetInfo.serial) infoParts.push(`S/N: ${escapeHtml(assetInfo.serial)}`);
infoEl.innerHTML = infoParts.join(' | ') || 'ลงทะเบียนแล้ว';
} else {
statusEl.innerHTML = '<span class="tag tag-warranty-bad">🚫 ยังไม่ลงทะเบียน</span>';
infoEl.innerHTML = 'กรุณาคลิก "ดู/แก้ไขข้อมูลทรัพย์สิน"';
}
}

async function loadHistory() {
    const container = document.getElementById('historySection');
    container.innerHTML = '';
    if (!currentDevice) return;

    const docRef = getSiteCollection(currentSiteKey).doc(currentDevice);
    let docData = null, records = [], assetInfo = null;

    try {   const snap = await docRef.get({ source: 'server' }); 
    if (snap.exists) { docData = snap.data(); records = docData.records || []; assetInfo = docData.assetInfo || null; }
    } catch (e) { console.error("Error fetching device:", e); container.innerHTML = '<p>Error loading data</p>'; return; }

    updateAssetDisplays(assetInfo);
    records.sort((a, b) => b.ts - a.ts); 
    if (records.length === 0) {
    container.innerHTML = '<p class="text-center py-4 text-gray-400">ไม่พบประวัติการบันทึกสำหรับอุปกรณ์นี้</p>';
    return;
    }

    const canEdit = (currentUserRole === 'editor' || currentUserRole === 'admin') ? '' : 'disabled title="ไม่มีสิทธิ์แก้ไข"';

    let isCurrentBrokenFound = false; 
    const totalRecords = records.length;

    records.forEach((r, index) => {
        const recordSequence = totalRecords - index; 
        let duration = '-';
        if (r.brokenDate) {
            if (r.fixedDate) {
                const days = calculateDaysDifference(r.brokenDate, r.fixedDate);
                duration = formatDuration(days);
            } else if (!r.fixedDate && !isCurrentBrokenFound) { 
                const days = calculateDaysDifference(r.brokenDate, null);
                duration = formatDuration(days) + ' <span class="text-sm text-red-500 font-semibold">(ชำรุด)</span>';
                isCurrentBrokenFound = true; 
            } else {
                const days = calculateDaysDifference(r.brokenDate, null);
                duration = formatDuration(days);
            }
        }

        const statusClass = r.status === 'ok' ? 'tag-ok' : 'tag-bad';
        const statusText = r.status === 'ok' ? '✅ ใช้งานได้' : '❎ ชำรุด';
        const div = document.createElement('div');
        // --- เปลี่ยน Class ตรงนี้ให้เป็น Light Theme ---
        div.className = 'p-4 mb-3 border border-gray-200 bg-white rounded-lg shadow-sm'; 

        div.innerHTML = `
            <div class="flex justify-between items-start border-b border-gray-100 pb-2 mb-2">
                <div class="text-lg font-bold text-slate-800">
                    <span class="tag ${statusClass}">${statusText}</span>
                        <span class="ml-2 text-base text-gray-500"> | ครั้งที่ ${recordSequence}</span>
                </div>
                <div class="text-sm text-gray-500">
                    โดย: <span class="font-semibold text-slate-700">${escapeHtml(r.user || 'ไม่ระบุ')}</span>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-y-2 text-sm text-gray-600">
                <div>วันที่ชำรุด: ${r.brokenDate || '-'}</div>
                <div>วันที่ซ่อม: ${r.fixedDate || '-'}</div>
                <div class="col-span-2 text-red-600">ระยะเวลา: ${duration}</div>
            </div>
            <div class="mt-3 text-sm text-gray-700 italic">"${escapeHtml(r.description || '-')}"</div>
            <div class="mt-4 flex justify-end space-x-2">
                <button class="btn btn-ghost text-yellow-600 hover:bg-yellow-50" onclick="editRecord('${r.ts}')" ${canEdit}>✏️ แก้ไข</button>
                <button class="btn btn-ghost text-red-600 hover:bg-red-50" onclick="deleteRecord('${r.ts}')" ${canEdit}>🗑️ ลบ</button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.deleteRecord = async function(ts) {
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') return;
    if (!currentDevice) return;
    const result = await Swal.fire({
        title: 'ลบรายการนี้?',
        text: "คุณต้องการลบรายการประวัตินี้จริงหรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ใช่, ลบ!',
        cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;
    let records = await getDeviceRecords(currentSiteKey, currentDevice);
    const idx = records.findIndex(r => String(r.ts) === String(ts));
    if (idx < 0) return;
    records.splice(idx, 1);
    await saveDeviceRecords(currentSiteKey, currentDevice, records);
    loadHistory();
    window.updateDeviceSummary(); 
    window.updateDeviceStatusOverlays(currentSiteKey); 
}

window.editRecord = async function(ts) {
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') return;
    if (!currentDevice) return;
    let records = await getDeviceRecords(currentSiteKey, currentDevice);
    const idx = records.findIndex(r => String(r.ts) === String(ts));
    if (idx < 0) return;
    const r = records[idx];
    const statusSelect = document.getElementById('status');
    const fixedDateInput = document.getElementById('fixedDate'); 
    statusSelect.value = r.status || 'down';
    statusSelect.disabled = false; 
    fixedDateInput.disabled = false;
    fixedDateInput.classList.remove('bg-gray-200', 'cursor-not-allowed');
    fixedDateInput.placeholder = "";
    document.getElementById('brokenDate').value = r.brokenDate || '';
    document.getElementById('fixedDate').value = r.fixedDate || '';
    document.getElementById('description').value = r.description || '';
    editIndex = idx;
    document.getElementById('editHint').classList.remove('hidden');
};

window.openAssetModal = async function() {
if (!currentDevice) return;
document.getElementById('assetFormTitle').textContent = `📋 ข้อมูลทรัพย์สิน: ${currentDevice}`;
document.getElementById('formModal').style.display = 'none'; 
document.getElementById('assetModal').style.display = 'flex'; 
await loadAssetData();
}

window.closeAssetModal = function(showMainModal = true) {
document.getElementById('assetModal').style.display = 'none';
if (showMainModal && currentDevice) {
document.getElementById('formModal').style.display = 'flex'; 
} else {

}
}

async function loadAssetData() {
    const docRef = getSiteCollection(currentSiteKey).doc(currentDevice);
    const snap = await docRef.get();
    let assetInfo = {};
    if (snap.exists && snap.data().assetInfo) { assetInfo = snap.data().assetInfo; }

    const inputIds = ['assetSerial', 'assetModel', 'assetManufacturer', 'assetWarrantyStart', 'assetWarrantyEnd'];
    
    // 💥 RBAC CHECK: Admin Only for Assets
    const isAdmin = (currentUserRole === 'admin');

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = !isAdmin;
            if (!isAdmin) el.classList.add('bg-gray-700', 'text-gray-400', 'cursor-not-allowed');
            else el.classList.remove('bg-gray-700', 'text-gray-400', 'cursor-not-allowed');
        }
    });

    const saveBtn = document.getElementById('saveAssetButton'); 
    if (saveBtn) saveBtn.style.display = isAdmin ? 'inline-block' : 'none';

    document.getElementById('assetSerial').value = assetInfo.serial || '';
    document.getElementById('assetModel').value = assetInfo.model || '';
    document.getElementById('assetManufacturer').value = assetInfo.manufacturer || '';
    document.getElementById('assetWarrantyStart').value = assetInfo.warrantyStart || '';
    document.getElementById('assetWarrantyEnd').value = assetInfo.warrantyEnd || '';

    if (assetInfo.warrantyStart && assetInfo.warrantyEnd) {
        const start = new Date(assetInfo.warrantyStart);
        const end = new Date(assetInfo.warrantyEnd);
        const diffYears = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
        document.getElementById('assetWarrantyYears').value = Math.round(diffYears * 10) / 10; 
    } else {
        document.getElementById('assetWarrantyYears').value = '';
    }
    updateAssetWarrantyStatusField();
}

window.saveAssetData = async function() {
    // 💥 RBAC CHECK: Admin Only
    if (currentUserRole !== 'admin') {
        Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าถึง', text: `เฉพาะ Admin เท่านั้น` });
        return; 
    }
    if (!currentDevice) return;
    const assetInfo = {
        serial: document.getElementById('assetSerial').value,
        model: document.getElementById('assetModel').value,
        manufacturer: document.getElementById('assetManufacturer').value,
        warrantyStart: document.getElementById('assetWarrantyStart').value,
        warrantyEnd: document.getElementById('assetWarrantyEnd').value,
    };
    const docRef = getSiteCollection(currentSiteKey).doc(currentDevice);
    try {
        await docRef.set({ assetInfo }, { merge: true }); 
        Swal.fire('บันทึกสำเร็จ', 'ข้อมูลทรัพย์สินถูกบันทึกแล้ว', 'success');
        updateAssetDisplays(assetInfo);
        window.updateDeviceSummary();
        closeAssetModal(true); 
    } catch (e) {
        console.error("Error saving asset:", e);
        Swal.fire('ผิดพลาด', e.message, 'error');
    }
    await createLog("EDIT_ASSET", "แก้ไขรายละเอียดทรัพย์สินของ " + currentDevice);
}

function updateAssetWarrantyStatusField() {
const endDate = document.getElementById('assetWarrantyEnd').value;
const status = getWarrantyStatus(endDate);
const field = document.getElementById('assetWarrantyStatus');
switch (status) {
case 'ok': field.value = 'รับประกัน'; break;
case 'warn': field.value = 'ใกล้หมดประกัน'; break;
case 'bad': field.value = 'หมดประกัน'; break;
default: field.value = 'N/A';
}
}

function setupWarrantyCalculators() {
const startEl = document.getElementById('assetWarrantyStart');
const yearsEl = document.getElementById('assetWarrantyYears');
const endEl = document.getElementById('assetWarrantyEnd');
function calculateEnd() {
if (startEl.value && yearsEl.value) {
const startDate = new Date(startEl.value);
const years = parseFloat(yearsEl.value);
if (!isNaN(startDate) && years > 0) {
startDate.setFullYear(startDate.getFullYear() + Math.floor(years));
const fractionalDays = (years % 1) * 365.25;
startDate.setDate(startDate.getDate() + Math.round(fractionalDays));
endEl.value = startDate.toISOString().split('T')[0];
updateAssetWarrantyStatusField();
}
}
}
function calculateYears() {
if (startEl.value && endEl.value) {
const startDate = new Date(startEl.value);
const endDate = new Date(endEl.value);
if (!isNaN(startDate) && !isNaN(endDate) && endDate > startDate) {
const diffMs = endDate - startDate;
const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
yearsEl.value = Math.round(diffYears * 100) / 100;
updateAssetWarrantyStatusField();
}
}
}
startEl.addEventListener('change', calculateEnd);
yearsEl.addEventListener('change', calculateEnd);
endEl.addEventListener('change', calculateYears);
endEl.addEventListener('change', updateAssetWarrantyStatusField);
}

// 💥💥💥 FUNCTION: User Management UI 💥💥💥
window.openUserManagement = async function() {
    if (currentUserRole !== 'admin') return;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('userModal').style.display = 'flex';
    await loadUsers();
}

window.closeUserManagement = function() {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('userModal').style.display = 'none';
}

window.loadUsers = async function() {
    const listContainer = document.getElementById('userListContainer');
    // เปลี่ยนสีข้อความสถานะ Loading เป็นสีเทาเข้มขึ้น
    listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">กำลังโหลด...</div>';
    
    try {
        const snapshot = await db.collection('users').get();
        if (snapshot.empty) {
            listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">ยังไม่มีผู้ใช้งาน</div>';
            return;
        }

        listContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const userData = doc.data();
            const email = userData.email;
            const role = userData.role || 'viewer';
            const isMe = (email === currentUser.email);
            
            const div = document.createElement('div');
            // ปรับ Background Item: สีขาว มีเส้นขอบล่าง
            div.className = 'user-item flex justify-between items-center p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors';
            
            const roleOptions = `
                <option value="viewer" ${role==='viewer'?'selected':''}>Viewer (ดูอย่างเดียว)</option>
                <option value="editor" ${role==='editor'?'selected':''}>Editor (บันทึก/แก้ไข)</option>
                <option value="admin" ${role==='admin'?'selected':''}>Admin (ดูแลระบบ)</option>
            `;

            div.innerHTML = `
                <div class="flex flex-col">
                    <span class="font-medium text-sm ${isMe ? 'text-blue-600' : 'text-slate-800'}">
                        ${escapeHtml(email)} ${isMe ? '(คุณ)' : ''}
                    </span>
                    <span class="text-xs text-gray-500">สิทธิ์ปัจจุบัน: ${role}</span>
                </div>
                <div>
                    <select onchange="changeUserRole('${email}', this.value)" 
                            class="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-1.5 outline-none shadow-sm cursor-pointer">
                        ${roleOptions}
                    </select>
                </div>
            `;
            listContainer.appendChild(div);
        });

    } catch (error) {
        console.error("Load users failed:", error);
        listContainer.innerHTML = `<div class="text-red-500 text-center py-4">โหลดไม่สำเร็จ: ${error.message}</div>`;
    }
}

window.changeUserRole = async function(email, newRole) {
    if (currentUserRole !== 'admin') return;
    
    // Prevent changing own role if it removes admin access (Safety check)
    if (email === ADMIN_EMAIL && newRole !== 'admin') {
        Swal.fire('ไม่อนุญาต', 'ไม่สามารถลดสิทธิ์ Admin หลักได้', 'error');
        await loadUsers(); // Reset UI
        return;
    }

    try {
        await db.collection('users').doc(email).update({ role: newRole });
        const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        Toast.fire({ icon: 'success', title: `ปรับสิทธิ์ ${email} เป็น ${newRole} แล้ว` });
     await createLog("ADMIN_MANAGEMENT", `แก้ไขสิทธิ์ของ ${email} เป็น ${newRole}`);
        // Reload list to confirm
        loadUsers(); 
    } catch (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
        loadUsers();
    }
  
}


// 💥💥💥 FUNCTION: updateDeviceSummary 💥💥💥
window.updateDeviceSummary = async function() {
    const siteData = sites[currentSiteKey];
    if (!siteData) return;
    const search = document.getElementById('searchInput').value.toLowerCase();
    const sortOrder = document.getElementById('sortOrder').value;
    const filterStatus = document.getElementById('filterStatus').value;
    const from = document.getElementById('fromDate').value;
    const to = document.getElementById('toDate').value;

    const docsSnap = await getSiteCollection(currentSiteKey).get({ source: 'server' }); 
    const dataMap = {}; 
    docsSnap.forEach(d => dataMap[d.id] = d.data());

    let summary = [];

    for (const dev of siteData.devices) {
        const docData = dataMap[dev]; 
        const records = docData?.records || [];
        if (records.length > 0) records.sort((a, b) => a.ts - b.ts); 
        
        let downCount = docData?.downCount || 0; 
        const isUnresolved = (r) => {
            if (r.status !== 'down') return false;
            return !r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null';
        };
        const remainingDownRecords = records.filter(r => isUnresolved(r));
        const remainingDownCount = remainingDownRecords.length;

        let latestBrokenDuration = '-', latestBrokenDays = 0, earliestBrokenDate = '-', latestFixedDate = '-', currentStatusDisplay = 'ok';
        const latestRecord = records.length > 0 ? records[records.length - 1] : null;

        if (remainingDownCount > 0) {
            currentStatusDisplay = '❎ ชำรุด';
            const oldestIssue = remainingDownRecords[0]; 
            earliestBrokenDate = oldestIssue.brokenDate || '-';
            latestFixedDate = '-'; 
            latestBrokenDays = calculateDaysDifference(earliestBrokenDate, null);
            latestBrokenDuration = formatDuration(latestBrokenDays) + ' (ยังไม่ได้แก้ไข)';
        } else {
            currentStatusDisplay = '✅ ใช้งานได้'; 
            if (latestRecord && latestRecord.brokenDate) {
                 earliestBrokenDate = latestRecord.brokenDate;
                 latestFixedDate = latestRecord.fixedDate || '-'; 
                 if (latestRecord.fixedDate && latestRecord.fixedDate !== '-') {
                      latestBrokenDays = calculateDaysDifference(latestRecord.brokenDate, latestRecord.fixedDate);
                      latestBrokenDuration = formatDuration(latestBrokenDays);
                 }
            }
        }
        
        let dateFilterSource = earliestBrokenDate !== '-' ? earliestBrokenDate : (latestRecord?.brokenDate);
        if (dateFilterSource && dateFilterSource !== '-') {
            const latestTs = new Date(dateFilterSource).getTime();
            if (from) { if (latestTs < new Date(from).getTime()) continue; }
            if (to) { if (latestTs >= new Date(to).getTime() + (86400000)) continue; }
        }        

        if (filterStatus === 'currently-down' && remainingDownCount === 0) continue; 
        if (filterStatus === 'down' && downCount === 0) continue; 
        if (filterStatus === 'clean' && downCount > 0) continue; 
        if (search && !dev.toLowerCase().includes(search)) continue;

        summary.push({
            device: dev,
            count: downCount,
            remaining: remainingDownCount, 
            brokenDate: earliestBrokenDate,
            fixedDate: latestFixedDate,
            status: currentStatusDisplay,
            latestDescription: latestRecord?.description || '-',
            latestBrokenDuration: latestBrokenDuration,
            latestBrokenDays: latestBrokenDays,
        });
    }

    summary.sort((a, b) => {
        const countSort = sortOrder === 'desc' ? b.count - a.count : a.count - b.count;
        if (countSort !== 0) return countSort;
        return b.latestBrokenDays - a.latestBrokenDays; 
    });

    const pageSize = 10;
    const totalPages = Math.max(1, Math.ceil(summary.length / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageData = summary.slice(startIndex, endIndex);

    const tbody = document.getElementById('summaryBody');
    tbody.innerHTML = '';

    if (summary.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-gray-500">ไม่พบข้อมูลอุปกรณ์ตามเงื่อนไขที่เลือก</td></tr>'; 
    } else {
        pageData.forEach(s => {
            const tr = document.createElement('tr');
            // --- เปลี่ยน Class Table Row ---
            tr.className = 'border-t border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors'; 
            tr.innerHTML = `
                <td class="text-left font-medium text-slate-800">${escapeHtml(s.device)}</td>
                <td><span class="${s.count > 0 ? 'tag tag-bad' : 'tag tag-ok'}">${s.count} / ${s.remaining}</span></td> 
                <td>${s.brokenDate}</td>
                <td>${s.fixedDate}</td>
                <td><span class="${s.status.includes('ชำรุด') ? 'tag tag-bad' : 'tag tag-ok'}">${s.status}</span></td>
                <td class="font-semibold text-center text-slate-700">${s.latestBrokenDuration}</td>
                <td class="text-left text-sm text-gray-500 max-w-[200px] whitespace-normal">${escapeHtml(s.latestDescription || '-')}</td>
            `;
            tr.addEventListener('click', () => window.openForm(s.device)); 
            tbody.appendChild(tr);
        });
    }

    document.getElementById('pagination').innerHTML = `
        <div class="flex justify-center items-center gap-2 mt-2">
            <button class="btn" onclick="changePage(-1)" ${currentPage===1?'disabled':''}>⬅️ ก่อนหน้า</button>
            <span>หน้า ${currentPage} / ${totalPages}</span>
            <button class="btn" onclick="changePage(1)" ${currentPage===totalPages?'disabled':''}>ถัดไป ➡️</button>
        </div>
    `;

    updateChart(summary);
};


function updateChart(summary) {
const sorted = [...summary].sort((a, b) => b.count - a.count);
const top10 = sorted.slice(0, 10);
const labels = top10.map(s => s.device);
const data = top10.map(s => s.count);
if (chartInstance) chartInstance.destroy();
const ctx = document.getElementById('chart').getContext('2d');
chartInstance = new Chart(ctx, {
type: 'bar',
data: { labels, datasets: [{ label: 'ครั้งชำรุด', data, backgroundColor: data.map(v => v > 0 ? 'rgba(248,113,113,0.85)' : 'rgba(148,163,184,0.6)') }] },
options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, precision: 0 } } }
});
}

window.changePage = function(step) {
currentPage += step;
if (currentPage < 1) currentPage = 1;
window.updateDeviceSummary(); 
}

window.updateDeviceStatusOverlays = async function(siteKey) {
    const mapContainer = document.getElementById(`map-${siteKey}`);
    if (!mapContainer) return;

    // 1. ลบ Overlay เก่าทั้งหมดออก
    mapContainer.querySelectorAll('.device-overlay').forEach(el => el.remove());

    // 2. ดึงข้อมูลอุปกรณ์เพื่อเช็คสถานะ
    const docsSnap = await getAllDevicesDocs(siteKey);
    const downDevices = {};
    docsSnap.forEach(d => {
        if (d.data() && d.data().currentStatus === 'down') {
            downDevices[d.id] = true;
        }
    });

    // 3. ค้นหา Map Area ทั้งหมด (เพื่อวาดทั้งกรอบเขียวและกากบาทแดง)
    const mapElement = mapContainer.querySelector('map');
    if (!mapElement) return;

    const areaElements = mapElement.querySelectorAll('area');
    const MIN_DIMENSION = 10;
    
    // 💥 แก้ไข: ลบ OFFSET_TOP ออก เพื่อแก้ปัญหาตำแหน่งเลื่อน
    // const OFFSET_TOP = ... (ลบทิ้ง)

    areaElements.forEach(area => {
        const deviceName = area.getAttribute('alt');
        const isDown = downDevices[deviceName]; // เช็คว่าเสียหรือไม่

        // ดึงพิกัด
        const coords = area.getAttribute('coords').split(',').map(c => parseInt(c.trim()));
        const shape = area.getAttribute('shape');

        let x, y, width, height;

        if (shape === 'rect' && coords.length === 4) {
            x = coords[0];
            y = coords[1];
            width = coords[2] - coords[0];
            height = coords[3] - coords[1];

            width = Math.max(width, MIN_DIMENSION);
            height = Math.max(height, MIN_DIMENSION);
        } else {
            return; // รองรับแค่ rect ในตอนนี้
        }

        // สร้าง Overlay
        const overlay = document.createElement('div');
        
        // 💥 กำหนด Class ตามสถานะ (ปกติ=กรอบเขียว, เสีย=กากบาทแดง)
        if (isDown) {
            overlay.className = 'device-overlay down'; // กากบาทแดง
        } else {
            overlay.className = 'device-overlay normal'; // กรอบเขียว
        }

        const PADDING = 0; // ปรับ Padding เป็น 0 เพื่อให้กรอบตรงเป๊ะกับ Area

        overlay.style.left = `${x - PADDING}px`;
        overlay.style.top = `${y - PADDING}px`; // ไม่ต้องบวก OFFSET_TOP แล้ว
        overlay.style.width = `${width + (2 * PADDING)}px`;
        overlay.style.height = `${height + (2 * PADDING)}px`;

        overlay.setAttribute('title', deviceName);

        mapContainer.appendChild(overlay);
    });
};

let unsubscribe = null; 

function setupRealtimeListener(siteKey) {
if (unsubscribe) { unsubscribe(); }
const currentDeviceCollection = db.collection(`sites`).doc(siteKey).collection(`devices`); 
unsubscribe = currentDeviceCollection.onSnapshot(snapshot => { 
window.updateDeviceSummary(); 
}, (error) => {
console.error("Listener Error:", error);
});
}

async function processAndSaveImport(assetsToImport, recordsToImport) {
    Swal.fire({ title: 'กำลังนำเข้า...', didOpen: () => { Swal.showLoading(); } });
    const batch = db.batch();
    const assetMap = new Map();
    for (const item of assetsToImport) assetMap.set(item.deviceName, item.assetInfo);
    const recordMap = new Map(); 
    for (const item of recordsToImport) {
        if (!recordMap.has(item.deviceName)) recordMap.set(item.deviceName, []);
        recordMap.get(item.deviceName).push(item.record);
    }
    const allDeviceNames = new Set([...assetMap.keys(), ...recordMap.keys(), ...sites[currentSiteKey].devices]);
    try {
        const docsSnap = await getAllDevicesDocs(currentSiteKey);
        const existingDataMap = new Map();
        docsSnap.forEach(d => existingDataMap.set(d.id, d.data()));
        for (const deviceName of allDeviceNames) {
            if (!sites[currentSiteKey].devices.includes(deviceName)) continue;
            const docRef = getSiteCollection(currentSiteKey).doc(deviceName);
            const existingData = existingDataMap.get(deviceName) || {};
            let finalAssetInfo = existingData.assetInfo || {};
            if (assetMap.has(deviceName)) finalAssetInfo = assetMap.get(deviceName);
            const existingRecords = existingData.records || [];
            const importedRecords = recordMap.get(deviceName) || [];
            const finalRecordsMap = new Map();
            for (const r of existingRecords) finalRecordsMap.set(r.ts, r);
            for (const r of importedRecords) finalRecordsMap.set(r.ts, r);
            const finalRecords = Array.from(finalRecordsMap.values());
            finalRecords.sort((a, b) => a.ts - b.ts);
            const downCount = finalRecords.filter(r => r.counted).length; 
          const isUnresolved = (r) => {
                if (r.status !== 'down') return false; 
                return !r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null';
            };
            
            // เช็คว่ามีรายการค้างหรือไม่
            const hasUnresolvedIssues = finalRecords.some(r => isUnresolved(r));
            
            // ถ้ามีค้าง ให้เป็น down, ถ้าไม่มี ให้เป็น ok
            const currentStatus = hasUnresolvedIssues ? 'down' : 'ok';
            // ------------------------

            batch.set(docRef, {
                assetInfo: finalAssetInfo,
                records: finalRecords,
                downCount: downCount,
                currentStatus: currentStatus
            });
        }
        await batch.commit();
        window.updateDeviceSummary();
        window.updateDeviceStatusOverlays(currentSiteKey);
        Swal.fire({ title: 'นำเข้าสำเร็จ!', icon: 'success' });
    } catch (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

window.importData = function(event) {
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') {
        Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์นำเข้าข้อมูล', 'error');
        event.target.value = null;
        return;
    }
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            const assetSheetName = "ข้อมูลทรัพย์สิน";
            const recordSheetName = "ประวัติการชำรุด";
            const wsAssets = wb.Sheets[assetSheetName];
            const wsRecords = wb.Sheets[recordSheetName];
            const assetsToImport = [];
            const recordsToImport = [];
            const cleanDate = (val) => {
                if (!val) return null;
                const str = val.toString().trim();
                if (str === '-' || str === '' || str.toLowerCase() === 'null') return null;
                return str.slice(0, 10).replace(/\//g, '-');
            };
            if (wsAssets) {
                const assetRawData = XLSX.utils.sheet_to_json(wsAssets, { header: 1 });
                if (assetRawData.length >= 2) { 
                    const headers = assetRawData[0];
                    const headerMap = {
                        'ชื่ออุปกรณ์': headers.indexOf('ชื่ออุปกรณ์'),
                        'Serial Number': headers.indexOf('Serial Number'),
                        'Model': headers.indexOf('Model'),
                        'Manufacturer': headers.indexOf('Manufacturer'),
                        'วันที่เริ่มประกัน': headers.indexOf('วันที่เริ่มประกัน'),
                        'วันที่หมดประกัน': headers.indexOf('วันที่หมดประกัน'),
                    };
                    if (headerMap['ชื่ออุปกรณ์'] !== -1) {
                        for (let i = 1; i < assetRawData.length; i++) {
                            const row = assetRawData[i];
                            const deviceName = row[headerMap['ชื่ออุปกรณ์']];
                            if (!deviceName) continue;
                            const assetInfo = {
                                serial: row[headerMap['Serial Number']] || '',
                                model: row[headerMap['Model']] || '',
                                manufacturer: row[headerMap['Manufacturer']] || '',
                                warrantyStart: cleanDate(row[headerMap['วันที่เริ่มประกัน']]),
                                warrantyEnd: cleanDate(row[headerMap['วันที่หมดประกัน']]),
                            };
                            assetsToImport.push({ deviceName, assetInfo });
                        }
                    }
                }
            }
            if (wsRecords) {
                const recordRawData = XLSX.utils.sheet_to_json(wsRecords, { header: 1 });
                if (recordRawData.length >= 2) { 
                    const headers = recordRawData[0];
                    const headerMap = {
                        'Timestamp': headers.indexOf('Timestamp'),
                        'ชื่ออุปกรณ์': headers.indexOf('ชื่ออุปกรณ์'),
                        'วันที่ชำรุด': headers.indexOf('วันที่ชำรุด'),
                        'วันที่ซ่อมแซม': headers.indexOf('วันที่ซ่อมแซม'),
                        'สถานะ': headers.indexOf('สถานะ'),
                        'คำอธิบาย': headers.indexOf('คำอธิบาย'),
                        'ผู้บันทึก': headers.indexOf('ผู้บันทึก')
                    };
                    const requiredHeaders = ['ชื่ออุปกรณ์', 'วันที่ชำรุด', 'สถานะ'];
                    if (!requiredHeaders.some(h => headerMap[h] === -1)) {
                        for (let i = 1; i < recordRawData.length; i++) {
                            const row = recordRawData[i];
                            const deviceName = row[headerMap['ชื่ออุปกรณ์']];
                            if (!deviceName) continue;
                            const importedBrokenDate = cleanDate(row[headerMap['วันที่ชำรุด']]);
                            const importedFixedDate = cleanDate(row[headerMap['วันที่ซ่อมแซม']]);
                            const statusValue = (row[headerMap['สถานะ']] || '').toString();
                            const importedTs = row[headerMap['Timestamp']];
                            let finalStatus = statusValue.includes('ชำรุด') ? 'down' : 'ok';
                            if (importedBrokenDate && !importedFixedDate) { finalStatus = 'down'; }
                            const record = {
                                ts: importedTs ? parseInt(importedTs) : Date.now() + i,
                                brokenDate: importedBrokenDate || '',
                                fixedDate: importedFixedDate || null, 
                                status: finalStatus, 
                                description: (row[headerMap['คำอธิบาย']] || '').toString() || 'นำเข้าจาก Excel',
                                user: (row[headerMap['ผู้บันทึก']] || '').toString() || currentUser.email,
                                counted: !!importedBrokenDate, 
                            };
                            recordsToImport.push({ deviceName, record });
                        }
                    }
                }
            }
            if (assetsToImport.length > 0 || recordsToImport.length > 0) {
                processAndSaveImport(assetsToImport, recordsToImport);
            } else {
                Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลที่ถูกต้องในชีตใดๆ', 'error');
            }
        } catch (error) {
            Swal.fire('ผิดพลาด', error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = null; 
};

window.exportAllDataExcel = async function() {
    const siteData = sites[currentSiteKey];
    if (!siteData || siteData.devices.length === 0) {
        Swal.fire('แจ้งเตือน', 'ไม่พบอุปกรณ์', 'warning');
        return;
    }

    // --- ส่วนที่ 1: ดึงข้อมูล Asset และ History (เดิม) ---
    const docsSnap = await getAllDevicesDocs(currentSiteKey);
    const dataMap = {};
    docsSnap.forEach(d => dataMap[d.id] = d.data());

    const recordsHeader = ['Timestamp', 'ชื่ออุปกรณ์', 'ลำดับการชำรุด (ครั้งที่ N)', 'วันที่ชำรุด', 'วันที่ซ่อมแซม', 'ระยะเวลาชำรุด', 'สถานะ', 'คำอธิบาย', 'ผู้บันทึก'];
    const recordsData = [recordsHeader]; 
    const assetHeader = ['ชื่ออุปกรณ์', 'Serial Number', 'Model', 'Manufacturer', 'วันที่เริ่มประกัน', 'วันที่หมดประกัน', 'สถานะประกัน'];
    const assetData = [assetHeader]; 

    for (const devName of siteData.devices) {
        const docData = dataMap[devName];
        const assetInfo = docData?.assetInfo || {}; 
        const warrantyStatus = getWarrantyStatus(assetInfo.warrantyEnd);
        let warrantyStatusText = 'N/A';
        switch(warrantyStatus) {
            case 'ok': warrantyStatusText = 'รับประกัน'; break;
            case 'warn': warrantyStatusText = 'ใกล้หมดประกัน'; break;
            case 'bad': warrantyStatusText = 'หมดประกัน'; break;
        }
        assetData.push([
            devName, assetInfo.serial || '-', assetInfo.model || '-', assetInfo.manufacturer || '-',
            (assetInfo.warrantyStart || '-').replace(/-/g, '/'), 
            (assetInfo.warrantyEnd || '-').replace(/-/g, '/'),   
            warrantyStatusText
        ]);

        if (!docData) continue; 
        const records = docData.records || [];
        records.sort((a, b) => a.ts - b.ts);
        let downCount = 0; 
        records.forEach(r => {
            let duration = '-', sequenceNumber = '-'; 
            if (r.counted) { downCount++; sequenceNumber = downCount; }
            if (r.brokenDate) {
                if (r.fixedDate) {
                    const days = calculateDaysDifference(r.brokenDate, r.fixedDate);
                    duration = formatDuration(days);
                } else if (r.status === 'down') {
                    const days = calculateDaysDifference(r.brokenDate, null); 
                    duration = formatDuration(days) + ' (ชำรุด)';
                }
            }
            recordsData.push([
                r.ts || '-', devName, sequenceNumber,
                (r.brokenDate || '-').replace(/-/g, '/'), 
                (r.fixedDate || '-').replace(/-/g, '/'),  
                duration, r.status === 'down' ? 'ชำรุด' : 'ใช้งานได้', r.description || '-', r.user || '-', 
            ]);
        });
    }

    // --- ส่วนที่ 2: เพิ่มการดึงข้อมูล Log (ใหม่สำหรับ Sheet 3) ---
    const logHeader = ['วัน-เวลา', 'ผู้ใช้งาน', 'การกระทำ', 'รายละเอียด', 'ไซต์'];
    const logData = [logHeader];

    try {
        // ดึง Log เฉพาะของไซต์ปัจจุบัน (หรือทั้งหมดตามต้องการ) เรียงจากใหม่ไปเก่า
        const logSnap = await db.collection("activity_logs")
            .where("siteKey", "==", currentSiteKey)
            .orderBy("timestamp", "desc")
            .limit(1000) // จำกัดไว้ที่ 1,000 รายการล่าสุด
            .get();

        logSnap.forEach(doc => {
            const d = doc.data();
            const timeStr = d.timestamp ? d.timestamp.toDate().toLocaleString('th-TH') : '-';
            logData.push([
                timeStr,
                d.userEmail || '-',
                d.action || '-',
                d.details || '-',
                d.siteKey || '-'
            ]);
        });
    } catch (error) {
        console.error("Error fetching logs for export:", error);
        // ถ้าดึง Log ไม่ได้ (เช่น สิทธิ์ไม่ถึง) จะข้ามส่วนนี้ไปเพื่อให้ Export ส่วนอื่นได้ต่อ
    }

    // --- ส่วนที่ 3: สร้างไฟล์ Excel ---
    if (recordsData.length <= 1 && assetData.length <= 1 && logData.length <= 1) {
        Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลใดๆ', 'warning');
        return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: ประวัติการชำรุด
    if (recordsData.length > 1) {
        const ws_records = XLSX.utils.aoa_to_sheet(recordsData);
        XLSX.utils.book_append_sheet(wb, ws_records, "ประวัติการชำรุด");
    }

    // Sheet 2: ข้อมูลทรัพย์สิน
    if (assetData.length > 1) {
        const ws_assets = XLSX.utils.aoa_to_sheet(assetData);
        XLSX.utils.book_append_sheet(wb, ws_assets, "ข้อมูลทรัพย์สิน");
    }

    // Sheet 3: ประวัติการใช้งาน (Logs)
    if (logData.length > 1) {
        const ws_logs = XLSX.utils.aoa_to_sheet(logData);
        XLSX.utils.book_append_sheet(wb, ws_logs, "ประวัติการใช้งาน");
    }

    const fileName = `Device_Export_${siteData.name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    Swal.fire('ส่งออกสำเร็จ', `ไฟล์ ${fileName} ถูกบันทึกแล้ว พร้อมข้อมูลประวัติการใช้งาน`, "success");
};

window.resetFilters = function() {
document.getElementById('searchInput').value = '';
document.getElementById('sortOrder').value = 'desc';
document.getElementById('filterStatus').value = 'all';
document.getElementById('fromDate').value = '';
document.getElementById('toDate').value = '';
currentPage = 1;
try { window.updateDeviceSummary(); } catch (e) {} 
}

window.clearAllDevices = async function() {
if (currentUserRole !== 'admin') {
Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin เท่านั้นที่ลบข้อมูลทั้งหมดได้', 'error');
return;
}
const result = await Swal.fire({
title: '⚠️ ลบข้อมูลทั้งหมด?',
text: `คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด? ข้อมูลทรัพย์สินจะไม่ถูกลบ`,
icon: 'error',
showCancelButton: true,
confirmButtonColor: '#ef4444',
confirmButtonText: 'ใช่, ลบทั้งหมด!',
cancelButtonText: 'ยกเลิก'
});
if (result.isConfirmed) {
const docs = await getAllDevicesDocs(currentSiteKey);
const batch = db.batch(); 
for (let d of docs.docs) {
const docRef = getSiteCollection(currentSiteKey).doc(d.id);
batch.set(docRef, { records: [], downCount: 0, currentStatus: 'ok' }, { merge: true });
}
await batch.commit();
window.updateDeviceSummary(); 
window.updateDeviceStatusOverlays(currentSiteKey); 
Swal.fire('ลบเรียบร้อย', 'ลบข้อมูลประวัติทั้งหมดแล้ว', 'success');
}
}

window.showSummary = function() {
document.getElementById('topologyPage').classList.add('hidden');
document.getElementById('summaryPage').classList.remove('hidden');
window.updateDeviceSummary(); 
};

window.showTopology = function() {
document.getElementById('summaryPage').classList.add('hidden');
document.getElementById('topologyPage').classList.remove('hidden');
if (typeof imageMapResize === 'function') { imageMapResize(); }
window.updateDeviceStatusOverlays(currentSiteKey);
};

function switchSite(siteKey) {
const siteData = sites[siteKey];
if (!siteData) return;
currentSiteKey = siteKey;
document.getElementById('locationTitle').textContent = `🔎 ${siteData.name}`;
document.querySelectorAll('.map-container').forEach(el => el.classList.add('hidden'));
document.getElementById(`map-${siteKey}`).classList.remove('hidden');
if (typeof imageMapResize === 'function') { imageMapResize(); }
setupRealtimeListener(siteKey); 
window.updateDeviceStatusOverlays(currentSiteKey); 
}

// =========================================================================
// Initialization
// =========================================================================

document.addEventListener("DOMContentLoaded", function() {

// 💥 MODIFIED: Auth with Role Fetching 💥
auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user;
        document.getElementById('userInfo').classList.remove('hidden');
        document.getElementById('loginButton').classList.add('hidden');
        document.getElementById('userNameDisplay').textContent = `${user.email}`; 
        
        // Fetch Role from 'users' collection
        try {
            const userRef = db.collection('users').doc(user.email);
            const userSnap = await userRef.get();
            
            if (!userSnap.exists) {
                // First login: create default 'viewer' record
                let initialRole = 'viewer';
                if (user.email === ADMIN_EMAIL) initialRole = 'admin'; // Safety fallback
                
                await userRef.set({
                    email: user.email,
                    role: initialRole,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                currentUserRole = initialRole;
            } else {
                currentUserRole = userSnap.data().role || 'viewer';
            }
            
            // Hardcoded Override (Just in case DB is messed up)
            if (user.email === ADMIN_EMAIL) currentUserRole = 'admin';
            await createLog("AUTH_LOGIN", `ผู้ใช้เข้าสู่ระบบด้วยสิทธิ์: ${currentUserRole.toUpperCase()}`);
            
            // ✅ เริ่มนับเวลา Auto Logout 15 นาที
            startAutoLogoutTimer();
        } catch (e) {
            console.error("Error fetching user role:", e);
            currentUserRole = 'viewer'; // Fallback
        }

        toggleWriteAccess(true);
        
    } else {
        currentUser = null;
        currentUserRole = 'viewer';
        document.getElementById('userInfo').classList.add('hidden');
        document.getElementById('loginButton').classList.remove('hidden');
        toggleWriteAccess(false);
        stopAutoLogoutTimer();
    }
});

document.getElementById('loginButton').addEventListener('click', login);
document.getElementById('logoutButton').addEventListener('click', logout);

setupWarrantyCalculators();

const locationSelect = document.getElementById("location-select");
if (locationSelect) {
locationSelect.addEventListener("change", function() { switchSite(this.value); });
try {
let initialSiteKey = locationSelect.value;
if (!sites[initialSiteKey]) initialSiteKey = Object.keys(sites)[0];
toggleWriteAccess(false); 
switchSite(initialSiteKey); 
} catch (error) { console.error("Init Error:", error); }
}

});

let logoutTimer;

function startAutoLogoutTimer() {
    // ล้าง Timer เก่าถ้ามี (ป้องกันการรันซ้อน)
    if (logoutTimer) clearTimeout(logoutTimer);
    
    const fifteenMinutes = 15 * 60 * 1000; // 15 นาที เป็นมิลลิวินาที

    logoutTimer = setTimeout(async () => {
        if (currentUser) {
            await createLog("AUTH_TIMEOUT", "ออกจากระบบอัตโนมัติเนื่องจากใช้งานเกิน 15 นาที");
            
            Swal.fire({
                title: 'หมดเวลาใช้งาน',
                text: 'คุณถูกออกจากระบบอัตโนมัติเนื่องจากเข้าใช้งานครบ 15 นาที',
                icon: 'warning',
                confirmButtonText: 'ตกลง'
            }).then(() => {
                auth.signOut(); // สั่ง Logout จาก Firebase
            });
        }
    }, fifteenMinutes);
}

function stopAutoLogoutTimer() {
    if (logoutTimer) clearTimeout(logoutTimer);
}
window.printReport = async function() {
    const siteData = sites[currentSiteKey];
    Swal.fire({ title: 'กำลังสร้างรายงาน...', didOpen: () => { Swal.showLoading(); } });
    const docsSnap = await getSiteCollection(currentSiteKey).get();
    const dataMap = {};
    docsSnap.forEach(d => dataMap[d.id] = d.data());
    const now = new Date();
    const printDate = now.toISOString().split('T')[0]; 
    const printTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    let tableContent = '';
    let itemNo = 1;

    for (const dev of siteData.devices) {
        const docData = dataMap[dev] || {};
        let records = docData.records || [];
        records.sort((a, b) => b.ts - a.ts); 
        const assetInfo = docData.assetInfo || {};
        const rowSpan = records.length > 0 ? records.length : 1;
        for (let i = 0; i < rowSpan; i++) {
            const r = records[i];
            const isFirst = (i === 0);
            const occurrenceNo = r ? (records.length - i) : '-';
            tableContent += `<tr class="${isFirst ? 'device-group-start' : ''}">`;
            if (isFirst) {
                const isDown = records.length > 0 && records[0].status === 'down' && !records[0].fixedDate;
                tableContent += `
                    <td rowspan="${rowSpan}" class="col-no text-center">${itemNo++}</td>
                    <td rowspan="${rowSpan}" class="col-device">
                        <div class="brand-tag">${assetInfo.manufacturer || 'General'}</div>
                        <div class="dev-title">${dev}</div>
                        <div class="dev-specs"><span><b>Model:</b> ${assetInfo.model || '-'}</span><br><span><b>S/N:</b> ${assetInfo.serial || '-'}</span></div>
                        <div class="status-pill ${isDown ? 'pill-down' : 'pill-ok'}">${isDown ? '● REQUIRES ATTENTION' : '● OPERATIONAL'}</div>
                    </td>
                `;
            }
            if (r) {
                tableContent += `
                    <td class="text-center font-bold hist-text">${occurrenceNo}</td>
                    <td class="text-center hist-text">${r.brokenDate || '-'}</td>
                    <td class="text-center hist-text">${r.fixedDate || '<span class="urgent">PENDING</span>'}</td>
                    <td class="text-left hist-text desc-cell">${r.description || '-'}</td>
                    <td class="text-left hist-text user-cell">${r.user ? r.user.split('@')[0] : '-'}</td>
                `;
            } else {
                tableContent += `<td colspan="5" class="empty-cell">No maintenance history recorded.</td>`;
            }
            tableContent += `</tr>`;
        }
    }
    Swal.close();
    const printWindow = window.open('', '', 'height=900,width=1300');
    printWindow.document.write(`
        <html><head><title>MAINTENANCE_LOG_${printDate}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                @page { size: A4 landscape; margin: 8mm; }
                body { font-family: 'Inter', 'Sarabun', sans-serif; color: #0f172a; margin: 0; padding: 0; background: #fff; }
                .page-wrapper { padding: 10px; }
                .report-header { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: white; padding: 25px 30px; border-radius: 8px 8px 0 0; margin-bottom: 0; }
                .report-header h1 { margin: 0; font-size: 22px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; }
                .report-header .site-name { font-size: 14px; opacity: 0.8; margin-top: 5px; }
                .header-meta { text-align: right; font-size: 12px; opacity: 0.9; line-height: 1.6; }
                table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #e2e8f0; }
                th { background: #1e293b; color: #f8fafc; padding: 15px 10px; font-size: 14px; text-transform: uppercase; font-weight: 600; border: 1px solid #334155; text-align: center; }
                .hist-text { font-size: 14px; } 
                td { padding: 12px 10px; border: 1px solid #e2e8f0; vertical-align: middle; word-wrap: break-word; }
                tr { page-break-inside: avoid; }
                .device-group-start td { border-top: 3px solid #0f172a; }
                .col-no { width: 40px; background: #f8fafc; color: #64748b; }
                .col-device { width: 220px; background: #f8fafc; border-right: 2px solid #e2e8f0; }
                .brand-tag { font-size: 9px; font-weight: 700; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 5px; color: #475569; }
                .dev-title { font-size: 15px; font-weight: 700; color: #1e40af; margin-bottom: 5px; }
                .dev-specs { font-size: 11px; color: #64748b; line-height: 1.4; }
                .status-pill { margin-top: 12px; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 20px; display: inline-block; }
                .pill-ok { background: #dcfce7; color: #166534; }
                .pill-down { background: #fee2e2; color: #991b1b; }
                .urgent { color: #e11d48; font-weight: 700; text-decoration: underline; }
                .desc-cell { line-height: 1.6; white-space: pre-wrap; }
                .user-cell { color: #94a3b8; font-style: italic; }
                .text-center { text-align: center; } .text-left { text-align: left; } .font-bold { font-weight: 600; }
                .empty-cell { text-align: center; padding: 30px; color: #cbd5e1; font-style: italic; }
                .report-footer { margin-top: 15px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 10px; }
                @media print {
                    body { background: white; -webkit-print-color-adjust: exact; }
                    .report-header { background: #0f172a !important; color: white !important; }
                    th { background: #1e293b !important; color: white !important; }
                    .device-group-start td { border-top: 3px solid #0f172a !important; }
                    thead { display: table-header-group; }
                }
            </style>
        </head>
        <body>
            <div class="page-wrapper">
                <div class="report-header"><div><h1>Asset Maintenance Report</h1><div class="site-name">PROJECT: ${siteData.name}</div></div>
                    <div class="header-meta"><strong>DATE:</strong> ${printDate}<br><strong>TIME:</strong> ${printTime}<br><strong>OPERATOR:</strong> ${currentUser ? currentUser.email : 'ADMIN'}</div>
                </div>
                <table><thead><tr><th style="width: 40px;">No.</th><th style="width: 220px;">Device & Specs</th><th style="width: 50px;">Occ.</th><th style="width: 100px;">Down Date</th><th style="width: 100px;">Fixed Date</th><th>Description</th><th style="width: 120px;">Recorded By</th></tr></thead><tbody>${tableContent}</tbody></table>
                <div class="report-footer">Generated by Microgrid Asset Management System</div>
            </div>
            <script>window.onload = () => { setTimeout(() => { window.print(); window.close(); }, 1200); }</script>
        </body></html>
    `);
    printWindow.document.close();
};

window.sendEmailNotify = async function(type, deviceName, description, user, dateVal, count) {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzLRfWeTwhZN_kU_8RD_eXiy30Mtt1duleN1Vxmw4RV7wB_mmTFhDPXObWCVoaUzF0GgQ/exec"; 
    let title = (type === 'down') ? `🚨 แจ้งเตือนอุปกรณ์ชำรุด (ครั้งที่ ${count})` : `✅ แจ้งเตือนซ่อมแซมเสร็จสิ้น`;
    const message = `หัวข้อ: ${title}\n------------------------------------------\n📍 สถานที่: ${sites[currentSiteKey].name}\n🛠️ อุปกรณ์: ${deviceName}\n📝 รายละเอียด: ${description || '-'}\n📅 วันที่ทำรายการ: ${dateVal}\n👤 ผู้บันทึก: ${user}\n🕒 เวลาที่บันทึกในระบบ: ${new Date().toLocaleString('th-TH')}\n------------------------------------------`;
    try {
        await fetch(GAS_URL, {
            method: 'POST', mode: 'no-cors', cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message }) 
        });
    } catch (err) { console.error("Email notification failed:", err); }
};

window.onload = function() { try { imageMapResize(); } catch (e) {} };












