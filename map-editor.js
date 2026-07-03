/* Extracted from main.js: 1652-2134. Keep script order in index.html. */
/* หัวข้อ: Dynamic Map Editor - สร้าง/แก้ไข/ลบพิกัดอุปกรณ์บนรูปภาพ */
let dynamicMapPoints = {};
let isMapEditMode = false;
let mapRedrawPointId = null;
function getMapConfigRef() { return db.collection('app_config').doc('map_points'); }
function getCurrentMapImage(container) {
    if (!container) return null;
    const view = container.querySelector('.view-wrapper:not(.hidden)');
    return (view || container).querySelector('img.device-img');
}
function getMapViewId(container) {
    const view = container?.querySelector('.view-wrapper:not(.hidden)');
    return view?.id || 'main';
}
function getSiteMapPoints(siteKey = currentSiteKey) {
    return Array.isArray(dynamicMapPoints[siteKey]) ? dynamicMapPoints[siteKey] : [];
}
function syncConfiguredDevicesFromMap(siteKey = currentSiteKey) {
     if (!sites[siteKey]) return;
    const current = Array.isArray(sites[siteKey]?.devices) ? sites[siteKey].devices : [];
    const mapped = getSiteMapPoints(siteKey).map(p => p.name).filter(Boolean);
   sites[siteKey].devices = [...new Set([...mapped, ...current])];
    if (!sites[siteKey].devices.includes('Other')) sites[siteKey].devices.push('Other');
}
function removeDeviceFromSiteConfig(siteKey, deviceName) {
    if (!sites[siteKey] || !deviceName || deviceName === 'Other') return false;
    const before = Array.isArray(sites[siteKey].devices) ? sites[siteKey].devices : [];
    const after = before.filter(device => getDeviceId(device) !== deviceName);
    sites[siteKey].devices = after.includes('Other') ? after : [...after, 'Other'];
    return after.length !== before.length;
}

function renameDeviceInSiteConfig(siteKey, oldName, newName) {
    if (!sites[siteKey] || !oldName || !newName || oldName === newName || oldName === 'Other') return false;
    const before = Array.isArray(sites[siteKey].devices) ? sites[siteKey].devices : [];
    let changed = false;
    const after = before.map(device => {
        if (getDeviceId(device) !== oldName) return device;
        changed = true;
        if (device && typeof device === 'object') {
            return { ...device, id: newName, name: newName };
        }
        return newName;
    });
    if (!after.some(device => getDeviceId(device) === newName)) after.push(newName);
    sites[siteKey].devices = after.includes('Other') || after.some(device => getDeviceId(device) === 'Other') ? after : [...after, 'Other'];
    return changed;
}
function renameDeviceInRegistryGroups(oldName, newName) {
    if (!Array.isArray(registryGroups) || !oldName || !newName || oldName === newName) return false;
    let changed = false;
    registryGroups = registryGroups.map(group => {
        const before = Array.isArray(group.deviceKeys) ? group.deviceKeys : [];
        const deviceKeys = [...new Set(before.map(key => {
            if (key === oldName) { changed = true; return newName; }
            return key;
        }))];
        return { ...group, deviceKeys };
    });
    return changed;
}
async function moveFirestoreDocument(oldRef, newRef, transformData = data => data) {
    const oldSnap = await oldRef.get();
    if (!oldSnap.exists) return false;
    const newSnap = await newRef.get();
    const movedData = transformData(oldSnap.data() || {});
    const batch = db.batch();
    batch.set(newRef, { ...movedData, ...(newSnap.exists ? (newSnap.data() || {}) : {}) }, { merge: true });
    batch.delete(oldRef);
    await batch.commit();
    return true;
}
async function syncDeviceRenameAcrossCollections(siteKey, oldName, newName, mapPoint) {
    if (!oldName || !newName || oldName === newName) return;
    const groupChanged = renameDeviceInRegistryGroups(oldName, newName);
    renameDeviceInSiteConfig(siteKey, oldName, newName);

    const deviceOldRef = getSiteCollection(siteKey).doc(oldName);
    const deviceNewRef = getSiteCollection(siteKey).doc(newName);
    const assetOldRef = getSiteAssetsCollection(siteKey).doc(oldName);
    const assetNewRef = getSiteAssetsCollection(siteKey).doc(newName);

    await Promise.all([
        moveFirestoreDocument(deviceOldRef, deviceNewRef, data => ({
            ...data,
            mapPoint: mapPoint ? { ...mapPoint, name: newName } : (data.mapPoint ? { ...data.mapPoint, name: newName } : data.mapPoint),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        })),
        moveFirestoreDocument(assetOldRef, assetNewRef, data => ({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }))
    ]);

    if (currentUserRole === 'admin') await window.saveSitesConfig(sites);
    if (groupChanged) await saveRegistryGroups();
    await createLog('RENAME_DEVICE', `เปลี่ยนชื่ออุปกรณ์จาก ${oldName} เป็น ${newName}`, siteKey);
}

