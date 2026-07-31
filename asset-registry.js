/* Extracted from main.js: 2512-3033. Keep script order in index.html. */
// ==================== ASSET REGISTRY MODULE ====================
let registryGroups = [];
let registryDataMap = {};
let groupModalMode = 'add';
let groupModalTargetId = null;

function getRegistryDocRef(siteKey) {
    return db.collection('site_asset_groups').doc(siteKey);
}
function getRegistryDeviceList(siteData) {
    const configuredDevices = Array.isArray(siteData?.devices) ? siteData.devices.map(getDeviceId).filter(Boolean) : [];
    const firestoreDevices = Object.keys(registryDataMap || {});

     return [...new Set([...configuredDevices, ...firestoreDevices])]
        .filter(d => d && d !== 'Other')
        .sort((a, b) => compareDeviceKeysByDisplayName(a, b, currentSiteKey));
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
                deviceKeys: deviceKeys.sort((a, b) => compareDeviceKeysByDisplayName(a, b, currentSiteKey))
            };
        });
}
/* หัวข้อ: Asset Registry - แสดงทะเบียนอุปกรณ์และจัดกลุ่มรายการทรัพย์สิน */
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
async function loadAssetRegistry() {
    const requestedSiteKey = currentSiteKey;
    const requestedSwitchVersion = siteSwitchVersion;
    const siteData = sites[requestedSiteKey];
    const siteNameEl = document.getElementById('registrySiteName');
    const loadingEl = document.getElementById('registryLoading');
    const contentEl = document.getElementById('registryContent');

   if (!siteData || !canReadSiteData(requestedSiteKey)) {
        if (siteNameEl) siteNameEl.textContent = siteData ? `— ${siteData.name}` : '';
        if (loadingEl) loadingEl.classList.add('hidden');
        if (contentEl) {
            contentEl.classList.remove('hidden');
             contentEl.innerHTML = siteData
                ? '<div class="bg-white border border-amber-200 text-amber-700 rounded-xl p-4 text-sm font-semibold">🔒 ไม่มีสิทธิ์ดูข้อมูลรายการทรัพย์สินของไซต์นี้</div>'
                : '<div class="bg-white border border-red-200 text-red-600 rounded-xl p-4 text-sm font-semibold">ไม่พบข้อมูลพื้นที่ที่เลือก</div>';
        }
        return;
    }
if (siteNameEl) siteNameEl.textContent = `— ${siteData.name}`;
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (contentEl) contentEl.classList.add('hidden');

    try {
        const snap = await getRegistryDocRef(requestedSiteKey).get();
        if (requestedSiteKey !== currentSiteKey || requestedSwitchVersion !== siteSwitchVersion) return;
        registryGroups = normalizeRegistryGroups(snap.exists ? snap.data().groups : []);
    } catch (e) {
        console.warn("Failed to load groups:", e);
        registryGroups = [];
    }
    registryDataMap = {};
    try {
        registryDataMap = await getMergedDeviceDataMap(requestedSiteKey);
        if (requestedSiteKey !== currentSiteKey || requestedSwitchVersion !== siteSwitchVersion) return;
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
            IP Address
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            ผู้ผลิต
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            สถานที่
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap">
            ประกัน
        </th>

        <th class="px-3 py-2.5 text-center whitespace-nowrap w-40 max-w-40">
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
             class="text-[10px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white text-slate-600 cursor-pointer w-full max-w-[9rem] truncate focus:ring-1 focus:ring-indigo-400 outline-none">
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
         ${escapeHtml(getDeviceDisplayNameById(devKey))}
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
        ${v(a.ipAddress)}
    </td>

    <td class="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap text-center">
        ${v(a.manufacturer)}
    </td>

    <td class="px-3 py-2.5 text-[11px] text-slate-600 whitespace-nowrap text-center">
        ${v(a.location)}
    </td>

    <td class="px-3 py-2.5 text-center">
        ${warrantyBadge}
    </td>

     <td class="px-3 py-2.5 w-40 max-w-40 text-center overflow-hidden">
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

    const sortedDeviceKeys = [...deviceKeys].sort((a, b) => compareDeviceKeysByDisplayName(a, b, currentSiteKey));
    const rows = sortedDeviceKeys
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
    const canEdit = isAdminRole() || currentUserRole === 'editor';
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
                    <h3 class="font-bold text-slate-600">อื่นๆ</h3>
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
    if (!isAdminRole() && currentUserRole !== 'editor') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin หรือ Editor เท่านั้น', 'warning'); return;
    }
    groupModalMode = 'add'; groupModalTargetId = null;
    document.getElementById('groupModalTitle').textContent = '➕ เพิ่มกลุ่มใหม่';
    document.getElementById('groupNameInput').value = '';
    document.getElementById('groupModal').classList.remove('hidden');
    setPageBlur(true);
    setTimeout(() => document.getElementById('groupNameInput').focus(), 100);
};

window.openRenameGroupModal = function(groupId, currentName) {
  if (!isAdminRole() && currentUserRole !== 'editor') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Admin หรือ Editor เท่านั้น', 'warning'); return;
    }
    // currentName comes from data-gname attribute (HTML-escaped), decode it
    const decoded = currentName.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    groupModalMode = 'rename'; groupModalTargetId = groupId;
    document.getElementById('groupModalTitle').textContent = '✏️ เปลี่ยนชื่อกลุ่ม';
    document.getElementById('groupNameInput').value = decoded;
    document.getElementById('groupModal').classList.remove('hidden');
    setPageBlur(true);
    setTimeout(() => document.getElementById('groupNameInput').focus(), 100);
};

window.closeGroupModal = function() {
    document.getElementById('groupModal').classList.add('hidden');
    refreshPageBlurState();
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
   if (!isAdminRole() && currentUserRole !== 'editor') return;
    const result = await Swal.fire({ title: 'ลบกลุ่มนี้?', text: 'อุปกรณ์ในกลุ่มจะกลับไปอยู่ในส่วน "อื่นๆ"', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' });
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
    if (!siteKey) { showWelcomeSitePage(); toggleWriteAccess(false); return; }
    applySiteAccessOptions();
    if (!canReadSiteData(siteKey)) {
        const fallbackSiteKey = getDefaultReadableSiteKey();
        if (!fallbackSiteKey) { showNoSiteAccessMessage(); toggleWriteAccess(false); return; }
        if (siteKey !== fallbackSiteKey) return switchSite(fallbackSiteKey);
    }
    const siteData = sites[siteKey]; if (!siteData) return; document.body.classList.remove('home-site-mode'); currentSiteKey = siteKey;
    siteSwitchVersion += 1;
    currentDevice = null;
    currentPage = 1;
    const locationSelect = document.getElementById('location-select');
    if (locationSelect && locationSelect.value !== siteKey) locationSelect.value = siteKey;
    if (typeof window.syncSidebarSiteMenu === 'function') window.syncSidebarSiteMenu();
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
    window.renderDynamicMapPoints(currentSiteKey);
    scheduleOverlayRefresh(currentSiteKey, false);
    toggleWriteAccess(currentUser !== null);
    const summaryPage = document.getElementById('summaryPage');
    const assetRegistryPage = document.getElementById('assetRegistryPage');
    if (summaryPage && !summaryPage.classList.contains('hidden')) {
        window.updateDeviceSummary();
    }
    if (assetRegistryPage && !assetRegistryPage.classList.contains('hidden')) {
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
