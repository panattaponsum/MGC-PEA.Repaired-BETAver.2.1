const firebaseConfig = {
apiKey: "AIzaSyCe-qS_uKPYASKJHHL0JuV4eCCzajbpzRY",
authDomain: "microgrid-th.firebaseapp.com",
projectId: "microgrid-th",
storageBucket: "microgrid-th.firebasestorage.app",
messagingSenderId: "88058740399",
appId: "1:88058740399:web:bbb38da765672dc4969e5a",
measurementId: "G-L45B835SV4"
};
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig); 
}
const db = firebase.firestore(); 
const auth = firebase.auth(); 
const storage = firebase.storage(); 
const devicesCol = db.collection("devices"); 

let cachedDeviceStatus = {}; 

function formatThaiDate(dateVal) {
    if (!dateVal || dateVal === '-' || dateVal.toString().trim() === '') return '-';
    let d;
    if (typeof dateVal === 'number' || (typeof dateVal === 'string' && !isNaN(dateVal) && dateVal.length >= 10)) {
        d = new Date(Number(dateVal));
    } else {
        const str = dateVal.toString().trim();
        if (str.includes('/')) {
            const parts = str.split('/');
            if (parts.length === 3) {
                let year = parseInt(parts[2]);
                if (year > 2500) year -= 543; 
                d = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
        } else {
            d = new Date(str);
        }
    }
    if (!d || isNaN(d.getTime())) return dateVal;
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear() + 543;
    return `${day}/${month}/${year}`;
}

function formatThaiDateTime(ts) {
    if (!ts) return '-';
    let d;
    if (typeof ts === 'number' || (typeof ts === 'string' && ts.trim() !== '' && !isNaN(ts))) {
        d = new Date(Number(ts));
    } else {
        d = new Date(ts);
    }
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear() + 543;
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    return `${day}/${month}/${year} ${time}`;
}

function parseThaiDateToStandard(val) {
    if (!val || val === '-' || val.toString().trim() === '') return '';
    if (typeof val === 'number' && val < 100000) {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        return d.toISOString().split('T')[0];
    }
    const str = val.toString().trim();
    if (str.includes('-') && str.split('-')[0].length === 4) return str.slice(0, 10);
    
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
            let day = parts[0].padStart(2, '0');
            let month = parts[1].padStart(2, '0');
            let year = parseInt(parts[2]);
            if (year > 2500) year -= 543; 
            return `${year}-${month}-${day}`;
        }
    }
    
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        let year = d.getFullYear();
        if (year > 2500) year -= 543;
        return `${year}-${month}-${day}`;
    }
    return '';
}

function parseThaiDateTimeToTS(val) {
    if (!val) return null;
    const str = val.toString().trim();
    if (!isNaN(str) && str.length >= 10) return Number(str);
    
    let datePart = str, timePart = '00:00';
    if (str.includes(' ')) {
        const parts = str.split(' ');
        datePart = parts[0]; timePart = parts[1];
    }
    
    if (datePart.includes('/')) {
        const parts = datePart.split('/');
        if (parts.length === 3) {
            let year = parseInt(parts[2]);
            if (year > 2500) year -= 543;
            const dStr = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T${timePart}:00`;
            const d = new Date(dStr);
            if (!isNaN(d.getTime())) return d.getTime();
        }
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
    return null;
}


let currentSiteKey = "ko-phaluay";
let currentDevice = null, editIndex = -1, chartInstance = null;
let currentPage = 1;
const pageSize = 7; 
let currentUser = null;
let currentUserRole = 'viewer'; 
let currentUserAllowedSites = []; 
let currentUserFullName = ''; 
let currentUserPosition = ''; 
let currentUserDept = '';
let currentUserPhone = ''; 
const ADMIN_EMAIL = 'panattapon.sum@gmail.com'; 

function hasWriteAccess(siteKey = currentSiteKey) {
    if (currentUserRole === 'admin') return true;
    if (currentUserRole === 'editor') {
        return currentUserAllowedSites.includes(siteKey) || currentUserAllowedSites.includes('all');
    }
    return false;
}
function hasEngineerSiteAccess(siteKey = currentSiteKey) {
    return currentUserRole === 'engineer' && (currentUserAllowedSites.includes(siteKey) || currentUserAllowedSites.includes('all'));
}
function canAcknowledgeIssue(siteKey = currentSiteKey) {
    return currentUserRole === 'admin' || hasWriteAccess(siteKey) || hasEngineerSiteAccess(siteKey);
}
function canMarkFixed(siteKey = currentSiteKey) {
    return currentUserRole === 'admin' || hasEngineerSiteAccess(siteKey);
}

const sites = {
"ko-phaluay": { name: "ไมโครกริดเกาะพะลวย อ.เกาะสมุย จ.สุราษฎร์ธานี", devices: [ "HMI Server 1",
"HMI Server 2",
"Operation Station",
"Printer",
"Time Server",
"MGC",
"ETH Switch 1",
"ETH Switch 2",
"ETH Switch 3",
"ETH Switch 4",
"ETH Switch 5 (REC No.1)",
"REC No.1",
"ETH Switch 6 (REC No.2)",
"REC No.2",
"ETH Switch 7 (RCS No.1)",
"RCS No.1",
"ETH Switch 8 (RCS No.2)",
"RCS No.2",
"COV 1",
"COV 2",
"BCP",
"PCS",
"Inverter 1",
"Inverter 2",
"Inverter 3",
"Inverter 4",
"Inverter 5",
"Inverter 6",
"Inverter 7",
"Inverter 8",
"Inverter 9",
"Inverter 10",
"Diesel Generator 1",
"Diesel Generator 2",
"Diesel Generator Master",
"Gateway 1",
"Gateway 2",
"Firewall 1",
"Firewall 2",
"Firewall 3",
"GPS",
"Weather",
"Jump Server",
"CCTV",
"4G Router 1",
"4G Router 2",
"4G Router 3",
"33 Switchgear Panal",
"Meter", "other" ] },
"mae-sariang": { name: "ไมโครกริดแม่สะเรียง อ.แม่สะเรียง จ.แม่ฮ่องสอน", devices: [ "FireWall 1","Web Server", "PCS-9893 (Web Server B)", "HMI Display 1", "HMI Display 2", "HMI Main 1", "(PCS-9895 Cyber Security Manager)", "Scada 1", "Scada 2", "Switch 1", "Switch 2", "Switch 3", "Switch 4", "Switch 5", "Switch 6", "Switch 7", "ETH Switch 1", "ETH Switch 2", "PCS-9892 (Cyber Security Gateway)", "PCS-9893 (Web Server A)", "PCS-9799 (Gateway A)", "PCS-9799 (Gateway B)", "PCS-9617 (MGC 1)", "PCS-9617 (MGC 2)", "PCS-9651 (ATS)", "PCS-9794 (Protocol Converter A)", "PCS-9617 (Diesel Generator Controller)", "PCS-9794 (Protocol Converter B)", "PCS-9726 (Transformer Protection)", "PCS-9567C (BESS Controller)", "PCS-9567 (PCS 1)", "PCS-9567 (PCS 2)", "PCS-9567 (PCS 3)", "PCS-9567 (PCS 4)", "PCS-9567 (PCS 5)", "PCS-9567 (PCS 6)", "ETH Switch 3", "BMS 1", "BMS 2", "BMS 3", "BMS 4", "BMS 5", "BMS 6", "FRTU 1-15", "other" ] },
"betong": { name: "ไมโครกริดเบตง อ.เบตง จ.ยะลา", devices: [ "Operator HMI 24", "Operator HMI 27", "ETH Switch 1", "ETH Switch 2", "ETH Switch 3", "ETH Switch 4", "ETH Switch 5", "ETH Switch 6", "ETH Switch 7", "eMC-N-Controller INC1", "eMC-N-Controller BAAN3", "eMC-N-Controller BAAN4", "RTU SVG", "RTU Substation", "eMC-G-Controller", "ADMS-1", "ADMS-2", "Firewall 1", "Firewall 2", "Firewall 3", "RTU Gateway -1", "RTU Gateway -2", "Security HMI", "GPS", "emC-Scada","emC-P-Controller","emC-E-Controller", "emC-LUC-1-Controller", "emC-LUC-2-Controller", "emC-LUC-3-Controller", "emC-LUC-4-Controller", "Battery System", "Diesel Generator System","Inverter System",
    "Recloser-1", "Recloser-2", "Recloser-3", "Recloser-4", "Recloser-5", "Recloser-6", "Recloser-7", "Recloser-8", "Recloser-9", "Recloser-10",
    "Recloser-11", "Recloser-12", "Recloser-13", "Recloser-14", "Recloser-15", "Recloser-16", "Recloser-17", "Recloser-18", "Recloser-19", "Recloser-20",
    "Recloser-21", "Recloser-22", "Recloser-23", "Recloser-24", "Recloser-25", "Recloser-26", "Recloser-27", "Recloser-28", "Recloser-29", "Recloser-30",
    "Recloser-31", "Recloser-32", "Recloser-33", "Recloser-34", "Recloser-35", "other" ] },
"phrao": { name: "ระบบกักเก็บพลังงานแบตเตอรี่พร้าว อ.พร้าว จ.เชียงใหม่", devices: [ "GPS Antenna", "work station", "Insight server", "Network Switch 1", "Clock server", "Network Switch 2", "Back start controller", "Firewall 1", "EMS Controller", "ETH Switch 1 (LC1000-1) ", "ETH Switch 2 (LC1000-1) ", "Local Controller 200-1", "Local Controller 200-2", "Local Controller 200-3", "ETH Switch 1 (LC1000-2) ", "ETH Switch 2 (LC1000-2) ", "PCS-1", "PCS-2", "PCS-3","Sync. Relay (RCS)", "RCS","ETH Switch (RCS) ", "Recloser","ETH Switch (Recloser)", "BATT-1", "BATT-2", "other" ] }
};
const OTHER_SUBDEVICES = {
    phrao: ["Office","Current Transformer","Voltage Transformer","Step-up Transformer 5 MVA","Service Transformer 160 KVA","Disconnecting Switch","Fire Alarm","PQ Meter","Power Meter","The Other"],
    betong: ["Office","SVG","Fire Alarm System","The Other"],
    "ko-phaluay": ["ระบบควบคุมอาคาร",
"เครื่องปรับอากาศ",
"Cable",
"Riser Pole",
"Recloser",
"ไฟฉุกเฉิน",
"ถังดับเพลิง",
"PQM",
"Generator",
"PV",
"Battery",
"โทรศัพท์",
"วิทยุสื่อสาร",
"Breaker",
"The Other"]
};
const sitePrefixes = {
    "ko-phaluay": "KPL",
    "betong": "BTG",
    "mae-sariang": "MSR",
    "phrao": "PRA"
};

async function generateAutoId(siteKey) {
    const prefixes = { "ko-phaluay": "KPL", "betong": "BTG", "mae-sariang": "MSR", "phrao": "PRA" };
    const prefix = prefixes[siteKey] || "gen";
    
    
    const docsSnap = await getAllDevicesDocs(siteKey);
    let maxNum = 0;
    
    docsSnap.forEach(doc => {
        const data = doc.data();
        if (data.records && Array.isArray(data.records)) {
            data.records.forEach(r => {
                if (r.customId && typeof r.customId === 'string' && r.customId.startsWith(prefix + '-')) {
                    const parts = r.customId.split('-');
                    if (parts.length > 1) {
                        const numPart = parseInt(parts[1]);
                        if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
                    }
                }
            });
        }
    });

    const nextNum = maxNum + 1;
    return `${prefix}-${nextNum.toString().padStart(6, '0')}`;
}
function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] || m)).replace(/\n/g, '<br>'); }
function getSiteCollection(siteKey) { return db.collection(`sites`).doc(siteKey).collection(`devices`); }

async function getDeviceRecords(siteKey, device) {
const docRef = getSiteCollection(siteKey).doc(device); 
const snap = await docRef.get();
const recs = snap.exists ? (snap.data().records || []) : [];
for (const r of recs) { if (typeof r.counted === 'undefined') r.counted = (r.status === 'down' || r.status === 'abnormal'); }
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
    const isAdmin = role === 'admin'; 
    const isEditor = hasWriteAccess(currentSiteKey); 

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

let currentLogPage = 1;
let firstLogDoc = null;
let lastLogDoc = null;
let logPageStack = []; 

window.showActivityLogs = async function(direction = 'first') {
    const modal = document.getElementById('logModal'); 
    const tableBody = document.getElementById('logTableBody');
    const siteFilter = document.getElementById('logSiteFilter').value; 
    const actionFilter = document.getElementById('logActionFilter').value;
    const prevBtn = document.getElementById('prevLogBtn');
    const nextBtn = document.getElementById('nextLogBtn');
    const pageDisplay = document.getElementById('currentLogPageDisplay');
    
    if (!modal || !tableBody) return;
    modal.classList.remove('hidden'); 
    modal.classList.add('flex');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-500 font-bold">กำลังโหลดข้อมูล...</td></tr>';

    if (direction === 'first') {
        currentLogPage = 1;
        firstLogDoc = null;
        lastLogDoc = null;
        logPageStack = [];
    }

    try {
        let query = db.collection("activity_logs");
        if (siteFilter !== "all") query = query.where("siteKey", "==", siteFilter);
        if (actionFilter !== "all") {
            if (actionFilter === "AUTH") query = query.where("action", ">=", "AUTH_").where("action", "<=", "AUTH_\uf8ff").orderBy("action");
            else query = query.where("action", "==", actionFilter);
        }
        
        query = query.orderBy("timestamp", "desc");

        if (direction === 'next' && lastLogDoc) {
            logPageStack.push(firstLogDoc); 
            query = query.startAfter(lastLogDoc).limit(100);
            currentLogPage++;
        } else if (direction === 'prev' && logPageStack.length > 0) {
            const prevPageFirstDoc = logPageStack.pop();
            query = prevPageFirstDoc ? query.startAt(prevPageFirstDoc).limit(100) : query.limit(100);
            currentLogPage--;
        } else {
            query = query.limit(100); 
        }

        const snapshot = await query.get();

        if (snapshot.empty) { 
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-slate-400 italic">ไม่พบข้อมูล หรือถึงหน้าสุดท้ายแล้ว</td></tr>'; 
            if (nextBtn) nextBtn.disabled = true;
            return; 
        }

        firstLogDoc = snapshot.docs[0];
        lastLogDoc = snapshot.docs[snapshot.docs.length - 1];

        let html = '';
        snapshot.forEach(doc => {
            const d = doc.data(); const time = d.timestamp ? formatThaiDateTime(d.timestamp.toMillis()) : '-';
            let siteDisplay = d.siteKey === "SYSTEM" ? `<span class="text-slate-400 font-medium italic">SYSTEM</span>` : `<span class="font-mono text-blue-600 font-bold">${(d.siteKey||'').toUpperCase()}</span>`;
            let badgeClass = 'bg-slate-100 text-slate-600';
            if (d.action.includes("AUTH")) badgeClass = 'bg-green-100 text-green-700'; else if (d.action.includes("UPDATE")) badgeClass = 'bg-blue-100 text-blue-700'; else if (d.action.includes("DELETE")) badgeClass = 'bg-red-100 text-red-700'; else if (d.action.includes("ADD") || d.action.includes("EDIT")) badgeClass = 'bg-yellow-100 text-yellow-700';
            html += `<tr class="hover:bg-slate-50 border-b border-slate-100 text-center"><td class="p-2 border text-[10px] font-mono">${time}</td><td class="p-2 border text-[11px]">${d.userEmail || 'System'}</td><td class="p-2 border text-[11px]">${siteDisplay}</td><td class="p-2 border"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeClass}">${d.action}</span></td><td class="p-2 border text-left text-[11px] text-slate-600">${d.details}</td></tr>`;
        });
        tableBody.innerHTML = html;

        
        if (pageDisplay) pageDisplay.innerText = currentLogPage;
        if (prevBtn) prevBtn.disabled = (currentLogPage === 1);
        if (nextBtn) nextBtn.disabled = (snapshot.docs.length < 100);

    } catch (error) { 
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-red-500 py-4 font-bold">เกิดข้อผิดพลาด: ${error.message}</td></tr>`; 
    }
};

