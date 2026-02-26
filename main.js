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
const storage = firebase.storage(); // ประกาศใช้งาน Storage
const devicesCol = db.collection("devices"); 

// Global Variables
let currentSiteKey = "ko-phaluay";
let currentDevice = null, editIndex = -1, chartInstance = null;
let currentPage = 1;
const pageSize = 7; 
let currentUser = null;
let currentUserRole = 'viewer'; 
let currentUserFullName = ''; 
const ADMIN_EMAIL = 'panattapon.sum@gmail.com'; 

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
"Firewall 1", "Firewall 2", "Firewall 3",
"others"
]
},
"mae-sariang": {
name: "ไมโครกริดแม่สะเรียง อ.แม่สะเรียง จ.แม่ฮ่องสอน",
devices: [
"FireWall 1", "PCS-9893(2nd)", "HMI Display 1", "HMI Display 2", "HMI Main 1", "Cyber Security Manager", "Scada 1", "Scada 2", "Switch 1", "Switch 2", "Switch 3", "Switch 4", "Switch 5", "Switch 6", "Switch 7", "ETH Switch 1", "ETH Switch 2", "PCS-9892", "PCS-9893(1st)", "PCS-9799(1st)", "PCS-9799(2nd)", "MGC 1", "MGC 2", "ATS", "PCS-9794(1st)", "Diesel Local", "PCS-9794(2nd)", "PCS-9726", "PCS-9567C", "PCS 1", "PCS 2", "PCS 3", "PCS 4", "PCS 5", "PCS 6", "ETH Switch 3", "BMS 1", "BMS 2", "BMS 3", "BMS 4", "BMS 5", "BMS 6", "FRTU 1-15",
"others"
]
},
"betong": {
name: "ไมโครกริดเบตง อ.เบตง จ.ยะลา",
devices: [
"Operator HMI 24", "Operator HMI 27", "ETH Switch 1", "ETH Switch 2", "ETH Switch 3", "ETH Switch 4", "ETH Switch 6", "ETH Switch 7",
"others"
]
},
"phrao": {
name: "ระบบกักเก็บพลังงานแบตเตอรี่พร้าว อ.พร้าว จ.เชียงใหม่",
devices: [
"GPS Antenna", "work station", "Insight server", "Network Switch 1", "Clock server", "Network Switch 2", "Back start controller", "Firewall 1", "EMS Controller", "ETH Switch 1", "ETH Switch 2", "Local Controller 200-1", "Local Controller 200-2", "Local Controller 200-3", "ETH Switch 3", "ETH Switch 4", "PCS-1", "PCS-2", "PCS-3", "RCS (Switch 1)", "Recloser", "BSC (BATT-1)", "BSC (BATT-2)",
"others"
]
}
};

function escapeHtml(text) {
return String(text || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m)).replace(/\n/g, '<br>');
}

function getSiteCollection(siteKey) {
return db.collection(`sites`).doc(siteKey).collection(`devices`);
}

async function getDeviceRecords(siteKey, device) {
const docRef = getSiteCollection(siteKey).doc(device); 
const snap = await docRef.get();
const recs = snap.exists ? (snap.data().records || []) : [];
for (const r of recs) {
if (typeof r.counted === 'undefined') r.counted = (r.status === 'down' || r.status === 'abnormal');
}
return recs;
}

async function saveDeviceRecords(siteKey, device, records) {
    const isUnresolved = (r) => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null');
    for (const r of records) if (typeof r.counted === 'undefined') r.counted = (r.status === 'down' || r.status === 'abnormal');
    records.sort((a, b) => a.ts - b.ts);
    
    let currentStatus = 'ok';
    const unresolvedIssues = records.filter(isUnresolved);
    if (unresolvedIssues.some(r => r.status === 'down')) currentStatus = 'down';
    else if (unresolvedIssues.some(r => r.status === 'abnormal')) currentStatus = 'abnormal';
    
   const downCount = records.length;
    await getSiteCollection(siteKey).doc(device).set({ records, downCount, currentStatus }, { merge: true });
}

async function getAllDevicesDocs(siteKey) { return await getSiteCollection(siteKey).get(); }

function calculateDaysDifference(dateString1, dateString2) {
if (!dateString1) return 0;
if (isNaN(new Date(dateString1).getTime())) return 0;
const date1 = new Date(dateString1);
const date2 = dateString2 && !isNaN(new Date(dateString2).getTime()) ? new Date(dateString2) : new Date(); 
const _MS_PER_DAY = 1000 * 60 * 60 * 24;
const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
return Math.ceil(Math.abs((utc2 - utc1) / _MS_PER_DAY));
}

function formatDuration(days) {
if (days <= 0) return '0 วัน';
const YEARS_IN_DAYS = 365.25; const MONTHS_IN_DAYS = 30.44;
let remainingDays = days; let parts = [];
const years = Math.floor(remainingDays / YEARS_IN_DAYS);
if (years > 0) { parts.push(`${years} ปี`); remainingDays -= years * YEARS_IN_DAYS; }
const months = Math.floor(remainingDays / MONTHS_IN_DAYS);
if (months > 0) { parts.push(`${months} เดือน`); remainingDays -= months * MONTHS_IN_DAYS; }
const finalDays = Math.ceil(remainingDays);
if (finalDays > 0 || (days > 0 && parts.length === 0)) parts.push(`${finalDays} วัน`);
return parts.join(' ');
}

function getWarrantyStatus(warrantyEnd) {
if (!warrantyEnd || !isValidDate(warrantyEnd)) return '-';
const today = new Date(); const endDate = new Date(warrantyEnd);
today.setHours(0, 0, 0, 0); endDate.setHours(0, 0, 0, 0);
const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
if (diffDays < 0) return 'bad'; else if (diffDays <= 30) return 'warn'; else return 'ok'; 
}

function getWarrantyStatusHTML(status) {
switch (status) { case 'ok': return '<span class="tag tag-warranty-ok">🛡️ รับประกัน</span>'; case 'warn': return '<span class="tag tag-warranty-warn">⚠️ ใกล้หมดประกัน</span>'; case 'bad': return '<span class="tag tag-warranty-bad">🚫 หมดประกัน</span>'; default: return '<span>-</span>'; }
}

function toggleWriteAccess(isLoggedIn) {
    const role = isLoggedIn ? currentUserRole : 'viewer';
    const isAdmin = role === 'admin'; const isEditor = role === 'editor' || isAdmin; 

    ['saveDataButton', 'clearDeviceButton', 'clearAllButton'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { btn.disabled = !isEditor; btn.title = isEditor ? '' : 'สิทธิ์ไม่เพียงพอ'; if (!isLoggedIn) btn.title = 'กรุณาลงชื่อเข้าใช้ก่อน'; }
    });

    const assetBtn = document.getElementById('saveAssetButton'); if (assetBtn) assetBtn.style.display = isAdmin ? 'inline-block' : 'none';
    const importLabel = document.getElementById('importButtonLabel'); if (importLabel) importLabel.style.display = isEditor ? 'inline-block' : 'none';
    const manageUsersBtn = document.getElementById('manageUsersBtn'); if (manageUsersBtn) manageUsersBtn.classList.toggle('hidden', !isAdmin);
    
    const roleDisplay = document.getElementById('userRoleDisplay');
    if (roleDisplay) {
        if (!isLoggedIn) roleDisplay.style.display = 'none';
        else {
            roleDisplay.style.display = 'inline-block'; roleDisplay.textContent = role.toUpperCase();
            if (isAdmin) roleDisplay.className = 'tag tag-bad text-xs'; 
            else if (isEditor) roleDisplay.className = 'tag tag-warn text-xs'; 
            else roleDisplay.className = 'tag tag-ok text-xs'; 
        }
    }

    const userNameInput = document.getElementById('userName');
    if (isLoggedIn && currentUser) { userNameInput.value = currentUserFullName || currentUser.email; userNameInput.readOnly = true; } 
    else { userNameInput.value = 'ผู้เยี่ยมชม (อ่านอย่างเดียว)'; userNameInput.readOnly = true; }
    
    if (document.getElementById('formModal').style.display === 'flex') loadHistory(); 
}

function login() { auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => Swal.fire('Login ผิดพลาด', e.message, 'error')); }

window.logout = async function() {
    if (currentUser) await createLog("AUTH_LOGOUT", "ผู้ใช้กดออกจากระบบ");
    auth.signOut().then(() => location.reload());
};

window.createLog = async function(action, details, siteKey = null) {
    if (!currentUser) return;
    try {
        await db.collection("activity_logs").add({
            timestamp: firebase.firestore.FieldValue.serverTimestamp(), userEmail: currentUserFullName || currentUser.email,
            action: action, details: details, siteKey: action.startsWith("AUTH") ? "SYSTEM" : (siteKey || currentSiteKey || "") 
        });
    } catch (e) {}
};

