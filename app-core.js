/* Extracted from main.js: 1-1406. Keep script order in index.html. */
/* หัวข้อ: Firebase - ตั้งค่าการเชื่อมต่อบริการ Auth, Firestore และ Storage */
const firebaseConfig = window.AppConfig && window.AppConfig.firebaseConfig;
if (!firebaseConfig) {
    throw new Error("ไม่พบการตั้งค่า Firebase: โปรดกำหนด window.AppConfig.firebaseConfig ใน config.js");
}
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();
const devicesCol = db.collection("devices");

let cachedDeviceStatus = {}; 
let cachedDeviceAlerts = {}; // เพิ่มใหม่: เก็บข้อมูล "อุปกรณ์ที่มีปัญหายังไม่รับทราบ" ต่อไซต์
/* หัวข้อ: Date Utils - แปลงวันที่ไทย/สากลให้ใช้ร่วมกับฟอร์มและรายงาน */
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

/* หัวข้อ: App State - เก็บสถานะผู้ใช้ หน้า และอุปกรณ์ที่กำลังทำงาน */
let currentSiteKey = "ko-phaluay";
let siteSwitchVersion = 0;
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
const SUPER_ADMIN_EMAIL = 'panattapon.sum@gmail.com'; 
/* หัวข้อ: Auth/Permissions - ตรวจสิทธิ์การดูแลไซต์ การ และการปิดงานซ่อม */
function isAdminRole(role = currentUserRole) {
    return role === 'admin' || (role === 'superadmin' && currentUser?.email === SUPER_ADMIN_EMAIL);
}
function isSuperAdmin() {
    return currentUserRole === 'superadmin' && currentUser?.email === SUPER_ADMIN_EMAIL;
}
function hasAssignedSiteAccess(siteKey = currentSiteKey) {
    return currentUserAllowedSites.includes(siteKey) || currentUserAllowedSites.includes('all');
}
function canReadSiteData(siteKey = currentSiteKey) {
    if (!currentUser) return false;
      if (isAdminRole()) return true;
    if (currentUserRole === 'viewer') return false;
    if (currentUserRole === 'editor' || currentUserRole === 'engineer') return hasAssignedSiteAccess(siteKey);
    return false;
}
function hasWriteAccess(siteKey = currentSiteKey) {
     if (isAdminRole()) return true;
    return currentUserRole === 'editor' && hasAssignedSiteAccess(siteKey);
}
function hasEngineerSiteAccess(siteKey = currentSiteKey) {
     return currentUserRole === 'engineer' && hasAssignedSiteAccess(siteKey);
}
function canAcknowledgeIssue(siteKey = currentSiteKey) {
    return currentUserRole === 'admin' || hasWriteAccess(siteKey) || hasEngineerSiteAccess(siteKey);
}
function canEditIssueData(siteKey = currentSiteKey) {
    return isAdminRole() || hasWriteAccess(siteKey) || hasEngineerSiteAccess(siteKey);
}
function canMarkFixed(siteKey = currentSiteKey) {
    return currentUserRole === 'admin' || hasEngineerSiteAccess(siteKey);
}
function canManageMap() { return isSuperAdmin(); }
function getReadableSiteKeys() {
    const keys = Object.keys(sites || {});
    if (isAdminRole()) return keys;
    if (!currentUser || currentUserRole === 'viewer') return [];
    if (currentUserAllowedSites.includes('all')) return keys;
    return keys.filter(key => currentUserAllowedSites.includes(key));
}
function getDefaultReadableSiteKey() {
    return getReadableSiteKeys()[0] || null;
}
function applySiteAccessOptions() {
    const locationSelect = document.getElementById('location-select');
    if (!locationSelect) return;
    const readable = new Set(getReadableSiteKeys());
    Array.from(locationSelect.options).forEach(option => {
         if (option.value === '') {
            option.hidden = false;
            option.disabled = false;
            return;
        }
        const allowed = readable.has(option.value);
        option.hidden = !allowed;
        option.disabled = !allowed;
    });
     if (typeof window.syncSidebarSiteMenu === 'function') window.syncSidebarSiteMenu();
}
function showWelcomeSitePage() {
    document.body.classList.add('home-site-mode');
    document.querySelectorAll('.map-container').forEach(el => el.classList.add('hidden'));
    const welcomeMap = document.getElementById('map-welcome');
    if (welcomeMap) welcomeMap.classList.remove('hidden');
    const locationSelect = document.getElementById('location-select');
    if (locationSelect) locationSelect.value = '';
    if (typeof window.syncSidebarSiteMenu === 'function') window.syncSidebarSiteMenu();
    const title = document.getElementById('locationTitle');
    if (title) title.textContent = '🏠 หน้าแรก - กรุณาเลือกไซต์ที่คุณมีสิทธิ์เข้าถึง';
    updateAssetDisplays(null);
}
function showNoSiteAccessMessage() {
    document.body.classList.add('home-site-mode');
    document.querySelectorAll('.map-container').forEach(el => el.classList.add('hidden'));
    const welcomeMap = document.getElementById('map-welcome');
    if (welcomeMap) welcomeMap.classList.remove('hidden');
    const title = document.getElementById('locationTitle');
    if (title) title.textContent = '🔒 ไม่มีสิทธิ์ดูข้อมูลไซต์';
    const history = document.getElementById('historySection');
    if (history) history.innerHTML = '<p class="text-center py-4 text-gray-400">ไม่มีสิทธิ์ดูข้อมูลประวัติชำรุด</p>';
    updateAssetDisplays(null);
}
/* หัวข้อ: Config - โหลดค่ารายชื่อไซต์/อุปกรณ์จากไฟล์ config.js และรองรับ override จาก Firestore */
let sites = window.AppConfig?.defaultSites || {};
const OTHER_SUBDEVICES = window.AppConfig?.otherSubdevices || {};
const sitePrefixes = window.AppConfig?.sitePrefixes || {};

