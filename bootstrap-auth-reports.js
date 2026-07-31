/* Extracted from main.js: 3034-3556. Keep script order in index.html. */
document.addEventListener("DOMContentLoaded", async function() {
    // หัวข้อ: Bootstrap - ใช้ config จากไฟล์ก่อน แล้วค่อยโหลด override เมื่อมีผู้ใช้ที่ผ่าน auth
    try { await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION); } catch (e) { console.warn("ตั้งค่า session persistence ไม่สำเร็จ:", e); }

    auth.onAuthStateChanged(async user => {
        
        const appContent = document.getElementById('appContent');
        const loginPrompt = document.getElementById('loginPrompt');
        
        if (user) {
          
            if (appContent) appContent.classList.remove('hidden');
            document.body.classList.add('app-shell-active');
            document.getElementById('appSidebar')?.classList.remove('hidden');
            document.getElementById('sidebarCollapseButton')?.classList.remove('hidden');
            if (loginPrompt) loginPrompt.classList.add('hidden');
            document.body.classList.remove('auth-hero-active');
            
            currentUser = user;
            document.getElementById('userInfo').classList.remove('hidden');
            document.getElementById('loginButton').classList.add('hidden');

            try {
                const userSnap = await db.collection('users').doc(user.email).get();
                if (!userSnap.exists) {
                     let initialRole = (user.email === SUPER_ADMIN_EMAIL) ? 'superadmin' : 'viewer';
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

                 if (user.email === SUPER_ADMIN_EMAIL) currentUserRole = 'superadmin';
                else if (currentUserRole === 'superadmin') currentUserRole = 'viewer';
                 await loadSitesConfig();
                 await loadDynamicMapPoints();
                disableLegacyImageMaps();
                bindDynamicMapClicks();
                if (currentUserRole === 'viewer') {
                    document.body.classList.add('viewer-mode'); 
                } else {
                    document.body.classList.remove('viewer-mode'); 
                }
                applySiteAccessOptions();
                if (getDefaultReadableSiteKey()) showWelcomeSitePage();
                else showNoSiteAccessMessage();

                document.getElementById('userNameDisplay').textContent = currentUserFullName ? `${currentUserFullName} (${user.email})` : user.email;
                 toggleWriteAccess(true);

                const sessionLogKey = `logged_in_${user.uid}`;
                if (!sessionStorage.getItem(sessionLogKey)) {
                    await createLog("AUTH_LOGIN", `เข้าสู่ระบบ (Role: ${currentUserRole})`);
                    sessionStorage.setItem(sessionLogKey, "true");
                }
                if (canReadSiteData(currentSiteKey)) scheduleOverlayRefresh(currentSiteKey);
                startAutoLogoutTimer();
            } catch (e) {
                console.error("Error fetching user role:", e);
                currentUserRole = 'viewer';
                document.body.classList.add('viewer-mode');
            }
            
        } else {
            if (appContent) appContent.classList.add('hidden');
            document.body.classList.remove('app-shell-active', 'sidebar-mobile-open');
            document.getElementById('appSidebar')?.classList.add('hidden');
            document.getElementById('sidebarCollapseButton')?.classList.add('hidden');
            if (loginPrompt) loginPrompt.classList.remove('hidden');
            document.body.classList.add('auth-hero-active');
            
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
            stopAutoLogoutTimer(true);
        }
    });

  
    document.getElementById('loginButton').addEventListener('click', login);
    document.getElementById('logoutButton').addEventListener('click', logout);
   
    setupWarrantyCalculators();

    const locationSelect = document.getElementById("location-select");
    if (locationSelect) {
        locationSelect.addEventListener("change", function() {
              if (this.value) switchSite(this.value);
            else showWelcomeSitePage();
        });
       // รอให้ onAuthStateChanged โหลด role/allowedSites ก่อนจึงค่อยเลือกไซต์ เพื่อไม่ให้ข้อมูลหรือรูปภาพแสดงก่อนตรวจสิทธิ์
    }
});


let countdownInterval; 
const LOGOUT_TIME_LIMIT = 60 * 60 * 1000; 