window.changeLogPage = function(direction) {
    showActivityLogs(direction);
};
window.openLogModal = function() {
    const modal = document.getElementById('logModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    document.body.classList.add('overflow-hidden');
};

window.closeLogModal = function() {
    const modal = document.getElementById('logModal');
    if (modal) {
        modal.classList.add('hidden');
    }

    document.body.classList.remove('overflow-hidden');
    
    const siteFilter = document.getElementById('logSiteFilter');
    const actionFilter = document.getElementById('logActionFilter');
    
    if (siteFilter) siteFilter.value = 'all';
    if (actionFilter) actionFilter.value = 'all';
    
    const tableBody = document.getElementById('logTableBody');
    if (tableBody) tableBody.innerHTML = '';
};

window.toggleBetongView = function(viewType) {
   
    document.getElementById('betong-main-view').classList.add('hidden');
    
    
    const sub1 = document.getElementById('betong-sub-view-1');
    if (sub1) sub1.classList.add('hidden');
    
    const sub2 = document.getElementById('betong-sub-view-2');
    if (sub2) sub2.classList.add('hidden');
    
    const sub3 = document.getElementById('betong-sub-view-3');
    if (sub3) sub3.classList.add('hidden');

 
    if (viewType === 'sub1' && sub1) {
        sub1.classList.remove('hidden');
    } else if (viewType === 'sub2' && sub2) {
        sub2.classList.remove('hidden');
    } else if (viewType === 'sub3' && sub3) {
        sub3.classList.remove('hidden');
    } else {
        document.getElementById('betong-main-view').classList.remove('hidden');
    }
    
    if (typeof imageMapResize === 'function') { imageMapResize(); }
    window.updateDeviceStatusOverlays('betong');
};

function parseDeviceSelection(deviceName) {
    if (typeof deviceName !== 'string') return { mainDevice: deviceName, subDevice: null };
    const parts = deviceName.split(' / ').map(p => p.trim()).filter(Boolean);
    if (parts[0] === 'other' && parts.length > 1) {
        return { mainDevice: 'other', subDevice: parts.slice(1).join(' / ') };
    }
    return { mainDevice: deviceName.trim(), subDevice: null };
}

window.openForm = async function(deviceName) {
    const { mainDevice, subDevice } = parseDeviceSelection(deviceName);
    currentDevice = mainDevice; editIndex = -1;
    document.getElementById('formTitle').textContent = `บันทึกข้อมูล: ${deviceName}`;
    const othersContainer = document.getElementById('othersDeviceContainer');
    const othersSelect = document.getElementById('othersDeviceSelect');
    
  
    if (mainDevice === 'other' && (currentSiteKey === 'phrao' || currentSiteKey === 'betong' || currentSiteKey === 'ko-phaluay')) { 
        othersContainer.classList.remove('hidden'); 
        let optionsHtml = '';
        
        if (currentSiteKey === 'phrao') {
            optionsHtml = `
                <option value="Office">Office</option>
                <option value="Current Transformer">Current Transformer</option>
                <option value="Voltage Transformer">Voltage Transformer</option>
                <option value="Step-up Transformer 5 MVA">Step-up Transformer 5 MVA</option>
                <option value="Service Transformer 160 KVA">Service Transformer 160 KVA</option>
                <option value="Disconnecting Switch">Disconnecting Switch</option>
                <option value="Fire Alarm">Fire Alarm System</option>
                <option value="PQ Meter">PQ Meter</option>
                <option value="Power Meter">Power Meter</option>
                <option value="The Other">The Other</option>`;
        } else if (currentSiteKey === 'betong') {
            optionsHtml = `
                <option value="Office">Office</option>
                 <option value="SVG">SVG</option>
                <option value="Fire Alarm System">Fire Alarm System</option>
                <option value="The Other">The Other</option>`;
        } else if (currentSiteKey === 'ko-phaluay') {
            optionsHtml = `
                <option value="ระบบควบคุมอาคาร">ระบบควบคุมอาคาร</option>
                <option value="เครื่องปรับอากาศ">เครื่องปรับอากาศ</option>
                <option value="Cable">Cable</option>
                <option value="Riser Pole">Riser Pole</option>
                <option value="ไฟฉุกเฉิน">ไฟฉุกเฉิน</option>
                <option value="ถังดับเพลิง">ถังดับเพลิง</option>
                <option value="PQM">PQM</option>
                <option value="Generator">Generator</option>
                <option value="PV">PV</option>
                <option value="Battery">Battery</option>
                <option value="โทรศัพท์">โทรศัพท์</option>
                <option value="วิทยุสื่อสาร">วิทยุสื่อสาร</option>
                <option value="Breaker">Breaker</option>
                <option value="Recloser">Recloser</option>
                <option value="The Other">The Other</option>`;
        }
        othersSelect.innerHTML = optionsHtml;
        if (subDevice) {
            const hasOption = Array.from(othersSelect.options).some(opt => opt.value === subDevice);
            othersSelect.value = hasOption ? subDevice : othersSelect.options[0]?.value;
        }
    } else { 
        othersContainer.classList.add('hidden'); 
    }

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
    document.getElementById('docMinistry').value = ''; document.getElementById('docPEA').value = '';
    document.getElementById('brokenFile').value = ''; document.getElementById('brokenFileLink').innerHTML = '';
    document.getElementById('fixedFile').value = ''; document.getElementById('fixedFileLink').innerHTML = '';
    
    const othersSelect = document.getElementById('othersDeviceSelect');
    if(othersSelect) othersSelect.selectedIndex = 0;
    editIndex = -1; document.getElementById('editHint').classList.add('hidden');
}

function isValidDate(str) { if (!str) return false; const d = new Date(str); return d instanceof Date && !isNaN(d); }

async function uploadFileToStorage(file, folderName) {
    if (!file) return null;
    const ref = storage.ref().child(`attachments/${currentSiteKey}/${currentDevice}/${folderName}/${Date.now()}_${file.name}`);
    await ref.put(file);
    return await ref.getDownloadURL();
}

window.saveData = async function() {
    if (!canAcknowledgeIssue(currentSiteKey)) { Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์บันทึกข้อมูลในสถานที่นี้', 'error'); return false; }
    if (!currentUser || !currentDevice) return false;

    let statusVal = document.getElementById('status').value;
    const brokenDate = document.getElementById('brokenDate').value;
    const fixedDate = document.getElementById('fixedDate').value;
    const isEditing = editIndex >= 0;
    const currentUserStr = document.getElementById('userName').value || "ไม่ระบุ";
    let statusTextTH = statusVal === 'down' ? 'ชำรุด' : (statusVal === 'abnormal' ? 'ผิดปกติ' : 'ใช้งานได้');

    const confirmResult = await Swal.fire({ title: isEditing ? 'ยืนยันการแก้ไข?' : 'ยืนยันการเพิ่มข้อมูล?', text: `บันทึกสถานะ ${currentDevice} เป็น "${statusTextTH}" ใช่หรือไม่?`, icon: 'question', showCancelButton: true, confirmButtonColor: '#2563eb', cancelButtonColor: '#64748b', confirmButtonText: 'ยืนยันบันทึก', cancelButtonText: 'ยกเลิก' });
    if (!confirmResult.isConfirmed) return false;

    if (isValidDate(brokenDate) && isValidDate(fixedDate)) statusVal = 'ok';
    if (editIndex < 0 && statusVal === 'ok') { Swal.fire({ title: "ไม่อนุญาต", text: "การเพิ่มรายการใหม่ต้องเป็นสถานะ ชำรุด หรือ ผิดปกติ", icon: "warning" }); return false; }
    if (currentUserRole === 'engineer' && !isEditing && (statusVal === 'down' || statusVal === 'abnormal')) { Swal.fire('ไม่อนุญาต', 'Engineer ไม่สามารถเพิ่มรายการแจ้งชำรุดใหม่ได้', 'warning'); return false; }
    if (statusVal === 'ok' && !canMarkFixed(currentSiteKey)) { Swal.fire('ไม่อนุญาต', 'เฉพาะ Engineer หรือ Admin เท่านั้นที่แจ้งซ่อมแล้วเสร็จได้', 'warning'); return false; }
    
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999); 
    if (brokenDate && isValidDate(brokenDate) && new Date(brokenDate) > todayEnd) { Swal.fire("วันที่ผิดพลาด", "วันที่เกิดเหตุเป็นอนาคตไม่ได้", "warning"); return false; }
    if (fixedDate && isValidDate(fixedDate) && new Date(fixedDate) > todayEnd) { Swal.fire("วันที่ผิดพลาด", "วันที่ซ่อมแซมเป็นล่วงหน้า (อนาคต) ไม่ได้", "warning"); return false; }
    
    if ((statusVal === 'down' || statusVal === 'abnormal') && !isValidDate(brokenDate)) { Swal.fire("ข้อมูลไม่ครบ", "กรุณาเลือกวันที่", "warning"); return false; }
    if (statusVal === 'ok') {
        if (!isValidDate(brokenDate) || !isValidDate(fixedDate)) { Swal.fire("ข้อมูลไม่ครบ", "กรุณากรอกวันที่ให้ครบ", "warning"); return false; }
        if (new Date(brokenDate) > new Date(fixedDate)) { Swal.fire("วันที่ผิดพลาด", "วันที่ซ่อมแซมต้องหลังวันที่เกิดเหตุ", "warning"); return false; }
    }

    const brokenFile = document.getElementById('brokenFile').files[0];
    const fixedFile = document.getElementById('fixedFile').files[0];
    const MAX_SIZE = 5 * 1024 * 1024;
    if (brokenFile && brokenFile.size > MAX_SIZE) { Swal.fire('ไฟล์ใหญ่เกินไป', 'หลักฐานแจ้งเสีย ต้องขนาดไม่เกิน 5 MB', 'warning'); return false; }
    if (fixedFile && fixedFile.size > MAX_SIZE) { Swal.fire('ไฟล์ใหญ่เกินไป', 'หลักฐานซ่อมแซม ต้องขนาดไม่เกิน 5 MB', 'warning'); return false; }

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    let records = await getDeviceRecords(currentSiteKey, currentDevice); 
    if (statusVal === 'ok' && isEditing) {
        const originalRecord = records[editIndex];
        if (!originalRecord?.acknowledgedAt) {
            Swal.fire('ยังไม่ได้รับทราบ', 'ต้องกด "รับทราบ" ก่อน จึงจะเปลี่ยนสถานะเป็นใช้งานได้', 'warning');
            return false;
        }
    }
    let baseRec = {
        status: statusVal, brokenDate, fixedDate,
        description: document.getElementById('description').value,
        solution: document.getElementById('solution').value, 
        orderNumber: document.getElementById('orderNumber').value,
        repairCost: document.getElementById('repairCost').value,
        docMinistry: document.getElementById('docMinistry').value,
        docPEA: document.getElementById('docPEA').value,
        ts: Date.now(), counted: true 
    };

    if (currentDevice === 'other' && (currentSiteKey === 'phrao' || currentSiteKey === 'betong' || currentSiteKey === 'ko-phaluay')) { 
        baseRec.subDevice = document.getElementById('othersDeviceSelect').value; 
    }
   if (!isEditing) baseRec.brokenAt = Date.now();
   if (editIndex >= 0) {
        const originalRecord = records[editIndex];
        baseRec.customId = originalRecord.customId;
        baseRec.brokenFileUrl = originalRecord.brokenFileUrl || null;
        baseRec.brokenFileType = originalRecord.brokenFileType || null;
        baseRec.fixedFileUrl = originalRecord.fixedFileUrl || null;
        baseRec.fixedFileType = originalRecord.fixedFileType || null;
        baseRec.ts = originalRecord.ts;
        baseRec.brokenUser = originalRecord.brokenUser || originalRecord.user || currentUserStr;
        baseRec.brokenUserPos = originalRecord.brokenUserPos || '';
        baseRec.brokenUserDept = originalRecord.brokenUserDept || '';

       if (statusVal === 'ok' && !originalRecord.fixedDate) {
            baseRec.fixedUser = currentUserStr; baseRec.fixedUserPos = currentUserPosition; baseRec.fixedUserDept = currentUserDept;
            baseRec.fixedAt = Date.now();
        } else {
            baseRec.fixedUser = originalRecord.fixedUser || (originalRecord.fixedDate ? originalRecord.user : null);
            baseRec.fixedUserPos = originalRecord.fixedUserPos || ''; baseRec.fixedUserDept = originalRecord.fixedUserDept || '';
            baseRec.fixedAt = originalRecord.fixedAt || null;
        }
        baseRec.user = currentUserStr;
        baseRec.brokenAt = originalRecord.brokenAt || originalRecord.ts || Date.now();

    } else {
       baseRec.customId = await generateAutoId(currentSiteKey);
       baseRec.brokenUser = currentUserStr; baseRec.brokenUserPos = currentUserPosition; baseRec.brokenUserDept = currentUserDept; baseRec.user = currentUserStr;

        if (statusVal === 'ok') { baseRec.fixedUser = currentUserStr; baseRec.fixedUserPos = currentUserPosition; baseRec.fixedUserDept = currentUserDept; baseRec.fixedAt = Date.now(); }
    }
    try {
        if (brokenFile) { baseRec.brokenFileUrl = await uploadFileToStorage(brokenFile, 'broken'); baseRec.brokenFileType = brokenFile.type; }
        if (fixedFile) { baseRec.fixedFileUrl = await uploadFileToStorage(fixedFile, 'fixed'); baseRec.fixedFileType = fixedFile.type; }
    } catch (err) { Swal.fire("อัปโหลดไฟล์ล้มเหลว", err.message, "error"); return false; }

    if (editIndex >= 0) {
        records[editIndex] = { ...records[editIndex], ...baseRec };
        if (statusVal === 'ok' && (records[editIndex].status === 'down' || records[editIndex].status === 'abnormal')) records[editIndex].counted = true;
        editIndex = -1; document.getElementById('editHint').classList.add('hidden');
    } else {
        if (statusVal === 'ok' && brokenDate && fixedDate) baseRec.counted = true;
        records.push(baseRec);
    }

const docRef = getSiteCollection(currentSiteKey).doc(currentDevice);
const snap = await docRef.get();
const assetInfo = snap.exists ? (snap.data().assetInfo || null) : null;
await saveDeviceRecords(currentSiteKey, currentDevice, records);


const count = records.filter(r => r.status === 'down' || r.status === 'abnormal').length;


if ((statusVal === 'down' || statusVal === 'abnormal') && !isEditing) {
    await sendEmailNotify('down', currentDevice, baseRec, assetInfo, count);
}

if (statusVal === 'ok') {

    if (baseRec.solution && baseRec.fixedDate) {
        await sendEmailNotify('fixed', currentDevice, baseRec, assetInfo, null);
    }
}
clearForm(); 
await loadHistory(); 
window.updateDeviceSummary();
window.updateDeviceStatusOverlays(currentSiteKey); 


Swal.fire("บันทึกเรียบร้อย", "", "success");
await createLog(isEditing ? "EDIT_RECORD" : "ADD_RECORD", isEditing ? `แก้ไขข้อมูลประวัติ ${currentDevice}` : `เพิ่มประวัติให้ ${currentDevice}`);
await createLog("UPDATE_STATUS", `อุปกรณ์ ${currentDevice} มีสถานะเป็น: ${statusTextTH}`);
return true;
};

function updateAssetDisplays(assetInfo) {
const statusEl = document.getElementById('warrantyStatusDisplay'); const infoEl = document.getElementById('assetInfoDisplay');
if (assetInfo && assetInfo.warrantyEnd) {
statusEl.innerHTML = getWarrantyStatusHTML(getWarrantyStatus(assetInfo.warrantyEnd));
let infoParts = [];
if (assetInfo.model) infoParts.push(`รุ่น: ${escapeHtml(assetInfo.model)}`); if (assetInfo.serial) infoParts.push(`S/N: ${escapeHtml(assetInfo.serial)}`); if (assetInfo.peaNo) infoParts.push(`PEA No. : ${escapeHtml(assetInfo.peaNo)}`);
infoEl.innerHTML = infoParts.join(' | ') || 'ลงทะเบียนแล้ว';
} else { statusEl.innerHTML = '<span class="tag tag-warranty-bad">🚫 ยังไม่ลงทะเบียน</span>'; infoEl.innerHTML = '"ดู/แก้ไขข้อมูลทรัพย์สิน"'; }
}

window.loadHistory = async function() {
    const container = document.getElementById('historySection'); 
    container.innerHTML = '';
    if (!currentDevice) return;

    const docRef = getSiteCollection(currentSiteKey).doc(currentDevice);
    let docData = null, records = [], assetInfo = null;

    try {   
        const snap = await docRef.get({ source: 'server' }); 
        if (snap.exists) { 
            docData = snap.data(); 
            records = docData.records || []; 
            assetInfo = docData.assetInfo || null; 
        }
    } catch (e) { 
        container.innerHTML = '<p>Error loading data</p>'; 
        return; 
    }

    updateAssetDisplays(assetInfo);

    if (document.getElementById('filterBrokenHistory')?.checked) {
        records = records.filter(r => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null'));
    }

    records.sort((a, b) => b.ts - a.ts); 
    if (records.length === 0) { 
        container.innerHTML = '<p class="text-center py-4 text-gray-400">ไม่พบประวัติการบันทึกสำหรับอุปกรณ์นี้</p>'; 
        return; 
    }

    // ตรวจสอบสิทธิ์การแก้ไข (viewer จะไม่มีสิทธิ์)
    const canEdit = canAcknowledgeIssue(currentSiteKey) ? '' : 'disabled title="ไม่มีสิทธิ์จัดการข้อมูล" style="opacity: 0.5; cursor: not-allowed;"';
    
    records.forEach((r, index) => {
        const recordSequence = records.length - index; 
        let duration = '-';
        if (r.brokenDate) {
            if (r.fixedDate && r.fixedDate !== '-' && r.fixedDate !== '') { 
                duration = formatDuration(calculateDaysDifference(r.brokenDate, r.fixedDate)); 
            } else { 
                duration = formatDuration(calculateDaysDifference(r.brokenDate, null)) + ' <span class="text-sm text-red-500 font-semibold">(ยังไม่ได้ซ่อมแซม)</span>'; 
            }
        }

        let statusClass = 'tag-ok', statusText = '✅ ใช้งานได้';
        if(r.status === 'down') { statusClass = 'tag-bad'; statusText = '❎ ชำรุด'; }
        else if(r.status === 'abnormal') { statusClass = 'tag-warn'; statusText = '⚠️ ผิดปกติ'; }
        if (r.acknowledgedAt && (r.status === 'down' || r.status === 'abnormal') && !r.fixedDate) { statusClass = 'tag-warn'; statusText += ' • 🛠️ กำลังซ่อมแซม'; }

        let subTag = r.subDevice ? `<span class="tag bg-blue-100 text-blue-800 ml-2 border border-blue-200">${r.subDevice}</span>` : '';

        // --- ส่วนที่แก้ไข: ตรวจสอบสิทธิ์การมองเห็นรูปภาพ (Requirement 2) ---
        let filesHtml = '';
        if (currentUserRole !== 'viewer') {
            let brokenLinkHtml = r.brokenFileUrl ? `<a href="${r.brokenFileUrl}" target="_blank" class="text-blue-500 hover:underline inline-flex items-center gap-1">📄 หลักฐานแจ้งปัญหา</a>` : '';
            let fixedLinkHtml = r.fixedFileUrl ? `<a href="${r.fixedFileUrl}" target="_blank" class="text-green-600 hover:underline inline-flex items-center gap-1">📄 หลักฐานซ่อมแซม</a>` : '';
            
            if (brokenLinkHtml || fixedLinkHtml) {
                filesHtml = `<div class="mt-2 pt-2 border-t border-gray-100 flex gap-4 text-xs font-semibold">${brokenLinkHtml} ${fixedLinkHtml}</div>`;
            }
        } else {
            // กรณีเป็น viewer และมีการอัปโหลดรูปไว้ ให้แสดงข้อความแจ้งเตือนแทนการแสดงลิงก์
            if (r.brokenFileUrl || r.fixedFileUrl) {
                filesHtml = `<div class="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400 italic">🔒 รูปภาพ/ไฟล์แนบถูกจำกัดสิทธิ์เฉพาะ Editor/Admin</div>`;
            }
        }
        // -----------------------------------------------------------

        const div = document.createElement('div');
        div.className = 'p-4 mb-3 border border-gray-200 bg-white rounded-lg shadow-sm'; 

        div.innerHTML = `
            <div class="flex justify-between items-center border-b border-gray-100 pb-2 mb-2">
                <div class="flex flex-col flex-1">
                    <div class="flex justify-between items-center w-full">
                        <div class="text-lg font-bold text-slate-800"><span class="tag ${statusClass}">${statusText}</span>${subTag}</div>
                        <div class="text-base text-gray-500 font-medium">ครั้งที่ ${recordSequence}</div>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mt-1">
                        <div class="space-y-1">
                            <div><span class="text-red-600">ชื่อผู้แจ้งเหตุ :</span> <span class="font-semibold text-slate-700">${escapeHtml(r.brokenUser ? r.brokenUser : (r.user || 'ไม่ระบุ'))}</span></div>
                            <div><span class="text-green-600">ชื่อผู้แจ้งซ่อมแซม :</span> <span class="font-semibold text-slate-700">${escapeHtml(r.fixedUser ? r.fixedUser : '-')}</span></div>
                            <div><span class="text-amber-600">ชื่อผู้รับทราบ :</span> <span class="font-semibold text-slate-700">${escapeHtml(r.acknowledgedBy || '-')}</span></div>
                        </div>
                        <div class="space-y-1 md:text-right text-slate-500">
                            <div>${(r.brokenAt || r.ts) ? formatThaiDateTime(r.brokenAt || r.ts) : '-'}</div>
                            <div>${(r.fixedAt || (r.fixedDate ? r.ts : null)) ? formatThaiDateTime(r.fixedAt || r.ts) : '-'}</div>
                            <div>${r.acknowledgedAt ? formatThaiDateTime(r.acknowledgedAt) : '-'}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-y-2 text-sm text-gray-600">
                <div>วันที่เกิดเหตุ : ${formatThaiDate(r.brokenDate)}</div><div>วันที่ซ่อมแซม : ${formatThaiDate(r.fixedDate)}</div>
                <div>เลขที่ใบสั่ง : <span class="font-semibold text-blue-700">${escapeHtml(r.orderNumber || '-')}</span></div>
                <div>ราคาซ่อมแซม : <span class="font-semibold text-orange-600">${r.repairCost ? Number(r.repairCost).toLocaleString() + ' บาท' : '-'}</span></div>
                <div>หนังสือ มท : <span class="font-semibold">${escapeHtml(r.docMinistry || '-')}</span></div>
                <div>หนังสือ กฟภ. : <span class="font-semibold">${escapeHtml(r.docPEA || '-')}</span></div>
                <div class="col-span-2 text-red-600">ระยะเวลาที่เกิดเหตุ: ${duration}</div>
            </div>
            <div class="mt-3 text-sm text-blue-700 "><b>รายละเอียดปัญหา :</b> "${escapeHtml(r.description || '-')}"</div>
            <div class="mt-1 text-sm text-blue-700"><b>วิธีแก้ไข :</b> ${escapeHtml(r.solution || '-')}</div>
            
            ${filesHtml}
            
            <div class="mt-3 flex justify-end space-x-2">
                ${((r.status === 'down' || r.status === 'abnormal') && !r.fixedDate && !r.acknowledgedAt && canAcknowledgeIssue(currentSiteKey)) ? `<button class="btn btn-ghost text-amber-700 hover:bg-amber-50 py-1" onclick="acknowledgeRecord('${r.ts}')">🛠️ รับทราบ</button>` : ''}
                ${currentUserRole !== 'viewer' ? `
                    <button class="btn btn-ghost text-blue-600 hover:bg-blue-50 py-1" onclick="generateWordCoverLetter('${currentDevice}', '${r.ts}')">📝 สร้างใบแจ้งชำรุด</button>
                ` : ''}
                <button class="btn btn-ghost text-yellow-600 hover:bg-yellow-50 py-1" onclick="editRecord('${r.ts}')" ${canEdit}>✏️ แก้ไขข้อมูล</button>
                <button class="btn btn-ghost text-red-600 hover:bg-red-50 py-1" onclick="deleteRecord('${r.ts}')" ${canEdit}>🗑️ ลบข้อมูล</button>
            </div>
        `;
        container.appendChild(div);
    });
}
window.generateWordCoverLetter = async function(deviceName, ts) {
    try {
        Swal.fire({ title: 'กำลังสร้างเอกสาร...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        let records = await getDeviceRecords(currentSiteKey, deviceName);
        const recordIndex = records.findIndex(rec => String(rec.ts) === String(ts));
        const r = recordIndex >= 0 ? records[recordIndex] : null;
        
        if (!r) {
            Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลประวัติรายการนี้', 'error');
            return;
        }
        if (!r.customId) {
            const generatedId = await generateAutoId(currentSiteKey);
            records[recordIndex].customId = generatedId;
            await saveDeviceRecords(currentSiteKey, deviceName, records);
            r.customId = generatedId;
        }
       let templateUrl = "";
if (currentSiteKey === "phrao") {
    templateUrl = "แบบฟอร์มแจ้งอุปกรณ์ชำรุด.docx";
} else if (currentSiteKey === "ko-phaluay") {
    templateUrl = "รายงานอุปกรณ์ชำรุดสถานีไฟฟ้าไมโครกริดเกาะพะลวย.docx";
} else {
    templateUrl = "แบบฟอร์มแจ้งอุปกรณ์ชำรุด_ทั่วไป.docx";
}
        const response = await fetch(templateUrl);
        if (!response.ok) throw new Error("ไม่พบไฟล์แบบฟอร์มแจ้งอุปกรณ์ชำรุด.docx");
        const arrayBuffer = await response.arrayBuffer();
        
        const dataForWord = {
            userDept: currentUserDept || 'ไม่ระบุสังกัด',
            deviceName: r.subDevice ? `${deviceName} (${r.subDevice})` : deviceName,
            brokenDate: formatThaiDate(r.brokenDate),
            description: r.description || '-',
            userName: currentUserFullName || currentUser.email || 'ไม่ระบุ',
            userPosition: currentUserPosition || '-',
            userPhone: currentUserPhone || '-',
            autoId: r.customId || '-'
        };

const zip = new PizZip(arrayBuffer); 
const Docx = window.docxtemplater || window.Docxtemplater;
const doc = new Docx(zip, {
    paragraphLoop: true,
    linebreaks: true,
});

        doc.render(dataForWord);
        const out = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
        
        saveAs(out, `ใบปะหน้าแจ้งชำรุด_${deviceName.replace(/\s/g, '_')}_${r.brokenDate}.docx`);
        Swal.fire('สำเร็จ', 'ดาวน์โหลดใบปะหน้าเรียบร้อยแล้ว', 'success');

    } catch (error) {
        console.error("Error generating Word doc:", error);
        Swal.fire('ผิดพลาด', 'ไม่สามารถสร้างไฟล์ Word ได้ (กรุณาตรวจสอบว่านำไฟล์ แบบฟอร์มแจ้งอุปกรณ์ชำรุด.docx อัปโหลดไว้ที่เดียวกับเว็บแล้วหรือยัง)', 'error');
    }
}

window.deleteRecord = async function(ts) {
    if (!hasWriteAccess(currentSiteKey)) return;
    if (!currentDevice) return;
    const result = await Swal.fire({ title: 'ลบรายการนี้?', text: "คุณต้องการลบรายการประวัตินี้จริงหรือไม่?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ใช่, ลบ!', cancelButtonText: 'ยกเลิก' });
    if (!result.isConfirmed) return;

    let records = await getDeviceRecords(currentSiteKey, currentDevice);
    const idx = records.findIndex(r => String(r.ts) === String(ts));
    if (idx < 0) return;
    
    const recordToDelete = records[idx];
    const dateRef = formatThaiDate(recordToDelete.brokenDate) || formatThaiDate(recordToDelete.fixedDate) || "ไม่ระบุวันที่";
    
    if (recordToDelete.brokenFileUrl) {
        try { await firebase.storage().refFromURL(recordToDelete.brokenFileUrl).delete(); } catch(e) { console.warn("Failed to delete brokenFile:", e); }
    }
    if (recordToDelete.fixedFileUrl) {
        try { await firebase.storage().refFromURL(recordToDelete.fixedFileUrl).delete(); } catch(e) { console.warn("Failed to delete fixedFile:", e); }
    }

    records.splice(idx, 1);
    await saveDeviceRecords(currentSiteKey, currentDevice, records);
    await createLog("DELETE_RECORD", `ลบประวัติของ ${currentDevice} (รายการวันที่ ${dateRef})`);

    loadHistory(); 
    window.updateDeviceSummary();
    window.updateDeviceStatusOverlays(currentSiteKey); 
    Swal.fire('ลบข้อมูลเรียบร้อย', '', 'success');
}


window.acknowledgeRecord = async function(ts) {
    if (!canAcknowledgeIssue(currentSiteKey)) { Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์รับทราบรายการนี้', 'error'); return; }
    let records = await getDeviceRecords(currentSiteKey, currentDevice);
    const i = records.findIndex(r => String(r.ts) === String(ts));
    if (i < 0) return;
    const r = records[i];
    if (r.fixedDate || (r.status !== 'down' && r.status !== 'abnormal')) return;
    if (r.acknowledgedAt) { Swal.fire('รับทราบแล้ว', 'รายการนี้ถูกกดรับทราบแล้ว', 'info'); return; }
    const userName = currentUserFullName || (currentUser && currentUser.email) || 'ไม่ระบุ';
    records[i] = { ...r, acknowledgedAt: Date.now(), acknowledgedBy: userName, acknowledgedByRole: currentUserRole };
    await saveDeviceRecords(currentSiteKey, currentDevice, records);
    await createLog('ACKNOWLEDGE_ISSUE', `รับทราบอุปกรณ์ ${currentDevice} มีสถานะเป็น ${r.status === 'down' ? 'ชำรุด' : 'ผิดปกติ'}`);
    await loadHistory();
    window.updateDeviceSummary();
    window.updateDeviceStatusOverlays(currentSiteKey);
    Swal.fire('รับทราบแล้ว', '', 'success');
};

window.editRecord = async function(ts) {
    if (!hasWriteAccess(currentSiteKey)) return;
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
    document.getElementById('docMinistry').value = r.docMinistry || ''; document.getElementById('docPEA').value = r.docPEA || ''; 

    if (currentDevice === 'other' && (currentSiteKey === 'phrao' || currentSiteKey === 'betong' || currentSiteKey === 'ko-phaluay') && r.subDevice) {
        document.getElementById('othersDeviceSelect').value = r.subDevice;
    }

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
    const listContainer = document.getElementById('userListContainer'); 
    listContainer.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500">กำลังโหลดข้อมูล...</div>';
    
    listContainer.className = "grid grid-cols-1 md:grid-cols-2 gap-4 p-1";

    try {
        const snapshot = await db.collection('users').get(); 
        if (snapshot.empty) { 
            listContainer.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500">ยังไม่มีผู้ใช้งาน</div>'; 
            return; 
        }
        listContainer.innerHTML = '';
        
        snapshot.forEach(doc => {
            const userData = doc.data(); 
            const email = userData.email; 
            const role = userData.role || 'viewer'; 
            const fullName = userData.fullName || ''; 
            const position = userData.position || ''; 
            const department = userData.department || '';
            const phone = userData.phone || ''; 
            const allowedSites = userData.allowedSites || []; 
            const isMe = (email === currentUser.email); 
            const isAdminMain = (email === ADMIN_EMAIL); 
            const safeId = email.replace(/[@.]/g, ''); 
            
            const div = document.createElement('div'); 
            div.className = 'bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3';
            
            const roleOptions = `
                <option value="viewer" ${role==='viewer'?'selected':''}>Viewer</option>
                <option value="editor" ${role==='editor'?'selected':''}>Editor</option>
                <option value="engineer" ${role==='engineer'?'selected':''}>Engineer</option>
                <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
            `;

            const sitesHtml = Object.keys(sites).map(key => `
                <label class="flex items-center gap-1 text-[10px] whitespace-nowrap cursor-pointer">
                    <input type="checkbox" class="site-cb-${safeId} rounded text-blue-600" value="${key}" ${allowedSites.includes(key) ? 'checked' : ''}>
                    ${sites[key].name.split(' ')[0]}
                </label>
            `).join('');
            
            let deleteBtn = ''; 
            if (!isAdminMain && !isMe) {
                deleteBtn = `
                <button onclick="deleteUser('${email}')" class="text-slate-400 hover:text-red-500 transition-colors p-1" title="ลบผู้ใช้">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>`;
            }

            div.innerHTML = `
                <div class="flex justify-between items-start border-b border-slate-50 pb-2">
                    <div class="truncate">
                        <div class="text-[10px] font-bold text-slate-400 uppercase">Email ${isMe ? '(บัญชีของคุณ)' : ''}</div>
                        <div class="text-sm font-semibold ${isMe ? 'text-blue-600' : 'text-slate-700'} truncate" title="${email}">${email}</div>
                    </div>
                    ${deleteBtn}
                </div>
                
                <div class="grid grid-cols-1 gap-3">
                    <div>
                        <label class="text-[10px] font-bold text-slate-400 uppercase">ชื่อ-นามสกุล</label>
                        <input type="text" id="name-${safeId}" value="${fullName}" class="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 uppercase">ตำแหน่ง</label>
                            <input type="text" id="pos-${safeId}" value="${position}" class="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 uppercase">สังกัด/กอง</label>
                            <input type="text" id="dept-${safeId}" value="${department}" class="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2 items-end">
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 uppercase">เบอร์โทรศัพท์</label>
                            <input type="text" id="phone-${safeId}" value="${phone}" class="w-full text-sm border border-slate-200 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-slate-400 uppercase">สิทธิ์การใช้งาน</label>
                            <select id="role-${safeId}" onchange="document.getElementById('sites-container-${safeId}').style.display = ['editor','engineer'].includes(this.value) ? 'block' : 'none'" class="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 cursor-pointer font-bold">${roleOptions}</select>
                        </div>
                    </div>
                </div>

                <div id="sites-container-${safeId}" style="display: ${['editor','engineer'].includes(role) ? 'block' : 'none'};" class="mt-2 p-2 bg-slate-100 border border-slate-200 rounded-lg">
                    <label class="text-[10px] font-bold text-slate-500 uppercase mb-2 block">✅ สิทธิ์จัดการไซต์ </label>
                    <div class="flex flex-wrap gap-3">${sitesHtml}</div>
                </div>

                <div class="pt-2">
                    <button onclick="updateUserFull('${email}', '${safeId}')" class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-bold shadow-sm flex justify-center items-center gap-2">
                        <span>💾 บันทึกข้อมูล</span>
                    </button>
                </div>
            `;
            listContainer.appendChild(div);
        });
    } catch (error) { 
        listContainer.innerHTML = `<div class="col-span-full text-red-500 text-center py-10">โหลดไม่สำเร็จ: ${error.message}</div>`; 
    }
}

window.updateUserFull = async function(email, safeId) {
    if (currentUserRole !== 'admin') return;
    
    const newRole = document.getElementById(`role-${safeId}`).value;
    const newName = document.getElementById(`name-${safeId}`).value.trim();
    const newPos = document.getElementById(`pos-${safeId}`).value.trim();
    const newDept = document.getElementById(`dept-${safeId}`).value.trim();
    const newPhone = document.getElementById(`phone-${safeId}`).value.trim(); 
    
    const allowedSitesCb = document.querySelectorAll(`.site-cb-${safeId}:checked`);
    const newAllowedSites = Array.from(allowedSitesCb).map(cb => cb.value);

    if (email === ADMIN_EMAIL && newRole !== 'admin') { 
        Swal.fire('ไม่อนุญาต', 'ไม่สามารถลดสิทธิ์ Admin หลักได้', 'error'); 
        return; 
    }

    try { 
        await db.collection('users').doc(email).set({ 
            role: newRole, 
            allowedSites: ['editor','engineer'].includes(newRole) ? newAllowedSites : [],
            fullName: newName, 
            position: newPos, 
            department: newDept,
            phone: newPhone 
        }, { merge: true }); 

        Swal.fire({ icon: 'success', title: `อัปเดตข้อมูล ${email} แล้ว`, timer: 1500, showConfirmButton: false }); 
        await createLog("USER_MANAGEMENT", `แก้ไขข้อมูลของ ${email} (Role: ${newRole}, ชื่อ: ${newName||'-'}, โทร: ${newPhone})`, "SYSTEM"); 

        if(email === currentUser.email) { 
            currentUserFullName = newName; 
            currentUserPosition = newPos;
            currentUserDept = newDept;
            currentUserPhone = newPhone;
            currentUserAllowedSites = ['editor','engineer'].includes(newRole) ? newAllowedSites : [];
            document.getElementById('userNameDisplay').textContent = newName ? `${newName} (${email})` : email; 
            toggleWriteAccess(true); 
        } 
        
        loadUsers(); 
    } catch (error) { 
        Swal.fire('ผิดพลาด', error.message, 'error'); 
    }
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
    let summary = []; let totalDevices = 0; let currentBrokenCount = 0; let currentNormalCount = 0;

    for (const dev of siteData.devices) {
        const docData = dataMap[dev]; const records = docData?.records || []; if (records.length > 0) records.sort((a, b) => a.ts - b.ts);
        const subDevices = (dev === 'other' && OTHER_SUBDEVICES[currentSiteKey]) ? OTHER_SUBDEVICES[currentSiteKey] : [null];

        for (const subDeviceName of subDevices) {
            totalDevices++;
            const scopedRecords = subDeviceName ? records.filter(r => (r.subDevice || 'The Other') === subDeviceName) : records;
            let downCount = scopedRecords.filter(r => r.counted).length;
            const isUnresolved = (r) => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null');
            const remainingIssues = scopedRecords.filter(isUnresolved); const remainingCount = remainingIssues.length;
            let latestBrokenDuration = '-', latestBrokenDays = 0, earliestBrokenDate = '-', latestFixedDate = '-'; let currentStatusDisplay = 'ปกติ'; let isDown = false, isAbnormal = false;
            remainingIssues.forEach(r => { if(r.status === 'down') isDown = true; if(r.status === 'abnormal') isAbnormal = true; });
            if (isDown && isAbnormal) currentStatusDisplay = 'ชำรุด / ผิดปกติ'; else if (isDown) currentStatusDisplay = 'ชำรุด'; else if (isAbnormal) currentStatusDisplay = 'ผิดปกติ'; else currentStatusDisplay = 'ปกติ';
            const latestRecord = scopedRecords.length > 0 ? scopedRecords[scopedRecords.length - 1] : null;

            if (remainingCount > 0) {
                currentBrokenCount++; const oldestIssue = remainingIssues[0]; earliestBrokenDate = oldestIssue.brokenDate || '-'; latestFixedDate = '-'; latestBrokenDays = calculateDaysDifference(earliestBrokenDate, null); latestBrokenDuration = formatDuration(latestBrokenDays);
            } else {
                currentNormalCount++;
                if (latestRecord && latestRecord.brokenDate) { earliestBrokenDate = latestRecord.brokenDate; latestFixedDate = latestRecord.fixedDate || '-'; if (latestRecord.fixedDate && latestRecord.fixedDate !== '-') { latestBrokenDays = calculateDaysDifference(latestRecord.brokenDate, latestRecord.fixedDate); latestBrokenDuration = formatDuration(latestBrokenDays); } }
            }

            let dateFilterSource = earliestBrokenDate !== '-' ? earliestBrokenDate : (latestRecord?.brokenDate);
            if (dateFilterSource && dateFilterSource !== '-') { const latestTs = new Date(dateFilterSource).getTime(); if (from && latestTs < new Date(from).getTime()) continue; if (to && latestTs >= new Date(to).getTime() + 86400000) continue; }
            if (filterStatus === 'currently-down' && !isDown) continue; if (filterStatus === 'currently-abnormal' && !isAbnormal) continue;
            if (filterStatus === 'down' && (scopedRecords.length === 0 || remainingCount > 0)) continue;
            if (filterStatus === 'clean' && scopedRecords.length > 0) continue;

            const deviceLabel = subDeviceName ? `${dev} / ${subDeviceName}` : dev;
            if (search && !deviceLabel.toLowerCase().includes(search)) continue;

            summary.push({ device: deviceLabel, count: downCount, remaining: remainingCount, brokenDate: earliestBrokenDate, fixedDate: latestFixedDate, status: currentStatusDisplay, latestDescription: latestRecord?.description || '-', latestSolution: latestRecord?.solution || '-', latestBrokenDuration: latestBrokenDuration, latestBrokenDays: latestBrokenDays });
        }
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
            tr.innerHTML = `<td class="p-4"><div class="font-bold text-slate-700 group-hover:text-blue-600 transition-colors">${escapeHtml(s.device)}</div></td><td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold ${s.count > 0 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}">${s.count} / ${s.remaining}</span></td> <td class="p-4 text-center text-xs text-slate-500 font-mono">${formatThaiDate(s.brokenDate)}</td><td class="p-4 text-center text-xs text-slate-500 font-mono">${formatThaiDate(s.fixedDate)}</td><td class="p-4 text-center">${statusBadge}</td><td class="p-4 text-center"><span class="text-xs font-bold ${(s.status !== 'ปกติ') ? 'text-red-500' : 'text-slate-600'}">${s.latestBrokenDuration}</span></td><td class="p-4"><p class="text-xs text-slate-500 truncate max-w-[150px]" title="${escapeHtml(s.latestDescription)}">${escapeHtml(s.latestDescription || '-')}</p></td><td class="p-4"><p class="text-xs text-slate-500 truncate max-w-[150px]" title="${escapeHtml(s.latestSolution)}">${escapeHtml(s.latestSolution || '-')}</p></td>`;
            tr.onclick = () => window.openForm(s.device); tbody.appendChild(tr);
        });
    }

    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.className = "flex items-center justify-between px-6 py-4 bg-slate-50/50";
        pagination.innerHTML = `<div class="text-xs font-bold text-slate-400 uppercase tracking-widest">Showing ${startIndex + 1} to ${Math.min(startIndex + pageSize, summary.length)} of ${summary.length} entries</div><div class="flex items-center gap-1"><button onclick="changePage(-1)" ${currentPage===1?'disabled':''} class="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg></button><div class="px-4 py-1 bg-white rounded-lg shadow-sm border border-slate-200 text-sm font-bold text-blue-600">${currentPage} / ${totalPages}</div><button onclick="changePage(1)" ${currentPage===totalPages?'disabled':''} class="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg></button></div>`;
    }
    if (typeof renderDashboardCharts === 'function') {
       renderDashboardCharts(currentSiteKey);
    }
};



window.chart1 = null;
window.chart2 = null;

window.renderDashboardCharts = async function(siteKey) {
    console.log("กำลังเริ่มคำนวณกราฟสำหรับ:", siteKey);
    const docs = await getAllDevicesDocs(siteKey);
    let allDevicesData = [];
    
    // ปรับปรุงฟังก์ชันแปลงวันที่ให้รองรับทั้ง / และ -
    const parseDate = (dateStr) => {
        if (!dateStr || dateStr === '-' || dateStr.toString().trim() === '') return null;
        
        // แยกส่วนวันที่โดยรองรับทั้ง / หรือ -
        const parts = dateStr.toString().split(/[\/-]/); 
        if (parts.length !== 3) return null;
        
        // สร้าง Date โดยพยายามเดาตำแหน่ง: 
        // ถ้า parts[0] มี 4 หลัก (ปี) -> YYYY-MM-DD
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        
        return new Date(year, month - 1, day).getTime();
    };

    docs.forEach(doc => {
        const d = doc.data();
        let broken = 0, fixed = 0, totalDays = 0;
        
        if (d.records && Array.isArray(d.records)) {
            d.records.forEach(r => {
                const brokenTime = parseDate(r.brokenDate);
                const isFixed = r.fixedDate && r.fixedDate !== '-' && r.fixedDate !== '';
                const fixedTime = isFixed ? parseDate(r.fixedDate) : Date.now();
                
                if (brokenTime) {
                    if (isFixed) fixed++; else broken++;
                    const diffDays = Math.max(0, (fixedTime - brokenTime) / (1000 * 60 * 60 * 24));
                    totalDays += diffDays;
                }
            });
        }

        allDevicesData.push({
            name: doc.id,
            broken: broken,
            fixed: fixed,
            avgDays: (fixed + broken) > 0 ? (totalDays / (fixed + broken)) : 0
        });
    });

    // ถ้าไม่มีข้อมูลเลย ให้แสดงรายการว่างไว้ป้องกันกราฟพัง
    if (allDevicesData.length === 0) allDevicesData = [{ name: 'ไม่มีข้อมูล', broken: 0, fixed: 0, avgDays: 0 }];

    // --- วาดกราฟ 1 ---
    const top10 = allDevicesData.sort((a, b) => (b.broken + b.fixed) - (a.broken + a.fixed)).slice(0, 10);
    if (window.chart1) window.chart1.destroy();
    window.chart1 = new Chart(document.getElementById('topDefectsStackedChart'), {
        type: 'bar',
        data: {
            labels: top10.map(d => d.name),
            datasets: [
                { label: 'ยังไม่ซ่อม', data: top10.map(d => d.broken), backgroundColor: '#ef4444' },
                { label: 'ซ่อมแล้ว', data: top10.map(d => d.fixed), backgroundColor: '#10b981' }
            ]
        },
        options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true } } }
    });

    // --- วาดกราฟ 2 ---
    const top10MTTR = allDevicesData.sort((a, b) => b.avgDays - a.avgDays).slice(0, 10);
    if (window.chart2) window.chart2.destroy();
    window.chart2 = new Chart(document.getElementById('avgRepairTimeChart'), {
        type: 'bar',
        data: {
            labels: top10MTTR.map(d => d.name),
            datasets: [{
                label: 'วันเฉลี่ย',
                data: top10MTTR.map(d => Number(d.avgDays.toFixed(1))),
                backgroundColor: '#3b82f6'
            }]
        },
        options: { indexAxis: 'y', responsive: true, scales: { x: { beginAtZero: true } } }
    });
};
window.changePage = function(step) { currentPage += step; if (currentPage < 1) currentPage = 1; window.updateDeviceSummary(); }

window.updateDeviceStatusOverlays = async function(siteKey, useCache = false) {
    const mapContainer = document.getElementById(`map-${siteKey}`); 
    if (!mapContainer) return;
    
    mapContainer.querySelectorAll('.device-overlay').forEach(el => el.remove());
    if (currentUserRole === 'viewer') return; 
    
    if (!useCache) {
        const docsSnap = await getAllDevicesDocs(siteKey); 
        cachedDeviceStatus[siteKey] = {};
        docsSnap.forEach(d => { if (d.data() && d.data().currentStatus) cachedDeviceStatus[siteKey][d.id] = d.data().currentStatus; });
    }
    const devicesStatus = cachedDeviceStatus[siteKey] || {};

    let mapElements = [];
    if (siteKey === 'betong') {
        const visibleView = mapContainer.querySelector('.view-wrapper:not(.hidden)');
        if (visibleView) mapElements = visibleView.querySelectorAll('map');
    } else {
        mapElements = mapContainer.querySelectorAll('map');
    }

    mapElements.forEach(mapElement => {
        mapElement.querySelectorAll('area').forEach(area => {
            const deviceName = area.getAttribute('alt'); 
            if(!deviceName || deviceName === 'The other' || deviceName === 'To Powerstore' || deviceName === 'Back to Main') return; 
            const status = devicesStatus[deviceName] || 'ok'; 
            const coordsAttr = area.getAttribute('coords'); 
            if(!coordsAttr) return;
            
            const coords = coordsAttr.split(',').map(c => parseInt(c.trim())); 
            const shape = area.getAttribute('shape');
            
            let x, y, width, height;
            if (shape === 'rect' && coords.length === 4) { 
                x = coords[0]; y = coords[1]; width = Math.max(coords[2] - coords[0], 10); height = Math.max(coords[3] - coords[1], 10); 
            } else return; 
            
            const overlay = document.createElement('div');
            if (status === 'down') overlay.className = 'device-overlay down'; 
            else if (status === 'abnormal') overlay.className = 'device-overlay abnormal'; 
            else overlay.className = 'device-overlay normal'; 
            
            overlay.style.left = `${x}px`; overlay.style.top = `${y}px`; 
            overlay.style.width = `${width}px`; overlay.style.height = `${height}px`; 
            overlay.setAttribute('title', deviceName);
            mapContainer.appendChild(overlay);
        });
    });
};

let unsubscribe = null; 
function setupRealtimeListener(siteKey) {
  if (unsubscribe) unsubscribe(); if (!firebase.auth().currentUser) return; 
  unsubscribe = db.collection(`sites`).doc(siteKey).collection(`devices`).onSnapshot(snapshot => { window.updateDeviceSummary(); window.updateDeviceStatusOverlays(siteKey); }, (error) => { if (error.code !== 'permission-denied') console.error("Listener Error:", error); });
}

async function processAndSaveImport(assetsToImport, recordsToImport, importedGroupMap = {}) {
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
            for (const r of (existingData.records || [])) {
                const key = r.customId || `ts-${r.ts}`;
                finalRecordsMap.set(key, r);
            }
            for (const r of (recordMap.get(deviceName) || [])) {
                const key = r.customId || `ts-${r.ts}`;
                if (!finalRecordsMap.has(key)) { finalRecordsMap.set(key, r); }
            }

            const finalRecords = Array.from(finalRecordsMap.values()); 
            finalRecords.sort((a, b) => a.ts - b.ts);

            const downCount = finalRecords.filter(r => r.counted).length; 
            const unresolvedIssues = finalRecords.filter(r => 
                (r.status === 'down' || r.status === 'abnormal') && 
                (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null')
            );

            let currentStatus = 'ok'; 
            if (unresolvedIssues.some(r => r.status === 'down')) currentStatus = 'down'; 
            else if (unresolvedIssues.some(r => r.status === 'abnormal')) currentStatus = 'abnormal';

            batch.set(docRef, { 
                assetInfo: finalAssetInfo, 
                records: finalRecords, 
                downCount: downCount, 
                currentStatus: currentStatus 
            });
        }

        await batch.commit(); 

        // --- Restore groups ถ้ามีข้อมูลกลุ่มใน Excel ---
        if (Object.keys(importedGroupMap).length > 0) {
            try {
                const groupDocRef = db.collection('site_asset_groups').doc(currentSiteKey);
                const existingGroupSnap = await groupDocRef.get();
                const existingGroups = (existingGroupSnap.exists && existingGroupSnap.data().groups) ? existingGroupSnap.data().groups : [];
                // Merge: ถ้ากลุ่มชื่อนี้มีแล้วให้ merge deviceKeys, ถ้าไม่มีให้สร้างใหม่
                const mergedGroups = [...existingGroups];
                for (const [groupName, deviceKeys] of Object.entries(importedGroupMap)) {
                    const existing = mergedGroups.find(g => g.name === groupName);
                    if (existing) {
                        // เพิ่มเฉพาะ key ที่ยังไม่มี
                        for (const dk of deviceKeys) { if (!existing.deviceKeys.includes(dk)) existing.deviceKeys.push(dk); }
                    } else {
                        mergedGroups.push({ id: 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), name: groupName, deviceKeys });
                    }
                }
                await groupDocRef.set({ groups: mergedGroups });
                // อัปเดต registryGroups ในหน่วยความจำด้วย
                registryGroups = mergedGroups;
            } catch(e) { console.warn('Could not restore groups:', e); }
        }

        window.updateDeviceSummary(); 
        window.updateDeviceStatusOverlays(currentSiteKey); 
        const groupMsg = Object.keys(importedGroupMap).length > 0 ? ` · นำเข้ากลุ่ม ${Object.keys(importedGroupMap).length} กลุ่ม` : '';
        Swal.fire({ title: 'นำเข้าสำเร็จ!', text: `ข้อมูลใหม่ถูกเพิ่มแล้ว (รายการที่มี ID ซ้ำถูกข้ามอัตโนมัติ)${groupMsg}`, icon: 'success' });
    } catch (error) { 
        Swal.fire('ผิดพลาด', error.message, 'error'); 
    }
}