async function loadSitesConfig() {
     if (!auth.currentUser) {
        return sites;
    }
    try {
        const snap = await db.collection('app_config').doc('sites').get();
        if (snap.exists && snap.data().sites && typeof snap.data().sites === 'object') {
            sites = snap.data().sites;
        }
    } catch (error) {
         if (error?.code !== 'permission-denied') {
            console.warn('ใช้ config จากไฟล์ เนื่องจากโหลด app_config/sites ไม่สำเร็จ:', error);
        }
    }
    return sites;
}

window.saveSitesConfig = async function(updatedSites) {
    if (!isAdminRole()) {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่แก้ไขรายชื่อไซต์/อุปกรณ์ได้', 'error');
        return false;
    }
    if (!window.AppValidation?.validateSitesConfig(updatedSites)) {
        Swal.fire('ข้อมูลไม่ถูกต้อง', 'รูปแบบ config ไซต์ไม่ถูกต้อง', 'warning');
        return false;
    }
    await db.collection('app_config').doc('sites').set({ sites: updatedSites, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    sites = updatedSites;
    return true;
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
function getSiteAssetsCollection(siteKey) { return db.collection(`sites`).doc(siteKey).collection(`assets`); }
function isPermissionDenied(error) { return error?.code === 'permission-denied'; }
function canReadAssetDetails() { return currentUserRole !== 'viewer'; }
function canReadAssetDetails(siteKey = currentSiteKey) { return canReadSiteData(siteKey) && currentUserRole !== 'viewer'; }
function removeAssetInfo(data) {
    if (!data || typeof data !== 'object') return data;
    const sanitized = { ...data };
    delete sanitized.assetInfo;
    return sanitized;
}
async function getAssetInfo(siteKey, device) {
      if (!canReadAssetDetails(siteKey)) return {};
    try {
        const assetSnap = await getSiteAssetsCollection(siteKey).doc(device).get();
        if (assetSnap.exists) return assetSnap.data().assetInfo || {};
    } catch (error) {
        if (!isPermissionDenied(error)) throw error;
    }
     try {
        const legacySnap = await getSiteCollection(siteKey).doc(device).get();
        return legacySnap.exists ? (legacySnap.data().assetInfo || {}) : {};
    } catch (error) {
        if (!isPermissionDenied(error)) throw error;
        return {};
    }
}

async function saveAssetInfo(siteKey, device, assetInfo) {
    return Promise.all([
        getSiteAssetsCollection(siteKey).doc(device).set({
            assetInfo,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }),
        // Keep the issue-history bucket free from asset data after an asset save.
        getSiteCollection(siteKey).doc(device).set({
            assetInfo: firebase.firestore.FieldValue.delete()
        }, { merge: true })
    ]);
}

async function getAllAssetDocs(siteKey) { return await getSiteAssetsCollection(siteKey).get(); }

async function getMergedDeviceDataMap(siteKey) {
    const dataMap = {};
    const canLoadAssets = canReadAssetDetails(siteKey);
    const assetDocsPromise = canLoadAssets ? getAllAssetDocs(siteKey) : Promise.resolve(null);
    const [deviceResult, assetResult] = await Promise.allSettled([getAllDevicesDocs(siteKey), assetDocsPromise]);

    if (deviceResult.status === 'fulfilled') {
        deviceResult.value.forEach(d => { dataMap[d.id] = canLoadAssets ? { ...d.data() } : removeAssetInfo(d.data()); });
    } else {
        throw deviceResult.reason;
    }

    if (!canLoadAssets) {
        return dataMap;
    }

    if (assetResult.status === 'fulfilled') {
        assetResult.value.forEach(d => {
            dataMap[d.id] = { ...(dataMap[d.id] || {}), assetInfo: d.data().assetInfo || {} };
        });
    } else if (isPermissionDenied(assetResult.reason)) {
        // Asset details are optional for users without Firestore read access; keep rendering device data.
    } else {
        throw assetResult.reason;
    }

     return dataMap;
}
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
    await getSiteCollection(siteKey).doc(device).set({
        records,
        downCount,
        currentStatus,
        assetInfo: firebase.firestore.FieldValue.delete()
    }, { merge: true });
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
switch (status) { case 'ok': return '<span class="tag tag-warranty-ok">🛡️ รับประกัน</span>'; 
    case 'warn': return '<span class="tag tag-warranty-warn">⚠️ ใกล้หมดประกัน</span>'; 
    case 'bad': return '<span class="tag tag-warranty-bad">🚫 หมดประกัน</span>'; 
    default: return '<span>-</span>'; }
}

function toggleWriteAccess(isLoggedIn) {
    const role = isLoggedIn ? currentUserRole : 'viewer';
    const isAdmin = isAdminRole(role);
    const isSuperAdminUser = isSuperAdmin();
    const isEditor = hasWriteAccess(currentSiteKey);
    const canManageIssues = canEditIssueData(currentSiteKey);

    const saveDataButton = document.getElementById('saveDataButton');
    if (saveDataButton) {
        saveDataButton.disabled = !canManageIssues;
        saveDataButton.title = canManageIssues ? '' : (isLoggedIn ? 'สิทธิ์ไม่เพียงพอ' : 'กรุณาลงชื่อเข้าใช้ก่อน');
    }
    ['clearDeviceButton', 'clearAllButton'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) { btn.disabled = !isEditor; btn.title = isEditor ? '' : 'สิทธิ์ไม่เพียงพอ'; 
        if (!isLoggedIn) btn.title = 'กรุณาลงชื่อเข้าใช้ก่อน'; }
    });

    const assetBtn = document.getElementById('saveAssetButton'); if (assetBtn) assetBtn.style.display = isAdmin ? 'inline-block' : 'none';
    const importLabel = document.getElementById('importButtonLabel'); if (importLabel) importLabel.style.display = isEditor ? 'inline-block' : 'none';
    const mapEditModeButton = document.getElementById('mapEditModeButton'); if (mapEditModeButton) mapEditModeButton.classList.toggle('hidden', !isSuperAdminUser);
    const manageUsersBtn = document.getElementById('manageUsersBtn'); if (manageUsersBtn) manageUsersBtn.classList.toggle('hidden', !isSuperAdminUser);
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
   if (document.getElementById('formModal').style.display === 'flex' && canReadSiteData(currentSiteKey)) loadHistory();
}