window.showActivityLogs = async function() {
    const modal = document.getElementById('logModal'); const tableBody = document.getElementById('logTableBody');
    const siteFilter = document.getElementById('logSiteFilter').value; const actionFilter = document.getElementById('logActionFilter').value;
    
    if (!modal || !tableBody) return;
    modal.classList.remove('hidden'); tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-4">กำลังโหลด...</td></tr>';

    try {
        let query = db.collection("activity_logs");
        if (siteFilter !== "all") query = query.where("siteKey", "==", siteFilter);
        if (actionFilter !== "all") {
            if (actionFilter === "AUTH") query = query.where("action", ">=", "AUTH_").where("action", "<=", "AUTH_\uf8ff").orderBy("action");
            else query = query.where("action", "==", actionFilter);
        }
        const snapshot = await query.orderBy("timestamp", "desc").limit(100).get();

        if (snapshot.empty) { tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 italic">ไม่พบข้อมูล</td></tr>'; return; }

        let html = '';
        snapshot.forEach(doc => {
            const d = doc.data(); const time = d.timestamp ? d.timestamp.toDate().toLocaleString('th-TH') : '-';
            let siteDisplay = d.siteKey === "SYSTEM" ? `<span class="text-slate-400 font-medium italic">SYSTEM</span>` : `<span class="font-mono text-blue-600 font-bold">${(d.siteKey||'').toUpperCase()}</span>`;
            let badgeClass = 'bg-slate-100 text-slate-600';
            if (d.action.includes("AUTH")) badgeClass = 'bg-green-100 text-green-700'; else if (d.action.includes("UPDATE")) badgeClass = 'bg-blue-100 text-blue-700'; else if (d.action.includes("DELETE")) badgeClass = 'bg-red-100 text-red-700'; else if (d.action.includes("ADD") || d.action.includes("EDIT")) badgeClass = 'bg-yellow-100 text-yellow-700';
            html += `<tr class="hover:bg-slate-50 border-b border-slate-100 text-center"><td class="p-2 border text-[10px] font-mono">${time}</td><td class="p-2 border text-[11px]">${d.userEmail || 'System'}</td><td class="p-2 border text-[11px]">${siteDisplay}</td><td class="p-2 border"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeClass}">${d.action}</span></td><td class="p-2 border text-left text-[11px] text-slate-600">${d.details}</td></tr>`;
        });
        tableBody.innerHTML = html;
    } catch (error) { tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4">เกิดข้อผิดพลาด: ${error.message}</td></tr>`; }
};
window.closeLogModal = function() { const modal = document.getElementById('logModal'); if (modal) modal.classList.add('hidden'); };

// =========================================================================
// UI and Form Functions
// =========================================================================

window.openForm = async function(deviceName) {
    currentDevice = deviceName; editIndex = -1;
    document.getElementById('formTitle').textContent = `บันทึกข้อมูล: ${deviceName}`;
    document.getElementById('overlay').style.display = 'block'; document.getElementById('formModal').style.display = 'flex';
    document.getElementById('editHint').classList.add('hidden'); document.getElementById('warrantyStatusDisplay').innerHTML = 'กำลังโหลด...'; document.getElementById('assetInfoDisplay').innerHTML = '';
    clearForm(); await loadHistory(); 
}

window.closeForm = function() { document.getElementById('overlay').style.display = 'none'; document.getElementById('formModal').style.display = 'none'; document.getElementById('assetModal').style.display = 'none'; }

function clearForm() {
    if (!currentUser) document.getElementById('userName').value = 'ผู้เยี่ยมชม (อ่านอย่างเดียว)';
    else document.getElementById('userName').value = currentUserFullName || currentUser.email;

    const statusSelect = document.getElementById('status'); const fixedDateInput = document.getElementById('fixedDate'); 
    document.getElementById('opt-ok').style.display = 'none';
    statusSelect.value = 'down'; statusSelect.disabled = false; 

    fixedDateInput.value = ''; fixedDateInput.disabled = true; 
    fixedDateInput.placeholder = "บันทึกข้อมูลชำรุดก่อน จึงจะระบุวันซ่อมได้"; fixedDateInput.classList.add('bg-gray-200', 'text-gray-500', 'cursor-not-allowed');

    document.getElementById('brokenDate').value = ''; document.getElementById('description').value = ''; document.getElementById('solution').value = ''; 
    document.getElementById('orderNumber').value = ''; document.getElementById('repairCost').value = '';
    
    // Clear files
    document.getElementById('brokenFile').value = ''; document.getElementById('brokenFileLink').innerHTML = '';
    document.getElementById('fixedFile').value = ''; document.getElementById('fixedFileLink').innerHTML = '';
    
    editIndex = -1; document.getElementById('editHint').classList.add('hidden');
}

function isValidDate(str) {
if (!str) return false; const d = new Date(str); return d instanceof Date && !isNaN(d);
}

// อัปโหลดไฟล์ไป Storage
async function uploadFileToStorage(file, folderName) {
    if (!file) return null;
    const ref = storage.ref().child(`attachments/${currentSiteKey}/${currentDevice}/${folderName}/${Date.now()}_${file.name}`);
    await ref.put(file);
    return await ref.getDownloadURL();
}

window.saveData = async function() {
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') { Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Editor และ Admin เท่านั้นที่บันทึกข้อมูลได้', 'error'); return false; }
    if (!currentUser || !currentDevice) return false;

    let statusVal = document.getElementById('status').value;
    const brokenDate = document.getElementById('brokenDate').value;
    const fixedDate = document.getElementById('fixedDate').value;
    const isEditing = editIndex >= 0;

    let statusTextTH = statusVal === 'down' ? 'ชำรุด' : (statusVal === 'abnormal' ? 'ผิดปกติ' : 'ใช้งานได้');

    const confirmResult = await Swal.fire({ title: isEditing ? 'ยืนยันการแก้ไข?' : 'ยืนยันการเพิ่มข้อมูล?', text: `บันทึกสถานะ ${currentDevice} เป็น "${statusTextTH}" ใช่หรือไม่?`, icon: 'question', showCancelButton: true, confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b', confirmButtonText: 'ยืนยันบันทึก', cancelButtonText: 'ยกเลิก' });
    if (!confirmResult.isConfirmed) return false;

    if (isValidDate(brokenDate) && isValidDate(fixedDate)) statusVal = 'ok';
    if (editIndex < 0 && statusVal === 'ok') { Swal.fire({ title: "ไม่อนุญาต", text: "การเพิ่มรายการใหม่ต้องเป็นสถานะ ชำรุด หรือ ผิดปกติ", icon: "warning" }); return false; }
    
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999); 
    if (brokenDate && isValidDate(brokenDate) && new Date(brokenDate) > todayEnd) { Swal.fire("วันที่ผิดพลาด", "วันที่เกิดเหตุเป็นอนาคตไม่ได้", "warning"); return false; }
    // เงื่อนไข: วันที่ซ่อมแซม ต้องไม่เกินวันนี้
    if (fixedDate && isValidDate(fixedDate) && new Date(fixedDate) > todayEnd) { Swal.fire("วันที่ผิดพลาด", "วันที่ซ่อมแซมเป็นล่วงหน้า (อนาคต) ไม่ได้", "warning"); return false; }
    
    if ((statusVal === 'down' || statusVal === 'abnormal') && !isValidDate(brokenDate)) { Swal.fire("ข้อมูลไม่ครบ", "กรุณาเลือกวันที่", "warning"); return false; }
    if (statusVal === 'ok') {
        if (!isValidDate(brokenDate) || !isValidDate(fixedDate)) { Swal.fire("ข้อมูลไม่ครบ", "กรุณากรอกวันที่ให้ครบ", "warning"); return false; }
        if (new Date(brokenDate) > new Date(fixedDate)) { Swal.fire("วันที่ผิดพลาด", "วันที่ซ่อมแซมต้องหลังวันที่เกิดเหตุ", "warning"); return false; }
    }

    // ตรวจสอบไฟล์แนบ (ไม่เกิน 5MB)
    const brokenFile = document.getElementById('brokenFile').files[0];
    const fixedFile = document.getElementById('fixedFile').files[0];
    const MAX_SIZE = 5 * 1024 * 1024;
    if (brokenFile && brokenFile.size > MAX_SIZE) { Swal.fire('ไฟล์ใหญ่เกินไป', 'หลักฐานแจ้งเสีย ต้องขนาดไม่เกิน 5 MB', 'warning'); return false; }
    if (fixedFile && fixedFile.size > MAX_SIZE) { Swal.fire('ไฟล์ใหญ่เกินไป', 'หลักฐานซ่อมแซม ต้องขนาดไม่เกิน 5 MB', 'warning'); return false; }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    let records = await getDeviceRecords(currentSiteKey, currentDevice); 
    
    let baseRec = {
        user: document.getElementById('userName').value || "ไม่ระบุ",
        status: statusVal, brokenDate, fixedDate,
        description: document.getElementById('description').value,
        solution: document.getElementById('solution').value, 
        orderNumber: document.getElementById('orderNumber').value,
        repairCost: document.getElementById('repairCost').value,
       ts: Date.now(), counted: true 
    };

    if (editIndex >= 0) {
        const originalRecord = records[editIndex];
        baseRec.brokenFileUrl = originalRecord.brokenFileUrl || null;
        baseRec.brokenFileType = originalRecord.brokenFileType || null;
        baseRec.fixedFileUrl = originalRecord.fixedFileUrl || null;
        baseRec.fixedFileType = originalRecord.fixedFileType || null;
        baseRec.ts = originalRecord.ts;
    }

    // อัปโหลดไฟล์ใหม่ถ้ามีการเลือก
    try {
        if (brokenFile) {
            baseRec.brokenFileUrl = await uploadFileToStorage(brokenFile, 'broken');
            baseRec.brokenFileType = brokenFile.type;
        }
        if (fixedFile) {
            baseRec.fixedFileUrl = await uploadFileToStorage(fixedFile, 'fixed');
            baseRec.fixedFileType = fixedFile.type;
        }
    } catch (err) {
        Swal.fire("อัปโหลดไฟล์ล้มเหลว", err.message, "error"); return false;
    }

    if (editIndex >= 0) {
        records[editIndex] = { ...records[editIndex], ...baseRec };
        if (statusVal === 'ok' && (records[editIndex].status === 'down' || records[editIndex].status === 'abnormal')) records[editIndex].counted = true;
        editIndex = -1; document.getElementById('editHint').classList.add('hidden');
    } else {
        if (statusVal === 'ok' && brokenDate && fixedDate) baseRec.counted = true;
        records.push(baseRec);
    }

    await saveDeviceRecords(currentSiteKey, currentDevice, records);
    
    clearForm(); await loadHistory(); window.updateDeviceSummary(); window.updateDeviceStatusOverlays(currentSiteKey); 
   
    if ((statusVal === 'down' || statusVal === 'abnormal') && !isEditing) sendEmailNotify('down', currentDevice, baseRec.description, baseRec.solution, baseRec.user, baseRec.brokenDate, records.filter(r => r.counted).length);
    if (statusVal === 'ok' && !isEditing) sendEmailNotify('fixed', currentDevice, baseRec.description, baseRec.solution, baseRec.user, baseRec.fixedDate, null);

    Swal.fire("บันทึกเรียบร้อย", "", "success");
    await createLog(isEditing ? "EDIT_RECORD" : "ADD_RECORD", isEditing ? `แก้ไขข้อมูลประวัติ ${currentDevice}` : `เพิ่มประวัติให้ ${currentDevice}`);
    await createLog("UPDATE_STATUS", `อุปกรณ์ ${currentDevice} มีสถานะเป็น: ${statusTextTH}`);
    return true;
};

window.clearCurrentDevice = async function() {
if (currentUserRole !== 'editor' && currentUserRole !== 'admin') { Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ลบข้อมูล', 'error'); return; }
if (!currentDevice) return;
const result = await Swal.fire({ title: `ลบข้อมูล ${currentDevice}?`, text: "คุณต้องการลบข้อมูลทั้งหมดของอุปกรณ์นี้ใช่หรือไม่?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก' });
if (result.isConfirmed) {
await getSiteCollection(currentSiteKey).doc(currentDevice).set({ records: [], downCount: 0, currentStatus: 'ok' }, { merge: true });
await loadHistory(); window.updateDeviceSummary(); window.updateDeviceStatusOverlays(currentSiteKey); 
Swal.fire("ลบเรียบร้อย", "", "success");
}
}

function updateAssetDisplays(assetInfo) {
const statusEl = document.getElementById('warrantyStatusDisplay'); const infoEl = document.getElementById('assetInfoDisplay');
if (assetInfo && assetInfo.warrantyEnd) {
statusEl.innerHTML = getWarrantyStatusHTML(getWarrantyStatus(assetInfo.warrantyEnd));
let infoParts = [];
if (assetInfo.model) infoParts.push(`รุ่น: ${escapeHtml(assetInfo.model)}`); if (assetInfo.serial) infoParts.push(`S/N: ${escapeHtml(assetInfo.serial)}`); if (assetInfo.peaNo) infoParts.push(`PEA: ${escapeHtml(assetInfo.peaNo)}`);
infoEl.innerHTML = infoParts.join(' | ') || 'ลงทะเบียนแล้ว';
} else { statusEl.innerHTML = '<span class="tag tag-warranty-bad">🚫 ยังไม่ลงทะเบียน</span>'; infoEl.innerHTML = 'กรุณาคลิก "ดู/แก้ไขข้อมูลทรัพย์สิน"'; }
}

window.loadHistory = async function() {
    const container = document.getElementById('historySection'); container.innerHTML = '';
    if (!currentDevice) return;
    const docRef = getSiteCollection(currentSiteKey).doc(currentDevice);
    let docData = null, records = [], assetInfo = null;
    try {   
        const snap = await docRef.get({ source: 'server' }); 
        if (snap.exists) { docData = snap.data(); records = docData.records || []; assetInfo = docData.assetInfo || null; }
    } catch (e) { container.innerHTML = '<p>Error loading data</p>'; return; }

    updateAssetDisplays(assetInfo);
    if (document.getElementById('filterBrokenHistory')?.checked) records = records.filter(r => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null'));
    records.sort((a, b) => b.ts - a.ts); 
    if (records.length === 0) { container.innerHTML = '<p class="text-center py-4 text-gray-400">ไม่พบประวัติการบันทึกสำหรับอุปกรณ์นี้</p>'; return; }

    const canEdit = (currentUserRole === 'editor' || currentUserRole === 'admin') ? '' : 'disabled title="ไม่มีสิทธิ์แก้ไข"';
    let isCurrentBrokenFound = false; 

    records.forEach((r, index) => {
        const recordSequence = records.length - index; 
        let duration = '-';
        if (r.brokenDate) {
            if (r.fixedDate) duration = formatDuration(calculateDaysDifference(r.brokenDate, r.fixedDate));
            else if (!r.fixedDate && !isCurrentBrokenFound) { duration = formatDuration(calculateDaysDifference(r.brokenDate, null)) + ' <span class="text-sm text-red-500 font-semibold">(ยังไม่ซ่อม)</span>'; isCurrentBrokenFound = true; } 
            else duration = formatDuration(calculateDaysDifference(r.brokenDate, null));
        }

        let statusClass = 'tag-ok', statusText = '✅ ใช้งานได้';
        if(r.status === 'down') { statusClass = 'tag-bad'; statusText = '❎ ชำรุด'; }
        else if(r.status === 'abnormal') { statusClass = 'tag-warn'; statusText = '⚠️ ผิดปกติ'; }

        // ส่วนแสดงลิงก์ไฟล์แนบ
        let brokenLinkHtml = r.brokenFileUrl ? `<a href="${r.brokenFileUrl}" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-1">📄 หลักฐานแจ้งปัญหา</a>` : '';
        let fixedLinkHtml = r.fixedFileUrl ? `<a href="${r.fixedFileUrl}" target="_blank" class="text-green-600 hover:underline inline-flex items-center gap-1">📄 หลักฐานซ่อมแซม</a>` : '';
        let filesHtml = (brokenLinkHtml || fixedLinkHtml) ? `<div class="mt-2 pt-2 border-t border-gray-100 flex gap-4 text-xs font-semibold">${brokenLinkHtml} ${fixedLinkHtml}</div>` : '';

        const div = document.createElement('div');
        div.className = 'p-4 mb-3 border border-gray-200 bg-white rounded-lg shadow-sm'; 

        div.innerHTML = `
            <div class="flex justify-between items-start border-b border-gray-100 pb-2 mb-2">
                <div class="text-lg font-bold text-slate-800"><span class="tag ${statusClass}">${statusText}</span><span class="ml-2 text-base text-gray-500">| ครั้งที่ ${recordSequence}</span></div>
                <div class="text-sm text-gray-500">โดย: <span class="font-semibold text-slate-700">${escapeHtml(r.user || 'ไม่ระบุ')}</span></div>
            </div>
            <div class="grid grid-cols-2 gap-y-2 text-sm text-gray-600">
                <div>วันที่เกิดเหตุ: ${r.brokenDate || '-'}</div><div>วันที่ซ่อม: ${r.fixedDate || '-'}</div>
                <div>เลขที่ใบสั่ง: <span class="font-semibold text-blue-700">${escapeHtml(r.orderNumber || '-')}</span></div>
                <div>ราคาซ่อมแซม: <span class="font-semibold text-orange-600">${r.repairCost ? Number(r.repairCost).toLocaleString() + ' บาท' : '-'}</span></div>
                <div class="col-span-2 text-red-600">ระยะเวลา: ${duration}</div>
            </div>
            <div class="mt-3 text-sm text-blue-700 "><b>รายละเอียด:</b> "${escapeHtml(r.description || '-')}"</div>
            <div class="mt-1 text-sm text-blue-700"><b>วิธีแก้ไข:</b> ${escapeHtml(r.solution || '-')}</div>
            ${filesHtml}
            <div class="mt-3 flex justify-end space-x-2">
                <button class="btn btn-ghost text-yellow-600 hover:bg-yellow-50 py-1" onclick="editRecord('${r.ts}')" ${canEdit}>✏️ แก้ไข</button>
                <button class="btn btn-ghost text-red-600 hover:bg-red-50 py-1" onclick="deleteRecord('${r.ts}')" ${canEdit}>🗑️ ลบ</button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.deleteRecord = async function(ts) {
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') return;
    if (!currentDevice) return;
    const result = await Swal.fire({ title: 'ลบรายการนี้?', text: "คุณต้องการลบรายการประวัตินี้จริงหรือไม่?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ใช่, ลบ!', cancelButtonText: 'ยกเลิก' });
    if (!result.isConfirmed) return;

    let records = await getDeviceRecords(currentSiteKey, currentDevice);
    const idx = records.findIndex(r => String(r.ts) === String(ts));
    if (idx < 0) return;
    const dateRef = records[idx].brokenDate || records[idx].fixedDate || "ไม่ระบุวันที่";
    records.splice(idx, 1);
    await saveDeviceRecords(currentSiteKey, currentDevice, records);
    await createLog("DELETE_RECORD", `ลบประวัติของ ${currentDevice} (รายการวันที่ ${dateRef})`);

    loadHistory(); window.updateDeviceSummary(); window.updateDeviceStatusOverlays(currentSiteKey); 
    Swal.fire('ลบข้อมูลเรียบร้อย', '', 'success');
}

window.editRecord = async function(ts) {
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') return;
    if (!currentDevice) return;
    let records = await getDeviceRecords(currentSiteKey, currentDevice);
    const idx = records.findIndex(r => String(r.ts) === String(ts));
    if (idx < 0) return;
    const r = records[idx];
    
    document.getElementById('opt-ok').style.display = 'block';
    document.getElementById('status').value = r.status || 'down'; document.getElementById('status').disabled = false; 
    
    const fixedInput = document.getElementById('fixedDate');
    fixedInput.disabled = false; fixedInput.classList.remove('bg-gray-200', 'cursor-not-allowed'); fixedInput.placeholder = "";
    
    document.getElementById('brokenDate').value = r.brokenDate || ''; fixedInput.value = r.fixedDate || '';
    document.getElementById('description').value = r.description || ''; document.getElementById('solution').value = r.solution || ''; 
    document.getElementById('orderNumber').value = r.orderNumber || ''; document.getElementById('repairCost').value = r.repairCost || ''; 

    // แสดงลิงก์ไฟล์เดิมเผื่อต้องการเขียนทับ
    document.getElementById('brokenFileLink').innerHTML = r.brokenFileUrl ? `<a href="${r.brokenFileUrl}" target="_blank" class="hover:underline">มีไฟล์แนบเดิม (คลิกดู) - อัปโหลดใหม่เพื่อเขียนทับ</a>` : '';
    document.getElementById('fixedFileLink').innerHTML = r.fixedFileUrl ? `<a href="${r.fixedFileUrl}" target="_blank" class="hover:underline">มีไฟล์แนบเดิม (คลิกดู) - อัปโหลดใหม่เพื่อเขียนทับ</a>` : '';

    editIndex = idx; document.getElementById('editHint').classList.remove('hidden');
};

window.openAssetModal = async function() {
if (!currentDevice) return; document.getElementById('assetFormTitle').textContent = `📋 ข้อมูลทรัพย์สิน: ${currentDevice}`;
document.getElementById('formModal').style.display = 'none'; document.getElementById('assetModal').style.display = 'flex'; await loadAssetData();
}

window.closeAssetModal = function(showMainModal = true) {
document.getElementById('assetModal').style.display = 'none'; if (showMainModal && currentDevice) document.getElementById('formModal').style.display = 'flex'; 
}

async function loadAssetData() {
    const docRef = getSiteCollection(currentSiteKey).doc(currentDevice); const snap = await docRef.get(); let assetInfo = {}; if (snap.exists && snap.data().assetInfo) assetInfo = snap.data().assetInfo;
    const inputIds = ['assetSerial', 'assetModel', 'assetPeaNo', 'assetPrice', 'assetManufacturer', 'assetWarrantyStart', 'assetWarrantyEnd'];
    const isAdmin = (currentUserRole === 'admin');

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = !isAdmin; if (!isAdmin) el.classList.add('bg-gray-700', 'text-gray-400', 'cursor-not-allowed'); else el.classList.remove('bg-gray-700', 'text-gray-400', 'cursor-not-allowed'); }
    });

    const saveBtn = document.getElementById('saveAssetButton'); if (saveBtn) saveBtn.style.display = isAdmin ? 'inline-block' : 'none';
    document.getElementById('assetSerial').value = assetInfo.serial || ''; document.getElementById('assetModel').value = assetInfo.model || ''; document.getElementById('assetPeaNo').value = assetInfo.peaNo || ''; document.getElementById('assetPrice').value = assetInfo.price || ''; document.getElementById('assetManufacturer').value = assetInfo.manufacturer || ''; document.getElementById('assetWarrantyStart').value = assetInfo.warrantyStart || ''; document.getElementById('assetWarrantyEnd').value = assetInfo.warrantyEnd || '';
    if (assetInfo.warrantyStart && assetInfo.warrantyEnd) document.getElementById('assetWarrantyYears').value = Math.round(((new Date(assetInfo.warrantyEnd)) - (new Date(assetInfo.warrantyStart))) / (1000 * 60 * 60 * 24 * 365.25) * 10) / 10; else document.getElementById('assetWarrantyYears').value = '';
    updateAssetWarrantyStatusField();
}

window.saveAssetData = async function() {
    if (currentUserRole !== 'admin') { Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าถึง', text: `เฉพาะ Admin เท่านั้น` }); return; }
    if (!currentDevice) return;
    const assetInfo = { serial: document.getElementById('assetSerial').value, model: document.getElementById('assetModel').value, peaNo: document.getElementById('assetPeaNo').value, price: document.getElementById('assetPrice').value, manufacturer: document.getElementById('assetManufacturer').value, warrantyStart: document.getElementById('assetWarrantyStart').value, warrantyEnd: document.getElementById('assetWarrantyEnd').value };
    try { await getSiteCollection(currentSiteKey).doc(currentDevice).set({ assetInfo }, { merge: true }); Swal.fire('บันทึกสำเร็จ', 'ข้อมูลทรัพย์สินถูกบันทึกแล้ว', 'success'); updateAssetDisplays(assetInfo); window.updateDeviceSummary(); closeAssetModal(true); } catch (e) { Swal.fire('ผิดพลาด', e.message, 'error'); }
    await createLog("EDIT_ASSET", "แก้ไขรายละเอียดทรัพย์สินของ " + currentDevice);
}

function updateAssetWarrantyStatusField() {
const status = getWarrantyStatus(document.getElementById('assetWarrantyEnd').value); const field = document.getElementById('assetWarrantyStatus');
switch (status) { case 'ok': field.value = 'รับประกัน'; break; case 'warn': field.value = 'ใกล้หมดประกัน'; break; case 'bad': field.value = 'หมดประกัน'; break; default: field.value = 'N/A'; }
}

function setupWarrantyCalculators() {
const startEl = document.getElementById('assetWarrantyStart'); const yearsEl = document.getElementById('assetWarrantyYears'); const endEl = document.getElementById('assetWarrantyEnd');
function calculateEnd() { if (startEl.value && yearsEl.value) { const startDate = new Date(startEl.value); const years = parseFloat(yearsEl.value); if (!isNaN(startDate) && years > 0) { startDate.setFullYear(startDate.getFullYear() + Math.floor(years)); const fractionalDays = (years % 1) * 365.25; startDate.setDate(startDate.getDate() + Math.round(fractionalDays)); endEl.value = startDate.toISOString().split('T')[0]; updateAssetWarrantyStatusField(); } } }
function calculateYears() { if (startEl.value && endEl.value) { const startDate = new Date(startEl.value); const endDate = new Date(endEl.value); if (!isNaN(startDate) && !isNaN(endDate) && endDate > startDate) { yearsEl.value = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24 * 365.25) * 100) / 100; updateAssetWarrantyStatusField(); } } }
startEl.addEventListener('change', calculateEnd); yearsEl.addEventListener('change', calculateEnd); endEl.addEventListener('change', calculateYears); endEl.addEventListener('change', updateAssetWarrantyStatusField);
}

window.openUserManagement = async function() { if (currentUserRole !== 'admin') return; document.getElementById('overlay').style.display = 'block'; document.getElementById('userModal').style.display = 'flex'; await loadUsers(); }
window.closeUserManagement = function() { document.getElementById('overlay').style.display = 'none'; document.getElementById('userModal').style.display = 'none'; }
window.loadUsers = async function() {
    const listContainer = document.getElementById('userListContainer'); listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">กำลังโหลด...</div>';
    try {
        const snapshot = await db.collection('users').get(); if (snapshot.empty) { listContainer.innerHTML = '<div class="text-center py-4 text-gray-500">ยังไม่มีผู้ใช้งาน</div>'; return; }
        listContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const userData = doc.data(); const email = userData.email; const role = userData.role || 'viewer'; const fullName = userData.fullName || ''; const isMe = (email === currentUser.email); const isAdminMain = (email === ADMIN_EMAIL); const safeId = email.replace(/[@.]/g, ''); 
            const div = document.createElement('div'); div.className = 'user-item flex flex-col sm:flex-row justify-between sm:items-center gap-2 p-3 border-b border-gray-200 hover:bg-gray-50 transition-colors';
            const roleOptions = `<option value="viewer" ${role==='viewer'?'selected':''}>Viewer</option><option value="editor" ${role==='editor'?'selected':''}>Editor</option><option value="admin" ${role==='admin'?'selected':''}>Admin</option>`;
            let deleteBtn = ''; if (!isAdminMain && !isMe) deleteBtn = `<button onclick="deleteUser('${email}')" class="p-2 text-gray-400 hover:text-red-600 transition-colors" title="ลบผู้ใช้"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>`;
            div.innerHTML = `<div class="flex flex-col flex-1 gap-1 pr-2"><span class="font-medium text-sm ${isMe ? 'text-blue-600' : 'text-slate-800'}">${escapeHtml(email)} ${isMe ? '(คุณ)' : ''}</span><input type="text" id="name-${safeId}" value="${escapeHtml(fullName)}" placeholder="ระบุชื่อ-นามสกุลจริง..." class="text-xs border border-gray-300 rounded p-1.5 w-full outline-none focus:border-blue-500"></div><div class="flex items-center gap-2 mt-2 sm:mt-0"><select id="role-${safeId}" class="bg-white border border-gray-300 text-gray-900 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-1.5 outline-none cursor-pointer">${roleOptions}</select><button onclick="updateUserFull('${email}', '${safeId}')" class="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors text-xs font-bold shadow-sm" title="บันทึกการแก้ไขสิทธิ์และชื่อ">💾 บันทึก</button>${deleteBtn}</div>`;
            listContainer.appendChild(div);
        });
    } catch (error) { listContainer.innerHTML = `<div class="text-red-500 text-center py-4">โหลดไม่สำเร็จ: ${error.message}</div>`; }
}
window.updateUserFull = async function(email, safeId) {
    if (currentUserRole !== 'admin') return; const newRole = document.getElementById(`role-${safeId}`).value; const newName = document.getElementById(`name-${safeId}`).value.trim();
    if (email === ADMIN_EMAIL && newRole !== 'admin') { Swal.fire('ไม่อนุญาต', 'ไม่สามารถลดสิทธิ์ Admin หลักได้', 'error'); return; }
    try { await db.collection('users').doc(email).set({ role: newRole, fullName: newName }, { merge: true }); Swal.fire({ icon: 'success', title: `อัปเดตข้อมูล ${email} แล้ว`, timer: 1500, showConfirmButton: false }); await createLog("USER_MANAGEMENT", `แก้ไขข้อมูลของ ${email} (Role: ${newRole}, ชื่อ: ${newName||'-'})`, "SYSTEM"); if(email === currentUser.email) { currentUserFullName = newName; document.getElementById('userNameDisplay').textContent = newName ? `${newName} (${email})` : email; } loadUsers(); } catch (error) { Swal.fire('ผิดพลาด', error.message, 'error'); }
};
window.deleteUser = async function(email) {
    if (currentUserRole !== 'admin') { Swal.fire('ปฏิเสธ', 'คุณไม่มีสิทธิ์ลบผู้ใช้งาน', 'error'); return; }
    const result = await Swal.fire({ title: 'ยืนยันการลบ?', text: `คุณต้องการลบผู้ใช้ ${email} ออกจากระบบใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ลบข้อมูล', cancelButtonText: 'ยกเลิก' });
    if (result.isConfirmed) { try { await db.collection('users').doc(email).delete(); await createLog("USER_MANAGEMENT", `ลบผู้ใช้ ${email} ออกจากระบบ`, "SYSTEM"); Swal.fire({ icon: 'success', title: 'ลบผู้ใช้สำเร็จ', showConfirmButton: false, timer: 1500 }); loadUsers(); } catch (error) { Swal.fire('ผิดพลาด', 'ไม่สามารถลบผู้ใช้ได้: ' + error.message, 'error'); } }
};

window.updateDeviceSummary = async function() {
    const siteData = sites[currentSiteKey]; if (!siteData) return;
    const search = document.getElementById('searchInput').value.toLowerCase(); const sortOrder = document.getElementById('sortOrder').value; const filterStatus = document.getElementById('filterStatus').value; const from = document.getElementById('fromDate').value; const to = document.getElementById('toDate').value;
    const docsSnap = await getSiteCollection(currentSiteKey).get({ source: 'server' }); const dataMap = {}; docsSnap.forEach(d => dataMap[d.id] = d.data());
    let summary = []; let totalDevices = siteData.devices.length; let currentBrokenCount = 0; let currentNormalCount = 0;

    for (const dev of siteData.devices) {
        const docData = dataMap[dev]; const records = docData?.records || []; if (records.length > 0) records.sort((a, b) => a.ts - b.ts); 
        let downCount = docData?.downCount || 0; 
        const isUnresolved = (r) => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null');
        const remainingIssues = records.filter(isUnresolved); const remainingCount = remainingIssues.length;
        let latestBrokenDuration = '-', latestBrokenDays = 0, earliestBrokenDate = '-', latestFixedDate = '-'; let currentStatusDisplay = 'ปกติ'; let isDown = false, isAbnormal = false;
        remainingIssues.forEach(r => { if(r.status === 'down') isDown = true; if(r.status === 'abnormal') isAbnormal = true; });
        if (isDown && isAbnormal) currentStatusDisplay = 'ชำรุด / ผิดปกติ'; else if (isDown) currentStatusDisplay = 'ชำรุด'; else if (isAbnormal) currentStatusDisplay = 'ผิดปกติ'; else currentStatusDisplay = 'ปกติ';
        const latestRecord = records.length > 0 ? records[records.length - 1] : null;

        if (remainingCount > 0) {
            currentBrokenCount++; const oldestIssue = remainingIssues[0]; earliestBrokenDate = oldestIssue.brokenDate || '-'; latestFixedDate = '-'; latestBrokenDays = calculateDaysDifference(earliestBrokenDate, null); latestBrokenDuration = formatDuration(latestBrokenDays);
        } else {
            currentNormalCount++; 
            if (latestRecord && latestRecord.brokenDate) { earliestBrokenDate = latestRecord.brokenDate; latestFixedDate = latestRecord.fixedDate || '-'; if (latestRecord.fixedDate && latestRecord.fixedDate !== '-') { latestBrokenDays = calculateDaysDifference(latestRecord.brokenDate, latestRecord.fixedDate); latestBrokenDuration = formatDuration(latestBrokenDays); } }
        }
        
        let dateFilterSource = earliestBrokenDate !== '-' ? earliestBrokenDate : (latestRecord?.brokenDate);
        if (dateFilterSource && dateFilterSource !== '-') { const latestTs = new Date(dateFilterSource).getTime(); if (from && latestTs < new Date(from).getTime()) continue; if (to && latestTs >= new Date(to).getTime() + 86400000) continue; }        
        if (filterStatus === 'currently-down' && !isDown) continue; if (filterStatus === 'currently-abnormal' && !isAbnormal) continue; 
        if (filterStatus === 'down' && (records.length === 0 || remainingCount > 0)) continue;
        if (filterStatus === 'clean' && records.length > 0) continue; 
        if (search && !dev.toLowerCase().includes(search)) continue;

        summary.push({ device: dev, count: downCount, remaining: remainingCount, brokenDate: earliestBrokenDate, fixedDate: latestFixedDate, status: currentStatusDisplay, latestDescription: latestRecord?.description || '-', latestSolution: latestRecord?.solution || '-', latestBrokenDuration: latestBrokenDuration, latestBrokenDays: latestBrokenDays });
    }

    if (document.getElementById('cardTotal')) document.getElementById('cardTotal').innerText = totalDevices; if (document.getElementById('cardNormal')) document.getElementById('cardNormal').innerText = currentNormalCount; if (document.getElementById('cardBroken')) document.getElementById('cardBroken').innerText = currentBrokenCount;
    summary.sort((a, b) => { const countSort = sortOrder === 'desc' ? b.count - a.count : a.count - b.count; if (countSort !== 0) return countSort; return b.latestBrokenDays - a.latestBrokenDays; });
    const totalPages = Math.max(1, Math.ceil(summary.length / pageSize)); if (currentPage > totalPages) currentPage = totalPages; const startIndex = (currentPage - 1) * pageSize; const pageData = summary.slice(startIndex, startIndex + pageSize);
    const tbody = document.getElementById('summaryBody'); tbody.innerHTML = '';

    if (summary.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400 italic"> ไม่พบข้อมูลอุปกรณ์ตามเงื่อนไขที่เลือก </td></tr>'; } 
    else {
        pageData.forEach(s => {
            let statusBadge = '';
            if (s.status === 'ชำรุด / ผิดปกติ') statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-100"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>ชำรุด / ผิดปกติ</span>`;
            else if (s.status === 'ชำรุด') statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-100"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>ชำรุด</span>`;
            else if (s.status === 'ผิดปกติ') statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-100"><span class="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>ผิดปกติ</span>`;
            else statusBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider bg-green-50 text-green-600 border border-green-100"><span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>ปกติ</span>`;

            const tr = document.createElement('tr'); tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors group cursor-pointer'; 
            tr.innerHTML = `<td class="p-4"><div class="font-bold text-slate-700 group-hover:text-blue-600 transition-colors">${escapeHtml(s.device)}</div></td><td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold ${s.count > 0 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}">${s.count} / ${s.remaining}</span></td> <td class="p-4 text-center text-xs text-slate-500 font-mono">${s.brokenDate}</td><td class="p-4 text-center text-xs text-slate-500 font-mono">${s.fixedDate}</td><td class="p-4 text-center">${statusBadge}</td><td class="p-4 text-center"><span class="text-xs font-bold ${(s.status !== 'ปกติ') ? 'text-red-500' : 'text-slate-600'}">${s.latestBrokenDuration}</span></td><td class="p-4"><p class="text-xs text-slate-500 truncate max-w-[150px]" title="${escapeHtml(s.latestDescription)}">${escapeHtml(s.latestDescription || '-')}</p></td><td class="p-4"><p class="text-xs text-slate-500 truncate max-w-[150px]" title="${escapeHtml(s.latestSolution)}">${escapeHtml(s.latestSolution || '-')}</p></td>`;
            tr.onclick = () => window.openForm(s.device); tbody.appendChild(tr);
        });
    }

    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.className = "flex items-center justify-between px-6 py-4 bg-slate-50/50";
        pagination.innerHTML = `<div class="text-xs font-bold text-slate-400 uppercase tracking-widest">Showing ${startIndex + 1} to ${Math.min(startIndex + pageSize, summary.length)} of ${summary.length} entries</div><div class="flex items-center gap-1"><button onclick="changePage(-1)" ${currentPage===1?'disabled':''} class="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg></button><div class="px-4 py-1 bg-white rounded-lg shadow-sm border border-slate-200 text-sm font-bold text-blue-600">${currentPage} / ${totalPages}</div><button onclick="changePage(1)" ${currentPage===totalPages?'disabled':''} class="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg></button></div>`;
    }
    if (typeof updateChart === 'function') updateChart(summary);
};

function updateChart(summary) {
const sorted = [...summary].sort((a, b) => b.count - a.count); const top10 = sorted.slice(0, 10); const labels = top10.map(s => s.device); const data = top10.map(s => s.count);
if (chartInstance) chartInstance.destroy();
chartInstance = new Chart(document.getElementById('chart').getContext('2d'), { type: 'bar', data: { labels, datasets: [{ label: 'ครั้งที่มีปัญหา', data, backgroundColor: data.map(v => v > 0 ? 'rgba(248,113,113,0.85)' : 'rgba(148,163,184,0.6)') }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, precision: 0 } } } });
}

window.changePage = function(step) { currentPage += step; if (currentPage < 1) currentPage = 1; window.updateDeviceSummary(); }

window.updateDeviceStatusOverlays = async function(siteKey) {
    const mapContainer = document.getElementById(`map-${siteKey}`); if (!mapContainer) return;
    mapContainer.querySelectorAll('.device-overlay').forEach(el => el.remove());
    const docsSnap = await getAllDevicesDocs(siteKey); const devicesStatus = {};
    docsSnap.forEach(d => { if (d.data() && d.data().currentStatus) devicesStatus[d.id] = d.data().currentStatus; });
    const mapElement = mapContainer.querySelector('map'); if (!mapElement) return;

    mapElement.querySelectorAll('area').forEach(area => {
        const deviceName = area.getAttribute('alt'); if(!deviceName || deviceName === 'The others') return; 
        const status = devicesStatus[deviceName] || 'ok'; const coordsAttr = area.getAttribute('coords'); if(!coordsAttr) return;
        const coords = coordsAttr.split(',').map(c => parseInt(c.trim())); const shape = area.getAttribute('shape');
        let x, y, width, height;
        if (shape === 'rect' && coords.length === 4) { x = coords[0]; y = coords[1]; width = Math.max(coords[2] - coords[0], 10); height = Math.max(coords[3] - coords[1], 10); } else return; 
        const overlay = document.createElement('div');
        if (status === 'down') overlay.className = 'device-overlay down'; else if (status === 'abnormal') overlay.className = 'device-overlay abnormal'; else overlay.className = 'device-overlay normal'; 
        overlay.style.left = `${x}px`; overlay.style.top = `${y}px`; overlay.style.width = `${width}px`; overlay.style.height = `${height}px`; overlay.setAttribute('title', deviceName);
        mapContainer.appendChild(overlay);
    });
};

let unsubscribe = null; 
function setupRealtimeListener(siteKey) {
  if (unsubscribe) unsubscribe(); if (!firebase.auth().currentUser) return; 
  unsubscribe = db.collection(`sites`).doc(siteKey).collection(`devices`).onSnapshot(snapshot => { window.updateDeviceSummary(); }, (error) => { if (error.code !== 'permission-denied') console.error("Listener Error:", error); });
}

async function processAndSaveImport(assetsToImport, recordsToImport) {
    Swal.fire({ title: 'กำลังนำเข้า...', didOpen: () => { Swal.showLoading(); } }); const batch = db.batch(); const assetMap = new Map();
    for (const item of assetsToImport) assetMap.set(item.deviceName, item.assetInfo);
    const recordMap = new Map(); 
    for (const item of recordsToImport) { if (!recordMap.has(item.deviceName)) recordMap.set(item.deviceName, []); recordMap.get(item.deviceName).push(item.record); }
    const allDeviceNames = new Set([...assetMap.keys(), ...recordMap.keys(), ...sites[currentSiteKey].devices]);
    try {
        const docsSnap = await getAllDevicesDocs(currentSiteKey); const existingDataMap = new Map(); docsSnap.forEach(d => existingDataMap.set(d.id, d.data()));
        for (const deviceName of allDeviceNames) {
            if (!sites[currentSiteKey].devices.includes(deviceName)) continue;
            const docRef = getSiteCollection(currentSiteKey).doc(deviceName); const existingData = existingDataMap.get(deviceName) || {};
            let finalAssetInfo = assetMap.has(deviceName) ? assetMap.get(deviceName) : (existingData.assetInfo || {});
            const finalRecordsMap = new Map();
            for (const r of (existingData.records || [])) finalRecordsMap.set(r.ts, r);
            for (const r of (recordMap.get(deviceName) || [])) finalRecordsMap.set(r.ts, r);
            const finalRecords = Array.from(finalRecordsMap.values()); finalRecords.sort((a, b) => a.ts - b.ts);
            const downCount = finalRecords.filter(r => r.counted).length; 
            const unresolvedIssues = finalRecords.filter(r => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null'));
            let currentStatus = 'ok'; if (unresolvedIssues.some(r => r.status === 'down')) currentStatus = 'down'; else if (unresolvedIssues.some(r => r.status === 'abnormal')) currentStatus = 'abnormal';
            batch.set(docRef, { assetInfo: finalAssetInfo, records: finalRecords, downCount: downCount, currentStatus: currentStatus });
        }
        await batch.commit(); window.updateDeviceSummary(); window.updateDeviceStatusOverlays(currentSiteKey); Swal.fire({ title: 'นำเข้าสำเร็จ!', icon: 'success' });
    } catch (error) { Swal.fire('ผิดพลาด', error.message, 'error'); }
}

window.importData = function(event) {
    if (currentUserRole !== 'editor' && currentUserRole !== 'admin') { Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์นำเข้าข้อมูล', 'error'); event.target.value = null; return; }
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, { type: 'array' });
            const wsAssets = wb.Sheets["ข้อมูลทรัพย์สิน"]; const wsRecords = wb.Sheets["ประวัติการชำรุด"];
            const assetsToImport = []; const recordsToImport = [];
            const cleanDate = (val) => { if (!val) return null; const str = val.toString().trim(); if (str === '-' || str === '' || str.toLowerCase() === 'null') return null; return str.slice(0, 10).replace(/\//g, '-'); };
            
            if (wsAssets) {
                const assetRawData = XLSX.utils.sheet_to_json(wsAssets, { header: 1 });
                if (assetRawData.length >= 2) { 
                    const headers = assetRawData[0];
                    const headerMap = { 'ชื่ออุปกรณ์': headers.indexOf('ชื่ออุปกรณ์'), 'Serial Number': headers.indexOf('Serial Number'), 'Model': headers.indexOf('Model'), 'PEA No.': headers.indexOf('PEA No.'), 'ราคา': headers.indexOf('ราคา'), 'Manufacturer': headers.indexOf('Manufacturer'), 'วันที่เริ่มประกัน': headers.indexOf('วันที่เริ่มประกัน'), 'วันที่หมดประกัน': headers.indexOf('วันที่หมดประกัน') };
                    if (headerMap['ชื่ออุปกรณ์'] !== -1) {
                        for (let i = 1; i < assetRawData.length; i++) {
                            const row = assetRawData[i]; const deviceName = row[headerMap['ชื่ออุปกรณ์']]; if (!deviceName) continue;
                            assetsToImport.push({ deviceName, assetInfo: { serial: row[headerMap['Serial Number']] || '', model: row[headerMap['Model']] || '', peaNo: (headerMap['PEA No.'] !== -1) ? (row[headerMap['PEA No.']] || '') : '', price: (headerMap['ราคา'] !== -1) ? (row[headerMap['ราคา']] || '') : '', manufacturer: row[headerMap['Manufacturer']] || '', warrantyStart: cleanDate(row[headerMap['วันที่เริ่มประกัน']]), warrantyEnd: cleanDate(row[headerMap['วันที่หมดประกัน']]) } });
                        }
                    }
                }
            }
            if (wsRecords) {
                const recordRawData = XLSX.utils.sheet_to_json(wsRecords, { header: 1 });
                if (recordRawData.length >= 2) { 
                    const headers = recordRawData[0];
                    // แก้ไขหา วันที่เกิดเหตุ เพื่อแก้ปัญหา Import ทับของเดิม
                    const headerMap = { 'Timestamp': headers.indexOf('Timestamp'), 'ชื่ออุปกรณ์': headers.indexOf('ชื่ออุปกรณ์'), 
                                        'วันที่เกิดเหตุ': headers.indexOf('วันที่เกิดเหตุ') !== -1 ? headers.indexOf('วันที่เกิดเหตุ') : headers.indexOf('วันที่ชำรุด'), 
                                        'วันที่ซ่อมแซม': headers.indexOf('วันที่ซ่อมแซม'), 'สถานะ': headers.indexOf('สถานะ'), 'คำอธิบาย': headers.indexOf('คำอธิบาย'), 'วิธีแก้ไข': headers.indexOf('วิธีแก้ไข'), 
                                        'เลขที่ใบสั่ง': headers.indexOf('เลขที่ใบสั่ง'), 'ราคาซ่อม': headers.indexOf('ราคาซ่อม'), 'ผู้บันทึก': headers.indexOf('ผู้บันทึก') };
                    
                    if (headerMap['ชื่ออุปกรณ์'] !== -1 && headerMap['วันที่เกิดเหตุ'] !== -1) {
                        for (let i = 1; i < recordRawData.length; i++) {
                            const row = recordRawData[i]; const deviceName = row[headerMap['ชื่ออุปกรณ์']]; if (!deviceName) continue;
                            const importedBrokenDate = cleanDate(row[headerMap['วันที่เกิดเหตุ']]); const importedFixedDate = cleanDate(row[headerMap['วันที่ซ่อมแซม']]);
                            const statusValue = (row[headerMap['สถานะ']] || '').toString(); const importedTs = row[headerMap['Timestamp']];
                            let finalStatus = 'ok'; if (statusValue.includes('ชำรุด')) finalStatus = 'down'; else if (statusValue.includes('ผิดปกติ')) finalStatus = 'abnormal';
                            if (importedBrokenDate && !importedFixedDate && finalStatus === 'ok') finalStatus = 'down'; 
                            
                            recordsToImport.push({ deviceName, record: {
                                ts: importedTs ? parseInt(importedTs) : Date.now() + i, brokenDate: importedBrokenDate || '', fixedDate: importedFixedDate || null, 
                                status: finalStatus, description: (row[headerMap['คำอธิบาย']] || '').toString() || 'นำเข้าจาก Excel', solution: (headerMap['วิธีแก้ไข'] !== -1) ? (row[headerMap['วิธีแก้ไข']] || '').toString() : '',
                                orderNumber: (headerMap['เลขที่ใบสั่ง'] !== -1) ? (row[headerMap['เลขที่ใบสั่ง']] || '').toString() : '', repairCost: (headerMap['ราคาซ่อม'] !== -1) ? (row[headerMap['ราคาซ่อม']] || '').toString() : '',
                                user: (row[headerMap['ผู้บันทึก']] || '').toString() || (currentUserFullName || currentUser.email), counted: !!importedBrokenDate, 
                            } });
                        }
                    } else { Swal.fire('ผิดพลาด', 'ไม่พบคอลัมน์ ชื่ออุปกรณ์ หรือ วันที่เกิดเหตุ ในไฟล์ Excel', 'error'); return; }
                }
            }
            if (assetsToImport.length > 0 || recordsToImport.length > 0) processAndSaveImport(assetsToImport, recordsToImport); else Swal.fire('ผิดพลาด', 'ไม่พบข้อมูล', 'error');
        } catch (error) { Swal.fire('ผิดพลาด', error.message, 'error'); }
    };
    reader.readAsArrayBuffer(file); event.target.value = null; 
};

window.exportAllDataExcel = async function() {
    const siteData = sites[currentSiteKey]; if (!siteData || siteData.devices.length === 0) return;
    const docsSnap = await getAllDevicesDocs(currentSiteKey); const dataMap = {}; docsSnap.forEach(d => dataMap[d.id] = d.data());

    // เพิ่มคอลัมน์ใหม่ใน Excel
    const recordsData = [['Timestamp', 'ชื่ออุปกรณ์', 'ลำดับการบันทึก (ครั้งที่ N)', 'วันที่เกิดเหตุ', 'วันที่ซ่อมแซม', 'ระยะเวลา', 'สถานะ', 'คำอธิบาย', 'วิธีแก้ไข', 'เลขที่ใบสั่ง', 'ราคาซ่อม', 'ผู้บันทึก']]; 
    const assetData = [['ชื่ออุปกรณ์', 'Serial Number', 'Model', 'PEA No.', 'ราคาซื้อ', 'Manufacturer', 'วันที่เริ่มประกัน', 'วันที่หมดประกัน', 'สถานะประกัน']]; 

    for (const devName of siteData.devices) {
        const docData = dataMap[devName]; const assetInfo = docData?.assetInfo || {}; const warrantyStatus = getWarrantyStatus(assetInfo.warrantyEnd);
        let warrantyStatusText = 'N/A'; switch(warrantyStatus) { case 'ok': warrantyStatusText = 'รับประกัน'; break; case 'warn': warrantyStatusText = 'ใกล้หมดประกัน'; break; case 'bad': warrantyStatusText = 'หมดประกัน'; break; }
        assetData.push([ devName, assetInfo.serial || '-', assetInfo.model || '-', assetInfo.peaNo || '-', assetInfo.price || '-', assetInfo.manufacturer || '-', (assetInfo.warrantyStart || '-').replace(/-/g, '/'), (assetInfo.warrantyEnd || '-').replace(/-/g, '/'), warrantyStatusText ]);

        if (!docData) continue; const records = docData.records || []; records.sort((a, b) => a.ts - b.ts); let downCount = 0; 
        records.forEach(r => {
            let duration = '-', sequenceNumber = '-'; if (r.counted) { downCount++; sequenceNumber = downCount; }
            if (r.brokenDate) { if (r.fixedDate) duration = formatDuration(calculateDaysDifference(r.brokenDate, r.fixedDate)); else if (r.status === 'down' || r.status === 'abnormal') duration = formatDuration(calculateDaysDifference(r.brokenDate, null)) + ' (ยังไม่ซ่อม)'; }
            let statusTH = r.status === 'down' ? 'ชำรุด' : (r.status === 'abnormal' ? 'ผิดปกติ' : 'ใช้งานได้');
            recordsData.push([ r.ts || '-', devName, sequenceNumber, (r.brokenDate || '-').replace(/-/g, '/'), (r.fixedDate || '-').replace(/-/g, '/'), duration, statusTH, r.description || '-', r.solution || '-', r.orderNumber || '-', r.repairCost || '-', r.user || '-', ]);
        });
    }

    const logData = [['วัน-เวลา', 'ผู้ใช้งาน', 'การกระทำ', 'รายละเอียด', 'ไซต์']];
    try {
        const logSnap = await db.collection("activity_logs").where("siteKey", "==", currentSiteKey).orderBy("timestamp", "desc").limit(1000).get();
        logSnap.forEach(doc => { const d = doc.data(); logData.push([ d.timestamp ? d.timestamp.toDate().toLocaleString('th-TH') : '-', d.userEmail || '-', d.action || '-', d.details || '-', d.siteKey || '-' ]); });
    } catch (error) {}

    const wb = XLSX.utils.book_new();
    if (recordsData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recordsData), "ประวัติการชำรุด");
    if (assetData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(assetData), "ข้อมูลทรัพย์สิน");
    if (logData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logData), "ประวัติการใช้งาน");
    XLSX.writeFile(wb, `Device_Export_${siteData.name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`); Swal.fire('ส่งออกสำเร็จ', `ไฟล์ถูกบันทึกแล้ว`, "success");
};

window.resetFilters = function() { document.getElementById('searchInput').value = ''; document.getElementById('sortOrder').value = 'desc'; document.getElementById('filterStatus').value = 'all'; document.getElementById('fromDate').value = ''; document.getElementById('toDate').value = ''; currentPage = 1; try { window.updateDeviceSummary(); } catch (e) {} }

window.clearAllDevices = async function() {
if (currentUserRole !== 'admin') return;
const result = await Swal.fire({ title: '⚠️ ลบข้อมูลทั้งหมด?', text: `คุณแน่ใจหรือไม่ว่าต้องการล้างข้อมูลทั้งหมด?`, icon: 'error', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ใช่, ลบทั้งหมด!', cancelButtonText: 'ยกเลิก' });
if (result.isConfirmed) {
const docs = await getAllDevicesDocs(currentSiteKey); const batch = db.batch(); 
for (let d of docs.docs) { batch.set(getSiteCollection(currentSiteKey).doc(d.id), { records: [], downCount: 0, currentStatus: 'ok' }, { merge: true }); }
await batch.commit(); window.updateDeviceSummary(); window.updateDeviceStatusOverlays(currentSiteKey); Swal.fire('ลบเรียบร้อย', 'ลบข้อมูลประวัติทั้งหมดแล้ว', 'success');
}
}

window.showSummary = function() { document.getElementById('topologyPage').classList.add('hidden'); document.getElementById('summaryPage').classList.remove('hidden'); window.updateDeviceSummary(); };
window.showTopology = function() { document.getElementById('summaryPage').classList.add('hidden'); document.getElementById('topologyPage').classList.remove('hidden'); if (typeof imageMapResize === 'function') { imageMapResize(); } window.updateDeviceStatusOverlays(currentSiteKey); };
function switchSite(siteKey) { const siteData = sites[siteKey]; if (!siteData) return; currentSiteKey = siteKey; document.getElementById('locationTitle').textContent = `🔎 ${siteData.name}`; document.querySelectorAll('.map-container').forEach(el => el.classList.add('hidden')); document.getElementById(`map-${siteKey}`).classList.remove('hidden'); if (typeof imageMapResize === 'function') { imageMapResize(); } setupRealtimeListener(siteKey); window.updateDeviceStatusOverlays(currentSiteKey); }

document.addEventListener("DOMContentLoaded", function() {
auth.onAuthStateChanged(async user => {
    if (user) {
        currentUser = user; document.getElementById('userInfo').classList.remove('hidden'); document.getElementById('loginButton').classList.add('hidden');
        try {
            const userSnap = await db.collection('users').doc(user.email).get();
            if (!userSnap.exists) { let initialRole = (user.email === ADMIN_EMAIL) ? 'admin' : 'viewer'; await db.collection('users').doc(user.email).set({ email: user.email, role: initialRole, fullName: '', createdAt: firebase.firestore.FieldValue.serverTimestamp() }); currentUserRole = initialRole; currentUserFullName = ''; } 
            else { currentUserRole = userSnap.data().role || 'viewer'; currentUserFullName = userSnap.data().fullName || ''; }
            if (user.email === ADMIN_EMAIL) currentUserRole = 'admin';
            document.getElementById('userNameDisplay').textContent = currentUserFullName ? `${currentUserFullName} (${user.email})` : user.email; 
            const sessionLogKey = `logged_in_${user.uid}`; if (!sessionStorage.getItem(sessionLogKey)) { await createLog("AUTH_LOGIN", `เข้าสู่ระบบ (Role: ${currentUserRole})`); sessionStorage.setItem(sessionLogKey, "true"); }
            startAutoLogoutTimer();
        } catch (e) { currentUserRole = 'viewer'; }
        toggleWriteAccess(true);
    } else {
        if (currentUser) sessionStorage.removeItem(`logged_in_${currentUser.uid}`);
        currentUser = null; currentUserRole = 'viewer'; currentUserFullName = ''; document.getElementById('userInfo').classList.add('hidden'); document.getElementById('loginButton').classList.remove('hidden'); toggleWriteAccess(false); stopAutoLogoutTimer();
    }
});
document.getElementById('loginButton').addEventListener('click', login); document.getElementById('logoutButton').addEventListener('click', logout); setupWarrantyCalculators();
const locationSelect = document.getElementById("location-select");
if (locationSelect) { locationSelect.addEventListener("change", function() { switchSite(this.value); }); try { let initialSiteKey = locationSelect.value; if (!sites[initialSiteKey]) initialSiteKey = Object.keys(sites)[0]; toggleWriteAccess(false); switchSite(initialSiteKey); } catch (error) {} }
});

let countdownInterval; const LOGOUT_TIME_LIMIT = 60 * 60 * 1000; 
window.startAutoLogoutTimer = function() {
    stopAutoLogoutTimer(); let expirationTime = localStorage.getItem('logoutExpiration'); if (!expirationTime) { expirationTime = Date.now() + LOGOUT_TIME_LIMIT; localStorage.setItem('logoutExpiration', expirationTime); }
    countdownInterval = setInterval(() => {
        let timeLeft = Math.ceil((expirationTime - Date.now()) / 1000); if (timeLeft <= 0) { stopAutoLogoutTimer(); localStorage.removeItem('logoutExpiration'); logout(); return; }
        const minElem = document.getElementById('timerMinutes'); const secElem = document.getElementById('timerSeconds');
        if (minElem && secElem) { minElem.textContent = Math.floor(timeLeft / 60).toString().padStart(2, '0'); secElem.textContent = (timeLeft % 60).toString().padStart(2, '0'); }
    }, 1000);
};
window.stopAutoLogoutTimer = function() { if (countdownInterval) clearInterval(countdownInterval); localStorage.removeItem('logoutExpiration'); };
window.printReport = async function() {
    const siteData = sites[currentSiteKey];
    
    const result = await Swal.fire({
        title: 'ตั้งค่าการออกรายงาน',
        input: 'radio',
        inputOptions: { 
            'all': '1. อุปกรณ์ทั้งหมด', 
            'broken': '2. เฉพาะอุปกรณ์ที่กำลังเสียหาย', 
            'history': '3. เฉพาะอุปกรณ์ที่มีประวัติเสียหาย' 
        },
        inputValidator: (value) => { if (!value) return 'กรุณาเลือกประเภทรายงาน'; },
        showCancelButton: true, confirmButtonText: 'เตรียมรายงาน', cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;
    const reportType = result.value;

    Swal.fire({
        title: 'กำลังจัดเตรียมข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

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
        
        const isCurrentlyDown = records.some(r => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '-' || r.fixedDate === 'null'));
        const hasHistory = records.length > 0;

        if (reportType === 'broken' && !isCurrentlyDown) continue;
        if (reportType === 'history' && !hasHistory) continue;

        const assetInfo = docData.assetInfo || {};
        const rowSpan = records.length > 0 ? records.length : 1;

        for (let i = 0; i < rowSpan; i++) {
            const r = records[i];
            const isFirst = (i === 0);
            const occurrenceNo = r ? (records.length - i) : '-';

            tableContent += `<tr class="${isFirst ? 'device-group-start' : ''}">`;
            
            if (isFirst) {
                const isDown = records.length > 0 && (records[0].status === 'down' || records[0].status === 'abnormal') && !records[0].fixedDate;
                tableContent += `
                    <td rowspan="${rowSpan}" class="col-no text-center">${itemNo++}</td>
                    <td rowspan="${rowSpan}" class="col-device">
                        <div class="dev-info-container">
                            <div class="dev-title">${dev}</div>
                            <div class="dev-specs">
                                <b>Manufacturer:</b> ${assetInfo.manufacturer || '-'}<br>
                                <b>S/N:</b> ${assetInfo.serial || '-'}<br>
                                <b>Model:</b> ${assetInfo.model || '-'}<br>
                                <b>PEA:</b> ${assetInfo.peaNo || '-'}
                            </div>
                            <div class="status-pill ${isDown ? 'pill-down' : 'pill-ok'}">
                                ${isDown ? '● REQUIRES ATTENTION' : '● OPERATIONAL'}
                            </div>
                        </div>
                    </td>
                `;
            }

            if (r) {
                let imgBroken = r.brokenFileUrl ? `<div class="img-wrap"><img src="${r.brokenFileUrl}"></div>` : '';
                let imgFixed = r.fixedFileUrl ? `<div class="img-wrap"><img src="${r.fixedFileUrl}"></div>` : '';

                tableContent += `
                    <td class="text-center font-bold">${occurrenceNo}</td>
                    <td class="text-center">${r.brokenDate || '-'}</td>
                    <td class="text-center">${r.fixedDate || '<span class="urgent">PENDING</span>'}</td>
                    <td class="text-left desc-cell">${r.description || '-'}${imgBroken}</td>
                    <td class="text-left desc-cell">${r.solution || '-'}${imgFixed}</td>
                    <td class="text-left">
                        <div class="cost-row"><span>O:</span> <b>${r.orderNumber || '-'}</b></div>
                        <div class="cost-row" style="margin-top:3px;"><span>C:</span> <b class="cost-val">${r.repairCost ? Number(r.repairCost).toLocaleString() : '-'}</b></div>
                    </td>
                    <td class="text-center user-cell">${r.user ? r.user.split('@')[0] : '-'}</td>
                `;
            } else {
                tableContent += `<td colspan="7" class="empty-cell">ไม่มีประวัติการซ่อมบำรุง</td>`;
            }
            tableContent += `</tr>`;
        }
    }

    Swal.close();

    const printWindow = window.open('', '', 'height=900,width=1400');
    printWindow.document.write(`
        <html>
        <head>
            <title>REPORT_${siteData.name}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
            <style>
                @page { 
                    size: A4 landscape; 
                    margin: 0.21in; 
                }
                body { 
                    font-family: 'Inter', 'Sarabun', sans-serif; 
                    color: #0f172a; 
                    margin: 0; 
                    padding-bottom: 100px; /* เว้นพื้นที่ให้ footer */
                    counter-reset: page; 
                }
                
                /* Header */
                .report-header { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: white; padding: 15px 20px; border-radius: 4px; margin-bottom: 10px; }
                .report-header h1 { margin: 0; font-size: 18px; text-transform: uppercase; font-weight: 700; }
                .header-meta { text-align: right; font-size: 10px; opacity: 0.9; }

                /* Table */
                table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #000; }
                th { background: #1e293b !important; color: white !important; padding: 8px 4px; font-size: 11px; border: 1px solid #000; }
                td { padding: 5px; border: 1px solid #000; vertical-align: middle; font-size: 10.5px; word-wrap: break-word; }
                
                /* จัดการการตัดหน้า */
                tr { page-break-inside: auto; }
                td { page-break-inside: avoid; }
                .device-group-start td { border-top: 2.5px solid #000; }

                /* ชื่ออุปกรณ์กึ่งกลางแนวตั้ง */
                .dev-info-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }
                .col-device { width: 160px; vertical-align: middle !important; background: #f8fafc; }
                .dev-title { font-size: 13px; font-weight: 700; color: #1e40af; margin-bottom: 4px; line-height: 1.2; }
                
                .brand-tag { font-size: 9px; font-weight: 700; background: #e2e8f0; padding: 2px 5px; border-radius: 3px; margin-bottom: 5px; color: #475569; border: 0.5px solid #94a3b8; }
                .dev-specs { font-size: 9px; color: #475569; line-height: 1.3; text-align: left; width: 90%; border-top: 1px solid #cbd5e1; padding-top: 3px; }
                
                .status-pill { margin-top: 5px; font-size: 8px; font-weight: 700; padding: 2px 6px; border-radius: 10px; border: 1px solid #000; }
                .pill-ok { background: #dcfce7; } .pill-down { background: #fee2e2; }
                
                /* รูปภาพ */
                .img-wrap { margin-top: 5px; border: 1px solid #000; padding: 1px; background: #fff; }
                .img-wrap img { width: 100%; height: 70px; object-fit: cover; display: block; }
                
                .cost-row { display: flex; justify-content: space-between; font-size: 10px; }
                .user-cell { white-space: nowrap; font-weight: 600; }

                /* Footer: ลายเซ็นอยู่กึ่งกลาง */
                .fixed-footer {
                    position: fixed;
                    bottom: 0.21in;
                    left: 0;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    z-index: 1000;
                    background: white;
                }
                .sig-wrapper {
                    display: flex;
                    justify-content: center;
                    gap: 100px;
                    width: 100%;
                    padding-bottom: 10px;
                }
                .sig-box { text-align: center; font-size: 11px; }
                .sig-line { border-bottom: 1px solid #000; width: 200px; margin-bottom: 15px; } /* เว้นช่องว่างระหว่างเส้นกับชื่อมากขึ้น */
                
                .page-number-box {
                    width: 100%;
                    text-align: right;
                    padding-right: 0.21in;
                    font-size: 10px;
                    font-weight: 700;
                }
                .page-number-box:after {
                    content: "หน้า " counter(page) " / " counter(pages);
                }

                @media print {
                    body { -webkit-print-color-adjust: exact; }
                    thead { display: table-header-group; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="background:#f1f5f9; padding:10px; text-align:center; border-bottom:1px solid #cbd5e1;">
                <button onclick="window.print()" style="padding:8px 20px; cursor:pointer; font-weight:bold; background:#0f172a; color:white; border-radius:4px; border:none;">คลิกเพื่อสั่งพิมพ์ / บันทึกเป็น PDF</button>
            </div>

            <div class="page-wrapper">
                <div class="report-header">
                    <div>
                        <h1>Asset Maintenance Report</h1>
                        <div class="site-name">PROJECT: ${siteData.name}</div>
                    </div>
                    <div class="header-meta">
                        PRINTED: ${printDate} | ${printTime}<br>
                        OPERATOR: ${currentUserFullName || 'ADMIN'}
                    </div>
                </div>
                
                <table>
                    <thead>
                        <tr>
                             <th style="width: 30px;">No.</th>
                            <th style="width: 170px;">Device & Specs</th>
                            <th style="width: 35px;">Occ.</th>
                            <th style="width: 75px;">Down Date</th>
                            <th style="width: 75px;">Fixed Date</th>
                            <th>Description</th>
                            <th>Solution</th>
                            <th style="width: 110px;">Order & Cost</th>
                            <th style="width: 90px;">Recorded By</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableContent}
                    </tbody>
                </table>
            </div>

            <div class="fixed-footer">
                <div class="sig-wrapper">
                    <div class="sig-box">
                        <div class="sig-line"></div>
                        <div style="font-weight:bold;">( ${currentUserFullName || '................................................'} )</div>
                        <div style="font-size: 9px;">ผู้จัดทำรายงาน</div>
                    </div>
                    <div class="sig-box">
                        <div class="sig-line"></div>
                        <div style="font-weight:bold;">( ............................................................ )</div>
                        <div style="font-size: 9px;">ผู้อนุมัติ / ผู้ตรวจสอบ</div>
                    </div>
                </div>
                <div class="page-number-box"></div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
};
window.sendEmailNotify = async function(type, deviceName, description,solution, user, dateVal, count) {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbzLRfWeTwhZN_kU_8RD_eXiy30Mtt1duleN1Vxmw4RV7wB_mmTFhDPXObWCVoaUzF0GgQ/exec"; 
    let title = (type === 'down') ? `🚨 แจ้งเตือนอุปกรณ์มีปัญหา (ครั้งที่ ${count})` : `✅ แจ้งเตือนซ่อมแซมเสร็จสิ้น`;
    try { await fetch(GAS_URL, { method: 'POST', mode: 'no-cors', cache: 'no-cache', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `หัวข้อ: ${title}\n------------------------------------------\n📍 สถานที่: ${sites[currentSiteKey].name}\n🛠️ อุปกรณ์: ${deviceName}\n📝 รายละเอียด: ${description || '-'}\nวิธีแก้ไข: ${solution || '-'}\n📅 วันที่ทำรายการ: ${dateVal}\n👤 ผู้บันทึก: ${user}\n------------------------------------------` }) }); } catch (err) {}
};

window.onload = function() { try { imageMapResize(); } catch (e) {} };



