function removeDeviceFromRegistryGroups(deviceName) {
    if (!Array.isArray(registryGroups) || !deviceName) return false;
    let changed = false;
    registryGroups = registryGroups.map(group => {
        const before = Array.isArray(group.deviceKeys) ? group.deviceKeys : [];
        const deviceKeys = before.filter(key => key !== deviceName);
        if (deviceKeys.length !== before.length) changed = true;
        return { ...group, deviceKeys };
    });
    return changed;
}
async function deleteDeviceMapPoint(siteKey, deviceName) {
    if (!siteKey || !deviceName) return;
    const batch = db.batch();
    batch.delete(getSiteCollection(siteKey).doc(deviceName));
    batch.delete(getSiteAssetsCollection(siteKey).doc(deviceName));
    await batch.commit();
}
async function persistDeviceRegistryAfterMapDelete(deviceName) {
    removeDeviceFromSiteConfig(currentSiteKey, deviceName);
    delete registryDataMap[deviceName];
    const groupChanged = removeDeviceFromRegistryGroups(deviceName);
    const writes = [];
    if (currentUserRole === 'admin') writes.push(window.saveSitesConfig(sites));
    if (groupChanged) writes.push(saveRegistryGroups());
    writes.push(deleteDeviceMapPoint(currentSiteKey, deviceName));
    await Promise.all(writes);
    await createLog('DELETE_DEVICE', `ลบอุปกรณ์ ${deviceName} ออกจากแผนผังและทะเบียนทรัพย์สิน`, currentSiteKey);
}
async function loadDynamicMapPoints() {
     dynamicMapPoints = {};
    try {
        const snap = await getMapConfigRef().get();
        dynamicMapPoints = snap.exists && snap.data().points ? snap.data().points : {};
    } catch (error) {
       if (error?.code !== 'permission-denied') console.warn('โหลดพิกัดแผนผังกลางไม่สำเร็จ:', error);
    }
    await Promise.all(Object.keys(sites).map(async siteKey => {
        try {
            const docsSnap = await getAllDevicesDocs(siteKey);
            docsSnap.forEach(doc => {
                const mapPoint = doc.data()?.mapPoint;
                if (!mapPoint?.name) return;
                if (!dynamicMapPoints[siteKey]) dynamicMapPoints[siteKey] = [];
                if (!dynamicMapPoints[siteKey].some(p => p.id === mapPoint.id || p.name === mapPoint.name)) {
                    dynamicMapPoints[siteKey].push({ ...mapPoint, id: mapPoint.id || doc.id, name: doc.id });
                }
            });
        } catch (error) {
            if (error?.code !== 'permission-denied') console.warn(`โหลดพิกัดของไซต์ ${siteKey} ไม่สำเร็จ:`, error);
        }
    }));
    Object.keys(sites).forEach(syncConfiguredDevicesFromMap);
}
async function saveDynamicMapPoints(point = null) {
    Object.keys(sites).forEach(syncConfiguredDevicesFromMap);
     const writes = [];
    if (point?.name) {
        writes.push(getSiteCollection(currentSiteKey).doc(point.name).set({ mapPoint: point }, { merge: true }));
    }
    writes.push(getMapConfigRef().set({ points: dynamicMapPoints, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(error => {
        if (error?.code !== 'permission-denied') throw error;
        console.warn('ไม่มีสิทธิ์บันทึกพิกัดกลาง จึงใช้ข้อมูลใน devices เป็นแหล่งข้อมูลหลัก');
    }));
    await Promise.all(writes);
    if (currentUserRole === 'admin') await window.saveSitesConfig(sites);
}
function disableLegacyImageMaps() {
    document.querySelectorAll('.map-container img[usemap]').forEach(img => {
        if (img.closest('#map-betong')) return;
        img.dataset.legacyUsemap = img.getAttribute('usemap');
        img.removeAttribute('usemap');
    });
}
function setBetongImageMapsForEditMode(disabled) {
    document.querySelectorAll('#map-betong img').forEach(img => {
        if (disabled) {
            if (img.hasAttribute('usemap')) {
                img.dataset.editModeUsemap = img.getAttribute('usemap');
                img.removeAttribute('usemap');
            }
            return;
        }
        if (!img.hasAttribute('usemap') && img.dataset.editModeUsemap) {
            img.setAttribute('usemap', img.dataset.editModeUsemap);
            delete img.dataset.editModeUsemap;
        }
    });
}
function getImageClickPercent(event, img) {
    const rect = img.getBoundingClientRect();
    return {
        x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
        y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100))
    };
}
function getMapPointerPercent(clientX, clientY, img) {
    const rect = img.getBoundingClientRect();
    return {
        x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
        y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100))
    };
}
function clampMapPointPosition(point) {
    const width = point.shape === 'rect' ? (Number(point.width) || 0) : 0;
    const height = point.shape === 'rect' ? (Number(point.height) || 0) : 0;
    return {
        ...point,
        x: Math.min(100 - width, Math.max(0, Number(point.x) || 0)),
        y: Math.min(100 - height, Math.max(0, Number(point.y) || 0))
    };
}
async function moveMapPoint(pointId, x, y) {
    const point = getSiteMapPoints().find(p => p.id === pointId);
    if (!point || !hasWriteAccess(currentSiteKey)) return;
    const movedPoint = clampMapPointPosition({ ...point, x, y });
    dynamicMapPoints[currentSiteKey] = getSiteMapPoints().map(p => p.id === pointId ? movedPoint : p);
    window.updateDeviceStatusOverlays(currentSiteKey, true);
    window.updateDeviceSummary();
    await saveDynamicMapPoints(movedPoint);
    window.updateDeviceStatusOverlays(currentSiteKey, true);
}
function makeMapMarker(point, status, alerts) {
    const marker = document.createElement('button');
    marker.type = 'button';
     const shapeClass = point.shape === 'rect' ? 'rect' : 'point';
    marker.className = `dynamic-map-marker ${shapeClass} ${status === 'down' ? 'down' : status === 'abnormal' ? 'abnormal' : 'normal'}`;
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.y}%`;
    if (point.shape === 'rect') {
        marker.style.width = `${point.width || 4}%`;
        marker.style.height = `${point.height || 4}%`;
    }
    marker.setAttribute('aria-label', point.name);
    marker.title = isMapEditMode ? `${point.name} - ลากเพื่อย้ายพิกัด คลิกเพื่อแก้ไข/ลบ หรือเลือกวาดพิกัดใหม่` : point.name;
    marker.innerHTML = `<span class="dynamic-map-dot"></span>${alerts ? `<span class="device-alert-badge">!</span>` : ''}`;
   let markerDrag = null;
    marker.addEventListener('mousedown', event => {
        if (!isMapEditMode || !hasWriteAccess(currentSiteKey)) return;
        event.preventDefault();
        event.stopPropagation();
        const container = document.getElementById(`map-${currentSiteKey}`);
        const img = getCurrentMapImage(container);
        if (!img) return;
        const pointer = getMapPointerPercent(event.clientX, event.clientY, img);
        markerDrag = {
            startClientX: event.clientX,
            startClientY: event.clientY,
            offsetX: pointer.x - (Number(point.x) || 0),
            offsetY: pointer.y - (Number(point.y) || 0),
            moved: false
        };
        const onMove = moveEvent => {
            if (!markerDrag) return;
            markerDrag.moved = markerDrag.moved || Math.abs(moveEvent.clientX - markerDrag.startClientX) > 4 || Math.abs(moveEvent.clientY - markerDrag.startClientY) > 4;
            const now = getMapPointerPercent(moveEvent.clientX, moveEvent.clientY, img);
            const preview = clampMapPointPosition({ ...point, x: now.x - markerDrag.offsetX, y: now.y - markerDrag.offsetY });
            marker.style.left = `${preview.x}%`;
            marker.style.top = `${preview.y}%`;
        };
        const onUp = async upEvent => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (!markerDrag) return;
            const wasMoved = markerDrag.moved;
            const now = getMapPointerPercent(upEvent.clientX, upEvent.clientY, img);
            const next = clampMapPointPosition({ ...point, x: now.x - markerDrag.offsetX, y: now.y - markerDrag.offsetY });
            markerDrag = null;
            if (wasMoved) await moveMapPoint(point.id, next.x, next.y);
            else openMapPointEditor(point.id);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    marker.onclick = (event) => {
        event.stopPropagation();
        if (!isMapEditMode) window.openForm(point.name);
    };
    return marker;
}
window.renderDynamicMapPoints = function(siteKey = currentSiteKey) {
    const container = document.getElementById(`map-${siteKey}`);
    if (!container) return;
    container.querySelectorAll('.dynamic-map-layer').forEach(el => el.remove());
    const img = getCurrentMapImage(container);
    if (!img || currentUserRole === 'viewer') return;
    const layer = document.createElement('div');
    layer.className = 'dynamic-map-layer';
    const viewId = getMapViewId(container);
    const statuses = cachedDeviceStatus[siteKey] || {};
    const alerts = cachedDeviceAlerts[siteKey] || {};
    getSiteMapPoints(siteKey).filter(p => (p.viewId || 'main') === viewId).forEach(point => {
        layer.appendChild(makeMapMarker(point, statuses[point.name] || 'ok', alerts[point.name] || 0));
    });
    img.insertAdjacentElement('afterend', layer);
};
window.updateDeviceStatusOverlays = async function(siteKey, useCache = false) {
    const container = document.getElementById(`map-${siteKey}`);
    if (!container) return;
    container.querySelectorAll('.device-overlay').forEach(el => el.remove());
    if (!useCache) {
        const docsSnap = await getAllDevicesDocs(siteKey);
        cachedDeviceStatus[siteKey] = {}; cachedDeviceAlerts[siteKey] = {};
        docsSnap.forEach(d => {
            const data = d.data();
            if (data?.currentStatus) cachedDeviceStatus[siteKey][d.id] = data.currentStatus;
            const unack = (data?.records || []).filter(r => (r.status === 'down' || r.status === 'abnormal') && (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null') && !r.acknowledgedAt);
            if (unack.length) cachedDeviceAlerts[siteKey][d.id] = unack.length;
        });
    }
    window.renderDynamicMapPoints(siteKey);
};
function getMapPointShapeFromPosition(position = {}) {
    return position.width && position.height ? 'rect' : 'point';
}
async function redrawExistingMapPoint(position) {
    const point = getSiteMapPoints().find(p => p.id === mapRedrawPointId);
    if (!point) {
        mapRedrawPointId = null;
        return false;
    }
    const redrawnPoint = clampMapPointPosition({
        ...point,
        viewId: getMapViewId(document.getElementById(`map-${currentSiteKey}`)),
        shape: getMapPointShapeFromPosition(position),
        x: position.x,
        y: position.y,
        width: position.width,
        height: position.height
    });
    mapRedrawPointId = null;
    await upsertMapPoint(redrawnPoint);
    Swal.fire({ icon: 'success', title: 'วาดพิกัดใหม่แล้ว', text: `บันทึกพิกัดใหม่ของ ${redrawnPoint.name} โดยคงข้อมูลเดิมไว้`, timer: 1800, showConfirmButton: false });
    return true;
}
function requestMapPointRedraw(point) {
    mapRedrawPointId = point.id;
    Swal.fire({
        icon: 'info',
        title: 'วาดพิกัดใหม่',
        text: `ลากกรอบหรือคลิกตำแหน่งใหม่บนแผนผังสำหรับ ${point.name} ระบบจะคงข้อมูลเดิมไว้`,
        confirmButtonText: 'ตกลง'
    });
}
async function upsertMapPoint(point) {
    if (!hasWriteAccess(currentSiteKey)) return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Editor/Admin เท่านั้นที่จัดการพิกัดได้', 'error');
    dynamicMapPoints[currentSiteKey] = getSiteMapPoints(currentSiteKey).filter(p => p.id !== point.id);
    dynamicMapPoints[currentSiteKey].push(point);
    window.updateDeviceStatusOverlays(currentSiteKey, true);
    window.updateDeviceSummary();
    await saveDynamicMapPoints(point);
    window.updateDeviceStatusOverlays(currentSiteKey, true);
    window.updateDeviceSummary();
}
window.openMapPointEditor = async function(pointId = null, clickPos = null) {
    const existing = getSiteMapPoints().find(p => p.id === pointId);
    let redrawRequested = false;
    const result = await Swal.fire({
        title: existing ? 'แก้ไขพิกัดอุปกรณ์' : 'เพิ่มพิกัดอุปกรณ์',
        html: `<input id="mapPointName" class="swal2-input" placeholder="ชื่ออุปกรณ์" value="${escapeHtml(existing?.name || '')}">${existing ? '<button type="button" id="redrawMapPointButton" class="swal2-styled" style="background:#79994a;margin-top:8px;">วาดพิกัดใหม่</button><div class="text-xs text-slate-500 mt-2">ใช้ปุ่มนี้เพื่อสร้างกรอบ/จุดใหม่ของอุปกรณ์เดิม โดยไม่ลบประวัติหรือข้อมูลเดิม</div>' : ''}`,
        showCancelButton: true,
        showDenyButton: !!existing,
        confirmButtonText: 'บันทึก',
        denyButtonText: 'ลบอุปกรณ์',
        cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            const redrawButton = document.getElementById('redrawMapPointButton');
            if (redrawButton) redrawButton.addEventListener('click', () => { redrawRequested = true; Swal.close(); });
        },
        preConfirm: () => {
            const name = document.getElementById('mapPointName').value.trim();
            if (!name) { Swal.showValidationMessage('กรุณาระบุชื่ออุปกรณ์'); return false; }
            const isRenaming = existing && existing.name && existing.name !== name;
            const duplicateMapPoint = getSiteMapPoints().some(p => p.id !== existing?.id && p.name === name);
            const duplicateConfiguredDevice = isRenaming && getSiteDeviceEntries(currentSiteKey).some(device => getDeviceId(device) === name);
            if (duplicateMapPoint || duplicateConfiguredDevice) {
                Swal.showValidationMessage('มีชื่ออุปกรณ์นี้อยู่แล้ว กรุณาใช้ชื่ออื่น');
                return false;
            }
            return name;
        }
    });
    if (redrawRequested && existing) {
        requestMapPointRedraw(existing);
        return;
    }
    if (result.isDenied && existing) {
         const deleteResult = await Swal.fire({
            title: 'ลบอุปกรณ์นี้?',
            text: `ระบบจะลบ ${existing.name} ออกจากแผนผัง รายการทรัพย์สิน กลุ่ม และข้อมูลประวัติทั้งหมด`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'ใช่, ลบทั้งหมด',
            cancelButtonText: 'ยกเลิก'
        });
        if (!deleteResult.isConfirmed) return;
        dynamicMapPoints[currentSiteKey] = getSiteMapPoints().filter(p => p.id !== existing.id);
        window.updateDeviceStatusOverlays(currentSiteKey, true);
        window.updateDeviceSummary();
        await persistDeviceRegistryAfterMapDelete(existing.name);
        await saveDynamicMapPoints();
        window.updateDeviceStatusOverlays(currentSiteKey, true);
        window.updateDeviceSummary();
        return;
    }
    if (!result.isConfirmed) return;
     const point = existing || { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, viewId: getMapViewId(document.getElementById(`map-${currentSiteKey}`)), shape: getMapPointShapeFromPosition(clickPos), x: clickPos.x, y: clickPos.y, width: clickPos.width, height: clickPos.height };
    const oldName = point.name;
    point.name = result.value;
    if (existing && oldName && oldName !== point.name) {
          await syncDeviceRenameAcrossCollections(currentSiteKey, oldName, point.name, point);
    }
    await upsertMapPoint(point);
};
window.toggleMapEditMode = function() {
    if (!hasWriteAccess(currentSiteKey)) return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Editor/Admin เท่านั้นที่จัดการพิกัดได้', 'error');
    isMapEditMode = !isMapEditMode;
    document.body.classList.toggle('map-edit-mode', isMapEditMode);
    setBetongImageMapsForEditMode(isMapEditMode);
    document.getElementById('mapEditModeText').textContent = isMapEditMode ? 'ปิดโหมดกำหนดพิกัด' : 'กำหนดพิกัดอุปกรณ์';
};
function openOtherForUnmappedMapClick(event, img) {
    if (!img || isMapEditMode || event.target.closest('.dynamic-map-marker')) return;
    const rect = img.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) return;
    // Replaces the removed legacy `<area shape="default">` fallback: any unmapped image area opens Other.
    window.openForm('Other');
}
function bindDynamicMapClicks() {
    document.querySelectorAll('.map-container').forEach(container => {
       let dragStart = null, draftEl = null, didDrag = false;
        const clearDraft = () => { if (draftEl) draftEl.remove(); draftEl = null; };
        container.addEventListener('mousedown', event => {
            if (!isMapEditMode || !hasWriteAccess(currentSiteKey) || event.target.closest('.dynamic-map-marker')) return;
            const img = getCurrentMapImage(container); if (!img) return;
            const rect = img.getBoundingClientRect();
            const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
            if (!inside) return;
            event.preventDefault(); didDrag = false;
            dragStart = { clientX: event.clientX, clientY: event.clientY, ...getImageClickPercent(event, img) };
            draftEl = document.createElement('div'); draftEl.className = 'dynamic-map-draft';
            const layer = container.querySelector('.dynamic-map-layer') || img.parentElement;
            layer.appendChild(draftEl);
        });
        container.addEventListener('mousemove', event => {
            if (!dragStart || !draftEl) return;
            const img = getCurrentMapImage(container); if (!img) return;
            const now = getImageClickPercent(event, img);
            didDrag = didDrag || Math.abs(event.clientX - dragStart.clientX) > 6 || Math.abs(event.clientY - dragStart.clientY) > 6;
            const x = Math.min(dragStart.x, now.x), y = Math.min(dragStart.y, now.y);
            draftEl.style.left = `${x}%`; draftEl.style.top = `${y}%`;
            draftEl.style.width = `${Math.abs(now.x - dragStart.x)}%`; draftEl.style.height = `${Math.abs(now.y - dragStart.y)}%`;
        });
        container.addEventListener('mouseup', event => {
             if (event.target.closest('area')) return;
            const img = getCurrentMapImage(container);
            if (dragStart && img) {
                const end = getImageClickPercent(event, img);
                const rectPos = { x: Math.min(dragStart.x, end.x), y: Math.min(dragStart.y, end.y), width: Math.abs(end.x - dragStart.x), height: Math.abs(end.y - dragStart.y) };
                clearDraft(); const start = dragStart; dragStart = null;
                 if (didDrag && rectPos.width >= 1 && rectPos.height >= 1) {
                    if (mapRedrawPointId) redrawExistingMapPoint(rectPos);
                    else window.openMapPointEditor(null, rectPos);
                    return;
                }
                const pointPos = { x: start.x, y: start.y };
                if (mapRedrawPointId) redrawExistingMapPoint(pointPos);
                else window.openMapPointEditor(null, pointPos);
                return;
            }
            clearDraft(); dragStart = null;
            openOtherForUnmappedMapClick(event, img);
        });
    });
}

let unsubscribe = null; 
/* หัวข้อ: Realtime Firestore - ฟังการเปลี่ยนแปลงเพื่ออัปเดต summary/overlay */
function setupRealtimeListener(siteKey) {
  if (unsubscribe) unsubscribe(); if (!firebase.auth().currentUser) return; 
  unsubscribe = db.collection(`sites`).doc(siteKey).collection(`devices`).onSnapshot(snapshot => { window.updateDeviceSummary(); window.updateDeviceStatusOverlays(siteKey); window.renderDynamicMapPoints(siteKey); }, (error) => { if (error.code !== 'permission-denied') console.error("Listener Error:", error); });
}