function isApiKeyReferrerBlocked(error) {
    const message = `${error?.message || ''} ${JSON.stringify(error?.serverResponse || {})}`;
    return message.includes('API_KEY_HTTP_REFERRER_BLOCKED') ||
        message.includes('Requests from referer') ||
        message.includes('referer') && message.includes('blocked');
}

function getFirebaseAuthErrorMessage(error) {
     if (error?.code === 'auth/unauthorized-domain') {
        return `โดเมน ${window.location.hostname || 'ปัจจุบัน'} ยังไม่ได้รับอนุญาตใน Firebase Authentication\n` +
            'กรุณาเพิ่มโดเมนนี้ที่ Firebase Console > Authentication > Settings > Authorized domains แล้วลองใหม่';
    }
    if (!isApiKeyReferrerBlocked(error)) return error?.message || 'ไม่สามารถเข้าสู่ระบบได้';
    const currentOrigin = window.location.origin || 'โดเมนปัจจุบัน';
    return [
        `Firebase ปฏิเสธโดเมน ${currentOrigin}`,
        'ให้ไปที่ Google Cloud Console > APIs & Services > Credentials > API key ของ Firebase project microgrid-th',
        `เพิ่ม HTTP referrer: ${currentOrigin}/*`,
        'ถ้าใช้ GitHub Pages แบบ project site ให้เพิ่ม path ของ repository ด้วย เช่น https://panattaponsum.github.io/MGC-PEA.Repaired-BETAver.2.1/*',
        'จากนั้นรอสักครู่และลองเข้าสู่ระบบใหม่'
    ].join('\n');
}

function shouldRetryLoginWithRedirect(error) {
    return ['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']
        .includes(error?.code);
}

async function login() {
    const loginButton = document.getElementById('loginButton');
    if (loginButton?.disabled) return;

    if (loginButton) {
        loginButton.disabled = true;
        loginButton.setAttribute('aria-busy', 'true');
        loginButton.classList.add('opacity-70', 'cursor-wait');
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        await auth.signInWithPopup(provider);
    } catch (error) {
        // Popup blockers are common in embedded/mobile browsers. Redirect keeps the
        // login action working without requiring the user to change browser settings.
        if (shouldRetryLoginWithRedirect(error)) {
            try {
                await auth.signInWithRedirect(provider);
                return;
            } catch (redirectError) {
                error = redirectError;
            }
        }

        if (error?.code !== 'auth/cancelled-popup-request') {
            await Swal.fire({
                title: 'Login ผิดพลาด',
                text: getFirebaseAuthErrorMessage(error),
                icon: 'error',
                customClass: { popup: 'text-left' }
            });
        }
    } finally {
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.removeAttribute('aria-busy');
            loginButton.classList.remove('opacity-70', 'cursor-wait');
        }
    }
}

window.logout = async function(isAutoLogout = false) {
    const expirationKey = currentUser ? `logoutExpiration_${currentUser.uid}` : null;
    if (currentUser) await createLog(isAutoLogout ? "AUTH_AUTO_LOGOUT" : "AUTH_LOGOUT", isAutoLogout ? "ออกจากระบบอัตโนมัติเมื่อครบเวลา" : "ผู้ใช้กดออกจากระบบ");
    if (expirationKey) localStorage.removeItem(expirationKey);
    sessionStorage.clear();
    await auth.signOut();
    location.reload();
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
    setPageBlur(true);
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
            if (d.action.includes("AUTH")) badgeClass = 'bg-green-100 text-green-700'; else if (d.action.includes("IMPORT")) badgeClass = 'bg-purple-100 text-purple-700'; else if (d.action.includes("EXPORT")) badgeClass = 'bg-cyan-100 text-cyan-700'; else if (d.action.includes("ACKNOWLEDGE")) badgeClass = 'bg-amber-100 text-amber-700'; else if (d.action.includes("UPDATE")) badgeClass = 'bg-blue-100 text-blue-700'; else if (d.action.includes("DELETE")) badgeClass = 'bg-red-100 text-red-700'; else if (d.action.includes("ADD") || d.action.includes("EDIT")) badgeClass = 'bg-yellow-100 text-yellow-700';
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

    setPageBlur(true);
};