window.importData = function(event) {
    if (!hasWriteAccess(currentSiteKey)) { Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์นำเข้าข้อมูลในสถานที่นี้', 'error'); event.target.value = null; return; }
    const file = event.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result); const wb = XLSX.read(data, { type: 'array' });
            const wsAssets = wb.Sheets["ข้อมูลทรัพย์สิน"]; const wsRecords = wb.Sheets["ประวัติการชำรุด"];
            const assetsToImport = []; const recordsToImport = [];
            const cleanDate = (val) => parseThaiDateToStandard(val);
            // กลุ่มที่อ่านได้จาก Excel เพื่อ restore
            const importedGroupMap = {}; // groupName -> [deviceNames]
            
            if (wsAssets) {
                const assetRawData = XLSX.utils.sheet_to_json(wsAssets, { header: 1 });
                if (assetRawData.length >= 2) { 
                    const headers = assetRawData[0];
                    // รองรับทั้งรูปแบบเก่า (ไม่มีคอลัมน์กลุ่ม) และใหม่ (มีคอลัมน์กลุ่ม)
                    const colGroup        = headers.indexOf('กลุ่ม');
                    const colDevice       = headers.indexOf('ชื่ออุปกรณ์');
                    const colSerial       = headers.indexOf('Serial Number');
                    const colModel        = headers.indexOf('Model');
                    const colPea          = headers.indexOf('PEA No.');
                    const colPrice        = headers.indexOf('ราคาซื้อ');
                    const colManufacturer = headers.indexOf('Manufacturer');
                    const colStart        = headers.indexOf('วันที่เริ่มประกัน');
                    const colEnd          = headers.indexOf('วันที่หมดประกัน');

                    if (colDevice !== -1) {
                        for (let i = 1; i < assetRawData.length; i++) {
                            const row = assetRawData[i];
                            const deviceName = row[colDevice];
                            // ข้ามแถวหัวกลุ่ม (ขึ้นต้นด้วย ──)
                            if (!deviceName || String(deviceName).startsWith('──')) continue;
                            const groupName = (colGroup !== -1 && row[colGroup]) ? String(row[colGroup]).trim() : '';
                            // เก็บข้อมูลกลุ่มสำหรับ restore
                            if (groupName && groupName !== '(ยังไม่ได้จัดกลุ่ม)') {
                                if (!importedGroupMap[groupName]) importedGroupMap[groupName] = [];
                                importedGroupMap[groupName].push(String(deviceName).trim());
                            }
                            assetsToImport.push({ deviceName: String(deviceName).trim(), assetInfo: {
                                serial:        colSerial       !== -1 ? (row[colSerial]       || '') : '',
                                model:         colModel        !== -1 ? (row[colModel]        || '') : '',
                                peaNo:         colPea          !== -1 ? (row[colPea]          || '') : '',
                                price:         colPrice        !== -1 ? (row[colPrice]        || '') : '',
                                manufacturer:  colManufacturer !== -1 ? (row[colManufacturer] || '') : '',
                                warrantyStart: cleanDate(colStart !== -1 ? row[colStart] : null),
                                warrantyEnd:   cleanDate(colEnd   !== -1 ? row[colEnd]   : null),
                            }});
                        }
                    }
                }
            }
            if (wsRecords) {
                const recordRawData = XLSX.utils.sheet_to_json(wsRecords, { header: 1 });
                if (recordRawData.length >= 2) { 
                    const headers = recordRawData[0];
        
                    const headerMap = { 'Timestamp': headers.indexOf('Timestamp'),'เลข ID อ้างอิง': headers.indexOf('เลข ID อ้างอิง') !== -1 ? headers.indexOf('เลข ID อ้างอิง') : headers.indexOf('ID อ้างอิง'), 'ชื่ออุปกรณ์': headers.indexOf('ชื่ออุปกรณ์'), 
                                        'วันที่เกิดเหตุ': headers.indexOf('วันที่เกิดเหตุ') !== -1 ? headers.indexOf('วันที่เกิดเหตุ') : headers.indexOf('วันที่ชำรุด'), 
                                        'วันที่ซ่อมแซม': headers.indexOf('วันที่ซ่อมแซม'), 'สถานะ': headers.indexOf('สถานะ'), 'คำอธิบาย': headers.indexOf('คำอธิบาย'),'ลิงก์รูปชำรุด': headers.indexOf('ลิงก์รูปชำรุด'), 'วิธีแก้ไข': headers.indexOf('วิธีแก้ไข'),'ลิงก์รูปแก้ไข': headers.indexOf('ลิงก์รูปแก้ไข'), 
                                        'เลขที่ใบสั่ง': headers.indexOf('เลขที่ใบสั่ง'), 'ราคาซ่อม': headers.indexOf('ราคาซ่อม'), 
                                        'หนังสือ มท': headers.indexOf('หนังสือ มท'), 'หนังสือ กฟภ.': headers.indexOf('หนังสือ กฟภ.'),
                                        'ชื่อ-สกุล ผู้แจ้งเหตุ': headers.indexOf('ชื่อ-สกุล ผู้แจ้งเหตุ') !== -1 ? headers.indexOf('ชื่อ-สกุล ผู้แจ้งเหตุ') : headers.indexOf('ผู้บันทึก'),
                                        'ตำแหน่ง': headers.indexOf('ตำแหน่ง'), 'สังกัด': headers.indexOf('สังกัด'),
                                        'ชื่อ-สกุล ผู้แจ้งซ่อมแซม': headers.indexOf('ชื่อ-สกุล ผู้แจ้งซ่อมแซม'), 'ตำแหน่ง': headers.indexOf('ตำแหน่ง'), 'สังกัด': headers.indexOf('สังกัด'),
                                        'ชื่อ-สกุล ผู้รับทราบ': headers.indexOf('ผู้รับทราบ'), 'วันที่-เวลา': headers.indexOf('วันที่-เวลา') };
                    
                    if (headerMap['ชื่ออุปกรณ์'] !== -1 && headerMap['วันที่เกิดเหตุ'] !== -1) {
                        for (let i = 1; i < recordRawData.length; i++) {
                            const row = recordRawData[i]; const deviceName = row[headerMap['ชื่ออุปกรณ์']]; if (!deviceName) continue;
                            const importedBrokenDate = cleanDate(row[headerMap['วันที่เกิดเหตุ']]); const importedFixedDate = cleanDate(row[headerMap['วันที่ซ่อมแซม']]);
                            const statusValue = (row[headerMap['สถานะ']] || '').toString(); const importedTs = row[headerMap['Timestamp']];
                            const customIdIdx = headerMap['เลข ID อ้างอิง'];
                            const customId = (customIdIdx !== -1 && row[customIdIdx]) ? row[customIdIdx].toString() : null;
                            let finalStatus = 'ok'; if (statusValue.includes('ชำรุด')) finalStatus = 'down'; else if (statusValue.includes('ผิดปกติ')) finalStatus = 'abnormal';
                            if (importedBrokenDate && !importedFixedDate && finalStatus === 'ok') finalStatus = 'down'; 
                            
                            const parsedTs = parseThaiDateTimeToTS(importedTs);
                            const timestampToSave = parsedTs ? parsedTs : (Date.now() + i);

                           recordsToImport.push({ deviceName, record: {
                                    ts: timestampToSave, customId: customId,brokenDate: importedBrokenDate || '', 
                                    fixedDate: importedFixedDate || null,  status: finalStatus, 
                                    description: (row[headerMap['รายละเอียดปัญหา']] || '').toString() || 'นำเข้าจาก Excel', 
                                    brokenFileUrl: row[headerMap['ลิงก์รูปชำรุด']] || null,
                                    solution: (headerMap['วิธีแก้ไข'] !== -1) ? (row[headerMap['วิธีแก้ไข']] || '').toString() : '',
                                    fixedFileUrl: row[headerMap['ลิงก์รูปแก้ไข']] || null, 
                                    orderNumber: (headerMap['เลขที่ใบสั่ง'] !== -1) ? (row[headerMap['เลขที่ใบสั่ง']] || '').toString() : '', 
                                    repairCost: (headerMap['ราคาซ่อม'] !== -1) ? (row[headerMap['ราคาซ่อม']] || '').toString() : '',
                                    docMinistry: (headerMap['หนังสือ มท'] !== -1) ? (row[headerMap['หนังสือ มท']] || '').toString() : '',
                                    docPEA: (headerMap['หนังสือ กฟภ.'] !== -1) ? (row[headerMap['หนังสือ กฟภ.']] || '').toString() : '',
                                    brokenUser: (headerMap['ชื่อ-สกุล ผู้แจ้งเหตุ'] !== -1) ? (row[headerMap['ชื่อ-สกุล ผู้แจ้งเหตุ']] || '').toString() : (currentUserFullName || currentUser.email), 
                                    brokenUserPos: (headerMap['ตำแหน่ง'] !== -1) ? (row[headerMap['ตำแหน่ง']] || '').toString() : '',
                                    brokenUserDept: (headerMap['สังกัด'] !== -1) ? (row[headerMap['สังกัด']] || '').toString() : '',
                                    fixedUser: (headerMap['ชื่อ-สกุล ผู้แจ้งซ่อมแซม'] !== -1) ? (row[headerMap['ชื่อ-สกุล ผู้แจ้งซ่อมแซม']] || '').toString() : '',
                                    acknowledgedBy: (headerMap['ชื่อ-สกุล ผู้รับทราบ'] !== -1) ? (row[headerMap['ชื่อ-สกุล ผู้รับทราบ']] || '').toString() : '',
                                    acknowledgedAt: (headerMap['วันที่-เวลารับทราบ'] !== -1) ? parseThaiDateTimeToTS(row[headerMap['วันที่-เวลารับทราบ']]) : null,
                                    user: (row[headerMap['ผู้บันทึก']] || '').toString() || (currentUserFullName || currentUser.email), 
                                    counted: !!importedBrokenDate
                            } });
                        }
                    } else { Swal.fire('ผิดพลาด', 'ไม่พบคอลัมน์ ชื่ออุปกรณ์ หรือ วันที่เกิดเหตุ ในไฟล์ Excel', 'error'); return; }
                }
            }
            if (assetsToImport.length > 0 || recordsToImport.length > 0) {
                processAndSaveImport(assetsToImport, recordsToImport, importedGroupMap);
            } else { Swal.fire('ผิดพลาด', 'ไม่พบข้อมูล', 'error'); }
        } catch (error) { Swal.fire('ผิดพลาด', error.message, 'error'); }
    };
    reader.readAsArrayBuffer(file); event.target.value = null; 
};

