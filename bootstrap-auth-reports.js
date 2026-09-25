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

                document.getElementById('userNameDisplay').textContent = currentUserFullName || user.displayName || 'ผู้ใช้งาน';
                document.getElementById('userEmailDisplay').textContent = user.email || '';
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
    window.showAppPage('reportModal', 'tab-report');
    window.tempReportDataMap = dataMap;
};


function openReportModal() {
  window.showAppPage('reportModal', 'tab-report');
}
function closeReportModal() {
  window.showTopology();
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
/* หัวข้อ: Reports - สร้างรายงาน PDF (ผ่านระบบพิมพ์ของเบราว์เซอร์) จากรายการที่เลือก */
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
                <div class="device-title">${deviceNo++}. ${escapeReportHtml(group.title)}</div>
                <div class="device-spec">
                    <span><b>S/N</b> ${escapeReportHtml(asset.serial)}</span>
                    <span><b>Model</b> ${escapeReportHtml(asset.model)}</span>
                    <span><b>PEA No.</b> ${escapeReportHtml(asset.peaNo)}</span>
                    <span><b>IP</b> ${escapeReportHtml(asset.ipAddress || '-')}</span>
                    <span><b>ราคา</b> ${escapeReportHtml(asset.price)}</span>
                    <span><b>รับประกัน</b> ${escapeReportHtml(formatThaiDate(asset.warrantyStart))} – ${escapeReportHtml(formatThaiDate(asset.warrantyEnd))}</span>
                </div>
            </div>
            <table class="device-table">
                <colgroup>
                    <col style="width:4%">
                    <col style="width:9%">
                    <col style="width:9%">
                    <col style="width:23%">
                    <col style="width:23%">
                    <col style="width:16%">
                    <col style="width:16%">
                </colgroup>
                <thead>
                    <tr>
                       <th>No.</th>
                        <th>Down Date</th>
                        <th>Fixed Date</th>
                        <th>Description</th>
                        <th>Solution</th>
                        <th>Details</th>
                        <th>User</th>
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
                </td>
                <td class="center">
                    <div class="user-block"><b>ชื่อ-สกุล ผู้แจ้งเหตุ</b><br>${escapeReportHtml(r.brokenUser)}<div class="user-sub">(${escapeReportHtml(`${r.brokenUserPos || ''} ${r.brokenUserDept || ''}`.trim())})</div></div>
                    <div class="user-block"><b>ชื่อ-สกุล ผู้รับทราบ</b><br>${escapeReportHtml(r.acknowledgedBy)}<div class="user-sub">(${escapeReportHtml(`${r.acknowledgedByPos || ''} ${r.acknowledgedByDept || ''}`.trim())})</div></div>
                    <div class="user-block"><b>ชื่อ-สกุล ผู้แจ้งซ่อมแซม</b><br>${escapeReportHtml(r.fixedUser)}<div class="user-sub">(${escapeReportHtml(`${r.fixedUserPos || ''} ${r.fixedUserDept || ''}`.trim())})</div></div>
                </td>
            </tr>`;
        });
        bodyHtml += `</tbody></table></div>`;
    }

    closeReportModal();
    const logoDataUrl = await getReportLogoDataUrl();
    const reportHtml = buildReportPrintHtml(siteData, bodyHtml, logoDataUrl);
    openReportPrintWindow(reportHtml);
};

async function getReportLogoDataUrl() {
    try {
        const response = await fetch('provincial-electricity-authority.png');
        if (!response.ok) throw new Error(`Unable to load logo: ${response.status}`);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('Unable to embed the report logo.', error);
        return '';
    }
}

function openReportPrintWindow(reportHtml) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        Swal.fire('ไม่สามารถเปิดหน้าต่างพิมพ์ได้', 'กรุณาอนุญาต pop-up สำหรับเว็บไซต์นี้ แล้วลองอีกครั้ง', 'warning');
        return;
    }
    printWindow.document.open();
    printWindow.document.write(reportHtml);
    printWindow.document.close();
    printWindow.onload = function () {
        printWindow.focus();
        printWindow.print();
    };
}

function buildReportPrintHtml(siteData, bodyHtml, logoDataUrl = '') {
    const reportDate = formatThaiDate(new Date());
    const reportTime = new Date().toLocaleTimeString('th-TH');
    return `
<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>PEA_REPORT_${escapeReportHtml(siteData.name)}</title>
<style>
    @page { size: A4; margin: 3.9cm 1.2cm 1.6cm 1.2cm; }
    * { box-sizing: border-box; }
    body { font-family: 'TH SarabunPSK', 'Sarabun', Tahoma, sans-serif; font-size: 12pt; margin: 0; color: #1e293b; }
    table { border-collapse: collapse; }
    tr, .device-section, .signature { page-break-inside: avoid; break-inside: avoid; }
    thead { display: table-header-group; }

    .report-toolbar { position: fixed; top: 10px; right: 10px; z-index: 10; display: flex; gap: 8px; }
    .report-toolbar button { font-family: inherit; font-size: 11pt; font-weight: 700; padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
    .report-toolbar .btn-print { background: #2563eb; color: #fff; }
    .report-toolbar .btn-close { background: #e2e8f0; color: #334155; }
    @media print { .report-toolbar { display: none !important; } }
    @media screen { .report-body { padding-top: 3.7cm; } }

    .report-header { position: fixed; top: 0; left: 0; right: 0; height: 3.3cm; padding: 6pt 1.2cm 0; display: flex; align-items: center; gap: 14pt; border-bottom: 4px double #6a1b9a; background: #fff; }
    .report-header .logo { width: 44pt; height: 44pt; object-fit: contain; flex-shrink: 0; }
    .report-header .title { flex: 1; text-align: center; }
    .report-header .title-main { font-size: 15pt; font-weight: 700; color: #6a1b9a; letter-spacing: 0.03em; }
    .report-header .title-sub { font-size: 11.5pt; color: #475569; margin-top: 2pt; }
    .report-header .meta { flex-shrink: 0; font-size: 10.5pt; border: 1px solid #cbd5e1; border-radius: 3px; background: #f8fafc; }
    .report-header .meta table { border-collapse: collapse; }
    .report-header .meta td { padding: 2pt 8pt; white-space: nowrap; }
    .report-header .meta td:first-child { font-weight: 700; color: #6a1b9a; border-right: 1px solid #e2e8f0; text-align: right; }

    .device-section { margin-bottom: 16pt; border: 1.3px solid #6a1b9a; }
    .device-header { background: #f3f0ff; border-bottom: 1.3px solid #6a1b9a; padding: 7pt 10pt; page-break-after: avoid; break-after: avoid-page; }
    .device-title { font-weight: 700; font-size: 12.5pt; color: #4c1370; margin-bottom: 3pt; }
    .device-spec { font-size: 10.5pt; color: #334155; display: flex; flex-wrap: wrap; gap: 2pt 16pt; }
    .device-spec b { color: #6a1b9a; margin-right: 3pt; }
    .device-table { width: 100%; table-layout: fixed; }
    .device-table th { background: #6a1b9a; color: #fff; border: 1px solid #4c1370; padding: 6pt; font-size: 11pt; line-height: 1.2; }
    .device-table td { border: 1px solid #cbd5e1; padding: 6pt; font-size: 11pt; line-height: 1.3; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }
    .device-table tbody tr:nth-child(even) td { background: #faf9ff; }
    .thai-distributed { text-align: justify; }
    .center { text-align: center; }
    .details div, .user-block { margin-bottom: 3pt; }
    .user-sub { color: #64748b; font-size: 10pt; }
    .img { margin-top: 3pt; text-align: center; }
    .img img { width: 150pt; height: 90pt; max-width: 150pt; max-height: 90pt; object-fit: contain; border: 1px solid #bbb; }
    .pending { color: #dc2626; font-weight: bold; }
    .sub-device { color: #2563eb; font-weight: bold; }

    .signature { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 26pt; }
    .sig-box { width: 33.33%; text-align: center; font-size: 11pt; vertical-align: top; padding: 0 6pt; line-height: 1.4; }
    .sig-line { margin-bottom: 6pt; white-space: nowrap; }
    .sig-name { margin-bottom: 2pt; }
</style>
</head>
<body>
    <div class="report-toolbar">
        <button class="btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>
        <button class="btn-close" onclick="window.close()">✕ ปิด</button>
    </div>

    <div class="report-header">
        ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="PEA">` : ''}
        <div class="title">
            <div class="title-main">MICROGRID ASSET MAINTENANCE REPORT</div>
            <div class="title-sub">การไฟฟ้าส่วนภูมิภาค (Provincial Electricity Authority)</div>
        </div>
        <div class="meta">
            <table>
                <tr><td>SITE</td><td>${escapeReportHtml(siteData.name)}</td></tr>
                <tr><td>DATE</td><td>${escapeReportHtml(reportDate)}</td></tr>
                <tr><td>TIME</td><td>${escapeReportHtml(reportTime)}</td></tr>
            </table>
        </div>
    </div>

    <div class="report-body">
        ${bodyHtml}

        <table class="signature">
            <tr>
                <td class="sig-box"><div class="sig-line">........................................</div><div class="sig-name"><b>${escapeReportHtml(currentUserFullName || '')}</b></div><div>ผู้จัดทำรายงาน</div></td>
                <td class="sig-box"><div class="sig-line">........................................</div><div class="sig-name">(...................................................)</div><div>ผู้ตรวจสอบ</div></td>
                <td class="sig-box"><div class="sig-line">........................................</div><div class="sig-name">(...................................................)</div><div>ผู้อนุมัติ</div></td>
            </tr>
        </table>
    </div>
</body>
</html>`;
}