window.closeLogModal = function() {
    const modal = document.getElementById('logModal');
    if (modal) {
        modal.classList.add('hidden');
    }

    refreshPageBlurState();
    
    const siteFilter = document.getElementById('logSiteFilter');
    const actionFilter = document.getElementById('logActionFilter');
    
    if (siteFilter) siteFilter.value = 'all';
    if (actionFilter) actionFilter.value = 'all';
    
    const tableBody = document.getElementById('logTableBody');
    if (tableBody) tableBody.innerHTML = '';
};

window.toggleBetongView = function(viewType) {
   
    const main = document.getElementById('betong-main-view');
    const sub1 = document.getElementById('betong-sub-view-1');
    const sub2 = document.getElementById('betong-sub-view-2');
    const sub3 = document.getElementById('betong-sub-view-3');
    const views = [main, sub1, sub2, sub3].filter(Boolean);

    views.forEach(view => view.classList.add('hidden'));

    const targetView = viewType === 'sub1' ? sub1
        : viewType === 'sub2' ? sub2
        : viewType === 'sub3' ? sub3
        : main;

    (targetView || main)?.classList.remove('hidden');

    const refreshBetongMap = () => {
        if (typeof imageMapResize === 'function') imageMapResize();
        window.updateDeviceStatusOverlays('betong');
        if (typeof window.renderDynamicMapPoints === 'function') {
            window.renderDynamicMapPoints('betong');
        }
    };

    refreshBetongMap();
    requestAnimationFrame(refreshBetongMap);
};
function setPageBlur(active) {
    document.body.classList.toggle('modal-blur-active', !!active);
    document.body.classList.toggle('overflow-hidden', !!active);
}

function isModalVisible(id) {
    const modal = document.getElementById(id);
    if (!modal) return false;
    const display = modal.style.display;
    return display !== 'none' && (!modal.classList.contains('hidden') || display === 'flex' || display === 'block');
}

function refreshPageBlurState() {
    const modalIds = ['formModal', 'assetModal', 'userModal', 'logModal', 'reportModal', 'groupModal'];
    setPageBlur(modalIds.some(isModalVisible));
}

function showSharedOverlay() {
    const overlay = document.getElementById('overlay');
    if (overlay) overlay.style.display = 'block';
    setPageBlur(true);
}

function hideSharedOverlayIfNoModal() {
    const overlay = document.getElementById('overlay');
    const sharedModalOpen = ['formModal', 'assetModal', 'userModal'].some(isModalVisible);
    if (overlay && !sharedModalOpen) overlay.style.display = 'none';
    refreshPageBlurState();
}

function getDeviceId(deviceEntry) {
    if (deviceEntry && typeof deviceEntry === 'object') return String(deviceEntry.id || deviceEntry.key || deviceEntry.name || '').trim();
    return String(deviceEntry || '').trim();
}

function getDeviceDisplayName(deviceEntry) {
    if (deviceEntry && typeof deviceEntry === 'object') return String(deviceEntry.name || deviceEntry.label || deviceEntry.id || deviceEntry.key || '').trim();
    return String(deviceEntry || '').trim();
}

function getSiteDeviceEntries(siteKey = currentSiteKey) {
    return Array.isArray(sites[siteKey]?.devices) ? sites[siteKey].devices : [];
}
function compareTextNatural(a, b) {
    return String(a || '').localeCompare(String(b || ''), ['th', 'en'], { numeric: true, sensitivity: 'base' });
}

function compareDeviceKeysByDisplayName(a, b, siteKey = currentSiteKey) {
    const nameCompare = compareTextNatural(getDeviceDisplayNameById(a, siteKey), getDeviceDisplayNameById(b, siteKey));
    if (nameCompare !== 0) return nameCompare;
    return compareTextNatural(a, b);
}

function getConfiguredDeviceIds(siteKey = currentSiteKey) {
    return getSiteDeviceEntries(siteKey).map(getDeviceId).filter(Boolean);
}

function getDeviceDisplayNameById(deviceId, siteKey = currentSiteKey) {
    const id = String(deviceId || '').trim();
    const entry = getSiteDeviceEntries(siteKey).find(device => getDeviceId(device) === id);
    return entry ? getDeviceDisplayName(entry) : id;
}


function resolveDeviceInputToId(deviceName, siteKey = currentSiteKey) {
    const raw = String(deviceName || '').trim();
    const entry = getSiteDeviceEntries(siteKey).find(device => getDeviceId(device) === raw || getDeviceDisplayName(device) === raw);
    return entry ? getDeviceId(entry) : raw;
}

function normalizeImportedDeviceSelection(deviceName, siteKey = currentSiteKey) {
    const raw = String(deviceName || '').trim();
    const otherDisplayName = getDeviceDisplayNameById('Other', siteKey);
    const escapedOtherDisplayName = otherDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parenthesisMatch = raw.match(new RegExp(`^(?:Other|${escapedOtherDisplayName})\\s*\\((.+)\\)$`, 'i'));
    const slashSelection = parseDeviceSelection(raw);

    if (parenthesisMatch) {
        return { deviceId: 'Other', subDevice: parenthesisMatch[1].trim() || null };
    }
    if (slashSelection.mainDevice === 'Other' && slashSelection.subDevice) {
        return { deviceId: 'Other', subDevice: slashSelection.subDevice };
    }

    return { deviceId: resolveDeviceInputToId(raw, siteKey), subDevice: null };
}


function getDisplayDeviceSelection(deviceName, siteKey = currentSiteKey) {
    const { mainDevice, subDevice } = parseDeviceSelection(deviceName);
    const mainLabel = getDeviceDisplayNameById(mainDevice, siteKey);
    return subDevice ? `${mainLabel} / ${subDevice}` : mainLabel;
}