function getLogoutExpirationKey() {
    return currentUser ? `logoutExpiration_${currentUser.uid}` : 'logoutExpiration';
}
window.startAutoLogoutTimer = function() {
    stopAutoLogoutTimer(false);
    const expirationKey = getLogoutExpirationKey();
    let expirationTime = Number(localStorage.getItem(expirationKey));
    if (!expirationTime || Number.isNaN(expirationTime)) {
        expirationTime = Date.now() + LOGOUT_TIME_LIMIT;
        localStorage.setItem(expirationKey, String(expirationTime));
    }
    countdownInterval = setInterval(() => {
       let timeLeft = Math.ceil((expirationTime - Date.now()) / 1000);
        if (timeLeft <= 0) {
            stopAutoLogoutTimer();
            localStorage.removeItem(expirationKey);
            logout(true);
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
window.stopAutoLogoutTimer = function(clearExpiration = false) {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = null;
    if (clearExpiration) localStorage.removeItem(getLogoutExpirationKey());
};

window.sendEmailNotify = async function(type, deviceName, baseRec, assetInfo, count) {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbyBgdIuxjOajJ10HZuJrskQGVxExt5j_DXcJMFcRrieo8WYktSnQT6xNCbIg7py6no-yg/exec";

    let title = (type === 'down') ? `รายงานแจ้งเหตุอุปกรณ์ชำรุด (ครั้งที่ ${count})` : `รายงานแจ้งซ่อมแซมอุปกรณ์แล้วเสร็จ`;
    const siteName = sites[currentSiteKey].name;
    const firebaseImageUrl = (type === 'down') ? (baseRec.brokenFileUrl || "") : (baseRec.fixedFileUrl || "");

    let subDeviceText = baseRec.subDevice ? ` (${baseRec.subDevice})` : '';
    let assetText = assetInfo ? `\nข้อมูลทรัพย์สิน: รุ่น ${assetInfo.model || '-'} | S/N: ${assetInfo.serial || '-'} | PEA No: ${assetInfo.peaNo || '-'} | IP: ${assetInfo.ipAddress || '-'}` : '';
    let docText = `\nเลขที่ใบสั่ง: ${baseRec.orderNumber || '-'}\nลงวันที่: ${baseRec.docPEA ? formatThaiDate(baseRec.docPEA) : '-'}\nเลขที่หนังสือ มท.: ${baseRec.docMinistry || '-'}`;
    let costText = type === 'fixed' ? `\nงบประมาณซ่อมแซม: ${baseRec.repairCost ? Number(baseRec.repairCost).toLocaleString() + ' บาท' : '-'}` : '';

    const formatReporter = (name, position, department) => {
        const reporterName = name || '-';
        const details = [position, department].filter(Boolean).join(' ');
        return details ? `${reporterName} (${details})` : reporterName;
    };

    let brokenDateStr = formatThaiDate(baseRec.brokenDate);
    let fixedDateStr = formatThaiDate(baseRec.fixedDate);
    let brokenUserDisplay = formatReporter(baseRec.brokenUser || baseRec.user, baseRec.brokenUserPos, baseRec.brokenUserDept);
    let fixedUserDisplay = type === 'fixed'
        ? formatReporter(baseRec.fixedUser || baseRec.user, baseRec.fixedUserPos, baseRec.fixedUserDept)
        : '-';
    let reportTypeText = (type === 'down') ? 'แจ้งเหตุอุปกรณ์ชำรุด/ผิดปกติ' : 'แจ้งซ่อมแซมอุปกรณ์แล้วเสร็จ';

    let message = `${title}

เรียน ส่วนที่เกี่ยวข้อง

ขอแจ้งรายงานจากระบบบริหารจัดการอุปกรณ์ Microgrid โดยมีรายละเอียดดังนี้

ประเภทการแจ้ง: ${reportTypeText}
เลขที่รายการ: ${baseRec.customId || '-'}
สถานที่: ${siteName}
อุปกรณ์: ${deviceName}${subDeviceText}${assetText}

รายละเอียดการแจ้งเหตุ
- วันที่เกิดเหตุ: ${brokenDateStr}
- ชื่อ-สกุล ผู้แจ้งเหตุ: ${brokenUserDisplay}
- รายละเอียดปัญหา: ${baseRec.description || '-'}

รายละเอียดการซ่อมแซม
- วันที่ซ่อมแซม: ${fixedDateStr}
- ชื่อ-สกุล ผู้แจ้งซ่อมแซม: ${fixedUserDisplay}
- วิธีแก้ไข: ${baseRec.solution || '-'}${costText}

ข้อมูลเอกสารอ้างอิง${docText}

จึงเรียนมาเพื่อโปรดทราบ
ระบบบริหารจัดการอุปกรณ์ Microgrid
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
    const dataMap = await getMergedDeviceDataMap(currentSiteKey);
    Swal.close();

    let html = '<div class="flex flex-col gap-4 text-left">';
    let hasRecords = false;

     for (const dev of getConfiguredDeviceIds(currentSiteKey)) {
        const devDisplayName = getDeviceDisplayNameById(dev);
        const docData = dataMap[dev] || {};
        const records = docData.records || [];
        if (records.length === 0) continue;
        
        hasRecords = true;
        const safeDevId = dev.replace(/[^a-zA-Z0-9]/g, '_');

        html += `<div class="border border-slate-200 p-4 rounded-xl bg-slate-50/50">
                    <h4 class="font-bold text-blue-800 flex items-center gap-2 mb-2 pb-2 border-b border-slate-200">
                        <input type="checkbox" onchange="toggleDeviceGroup(this, '${safeDevId}')" class="w-4 h-4 dev-checkbox cursor-pointer" checked>
                        📦 ${devDisplayName}
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
    setPageBlur(true);
    window.tempReportDataMap = dataMap;
};


function openReportModal() {
  const modal = document.getElementById('reportModal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setPageBlur(true);
}
function closeReportModal() {
  const modal = document.getElementById('reportModal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  refreshPageBlurState();
}
window.selectAllReport = function(isChecked) { document.querySelectorAll('#reportSelectionContainer input[type="checkbox"]').forEach(cb => cb.checked = isChecked); };
window.toggleDeviceGroup = function(cb, safeDevId) { document.querySelectorAll(`#group-${safeDevId} .record-checkbox`).forEach(childCb => childCb.checked = cb.checked); };
function escapeReportHtml(value) {
    if (value === null || value === undefined || value === '') return '-';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildReportImageHtml(url) {
    if (!url) return '';
    const safeUrl = escapeReportHtml(url);
    return `<div class="img"><img src="${safeUrl}" width="150" height="90" alt="รูปประกอบ"></div>`;
}
/* หัวข้อ: Reports - สร้างรายงาน Word จากรายการที่เลือก */
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
           <div class="device-header"><div class="device-title">${deviceNo++}. ${escapeReportHtml(group.title)}</div>
                <div class="device-spec">
                     S/N : ${escapeReportHtml(asset.serial)} |
                     Model : ${escapeReportHtml(asset.model)} | 
                     PEA No. : ${escapeReportHtml(asset.peaNo)} |
                     IP : ${escapeReportHtml(asset.ipAddress || '-')} | 
                     Price : ${escapeReportHtml(asset.price)} | 
                    Warranty : ${escapeReportHtml(formatThaiDate(asset.warrantyStart))} → ${escapeReportHtml(formatThaiDate(asset.warrantyEnd))}
                </div>
            </div>
            <table class="device-table">
                <thead>
                    <tr>
                       <th class="col-no">No.</th>
                        <th class="col-date">Down Date</th>
                        <th class="col-date">Fixed Date</th>
                        <th class="col-text">Description</th>
                        <th class="col-text">Solution</th>
                        <th class="col-details">Details</th>
                        <th class="col-user">User</th>
                    </tr>
                </thead>
                <tbody>`;

        group.items.forEach((r, idx) => {
            let imgBroken = buildReportImageHtml(r.brokenFileUrl);
            let imgFixed = buildReportImageHtml(r.fixedFileUrl);
            let subDeviceStm = r.subDevice ? ` <span class="sub-device">[${escapeReportHtml(r.subDevice)}]</span>` : '';
            bodyHtml += `
            <tr>
                <td class="center">${idx + 1}</td>
                <td class="center">${escapeReportHtml(formatThaiDate(r.brokenDate))}</td>
                <td class="center">${r.fixedDate ? escapeReportHtml(formatThaiDate(r.fixedDate)) : '<span class="pending">PENDING</span>'}</td>
                <td class="thai-distributed">${escapeReportHtml(r.description)} <br>${subDeviceStm} ${imgBroken}</td>
                <td class="thai-distributed">${escapeReportHtml(r.solution)} ${imgFixed}</td>
                <td class="details">
                    <div><b>ราคาซ่อมแซม:</b> ${r.repairCost ? escapeReportHtml(Number(r.repairCost).toLocaleString()) : '-'}</div>
                    <div><b>เลขที่ใบสั่ง:</b> ${escapeReportHtml(r.orderNumber)}</div>
                    <div class="doc-line"><b>หนังสือ มท</b> ${escapeReportHtml(r.docMinistry)}</div>
                     <div><b>ลงวันที่:</b> ${r.docPEA ? escapeReportHtml(formatThaiDate(r.docPEA)) : '-'}</div>
                    <div><b>สถานะซ่อม:</b> ${r.fixedDate ? 'ซ่อมแล้ว' : ((r.acknowledgedAt && (r.status === 'down' || r.status === 'abnormal') && !r.fixedDate) ? 'กำลังซ่อมแซม' : 'รอดำเนินการ')}</div>
                    <div><b>ชื่อ-สกุล ผู้รับทราบ :</b> ${escapeReportHtml(r.acknowledgedBy)}</div>
                    <div><b>วันที่-เวลา :</b> ${r.acknowledgedAt ? escapeReportHtml(formatThaiDateTime(r.acknowledgedAt)) : '-'}</div>
                </td>
                <td class="center">
                    <div class="user-block"><b>ชื่อ-สกุล ผู้แจ้งเหตุ</b><br>${escapeReportHtml(r.brokenUser)}<div class="user-sub">(${escapeReportHtml(`${r.brokenUserPos || ''} ${r.brokenUserDept || ''}`.trim())})</div></div>
                    <div class="user-block"><b>ชื่อ-สกุล ผู้แจ้งซ่อมแซม</b><br>${escapeReportHtml(r.fixedUser)}<div class="user-sub">(${escapeReportHtml(`${r.fixedUserPos || ''} ${r.fixedUserDept || ''}`.trim())})</div></div>
                </td>
            </tr>`;
        });
        bodyHtml += `</tbody></table></div>`;
    }

    closeReportModal();
   const reportHtml = buildReportDocumentHtml(siteData, bodyHtml);
    const fileName = `รายงานสรุปการแจ้งปัญหา_${siteData.name.replace(/[\\/:*?"<>|]/g, '_')}_${new Date().toISOString().slice(0, 10)}.doc`;
    const blob = new Blob(['\ufeff', reportHtml], { type: 'application/msword;charset=utf-8' });
    saveAs(blob, fileName);
};

function buildReportDocumentHtml(siteData, bodyHtml) {
     const reportDate = formatThaiDate(new Date());
    const reportTime = new Date().toLocaleTimeString('th-TH');
    return `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="UTF-8">
<title>PEA_REPORT_${escapeReportHtml(siteData.name)}</title>
<!--[if gte mso 9]>
<xml>
    <w:WordDocument>
        <w:View>Print</w:View>
        <w:Zoom>100</w:Zoom>
        <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
</xml>
<![endif]-->
<style>
    @page WordSection1 { size: 21cm 29.7cm; margin: 3.2cm 1.2cm 2.8cm 1.2cm; mso-header: h1; mso-footer: f1; mso-header-margin: 0.8cm; mso-footer-margin: 0.8cm; }
    div.WordSection1 { page: WordSection1; }
    body { font-family: 'TH SarabunPSK', 'TH Sarabun New', 'Sarabun', Arial, sans-serif; font-size: 11pt; margin: 0; color: #222; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    tr { page-break-inside: avoid; }
    thead { display: table-header-group; }
   .header-table { width: 100%; border-bottom: 3px solid #6a1b9a; margin-bottom: 12pt; table-layout: fixed; }
   .logo { width: 54pt; height: 54pt; max-width: 54pt; max-height: 54pt; border-radius: 50%; object-fit: contain; }
    .title { text-align: center; }
    .title-main { font-size: 14pt; font-weight: 700; color: #6a1b9a; }
   .title-sub { font-size: 11pt; }
    .header-right { font-size: 11pt; text-align: right; }
    .device-section { margin-bottom: 18pt; }
    .device-header { background: #f3f0ff; border-left: 4pt solid #6a1b9a; border-top: 1px solid #ddd; border-right: 1px solid #ddd; padding: 6pt; }
    .device-title { font-weight: 700; font-size: 11pt; }
    .device-spec { font-size: 11pt; }
    .device-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
     .device-table th { background: #6a1b9a; color: #fff; border: 1px solid #000; padding: 3pt; font-size: 11pt; line-height: 1.2; }
    .device-table td { border: 1px solid #000; padding: 3pt; font-size: 11pt; line-height: 1.25; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
    .thai-distributed { text-align: justify; text-justify: distribute; mso-text-justify: distribute-all-lines; }
    .col-no { width: 4%; }
    .col-date { width: 9%; }
    .col-text { width: 23%; }
    .col-details { width: 16%; }
    .col-user { width: 16%; }
    .center { text-align: center; }
    .details div, .user-block { margin-bottom: 3pt; }
    .img { margin-top: 3pt; text-align: center; }
    .img img { width: 150pt; height: 90pt; max-width: 150pt; max-height: 90pt; object-fit: contain; border: 1px solid #bbb; }
    .pending { color: red; font-weight: bold; }
    .sub-device { color: #2563eb; font-weight: bold; }
    .footer-title { text-align: left; font-weight: 700; font-size: 11pt; margin-bottom: 4pt; }
    .word-header-footer { display: none; mso-hide: all; page-break-inside: avoid; }
    table#hrdftrtbl { margin: 0cm 0cm 0cm 25cm; mso-hide: all; }
    .signature { width: 100%; table-layout: fixed; border-collapse: collapse; }
     .sig-box { width: 33.33%; text-align: center; font-size: 11pt; vertical-align: top; padding: 0 6pt; line-height: 1.35; }
    .sig-line { margin-bottom: 3pt; white-space: nowrap; }
    .sig-name { margin-bottom: 2pt; }
</style>
</head>
<body>
<div class="WordSection1">
<!--[if gte mso 9]>
<table id="hrdftrtbl" border="0" cellpadding="0" cellspacing="0">
<tr>
<td>
<div class="word-header-footer" style="mso-element:header; display:none;" id="h1">
    <table class="header-table">
        <tr>
            <td style="width:25%;"><img class="logo" src="provincial-electricity-authority.png" width="72" height="72" alt="PEA"></td>
            <td class="title" style="width:50%;"><div class="title-main">ASSET MAINTENANCE REPORT</div><div class="title-sub">การไฟฟ้าส่วนภูมิภาค (Provincial Electricity Authority)</div></td>
            <td class="header-right" style="width:25%;">SITE : ${escapeReportHtml(siteData.name)}<br>DATE : ${escapeReportHtml(reportDate)}<br>TIME : ${escapeReportHtml(reportTime)}</td>
        </tr>
    </table>
</div>
</td>
</tr>
<tr>
<td>
<div class="word-header-footer" style="mso-element:footer; display:none;" id="f1">
    <table class="signature">
        <tr>
            <td class="sig-box"><div class="sig-line">........................................</div><div class="sig-name"><b>${currentUserFullName || ''}</b></div><div>ผู้จัดทำรายงาน</div></td>
            <td class="sig-box"><div class="sig-line">........................................</div><div class="sig-name">(...................................................)</div><div>ผู้ตรวจสอบ</div></td>
            <td class="sig-box"><div class="sig-line">........................................</div><div class="sig-name">(...................................................)</div><div>ผู้อนุมัติ</div></td>
        </tr>
    </table>
</div>
</td>
</tr>
</table>
<![endif]-->
  ${bodyHtml}  
</div>
</body>
</html>`;
}