window.exportAllDataExcel = async function() {
    const siteData = sites[currentSiteKey]; if (!siteData || siteData.devices.length === 0) return;
    const docsSnap = await getAllDevicesDocs(currentSiteKey); const dataMap = {}; docsSnap.forEach(d => dataMap[d.id] = d.data());

    // ---- โหลดกลุ่มจาก Firestore ----
    let exportGroups = [];
    try {
        const snap = await db.collection('site_asset_groups').doc(currentSiteKey).get();
        exportGroups = (snap.exists && snap.data().groups) ? snap.data().groups : [];
    } catch(e) { exportGroups = []; }

    // สร้าง map: deviceKey -> groupName
    const deviceGroupMap = {};
    for (const g of exportGroups) {
        for (const dk of g.deviceKeys) { deviceGroupMap[dk] = g.name; }
    }

    // ---- ชีทประวัติชำรุด ----
    const recordsData = [[
        'Timestamp', 'เลข ID อ้างอิง', 'ชื่ออุปกรณ์', 'ลำดับการบันทึก (ครั้งที่ N)', 
        'วันที่เกิดเหตุ', 'วันที่ซ่อมแซม', 'ระยะเวลา', 'สถานะ', 'รายละเอียดปัญหา', 'ลิงก์รูปชำรุด', 
        'วิธีแก้ไข', 'ลิงก์รูปแก้ไข', 'เลขที่ใบสั่ง', 'ราคาซ่อม', 'หนังสือ มท', 'หนังสือ กฟภ.', 
        'ชื่อ-สกุล ผู้แจ้งเหตุ', 'ตำแหน่ง', 'สังกัด', 'ชื่อ-สกุล ผู้รับทราบ', 'วันที่-เวลารับทราบ', 'สถานะซ่อม', 'ชื่อ-สกุล ผู้แจ้งซ่อมแซม', 'ตำแหน่ง', 'สังกัด'
    ]];

    // ---- ชีทข้อมูลทรัพย์สิน (แยกตามกลุ่ม) ----
    const ASSET_HEADER = ['กลุ่ม', 'ชื่ออุปกรณ์', 'Serial Number', 'Model', 'PEA No.', 'ราคาซื้อ', 'Manufacturer', 'วันที่เริ่มประกัน', 'วันที่หมดประกัน', 'สถานะประกัน'];
    const assetData = [ASSET_HEADER];

    // ฟังก์ชันเพิ่มแถวอุปกรณ์
    const pushAssetRow = (devName, groupName) => {
        const docData = dataMap[devName]; const assetInfo = docData?.assetInfo || {};
        const warrantyStatus = getWarrantyStatus(assetInfo.warrantyEnd);
        let warrantyStatusText = 'N/A';
        switch(warrantyStatus) { case 'ok': warrantyStatusText = 'รับประกัน'; break; case 'warn': warrantyStatusText = 'ใกล้หมดประกัน'; break; case 'bad': warrantyStatusText = 'หมดประกัน'; break; }
        assetData.push([ groupName, devName, assetInfo.serial || '-', assetInfo.model || '-', assetInfo.peaNo || '-', assetInfo.price || '-', assetInfo.manufacturer || '-', formatThaiDate(assetInfo.warrantyStart), formatThaiDate(assetInfo.warrantyEnd), warrantyStatusText ]);
    };

    // เพิ่มตามกลุ่มก่อน
    const assignedDevices = new Set();
    for (const group of exportGroups) {
        if (group.deviceKeys.length === 0) continue;
        // แถวหัวกลุ่ม (merge label)
        assetData.push([`── ${group.name} (${group.deviceKeys.length} อุปกรณ์) ──`, '', '', '', '', '', '', '', '', '']);
        for (const dk of group.deviceKeys) {
            if (siteData.devices.includes(dk)) { pushAssetRow(dk, group.name); assignedDevices.add(dk); }
        }
    }
    // อุปกรณ์ที่ยังไม่ได้จัดกลุ่ม
    const ungrouped = siteData.devices.filter(d => d !== 'other' && !assignedDevices.has(d));
    if (ungrouped.length > 0) {
        assetData.push([`── ยังไม่ได้จัดกลุ่ม (${ungrouped.length} อุปกรณ์) ──`, '', '', '', '', '', '', '', '', '']);
        for (const dk of ungrouped) { pushAssetRow(dk, '(ยังไม่ได้จัดกลุ่ม)'); }
    }

    // ---- records data (ทุกอุปกรณ์ตามลำดับ devices) ----
    for (const devName of siteData.devices) {
        const docData = dataMap[devName]; if (!docData) continue;
        const records = docData.records || []; records.sort((a, b) => a.ts - b.ts); let downCount = 0; 
        records.forEach(r => {
            let duration = '-', sequenceNumber = '-'; if (r.counted) { downCount++; sequenceNumber = downCount; }
            if (r.brokenDate) { if (r.fixedDate) duration = formatDuration(calculateDaysDifference(r.brokenDate, r.fixedDate)); else if (r.status === 'down' || r.status === 'abnormal') duration = formatDuration(calculateDaysDifference(r.brokenDate, null)) + ' (ยังไม่ซ่อม)'; }
            let statusTH = r.status === 'down' ? 'ชำรุด' : (r.status === 'abnormal' ? 'ผิดปกติ' : 'ใช้งานได้');
            const repairState = (r.acknowledgedAt && (r.status === 'down' || r.status === 'abnormal') && !r.fixedDate) ? 'กำลังซ่อมแซม' : '-';
            let devNameFinal = r.subDevice ? `${devName} (${r.subDevice})` : devName;
            recordsData.push([ 
                formatThaiDateTime(r.ts), r.customId || '-', devNameFinal, sequenceNumber, 
                formatThaiDate(r.brokenDate), formatThaiDate(r.fixedDate), 
                duration, statusTH, r.description || '-', r.brokenFileUrl || '-', r.solution || '-', r.fixedFileUrl || '-', 
                r.orderNumber || '-', r.repairCost || '-', r.docMinistry || '-', r.docPEA || '-', 
                r.brokenUser || r.user || '-', r.brokenUserPos || '-', r.brokenUserDept || '-', 
                r.acknowledgedBy || '-', r.acknowledgedAt ? formatThaiDateTime(r.acknowledgedAt) : '-',
                repairState, r.fixedUser || '-', r.fixedUserPos || '-', r.fixedUserDept || '-'
            ]);
        });
    }

    // ---- log ----
    const logData = [['วันที่-เวลา', 'ชื่อ-สกุล ผู้ใช้งาน', 'การกระทำ', 'รายละเอียด', 'ไซต์']];
    try {
        const logSnap = await db.collection("activity_logs").where("siteKey", "==", currentSiteKey).orderBy("timestamp", "desc").limit(1000).get();
        logSnap.forEach(doc => { const d = doc.data(); logData.push([ d.timestamp ? formatThaiDateTime(d.timestamp.toMillis()) : '-', d.userEmail || '-', d.action || '-', d.details || '-', d.siteKey || '-' ]); });
    } catch (error) {}

    // ---- สร้าง Workbook + สไตล์ชีทแอสเซต ----
    const wb = XLSX.utils.book_new();
    if (recordsData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recordsData), "ประวัติการชำรุด");

    if (assetData.length > 1) {
        const wsAsset = XLSX.utils.aoa_to_sheet(assetData);
        // ทำให้แถวหัวกลุ่มโดดเด่น (ตั้ง cell comment / background ไม่ได้ใน xlsx.js แต่ mark ด้วย !กลุ่ม row)
        // ตั้งความกว้างคอลัมน์
        wsAsset['!cols'] = [
            { wch: 24 }, // กลุ่ม
            { wch: 28 }, // ชื่ออุปกรณ์
            { wch: 20 }, // S/N
            { wch: 20 }, // Model
            { wch: 16 }, // PEA No.
            { wch: 14 }, // ราคา
            { wch: 20 }, // Manufacturer
            { wch: 18 }, // วันเริ่ม
            { wch: 18 }, // วันหมด
            { wch: 16 }, // สถานะ
        ];
        XLSX.utils.book_append_sheet(wb, wsAsset, "ข้อมูลทรัพย์สิน");
    }
    if (logData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logData), "ประวัติการใช้งาน");

    XLSX.writeFile(wb, `Device_Export_${siteData.name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    Swal.fire('ส่งออกสำเร็จ', 'ไฟล์ถูกบันทึกแล้ว', "success");
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

function setActiveTab(tabId) {
    ['tab-topology','tab-summary','tab-registry'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === tabId) { el.classList.add('bg-white','text-brand-600','shadow-sm'); el.classList.remove('text-slate-600'); }
        else { el.classList.remove('bg-white','text-brand-600','shadow-sm'); el.classList.add('text-slate-600'); }
    });
}
window.showSummary = function() { 
    document.getElementById('topologyPage').classList.add('hidden'); 
    document.getElementById('assetRegistryPage').classList.add('hidden'); 
    document.getElementById('summaryPage').classList.remove('hidden'); 
    setActiveTab('tab-summary');
    window.updateDeviceSummary(); scheduleOverlayRefresh(currentSiteKey, true); 
};
window.showTopology = function() { 
    document.getElementById('summaryPage').classList.add('hidden'); 
    document.getElementById('assetRegistryPage').classList.add('hidden'); 
    document.getElementById('topologyPage').classList.remove('hidden'); 
    setActiveTab('tab-topology');
    if (typeof imageMapResize === 'function') { imageMapResize(); } window.updateDeviceStatusOverlays(currentSiteKey); 
};
window.showAssetRegistry = function() {
    document.getElementById('topologyPage').classList.add('hidden');
    document.getElementById('summaryPage').classList.add('hidden');
    document.getElementById('assetRegistryPage').classList.remove('hidden');
    setActiveTab('tab-registry');
    loadAssetRegistry();
};

// ==================== ASSET REGISTRY MODULE ====================
let registryGroups = [];
let registryDataMap = {};
let groupModalMode = 'add';
let groupModalTargetId = null;

function getRegistryDocRef(siteKey) {
    return db.collection('site_asset_groups').doc(siteKey);
}
function getRegistryDeviceList(siteData) {
    const configuredDevices = Array.isArray(siteData?.devices) ? siteData.devices : [];
    const firestoreDevices = Object.keys(registryDataMap || {});

    return [...new Set([...configuredDevices, ...firestoreDevices])].filter(d => d && d !== 'other');
}

function normalizeRegistryGroups(rawGroups) {
    if (!Array.isArray(rawGroups)) return [];

    return rawGroups
        .filter(group => group && typeof group === 'object')
        .map((group, index) => {
            const deviceKeys = Array.isArray(group.deviceKeys)
                ? [...new Set(group.deviceKeys.filter(Boolean).map(String))]
                : [];

            return {
                id: String(group.id || `grp_${index}_${Date.now()}`),
                name: String(group.name || `กลุ่ม ${index + 1}`),
                deviceKeys
            };
        });
}

function renderRegistryStats(siteData) {
   const allDevices = getRegistryDeviceList(siteData);
    let totalFaults = 0;
    let unresolved = 0;
    let registeredAssets = 0;

    for (const dev of allDevices) {
        const d = registryDataMap[dev];
        if (!d) continue;

        if (d.assetInfo && d.assetInfo.serial) {
            registeredAssets++;
        }

        const records = d.records || [];
        totalFaults += records.filter(r => r.counted || r.status === 'down' || r.status === 'abnormal').length;
        unresolved += records.filter(r => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-')).length;
    }

    }
}
async function loadAssetRegistry() {
    const siteData = sites[currentSiteKey];
    const siteNameEl = document.getElementById('registrySiteName');
    const loadingEl = document.getElementById('registryLoading');
    const contentEl = document.getElementById('registryContent');

    if (!siteData) {
        if (siteNameEl) siteNameEl.textContent = '';
        if (loadingEl) loadingEl.classList.add('hidden');
        if (contentEl) {
            contentEl.classList.remove('hidden');
            contentEl.innerHTML = '<div class="bg-white border border-red-200 text-red-600 rounded-xl p-4 text-sm font-semibold">ไม่พบข้อมูลพื้นที่ที่เลือก</div>';
        }
        return;
    }
if (siteNameEl) siteNameEl.textContent = `— ${siteData.name}`;
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');

    try {
        const snap = await getRegistryDocRef(currentSiteKey).get();
        registryGroups = normalizeRegistryGroups(snap.exists ? snap.data().groups : []);
    } catch (e) {
        console.warn("Failed to load groups:", e);
        registryGroups = [];
    }
    registryDataMap = {};
    try {
        const docsSnap = await getSiteCollection(currentSiteKey).get();
        docsSnap.forEach(d => {
            registryDataMap[d.id] = d.data();
        });
    } catch (e) {
       console.error("Failed to load device asset data:", e);
        Swal.fire('โหลดข้อมูลบางส่วน', 'ไม่สามารถโหลดรายละเอียดทรัพย์สินจาก Firestore ได้ แต่จะแสดงรายการอุปกรณ์พื้นฐานให้ก่อน: ' + e.message, 'warning');
    }

     if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');

    renderRegistryStats(siteData);
    renderRegistryContent(siteData);
}

function getDeviceStats(devKey) {
    const d = registryDataMap[devKey];

    if (!d) {
        return {
            total: 0,
            unresolved: 0,
            assetInfo: null
        };
    }

    const records = d.records || [];

    return {
        total: records.filter(r =>
            r.counted ||
            r.status === 'down' ||
            r.status === 'abnormal'
        ).length,

        unresolved: records.filter(r =>
            (r.status === 'down' || r.status === 'abnormal') &&
            (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-')
        ).length,

        assetInfo: d.assetInfo || null
    };
}

const TABLE_HEADER = `
<thead class="bg-slate-100 sticky top-0 z-10">
    <tr class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            ชื่ออุปกรณ์
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            S/N
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            Model
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            PEA No.
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            ผู้ผลิต
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            ประกัน
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            กลุ่ม
        </th>

    </tr>
</thead>`;

function deviceRowHTML(devKey, isInGroup, groupId) {

    const stats = getDeviceStats(devKey);
    const a = stats.assetInfo || {};

    const v = (val) =>
        (val && String(val).trim())
            ? escapeHtml(String(val))
            : '<span class="text-slate-300">—</span>';

    const warrantyBadge = a.warrantyEnd
        ? (() => {

            const ws = getWarrantyStatus(a.warrantyEnd);

            return ws === 'ok'
                ? `<span class="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold border border-green-200 whitespace-nowrap">✅ ในประกัน</span>`
                : ws === 'warn'
                ? `<span class="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold border border-amber-200 whitespace-nowrap">⚠️ ใกล้หมด</span>`
                : `<span class="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold border border-red-200 whitespace-nowrap">❌ หมดประกัน</span>`;
        })()
        : `<span class="text-[9px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full border border-slate-200 whitespace-nowrap">— ไม่มีข้อมูล</span>`;

    const safeDevKey = devKey
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");

    const safeGroupId = (isInGroup && groupId)
        ? groupId.replace(/'/g, "\\'")
        : '';

    const groupOptions = registryGroups.map(g => `
        <option value="${escapeHtml(g.id)}"
            ${(isInGroup && groupId === g.id) ? 'selected' : ''}>
            ${escapeHtml(g.name)}
        </option>
    `).join('');

    const moveSelect = registryGroups.length > 0
        ? `
        <select onchange="assignDeviceToGroup('${safeDevKey}', this.value, '${safeGroupId}')"
            class="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-600 cursor-pointer w-full focus:ring-1 focus:ring-indigo-400 outline-none">

            <option value="">— เลือกกลุ่ม —</option>

            ${groupOptions}

            ${isInGroup
                ? '<option value="__remove__">❌ นำออกจากกลุ่ม</option>'
                : ''
            }

        </select>
        `
        : '<span class="text-[10px] text-slate-300">ยังไม่มีกลุ่ม</span>';

  return `
<tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">

    <td class="px-3 py-2.5 text-sm font-semibold text-slate-800 whitespace-nowrap text-center">
        ${escapeHtml(devKey)}
    </td>

    <td class="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap text-center">
        ${v(a.serial)}
    </td>

    <td class="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap text-center">
        ${v(a.model)}
    </td>

    <td class="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap text-center">
        ${v(a.peaNo)}
    </td>

    <td class="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap text-center">
        ${v(a.manufacturer)}
    </td>

    <td class="px-3 py-2.5 text-center">
        ${warrantyBadge}
    </td>

    <td class="px-3 py-2.5 min-w-[130px] text-center">
        ${moveSelect}
    </td>

</tr>
`;
}

function buildGroupTable(deviceKeys, isInGroup, groupId) {

    if (deviceKeys.length === 0) {
        return `
            <p class="text-slate-400 text-sm text-center py-4">
                ยังไม่มีอุปกรณ์ในกลุ่มนี้
            </p>
        `;
    }

    const rows = deviceKeys
        .map(dk => deviceRowHTML(dk, isInGroup, groupId))
        .join('');

    return `
    <div class="overflow-x-auto">

        <table class="w-full text-left border-collapse text-sm">
            ${TABLE_HEADER}
            <tbody>${rows}</tbody>
        </table>

    </div>
    `;
}

function renderRegistryContent(siteData) {
     const allDevices = getRegistryDeviceList(siteData);
     const validDeviceSet = new Set(allDevices);

   // ป้องกัน Error หาก deviceKeys เป็น undefined หรือข้อมูลกลุ่มใน Firestore เสียรูปแบบ
    registryGroups = normalizeRegistryGroups(registryGroups);
    const assignedDevices = new Set(
        registryGroups.flatMap(g => (g.deviceKeys || []).filter(dk => validDeviceSet.has(dk)))
    );

    const ungrouped = allDevices.filter(d => !assignedDevices.has(d));
    const canEdit = currentUserRole === 'admin' || currentUserRole === 'editor';
    let html = '';

    registryGroups.forEach(group => {
       const keys = (group.deviceKeys || []).filter(dk => validDeviceSet.has(dk)); // Fallback ป้องกัน Error
        
        const groupFaults = keys.reduce((s, dk) => s + getDeviceStats(dk).total, 0);
        const groupUnresolved = keys.reduce((s, dk) => s + getDeviceStats(dk).unresolved, 0);

        html += `
        <div class="bg-white border border-slate-200 rounded-xl card-shadow overflow-hidden mb-4">
            <div class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-200">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-indigo-500 text-lg">📁</span>
                    <div class="min-w-0">
                        <h3 class="font-bold text-slate-800 text-base truncate">${escapeHtml(group.name)}</h3>
                        <div class="text-xs text-slate-500 mt-0.5">
                            ${keys.length} อุปกรณ์
                            · ชำรุด <b class="text-amber-600">${groupFaults}</b>
                            · ค้าง <b class="${groupUnresolved > 0 ? 'text-red-600' : 'text-green-600'}">${groupUnresolved}</b>
                        </div>
                    </div>
                </div>
                ${canEdit ? `
                <div class="flex gap-1 shrink-0">
                    <button data-gid="${escapeHtml(group.id)}" data-gname="${escapeHtml(group.name)}" onclick="openRenameGroupModal(this.dataset.gid, this.dataset.gname)" class="px-2.5 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">✏️ เปลี่ยนชื่อ</button>
                    <button data-gid="${escapeHtml(group.id)}" onclick="deleteGroup(this.dataset.gid)" class="px-2.5 py-1 text-xs font-semibold text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50">🗑️</button>
                </div>
                ` : ''}
            </div>
            ${buildGroupTable(keys, true, group.id)}
        </div>
        `;
    });

    if (ungrouped.length > 0) {
        html += `
        <div class="bg-white border border-dashed border-slate-300 rounded-xl overflow-hidden mb-4">
            <div class="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <span class="text-slate-400 text-lg">📂</span>
                <div>
                    <h3 class="font-bold text-slate-600">อุปกรณ์ที่ยังไม่ได้จัดกลุ่ม</h3>
                    <div class="text-xs text-slate-400">${ungrouped.length} อุปกรณ์</div>
                </div>
            </div>
            ${buildGroupTable(ungrouped, false, null)}
        </div>
        `;
    }

   if (!html) {
        html = `
        <div class="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
            <div class="text-3xl mb-2">📭</div>
            <p class="text-sm font-semibold">ไม่มีรายการอุปกรณ์สำหรับพื้นที่นี้</p>
        </div>
        `;
    }

    const contentEl = document.getElementById('registryContent');
    if (contentEl) contentEl.innerHTML = html;
}
async function saveRegistryGroups() {
    try {
        registryGroups = normalizeRegistryGroups(registryGroups);
        await getRegistryDocRef(currentSiteKey).set({ groups: registryGroups });
    } catch(e) {
        console.error('saveRegistryGroups error:', e);
        Swal.fire('บันทึกไม่สำเร็จ', 'กรุณาตรวจสอบสิทธิ์ Firestore: ' + e.message, 'error');
    }
}

window.assignDeviceToGroup = async function(devKey, newGroupId, oldGroupId) {
    // Remove from old group
    if (oldGroupId) {
        registryGroups = normalizeRegistryGroups(registryGroups);
        const oldG = registryGroups.find(g => g.id === oldGroupId);
        if (oldG) oldG.deviceKeys = (oldG.deviceKeys || []).filter(k => k !== devKey);
    }
    // Check remove command
    if (newGroupId === '__remove__' || newGroupId === '') {
        await saveRegistryGroups();
        renderRegistryContent(sites[currentSiteKey]);
        renderRegistryStats(sites[currentSiteKey]);
        return;
    }
    // Add to new group
    const newG = registryGroups.find(g => g.id === newGroupId);
     if (newG) {
        newG.deviceKeys = newG.deviceKeys || [];
        if (!newG.deviceKeys.includes(devKey)) newG.deviceKeys.push(devKey);
    }
    await saveRegistryGroups();
    renderRegistryContent(sites[currentSiteKey]);
    renderRegistryStats(sites[currentSiteKey]);
};

window.openAddGroupModal = function() {
    if (currentUserRole !== 'admin' && currentUserRole !== 'editor') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin หรือ Editor เท่านั้น', 'warning'); return;
    }
    groupModalMode = 'add'; groupModalTargetId = null;
    document.getElementById('groupModalTitle').textContent = '➕ เพิ่มกลุ่มใหม่';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('groupNameInput').focus(), 100);
};

window.openRenameGroupModal = function(groupId, currentName) {
    if (currentUserRole !== 'admin' && currentUserRole !== 'editor') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin หรือ Editor เท่านั้น', 'warning'); return;
    }
    // currentName comes from data-gname attribute (HTML-escaped), decode it
    const decoded = currentName.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    groupModalMode = 'rename'; groupModalTargetId = groupId;
    document.getElementById('groupModalTitle').textContent = '✏️ เปลี่ยนชื่อกลุ่ม';
    document.getElementById('groupNameInput').value = decoded;
    document.getElementById('groupModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('groupNameInput').focus(), 100);
};

window.closeGroupModal = function() {
    document.getElementById('groupModal').classList.add('hidden');
};

window.confirmGroupAction = async function() {
    const name = document.getElementById('groupNameInput').value.trim();
    if (!name) { Swal.fire('กรุณากรอกชื่อกลุ่ม', '', 'warning'); return; }
    
    if (groupModalMode === 'add') {
        const newId = 'grp_' + Date.now();
        registryGroups.push({ id: newId, name, deviceKeys: [] });
    } else if (groupModalMode === 'rename' && groupModalTargetId) {
        const g = registryGroups.find(g => g.id === groupModalTargetId);
        if (g) g.name = name;
    }
    await saveRegistryGroups();
    closeGroupModal();
    renderRegistryContent(sites[currentSiteKey]);
    renderRegistryStats(sites[currentSiteKey]);
};

window.deleteGroup = async function(groupId) {
    if (currentUserRole !== 'admin' && currentUserRole !== 'editor') return;
    const result = await Swal.fire({ title: 'ลบกลุ่มนี้?', text: 'อุปกรณ์ในกลุ่มจะกลับไปอยู่ในส่วน "ยังไม่ได้จัดกลุ่ม"', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' });
    if (!result.isConfirmed) return;
    registryGroups = registryGroups.filter(g => g.id !== groupId);
    await saveRegistryGroups();
    renderRegistryContent(sites[currentSiteKey]);
    renderRegistryStats(sites[currentSiteKey]);
};

// ==================== END ASSET REGISTRY MODULE ====================
function scheduleOverlayRefresh(siteKey = currentSiteKey, useCache = false) {
    setTimeout(() => {
        if (typeof imageMapResize === 'function') imageMapResize();
        window.updateDeviceStatusOverlays(siteKey, useCache);
    }, 100);
}
function switchSite(siteKey) { 
    const siteData = sites[siteKey]; if (!siteData) return; currentSiteKey = siteKey; 
    document.getElementById('locationTitle').textContent = `🔎 ${siteData.name}`; 
    document.querySelectorAll('.map-container').forEach(el => el.classList.add('hidden')); 
    document.getElementById(`map-${siteKey}`).classList.remove('hidden'); 
    
  if(siteKey === 'betong') {
        const sub1 = document.getElementById('betong-sub-view-1');
        const sub2 = document.getElementById('betong-sub-view-2');
        const sub3 = document.getElementById('betong-sub-view-3');
        
        if (sub1) sub1.classList.add('hidden');
        if (sub2) sub2.classList.add('hidden');
        if (sub3) sub3.classList.add('hidden');
        
        document.getElementById('betong-main-view').classList.remove('hidden');
    }
    
    if (typeof imageMapResize === 'function') { imageMapResize(); } 
    setupRealtimeListener(siteKey); 
    window.updateDeviceStatusOverlays(currentSiteKey); 
    scheduleOverlayRefresh(currentSiteKey, false);
    toggleWriteAccess(currentUser !== null);
    // Reload registry if it's the active page
    if (!document.getElementById('assetRegistryPage').classList.contains('hidden')) {
        loadAssetRegistry();
    }
}

function applyRoleRestrictions() {
    const body = document.body;
    
    if (currentUserRole === 'viewer') {
     
        body.classList.add('viewer-mode');

        toggleWriteAccess(false); 
    } else {
    
        body.classList.remove('viewer-mode');
        toggleWriteAccess(true);
    }
}
document.addEventListener("DOMContentLoaded", function() {
    auth.onAuthStateChanged(async user => {
        
        const appContent = document.getElementById('appContent');
        const loginPrompt = document.getElementById('loginPrompt');

        if (user) {
          
            if (appContent) appContent.classList.remove('hidden');
            if (loginPrompt) loginPrompt.classList.add('hidden');

            currentUser = user;
            document.getElementById('userInfo').classList.remove('hidden');
            document.getElementById('loginButton').classList.add('hidden');

            try {
                const userSnap = await db.collection('users').doc(user.email).get();
                if (!userSnap.exists) {
                    let initialRole = (user.email === ADMIN_EMAIL) ? 'admin' : 'viewer';
                    await db.collection('users').doc(user.email).set({
                        email: user.email,
                        role: initialRole,
                        allowedSites: [],
                        fullName: '',
                        position: '',
                        department: '',
                        phone: '',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    currentUserRole = initialRole;
                    currentUserAllowedSites = [];
                    currentUserFullName = '';
                } else {
                    currentUserRole = userSnap.data().role || 'viewer';
                    currentUserAllowedSites = userSnap.data().allowedSites || [];
                    currentUserFullName = userSnap.data().fullName || '';
                    currentUserPosition = userSnap.data().position || '';
                    currentUserDept = userSnap.data().department || '';
                    currentUserPhone = userSnap.data().phone || '';
                }

                if (user.email === ADMIN_EMAIL) currentUserRole = 'admin';
                
               
                if (currentUserRole === 'viewer') {
                    document.body.classList.add('viewer-mode'); 
                    toggleWriteAccess(false); 
                } else {
                    document.body.classList.remove('viewer-mode'); 
                    toggleWriteAccess(true); 
                }

                document.getElementById('userNameDisplay').textContent = currentUserFullName ? `${currentUserFullName} (${user.email})` : user.email;
                document.getElementById('userRoleDisplay').textContent = currentUserRole; 

                const sessionLogKey = `logged_in_${user.uid}`;
                if (!sessionStorage.getItem(sessionLogKey)) {
                    await createLog("AUTH_LOGIN", `เข้าสู่ระบบ (Role: ${currentUserRole})`);
                    sessionStorage.setItem(sessionLogKey, "true");
                }
                scheduleOverlayRefresh(currentSiteKey);
                startAutoLogoutTimer();
            } catch (e) {
                console.error("Error fetching user role:", e);
                currentUserRole = 'viewer';
                document.body.classList.add('viewer-mode');
            }
            
        } else {
            if (appContent) appContent.classList.add('hidden');
            if (loginPrompt) loginPrompt.classList.remove('hidden');
            
            if (currentUser) sessionStorage.removeItem(`logged_in_${currentUser.uid}`);
            currentUser = null;
            currentUserRole = 'viewer';
            currentUserAllowedSites = [];
            currentUserFullName = '';
            currentUserPhone = '';
            
            document.body.classList.remove('viewer-mode'); 
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
        locationSelect.addEventListener("change", function() {
            switchSite(this.value);
        });
        try {
            let initialSiteKey = locationSelect.value;
            if (!sites[initialSiteKey]) initialSiteKey = Object.keys(sites)[0];
            switchSite(initialSiteKey);
        } catch (error) {}
    }
});


let countdownInterval; 
const LOGOUT_TIME_LIMIT = 60 * 60 * 1000; 
window.startAutoLogoutTimer = function() {
    stopAutoLogoutTimer(); 
    let expirationTime = localStorage.getItem('logoutExpiration'); 
    if (!expirationTime) { 
        expirationTime = Date.now() + LOGOUT_TIME_LIMIT; 
        localStorage.setItem('logoutExpiration', expirationTime); 
    }
    countdownInterval = setInterval(() => {
        let timeLeft = Math.ceil((expirationTime - Date.now()) / 1000); 
        if (timeLeft <= 0) { 
            stopAutoLogoutTimer(); 
            localStorage.removeItem('logoutExpiration'); 
            logout(); 
            return; 
        }
        const minElem = document.getElementById('timerMinutes'); 
        const secElem = document.getElementById('timerSeconds');
        if (minElem && secElem) { 
            minElem.textContent = Math.floor(timeLeft / 60).toString().padStart(2, '0'); 
            secElem.textContent = (timeLeft % 60).toString().padStart(2, '0'); 
        }
    }, 1000);
};
window.stopAutoLogoutTimer = function() { 
    if (countdownInterval) clearInterval(countdownInterval); 
    localStorage.removeItem('logoutExpiration'); 
};

window.sendEmailNotify = async function(type, deviceName, baseRec, assetInfo, count) {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbyBgdIuxjOajJ10HZuJrskQGVxExt5j_DXcJMFcRrieo8WYktSnQT6xNCbIg7py6no-yg/exec"; 
    
    let title = (type === 'down') ? `🚨 แจ้งเตือนอุปกรณ์มีปัญหา (ครั้งที่ ${count})` : `✅ แจ้งเตือนซ่อมแซมเสร็จสิ้น `;
    const siteName = sites[currentSiteKey].name;
    const firebaseImageUrl = (type === 'down') ? (baseRec.brokenFileUrl || "") : (baseRec.fixedFileUrl || "");

    let subDeviceText = baseRec.subDevice ? ` (${baseRec.subDevice})` : '';
    let assetText = assetInfo ? `\n📦 ข้อมูลทรัพย์สิน: รุ่น ${assetInfo.model || '-'} | S/N: ${assetInfo.serial || '-'} | PEA No: ${assetInfo.peaNo || '-'}` : '';
    
    
    let docText = `\n📄 เลขที่ใบสั่ง: ${baseRec.orderNumber || '-'} | เลขที่หนังสือ กฟภ.: ${baseRec.docPEA || '-'} | เลขที่หนังสือ มท : ${baseRec.docMinistry || '-'}`;
    let costText = type === 'fixed' ? `\n💰 งบประมาณซ่อมแซม: ${baseRec.repairCost ? Number(baseRec.repairCost).toLocaleString() + ' บาท' : '-'}` : '';
    

    let userDetail = `(${currentUserPosition || '-'} ${currentUserDept || '-'})`;
    
   
    let brokenDateStr = formatThaiDate(baseRec.brokenDate); 
    let fixedDateStr = formatThaiDate(baseRec.fixedDate);

   
    let brokenUserDisplay = "";
    let fixedUserDisplay = "";

    if (type === 'down') {
     
        brokenUserDisplay = `${baseRec.user} ${userDetail}`;
        fixedUserDisplay = "-";
    } else {
       
        brokenUserDisplay = `${baseRec.user} ${userDetail}`;
       
        fixedUserDisplay = `${baseRec.user} ${userDetail}`;
    }

    let message = ` ${title}

🆔 เลขที่รายการ: ${baseRec.customId || '-'}
📍 สถานที่: ${siteName}
🛠️ อุปกรณ์: ${deviceName}${subDeviceText}${assetText}
📝 รายละเอียดปัญหา: ${baseRec.description || '-'}
📅 วันที่เกิดเหตุ: ${brokenDateStr}
👤 ชื่อ-สกุล ผู้แจ้งเหตุ: ${brokenUserDisplay}

💡 วิธีแก้ไข: ${baseRec.solution || '-'}${docText}${costText}
📅 วันที่ซ่อมแซม: ${fixedDateStr}
👤 ชื่อ-สกุล ผู้แจ้งซ่อมแซม: ${fixedUserDisplay}
------------------------------------------`;

    try { 
        await fetch(GAS_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            cache: 'no-cache', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                site: siteName, 
                message: message,
                firebaseImageUrl: firebaseImageUrl 
            }) 
        }); 
    } catch (err) {
        console.error("ส่งแจ้งเตือนล้มเหลว:", err);
    }
};

window.onload = function() { try { imageMapResize(); } catch (e) {} };


window.addEventListener('resize', function() {
    clearTimeout(window.overlayResizeTimer);
    window.overlayResizeTimer = setTimeout(function() {
        if (typeof imageMapResize === 'function') imageMapResize();
        if (currentSiteKey) window.updateDeviceStatusOverlays(currentSiteKey, true);
    }, 300);
});

window.printReport = async function() {
    const siteData = sites[currentSiteKey];
    Swal.fire({ title: 'กำลังโหลดข้อมูลประวัติ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const docsSnap = await getSiteCollection(currentSiteKey).get();
    const dataMap = {};
    docsSnap.forEach(d => dataMap[d.id] = d.data());
    Swal.close();

    let html = '<div class="flex flex-col gap-4 text-left">';
    let hasRecords = false;

    for (const dev of siteData.devices) {
        const docData = dataMap[dev] || {};
        const records = docData.records || [];
        if (records.length === 0) continue;
        
        hasRecords = true;
        const safeDevId = dev.replace(/[^a-zA-Z0-9]/g, '_');

        html += `<div class="border border-slate-200 p-4 rounded-xl bg-slate-50/50">
                    <h4 class="font-bold text-blue-800 flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                        <input type="checkbox" onchange="toggleDeviceGroup(this, '${safeDevId}')" class="w-4 h-4 dev-checkbox cursor-pointer" checked>
                        📦 ${dev}
                    </h4>
                    <div class="ml-6 flex flex-col gap-2" id="group-${safeDevId}">`;

records.sort((a, b) => a.ts - b.ts).forEach((r, idx) => {
    const statusText = r.status === 'down' ? 'ชำรุด' : (r.status === 'abnormal' ? 'ผิดปกติ' : '✅ ปกติ');
    const repairingText = (r.acknowledgedAt && (r.status === 'down' || r.status === 'abnormal') && !r.fixedDate) ? ' • กำลังซ่อมแซม' : ''; 
    let subDeviceStr = r.subDevice ? ` <span class="text-blue-600 font-bold">[${r.subDevice}]</span>` : '';
    const desc = r.description || '-';

    html += `
    <label class="flex items-center gap-3 text-sm cursor-pointer hover:bg-white p-2 rounded transition-colors border border-transparent hover:border-slate-200">
        <input type="checkbox" class="record-checkbox w-4 h-4 text-blue-600 shrink-0" value="${dev.replace(/'/g,"\\'")}|${r.ts}" checked>
        <div class="flex flex-1 items-center gap-2 min-w-0">
            <span class="text-slate-700 font-medium whitespace-nowrap">ครั้งที่ ${idx + 1}${subDeviceStr}</span>
            <span class="text-slate-400">|</span>
            <span class="text-slate-500 whitespace-nowrap">${formatThaiDate(r.brokenDate)}</span>
            <span class="text-slate-400">|</span>
            <span class="text-slate-500 truncate italic flex-1" title="${escapeHtml(desc)}">
                ${escapeHtml(desc)}
            </span>
        </div>
        <span class="text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${r.status !== 'ok' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">
            ${statusText}
        </span>
    </label>`;
});
        html += `</div></div>`;
    }

    if (!hasRecords) { Swal.fire('ไม่มีข้อมูล', 'ไม่มีประวัติการชำรุดในสถานที่นี้เลย', 'info'); return; }
    html += '</div>';
    document.getElementById('reportSelectionContainer').innerHTML = html;
    const reportModal = document.getElementById('reportModal');
    reportModal.classList.remove('hidden');
    reportModal.classList.add('flex');
    window.tempReportDataMap = dataMap;
};


function openReportModal() {
  const modal = document.getElementById('reportModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.classList.add('overflow-hidden');
}
function closeReportModal() {
  const modal = document.getElementById('reportModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.classList.remove('overflow-hidden');
}
window.selectAllReport = function(isChecked) { document.querySelectorAll('#reportSelectionContainer input[type="checkbox"]').forEach(cb => cb.checked = isChecked); };
window.toggleDeviceGroup = function(cb, safeDevId) { document.querySelectorAll(`#group-${safeDevId} .record-checkbox`).forEach(childCb => childCb.checked = cb.checked); };
window.generateSelectedReport = async function () {
    const siteData = sites[currentSiteKey];
    const selectedCheckboxes = Array.from(document.querySelectorAll('.record-checkbox:checked')).map(cb => cb.value);
    
    if (selectedCheckboxes.length === 0) {
        Swal.fire('ระบุข้อมูล', 'กรุณาเลือกรายการอย่างน้อย 1 รายการ', 'warning');
        return;
    }

    const dataMap = window.tempReportDataMap;
    const groupedData = {}; 
    selectedCheckboxes.forEach(v => {
        const [devName, ts] = v.split('|');
        const docData = dataMap[devName] || {};
        const records = docData.records || [];
        const targetRec = records.find(r => String(r.ts) === String(ts));

        if (targetRec) {
            const assetInfo = docData.assetInfo || {};
            const subName = targetRec.subDevice || "";
            
            let groupKey;
            let displayTitle;
            
            if (devName === "Other") {
                groupKey = `Other_${subName}`; 
                displayTitle = subName ? `Other [${subName}]` : "Other";
            } else {
                groupKey = devName; 
                displayTitle = devName;
            }

            if (!groupedData[groupKey]) {
                groupedData[groupKey] = {
                    title: displayTitle,
                    assetInfo: assetInfo,
                    items: []
                };
            }
            groupedData[groupKey].items.push(targetRec);
        }
    });

    let bodyHtml = '';
    let deviceNo = 1;

    
    for (const key in groupedData) {
        const group = groupedData[key];
        const asset = group.assetInfo;
        group.items.sort((a, b) => a.ts - b.ts);

        bodyHtml += `
        <div class="device-section">
            <div class="device-header">
                <div class="device-title">${deviceNo++}. ${group.title}</div>
                <div class="device-spec">
                    S/N : ${asset.serial || '-'} | Model : ${asset.model || '-'} | 
                    PEA No. : ${asset.peaNo || '-'} | Price : ${asset.price || '-'} | 
                    Warranty : ${formatThaiDate(asset.warrantyStart)} → ${formatThaiDate(asset.warrantyEnd)}
                </div>
            </div>
            <table class="device-table">
                <thead>
                    <tr>
                        <th style="width:3%">No.</th>
                        <th style="width:8%">Down Date</th>
                        <th style="width:8%">Fixed Date</th>
                        <th style="width:24%">Description</th>
                        <th style="width:24%">Solution</th>
                        <th style="width:17%">Details</th>
                        <th style="width:16%">User</th>
                    </tr>
                </thead>
                <tbody>`;

        group.items.forEach((r, idx) => {
            let imgBroken = r.brokenFileUrl ? `<div class="img"><img src="${r.brokenFileUrl}"></div>` : '';
            let imgFixed = r.fixedFileUrl ? `<div class="img"><img src="${r.fixedFileUrl}"></div>` : '';
             let subDeviceStm = r.subDevice ? ` <span class="text-blue-600 font-bold">[${r.subDevice}]</span>` : '';
            bodyHtml += `
            <tr>
                <td class="center">${idx + 1}</td>
                <td class="center">${formatThaiDate(r.brokenDate)}</td>
                <td class="center">${r.fixedDate ? formatThaiDate(r.fixedDate) : '<span class="pending">PENDING</span>'}</td>
                <td>${r.description || '-' } <br>${subDeviceStm} ${imgBroken}</td>
                <td>${r.solution || '-'} ${imgFixed}</td>
                <td class="details">
                    <div><b>ราคาซ่อมแซม:</b> ${r.repairCost ? Number(r.repairCost).toLocaleString() : '-'}</div>
                    <div><b>เลขที่ใบสั่ง:</b> ${r.orderNumber || '-'}</div>
                    <div class="doc-line"><b>หนังสือ มท</b> ${r.docMinistry || '-'}</div>
                    <div><b>หนังสือ กฟภ.</b> ${r.docPEA || '-'}</div>
                    <div><b>สถานะซ่อม:</b> ${r.fixedDate ? 'ซ่อมแล้ว' : ((r.acknowledgedAt && (r.status === 'down' || r.status === 'abnormal') && !r.fixedDate) ? 'กำลังซ่อมแซม' : 'รอดำเนินการ')}</div>
                    <div><b>ชื่อ-สกุล ผู้รับทราบ :</b> ${r.acknowledgedBy || '-'}</div>
                    <div><b>วันที่-เวลา :</b> ${r.acknowledgedAt ? formatThaiDateTime(r.acknowledgedAt) : '-'}</div>
                </td>
                <td class="center">
                    <div class="user-block"><b>ชื่อ-สกุล ผู้แจ้งเหตุ</b><br>${r.brokenUser || '-'}<div class="user-sub">(${r.brokenUserPos || ''} ${r.brokenUserDept || ''})</div></div>
                    <div class="user-block"><b>ชื่อ-สกุล ผู้แจ้งซ่อมแซม</b><br>${r.fixedUser || '-'}<div class="user-sub">(${r.fixedUserPos || ''} ${r.fixedUserDept || ''})</div></div>
                </td>
            </tr>`;
        });
        bodyHtml += `</tbody></table></div>`;
    }

    closeReportModal();
    const w = window.open('', '', 'width=1200,height=900');
    w.document.write(`
<html><head><title>PEA_REPORT_${siteData.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
    @page { size: A4 portrait; margin: 18mm; }
    @media print {
        thead { display: table-header-group; } 
        tr { page-break-inside: avoid; }
        .device-section { page-break-inside: auto; }
    }
    body { font-family: 'Sarabun', sans-serif; font-size: 11px; margin: 0; color: #333; }
    .header { display: flex; align-items: center; border-bottom: 3px solid #6a1b9a; padding-bottom: 8px; margin-bottom: 15px; }
    .logo { width: 150px; margin-right: 15px; }
    .title { flex: 1; text-align: center; } 
    .title-main { font-size: 16px; font-weight: 700; color: #6a1b9a; } 
    .header-right { font-size: 10px; text-align: right; }
    .device-section { margin-bottom: 25px; }
    .device-header { background: #f3f0ff; border-left: 5px solid #6a1b9a; padding: 8px; border-top: 1px solid #ddd; border-right: 1px solid #ddd; }
    .device-title { font-weight: 700; font-size: 12px; } 
    .device-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .device-table th { background: #6a1b9a; color: #fff; border: 1px solid #000; padding: 5px; font-size: 9px; }
    .device-table td { border: 1px solid #000; padding: 5px; font-size: 9px; vertical-align: top; word-break: break-word; }
    .center { text-align: center; } 
    .img img { width: 100%; height: 120px; object-fit: cover; margin-top: 3px; border: 1px solid #eee; }
    .pending { color: red; font-weight: bold; }
    .signature { margin-top: 50px; display: flex; justify-content: space-around; page-break-inside: avoid; }
    .sig-box { text-align: center; } 
    .sig-line { border-bottom: 1px solid #000; width: 180px; height: 35px; margin-bottom: 6px; }
</style>
</head>
<body>
    <div class="header">
        <img class="logo" src="provincial-electricity-authority.png">
        <div class="title">
            <div class="title-main">ASSET MAINTENANCE REPORT</div>
            <div class="title-sub">การไฟฟ้าส่วนภูมิภาค (Provincial Electricity Authority)</div>
        </div>
        <div class="header-right">SITE : ${siteData.name}<br>DATE : ${formatThaiDate(new Date())}<br>TIME : ${new Date().toLocaleTimeString('th-TH')}</div>
    </div>
    ${bodyHtml}
    <div class="signature">
        <div class="sig-box"><div class="sig-line"></div><b>${currentUserFullName || ''}</b><br>ผู้จัดทำรายงาน</div>
        <div class="sig-box"><div class="sig-line"></div>........................................<br>ผู้ตรวจสอบ</div>
        <div class="sig-box"><div class="sig-line"></div>........................................<br>ผู้อนุมัติ</div>
    </div>
</body>
</html>`);
    w.document.close();
};