function parseDeviceSelection(deviceName) {
    if (typeof deviceName !== 'string') return { mainDevice: deviceName, subDevice: null };
    const parts = deviceName.split(' / ').map(p => p.trim()).filter(Boolean);
    if (parts[0] === 'Other' && parts.length > 1) {
        return { mainDevice: 'Other', subDevice: parts.slice(1).join(' / ') };
    }
    return { mainDevice: deviceName.trim(), subDevice: null };
}

window.openForm = async function(deviceName) {
    const { mainDevice, subDevice } = parseDeviceSelection(deviceName);
    currentDevice = mainDevice; editIndex = -1;
    document.getElementById('formTitle').textContent = `บันทึกข้อมูล: ${getDisplayDeviceSelection(deviceName)}`;
    const othersContainer = document.getElementById('othersDeviceContainer');
    const othersSelect = document.getElementById('othersDeviceSelect');
    
    const otherSubdevices = OTHER_SUBDEVICES[currentSiteKey] || [];
    if (mainDevice === 'Other' && otherSubdevices.length) { 
       othersContainer.classList.remove('hidden'); 
        othersSelect.innerHTML = otherSubdevices
            .map(subdevice => `<option value="${escapeHtml(subdevice)}">${escapeHtml(subdevice)}</option>`)
            .join('');
        if (subDevice) {
            const hasOption = Array.from(othersSelect.options).some(opt => opt.value === subDevice);
            othersSelect.value = hasOption ? subDevice : othersSelect.options[0]?.value;
        }
    } else { 
        othersContainer.classList.add('hidden'); 
    }

     showSharedOverlay();
    document.getElementById('formModal').style.display = 'flex';
    document.getElementById('editHint').classList.add('hidden'); 
    document.getElementById('warrantyStatusDisplay').innerHTML = 'กำลังโหลด...'; 
    document.getElementById('assetInfoDisplay').innerHTML = '';
    clearForm(); await loadHistory(); 
}

window.closeForm = function() {
    document.getElementById('formModal').style.display = 'none';
    document.getElementById('assetModal').style.display = 'none'; hideSharedOverlayIfNoModal(); }

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
    document.getElementById('ministryFile').value = ''; document.getElementById('ministryFileLink').innerHTML = '';
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
    const saveValidation = window.AppValidation?.validateSavePermission({ currentUser, currentDevice, currentSiteKey, canAcknowledgeIssue });
    if (saveValidation && !saveValidation.ok) { Swal.fire('ไม่สามารถบันทึกได้', saveValidation.message, 'error'); return false; }

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
    const ministryFile = document.getElementById('ministryFile').files[0];
    const fixedFile = document.getElementById('fixedFile').files[0];
    const MAX_SIZE = 5 * 1024 * 1024;
    if (brokenFile && brokenFile.size > MAX_SIZE) { Swal.fire('ไฟล์ใหญ่เกินไป', 'หลักฐานแจ้งเสีย ต้องขนาดไม่เกิน 5 MB', 'warning'); return false; }
    if (ministryFile && ministryFile.size > MAX_SIZE) { Swal.fire('ไฟล์ใหญ่เกินไป', 'ไฟล์ มท. ต้องขนาดไม่เกิน 5 MB', 'warning'); return false; }
    if (fixedFile && fixedFile.size > MAX_SIZE) { Swal.fire('ไฟล์ใหญ่เกินไป', 'หลักฐานซ่อมแซม ต้องขนาดไม่เกิน 5 MB', 'warning'); return false; }

   

    let records = await getDeviceRecords(currentSiteKey, currentDevice); 
    if (statusVal === 'ok' && isEditing) {
        const originalRecord = records[editIndex];
        const isChangingDamagedRecordToOk = originalRecord && ['down', 'abnormal'].includes(originalRecord.status);
        if (isChangingDamagedRecordToOk && !originalRecord.acknowledgedAt) {
            Swal.fire('ยังไม่ได้รับทราบ', 'ต้องกด "รับทราบ" ก่อน จึงจะแก้ไขข้อมูลชำรุดเป็นสถานะใช้งานได้', 'warning');
            return false;
        }
    }

       Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    
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

if (currentDevice === 'Other' && (OTHER_SUBDEVICES[currentSiteKey] || []).length) { 
        baseRec.subDevice = document.getElementById('othersDeviceSelect').value; 
    }
   if (!isEditing) baseRec.brokenAt = Date.now();
   if (editIndex >= 0) {
        const originalRecord = records[editIndex];
        baseRec.customId = originalRecord.customId;
        baseRec.brokenFileUrl = originalRecord.brokenFileUrl || null;
        baseRec.brokenFileType = originalRecord.brokenFileType || null;
        baseRec.ministryFileUrl = originalRecord.ministryFileUrl || null;
        baseRec.ministryFileType = originalRecord.ministryFileType || null;
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
        if (ministryFile) { baseRec.ministryFileUrl = await uploadFileToStorage(ministryFile, 'ministry'); baseRec.ministryFileType = ministryFile.type; }
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

const assetInfo = await getAssetInfo(currentSiteKey, currentDevice);
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
if (assetInfo.model) infoParts.push(`รุ่น: ${escapeHtml(assetInfo.model)}`); if (assetInfo.serial) infoParts.push(`S/N: ${escapeHtml(assetInfo.serial)}`); if (assetInfo.peaNo) infoParts.push(`PEA No. : ${escapeHtml(assetInfo.peaNo)}`); if (assetInfo.ipAddress) infoParts.push(`IP: ${escapeHtml(assetInfo.ipAddress)}`);
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
        const [snap, loadedAssetInfo] = await Promise.all([docRef.get({ source: 'server' }), getAssetInfo(currentSiteKey, currentDevice)]); 
        if (snap.exists) { 
            docData = snap.data(); 
            records = docData.records || []; 
        }
          assetInfo = loadedAssetInfo || null;
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
    const canEdit = canEditIssueData(currentSiteKey) ? '' : 'disabled title="ไม่มีสิทธิ์จัดการข้อมูล" style="opacity: 0.5; cursor: not-allowed;"';
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
            let ministryLinkHtml = r.ministryFileUrl ? `<a href="${r.ministryFileUrl}" target="_blank" class="text-indigo-600 hover:underline inline-flex items-center gap-1">📄 ไฟล์ มท.</a>` : '';
            let fixedLinkHtml = r.fixedFileUrl ? `<a href="${r.fixedFileUrl}" target="_blank" class="text-green-600 hover:underline inline-flex items-center gap-1">📄 หลักฐานซ่อมแซม</a>` : '';
            
              if (brokenLinkHtml || ministryLinkHtml || fixedLinkHtml) {
                filesHtml = `<div class="mt-2 pt-2 border-t border-gray-100 flex flex-wrap gap-4 text-xs font-semibold">${brokenLinkHtml} ${ministryLinkHtml} ${fixedLinkHtml}</div>`;
              }
        } else {
            // กรณีเป็น viewer และมีการอัปโหลดรูปไว้ ให้แสดงข้อความแจ้งเตือนแทนการแสดงลิงก์
           if (r.brokenFileUrl || r.ministryFileUrl || r.fixedFileUrl) {
                filesHtml = `<div class="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400 italic">🔒 รูปภาพ/ไฟล์แนบถูกจำกัดสิทธิ์ตามไซต์ที่ได้รับอนุญาต</div>`;
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
                <div>เลขที่ใบสั่ง : <span class="font-semibold ">${escapeHtml(r.orderNumber || '-')}</span></div>
                <div>ราคาซ่อมแซม : <span class="font-semibold ">${r.repairCost ? Number(r.repairCost).toLocaleString() + ' บาท' : '-'}</span></div>
                <div>หนังสือ มท : <span class="font-semibold">${escapeHtml(r.docMinistry || '-')}</span></div>
                <div>ลงวันที่ : <span class="font-semibold">${r.docPEA ? formatThaiDate(r.docPEA) : '-'}</span></div>
                <div class="col-span-2 text-red-600">ระยะเวลาที่เกิดเหตุ: ${duration}</div>
            </div>
            <div class="mt-3 text-sm text-gray-600 "><b>รายละเอียดปัญหา :</b> "${escapeHtml(r.description || '-')}"</div>
            <div class="mt-1 text-sm text-gray-600"><b>วิธีแก้ไข :</b> ${escapeHtml(r.solution || '-')}</div>
            
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
     if (recordToDelete.ministryFileUrl) {
        try { await firebase.storage().refFromURL(recordToDelete.ministryFileUrl).delete(); } catch(e) { console.warn("Failed to delete ministryFile:", e); }
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
    if (!canEditIssueData(currentSiteKey)) return;
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
    if (currentDevice === 'Other' && (OTHER_SUBDEVICES[currentSiteKey] || []).length && r.subDevice) {
    document.getElementById('othersDeviceSelect').value = r.subDevice;
    }

    document.getElementById('brokenFileLink').innerHTML = r.brokenFileUrl ? `<a href="${r.brokenFileUrl}" target="_blank" class="hover:underline">มีไฟล์แนบเดิม (คลิกดู) - อัปโหลดใหม่เพื่อเขียนทับ</a>` : '';
    document.getElementById('ministryFileLink').innerHTML = r.ministryFileUrl ? `<a href="${r.ministryFileUrl}" target="_blank" class="hover:underline">มีไฟล์ มท. เดิม (คลิกดู) - อัปโหลดใหม่เพื่อเขียนทับ</a>` : '';
    document.getElementById('fixedFileLink').innerHTML = r.fixedFileUrl ? `<a href="${r.fixedFileUrl}" target="_blank" class="hover:underline">มีไฟล์แนบเดิม (คลิกดู) - อัปโหลดใหม่เพื่อเขียนทับ</a>` : '';

    editIndex = idx; document.getElementById('editHint').classList.remove('hidden');
};

window.openAssetModal = async function() {
if (!currentDevice || !canReadAssetDetails(currentSiteKey)) { Swal.fire('ไม่มีสิทธิ์', 'คุณไม่มีสิทธิ์ดูข้อมูลรายการทรัพย์สินของไซต์นี้', 'error'); return; }
    document.getElementById('assetFormTitle').textContent = `📋 ข้อมูลทรัพย์สิน: ${currentDevice}`;
    document.getElementById('formModal').style.display = 'none'; 
    document.getElementById('assetModal').style.display = 'flex'; 
    setPageBlur(true); 
    await loadAssetData();
}

window.closeAssetModal = function(showMainModal = true) {
document.getElementById('assetModal').style.display = 'none'; if (showMainModal && currentDevice) document.getElementById('formModal').style.display = 'flex'; 
}

async function loadAssetData() {
    let assetInfo = await getAssetInfo(currentSiteKey, currentDevice);
    const inputIds = ['assetSerial', 'assetModel', 'assetPeaNo', 'assetIpAddress', 'assetPrice', 'assetManufacturer', 'assetLocation', 'assetWarrantyStart', 'assetWarrantyEnd'];
     const isAdmin = isAdminRole();

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = !isAdmin; if (!isAdmin) el.classList.add('bg-gray-700', 'text-gray-400', 'cursor-not-allowed'); else el.classList.remove('bg-gray-700', 'text-gray-400', 'cursor-not-allowed'); }
    });

    const saveBtn = document.getElementById('saveAssetButton'); if (saveBtn) saveBtn.style.display = isAdmin ? 'inline-block' : 'none';
    // safeDate: คืน string ที่ input[type=date] รับได้ (YYYY-MM-DD) หรือ '' ถ้าข้อมูลเสีย
    const safeDate = (val) => {
        if (!val || val === '-' || val === 'null') return '';
        const d = new Date(val);
        return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
    };
    document.getElementById('assetSerial').value = assetInfo.serial || '';
    document.getElementById('assetModel').value = assetInfo.model || '';
    document.getElementById('assetPeaNo').value = assetInfo.peaNo || '';
    document.getElementById('assetPrice').value = assetInfo.price || '';
    document.getElementById('assetIpAddress').value = assetInfo.ipAddress || '';
    document.getElementById('assetManufacturer').value = assetInfo.manufacturer || '';
    document.getElementById('assetLocation').value = assetInfo.location || '';
    document.getElementById('assetWarrantyStart').value = safeDate(assetInfo.warrantyStart);
    document.getElementById('assetWarrantyEnd').value = safeDate(assetInfo.warrantyEnd);
    const ws = safeDate(assetInfo.warrantyStart), we = safeDate(assetInfo.warrantyEnd);
    if (ws && we) document.getElementById('assetWarrantyYears').value = Math.round(((new Date(we)) - (new Date(ws))) / (1000 * 60 * 60 * 24 * 365.25) * 10) / 10; else document.getElementById('assetWarrantyYears').value = '';
    updateAssetWarrantyStatusField();

    // แสดงรูปภาพอุปกรณ์ (ถ้ามี)
    const preview = document.getElementById('assetImagePreview');
    const placeholder = document.getElementById('assetImagePlaceholder');
    const imageLink = document.getElementById('assetImageLink');
    document.getElementById('assetImageFile').value = '';
    if (assetInfo.imageUrl) {
        preview.src = assetInfo.imageUrl;
        preview.classList.remove('hidden');
        if (placeholder) placeholder.classList.add('hidden');
        if (imageLink) imageLink.innerHTML = `<a href="${assetInfo.imageUrl}" target="_blank" class="hover:underline">มีรูปภาพเดิม (คลิกดู) — อัปโหลดใหม่เพื่อเปลี่ยน</a>`;
    } else {
        preview.src = '';
        preview.classList.add('hidden');
        if (placeholder) placeholder.classList.remove('hidden');
        if (imageLink) imageLink.innerHTML = '';
    }
}

window.saveAssetData = async function() {
   if (!isAdminRole()) { Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าถึง', text: `เฉพาะ Admin เท่านั้น` }); return; }
    if (!currentDevice) return;
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    let imageUrl = null;
    try {
        const existingAsset = await getAssetInfo(currentSiteKey, currentDevice);
        imageUrl = existingAsset.imageUrl || null;
        const imageFile = document.getElementById('assetImageFile').files[0];
        if (imageFile) {
            const ref = storage.ref().child(`attachments/${currentSiteKey}/${currentDevice}/assetImage/${Date.now()}_${imageFile.name}`);
            await ref.put(imageFile);
            imageUrl = await ref.getDownloadURL();
        }
    } catch(e) { Swal.fire('อัปโหลดรูปภาพล้มเหลว', e.message, 'error'); return; }
     const assetInfo = { serial: document.getElementById('assetSerial').value, model: document.getElementById('assetModel').value, peaNo: document.getElementById('assetPeaNo').value, ipAddress: document.getElementById('assetIpAddress').value, price: document.getElementById('assetPrice').value, manufacturer: document.getElementById('assetManufacturer').value, location: document.getElementById('assetLocation').value, warrantyStart: document.getElementById('assetWarrantyStart').value, warrantyEnd: document.getElementById('assetWarrantyEnd').value };
    if (imageUrl) assetInfo.imageUrl = imageUrl;
    try { await saveAssetInfo(currentSiteKey, currentDevice, assetInfo); Swal.fire('บันทึกสำเร็จ', 'ข้อมูลทรัพย์สินถูกบันทึกแล้ว', 'success'); updateAssetDisplays(assetInfo); window.updateDeviceSummary(); closeAssetModal(true); } catch (e) { Swal.fire('ผิดพลาด', e.message, 'error'); }
}

function updateAssetWarrantyStatusField() {
const status = getWarrantyStatus(document.getElementById('assetWarrantyEnd').value); const field = document.getElementById('assetWarrantyStatus');
switch (status) { case 'ok': field.value = 'รับประกัน'; break; case 'warn': field.value = 'ใกล้หมดประกัน'; break; case 'bad': field.value = 'หมดประกัน'; break; default: field.value = 'N/A'; }
}

window.previewAssetImage = function(input) {
    const preview = document.getElementById('assetImagePreview');
    const placeholder = document.getElementById('assetImagePlaceholder');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        };
        reader.readAsDataURL(input.files[0]);
    }
};

function setupWarrantyCalculators() {
const startEl = document.getElementById('assetWarrantyStart'); const yearsEl = document.getElementById('assetWarrantyYears'); const endEl = document.getElementById('assetWarrantyEnd');
function calculateEnd() { if (startEl.value && yearsEl.value) { const startDate = new Date(startEl.value); const years = parseFloat(yearsEl.value); if (!isNaN(startDate) && years > 0) { startDate.setFullYear(startDate.getFullYear() + Math.floor(years)); const fractionalDays = (years % 1) * 365.25; startDate.setDate(startDate.getDate() + Math.round(fractionalDays)); endEl.value = startDate.toISOString().split('T')[0]; updateAssetWarrantyStatusField(); } } }
function calculateYears() { if (startEl.value && endEl.value) { const startDate = new Date(startEl.value); const endDate = new Date(endEl.value); if (!isNaN(startDate) && !isNaN(endDate) && endDate > startDate) { yearsEl.value = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24 * 365.25) * 100) / 100; updateAssetWarrantyStatusField(); } } }
startEl.addEventListener('change', calculateEnd); yearsEl.addEventListener('change', calculateEnd); endEl.addEventListener('change', calculateYears); endEl.addEventListener('change', updateAssetWarrantyStatusField);
}

window.openUserManagement = async function() { 
     if (!isSuperAdmin()) return;
    showSharedOverlay();
    document.getElementById('userModal').style.display = 'flex';
    await loadUsers(); }
window.closeUserManagement = function() { 
    document.getElementById('userModal').style.display = 'none'; 
    hideSharedOverlayIfNoModal(); 
}


window.loadUsers = async function() {
     if (!isSuperAdmin()) return;
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
             const isSuperAdminMain = (email === SUPER_ADMIN_EMAIL);
            const safeId = email.replace(/[@.]/g, ''); 
            
            const div = document.createElement('div'); 
            div.className = 'bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3';
            
            const roleOptions = `
                <option value="viewer" ${role==='viewer'?'selected':''}>Viewer</option>
                <option value="editor" ${role==='editor'?'selected':''}>Editor</option>
                <option value="engineer" ${role==='engineer'?'selected':''}>Engineer</option>
                <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
                 ${isSuperAdminMain ? `<option value="superadmin" ${role==='superadmin'?'selected':''}>Super Admin</option>` : ''}
            `;

            const sitesHtml = Object.keys(sites).map(key => `
                <label class="flex items-center gap-1 text-[10px] whitespace-nowrap cursor-pointer">
                    <input type="checkbox" class="site-cb-${safeId} rounded text-blue-600" value="${key}" ${allowedSites.includes(key) ? 'checked' : ''}>
                    ${sites[key].name.split(' ')[0]}
                </label>
            `).join('');
            
            let deleteBtn = ''; 
            if (!isSuperAdminMain && !isMe) {
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
     if (!isSuperAdmin()) return;
    
    const newRole = document.getElementById(`role-${safeId}`).value;
    const newName = document.getElementById(`name-${safeId}`).value.trim();
    const newPos = document.getElementById(`pos-${safeId}`).value.trim();
    const newDept = document.getElementById(`dept-${safeId}`).value.trim();
    const newPhone = document.getElementById(`phone-${safeId}`).value.trim(); 
    
    const allowedSitesCb = document.querySelectorAll(`.site-cb-${safeId}:checked`);
    const newAllowedSites = Array.from(allowedSitesCb).map(cb => cb.value);

     if (newRole === 'superadmin' && email !== SUPER_ADMIN_EMAIL) {
        Swal.fire('ไม่อนุญาต', 'สิทธิ์ Super Admin สงวนไว้สำหรับบัญชีหลักเท่านั้น', 'error');
        return;
    }

    if (email === SUPER_ADMIN_EMAIL && newRole !== 'superadmin') {
        Swal.fire('ไม่อนุญาต', 'ไม่สามารถลดสิทธิ์ Super Admin หลักได้', 'error');
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
       await createLog(
            "USER_MANAGEMENT",
            `แก้ไขข้อมูลผู้ใช้ (Role: ${newRole}, ชื่อ: ${newName || '-'})`,
            "SYSTEM"
        );

        if(email === currentUser.email) { 
            currentUserFullName = newName; 
            currentUserPosition = newPos;
            currentUserDept = newDept;
            currentUserPhone = newPhone;
            currentUserAllowedSites = ['editor','engineer'].includes(newRole) ? newAllowedSites : [];
            document.getElementById('userNameDisplay').textContent = newName || 'ผู้ใช้งาน';
            const emailDisplay = document.getElementById('userEmailDisplay');
            if (emailDisplay) emailDisplay.textContent = email;
            toggleWriteAccess(true); 
        } 
        
        loadUsers(); 
    } catch (error) { 
        Swal.fire('ผิดพลาด', error.message, 'error'); 
    }
};

window.deleteUser = async function(email) {
    if (!isSuperAdmin()) { Swal.fire('ปฏิเสธ', 'เฉพาะ Super Admin เท่านั้นที่ลบผู้ใช้งานได้', 'error'); return; }
    const result = await Swal.fire({ title: 'ยืนยันการลบ?', text: `คุณต้องการลบผู้ใช้ ${email} ออกจากระบบใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'ลบข้อมูล', cancelButtonText: 'ยกเลิก' });
    if (result.isConfirmed) { try { await db.collection('users').doc(email).delete(); await createLog("USER_MANAGEMENT", `ลบผู้ใช้ ${email} ออกจากระบบ`, "SYSTEM"); Swal.fire({ icon: 'success', title: 'ลบผู้ใช้สำเร็จ', showConfirmButton: false, timer: 1500 }); loadUsers(); } catch (error) { Swal.fire('ผิดพลาด', 'ไม่สามารถลบผู้ใช้ได้: ' + error.message, 'error'); } }
};
