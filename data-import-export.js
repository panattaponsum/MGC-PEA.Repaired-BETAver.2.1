/* Extracted from main.js: 2135-2511. Keep script order in index.html. */
/* หัวข้อ: Excel Import - รวมข้อมูลจากไฟล์ Excel ตรวจซ้ำ และบันทึกเข้า Firestore */
async function processAndSaveImport(assetsToImport, recordsToImport, importedGroupMap = {}) {
    Swal.fire({ title: 'กำลังนำเข้า...', didOpen: () => { Swal.showLoading(); } }); const batch = db.batch(); const assetMap = new Map();
    for (const item of assetsToImport) assetMap.set(item.deviceName, item.assetInfo);
    const recordMap = new Map(); 
    for (const item of recordsToImport) { if (!recordMap.has(item.deviceName)) recordMap.set(item.deviceName, []); recordMap.get(item.deviceName).push(item.record); }
     const configuredDeviceIds = getConfiguredDeviceIds(currentSiteKey);
    const allDeviceNames = new Set([...assetMap.keys(), ...recordMap.keys(), ...configuredDeviceIds]);
    try {
        const docsSnap = await getAllDevicesDocs(currentSiteKey); const existingDataMap = new Map(); docsSnap.forEach(d => existingDataMap.set(d.id, d.data()));
        const assetSnap = await getAllAssetDocs(currentSiteKey); const existingAssetMap = new Map(); assetSnap.forEach(d => existingAssetMap.set(d.id, d.data().assetInfo || {}));
        for (const deviceName of allDeviceNames) {
             if (!configuredDeviceIds.includes(deviceName)) continue;
            const docRef = getSiteCollection(currentSiteKey).doc(deviceName); const existingData = existingDataMap.get(deviceName) || {};
            let finalAssetInfo = assetMap.has(deviceName) ? assetMap.get(deviceName) : (existingAssetMap.get(deviceName) || existingData.assetInfo || {});
            
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
            
            batch.set(getSiteAssetsCollection(currentSiteKey).doc(deviceName), { 
                assetInfo: finalAssetInfo,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            batch.set(docRef, { 
                records: finalRecords, 
                downCount: downCount, 
                currentStatus: currentStatus,
                assetInfo: firebase.firestore.FieldValue.delete()
            }, { merge: true });
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
        const siteNameForLog = (sites[currentSiteKey] && sites[currentSiteKey].name) ? sites[currentSiteKey].name : currentSiteKey;
        await createLog("IMPORT_DATA", `นำเข้าข้อมูล Excel ของไซต์ ${siteNameForLog} (อุปกรณ์ ${assetsToImport.length} รายการ, ประวัติ ${recordsToImport.length} รายการ)${groupMsg}`);
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
                    const colIpAddress    = headers.indexOf('IP Address');
                    const colPrice        = headers.indexOf('ราคาซื้อ');
                    const colManufacturer = headers.indexOf('Manufacturer');
                    const colLocation     = headers.indexOf('สถานที่ติดตั้ง');
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
                            if (groupName && groupName !== '(อื่นๆ)') {
                                if (!importedGroupMap[groupName]) importedGroupMap[groupName] = [];
                                 importedGroupMap[groupName].push(normalizeImportedDeviceSelection(deviceName).deviceId);
                            }
                            assetsToImport.push({ deviceName: normalizeImportedDeviceSelection(deviceName).deviceId, assetInfo: {
                                serial:        colSerial       !== -1 ? (row[colSerial]       || '') : '',
                                model:         colModel        !== -1 ? (row[colModel]        || '') : '',
                                peaNo:         colPea          !== -1 ? (row[colPea]          || '') : '',
                                ipAddress:     colIpAddress    !== -1 ? (row[colIpAddress]    || '') : '',
                                price:         colPrice        !== -1 ? (row[colPrice]        || '') : '',
                                manufacturer:  colManufacturer !== -1 ? (row[colManufacturer] || '') : '',
                                location:      colLocation     !== -1 ? (row[colLocation]     || '') : '',
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
                                                                                'หนังสือ มท': headers.indexOf('หนังสือ มท'), 'ลิงก์ไฟล์ มท': headers.indexOf('ลิงก์ไฟล์ มท'), 'ลงวันที่': headers.indexOf('ลงวันที่') !== -1 ? headers.indexOf('ลงวันที่') : headers.indexOf('หนังสือ กฟภ.'),
                                        'ชื่อ-สกุล ผู้แจ้งเหตุ': headers.indexOf('ชื่อ-สกุล ผู้แจ้งเหตุ') !== -1 ? headers.indexOf('ชื่อ-สกุล ผู้แจ้งเหตุ') : headers.indexOf('ผู้บันทึก'),
                                        'ตำแหน่ง': headers.indexOf('ตำแหน่ง'), 'สังกัด': headers.indexOf('สังกัด'),
                                        'ชื่อ-สกุล ผู้แจ้งซ่อมแซม': headers.indexOf('ชื่อ-สกุล ผู้แจ้งซ่อมแซม'), 'ตำแหน่ง': headers.indexOf('ตำแหน่ง'), 'สังกัด': headers.indexOf('สังกัด'),
                                        'ชื่อ-สกุล ผู้รับทราบ': headers.indexOf('ชื่อ-สกุล ผู้รับทราบ') !== -1 ? headers.indexOf('ชื่อ-สกุล ผู้รับทราบ') : headers.indexOf('ผู้รับทราบ'),
                                        'วันที่-เวลารับทราบ': headers.indexOf('วันที่-เวลารับทราบ') !== -1 ? headers.indexOf('วันที่-เวลารับทราบ') : headers.indexOf('วันที่-เวลา'),
                                        'ผู้บันทึก': headers.indexOf('ผู้บันทึก'),
                                        'รายละเอียดปัญหา': headers.indexOf('รายละเอียดปัญหา') !== -1 ? headers.indexOf('รายละเอียดปัญหา') : headers.indexOf('คำอธิบาย') };
                    
                    if (headerMap['ชื่ออุปกรณ์'] !== -1 && headerMap['วันที่เกิดเหตุ'] !== -1) {
                        for (let i = 1; i < recordRawData.length; i++) {
                            const row = recordRawData[i]; const deviceName = row[headerMap['ชื่ออุปกรณ์']]; if (!deviceName) continue;
                            const importedDevice = normalizeImportedDeviceSelection(deviceName);
                            const importedBrokenDate = cleanDate(row[headerMap['วันที่เกิดเหตุ']]); const importedFixedDate = cleanDate(row[headerMap['วันที่ซ่อมแซม']]);
                            const statusValue = (row[headerMap['สถานะ']] || '').toString(); const importedTs = row[headerMap['Timestamp']];
                            const customIdIdx = headerMap['เลข ID อ้างอิง'];
                            const customId = (customIdIdx !== -1 && row[customIdIdx]) ? row[customIdIdx].toString() : null;
                            let finalStatus = 'ok'; if (statusValue.includes('ชำรุด')) finalStatus = 'down'; else if (statusValue.includes('ผิดปกติ')) finalStatus = 'abnormal';
                            if (importedBrokenDate && !importedFixedDate && finalStatus === 'ok') finalStatus = 'down'; 
                            
                            const parsedTs = parseThaiDateTimeToTS(importedTs);
                            const timestampToSave = parsedTs ? parsedTs : (Date.now() + i);

                             recordsToImport.push({ deviceName: importedDevice.deviceId, record: {
                                    ts: timestampToSave, customId: customId,brokenDate: importedBrokenDate || '', 
                                    fixedDate: importedFixedDate || null,  status: finalStatus, 
                                    subDevice: importedDevice.subDevice,   
                                    description: (headerMap['รายละเอียดปัญหา'] !== -1 ? (row[headerMap['รายละเอียดปัญหา']] || '') : '').toString() || 'นำเข้าจาก Excel',  
                                    brokenFileUrl: row[headerMap['ลิงก์รูปชำรุด']] || null,
                                    solution: (headerMap['วิธีแก้ไข'] !== -1) ? (row[headerMap['วิธีแก้ไข']] || '').toString() : '',
                                   fixedFileUrl: row[headerMap['ลิงก์รูปแก้ไข']] || null,
                                    ministryFileUrl: (headerMap['ลิงก์ไฟล์ มท'] !== -1) ? (row[headerMap['ลิงก์ไฟล์ มท']] || null) : null, 
                                    orderNumber: (headerMap['เลขที่ใบสั่ง'] !== -1) ? (row[headerMap['เลขที่ใบสั่ง']] || '').toString() : '', 
                                    repairCost: (headerMap['ราคาซ่อม'] !== -1) ? (row[headerMap['ราคาซ่อม']] || '').toString() : '',
                                    docMinistry: (headerMap['หนังสือ มท'] !== -1) ? (row[headerMap['หนังสือ มท']] || '').toString() : '',
                                    docPEA: (headerMap['ลงวันที่'] !== -1) ? cleanDate(row[headerMap['ลงวันที่']]) : '',
                                    brokenUser: (headerMap['ชื่อ-สกุล ผู้แจ้งเหตุ'] !== -1) ? (row[headerMap['ชื่อ-สกุล ผู้แจ้งเหตุ']] || '').toString() : (currentUserFullName || currentUser.email), 
                                    brokenUserPos: (headerMap['ตำแหน่ง'] !== -1) ? (row[headerMap['ตำแหน่ง']] || '').toString() : '',
                                    brokenUserDept: (headerMap['สังกัด'] !== -1) ? (row[headerMap['สังกัด']] || '').toString() : '',
                                    fixedUser: (headerMap['ชื่อ-สกุล ผู้แจ้งซ่อมแซม'] !== -1) ? (row[headerMap['ชื่อ-สกุล ผู้แจ้งซ่อมแซม']] || '').toString() : '',
                                    acknowledgedBy: (headerMap['ชื่อ-สกุล ผู้รับทราบ'] !== -1) ? (row[headerMap['ชื่อ-สกุล ผู้รับทราบ']] || '').toString() : '',
                                    acknowledgedAt: (headerMap['วันที่-เวลารับทราบ'] !== -1) ? parseThaiDateTimeToTS(row[headerMap['วันที่-เวลารับทราบ']]) : null,
                                    user: (headerMap['ผู้บันทึก'] !== -1 ? (row[headerMap['ผู้บันทึก']] || '') : '').toString() || (currentUserFullName || currentUser.email),
                                    counted: !!importedBrokenDate
                            } });
                        }
                    } else { Swal.fire('ผิดพลาด', 'ไม่พบคอลัมน์ ชื่ออุปกรณ์ หรือ วันที่เกิดเหตุ ในไฟล์ Excel', 'error'); return; }
                }
            }
            const importValidation = window.AppValidation?.validateExcelWorkbook({
                workbook: wb,
                assetsToImport,
                recordsToImport,
                allowedDevices: getConfiguredDeviceIds(currentSiteKey)
            });
            if (importValidation && !importValidation.ok) {
                Swal.fire('ตรวจสอบไฟล์ Excel ไม่ผ่าน', importValidation.errors.slice(0, 10).join('<br>'), 'warning');
                return;
            }
            if (assetsToImport.length > 0 || recordsToImport.length > 0) {
                processAndSaveImport(assetsToImport, recordsToImport, importedGroupMap);
            } else { Swal.fire('ผิดพลาด', 'ไม่พบข้อมูล', 'error'); }
        } catch (error) { Swal.fire('ผิดพลาด', error.message, 'error'); }
    };
    reader.readAsArrayBuffer(file); event.target.value = null; 
};
/* หัวข้อ: Excel Export - ส่งออกประวัติ ทรัพย์สิน และ log เป็น workbook */
window.exportAllDataExcel = async function() {
    const siteData = sites[currentSiteKey]; if (!siteData || siteData.devices.length === 0) return;
    const configuredDeviceIds = getConfiguredDeviceIds(currentSiteKey);
    const dataMap = await getMergedDeviceDataMap(currentSiteKey);
    
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
         'วิธีแก้ไข', 'ลิงก์รูปแก้ไข', 'เลขที่ใบสั่ง', 'ราคาซ่อม', 'หนังสือ มท', 'ลิงก์ไฟล์ มท', 'ลงวันที่',
        'ชื่อ-สกุล ผู้แจ้งเหตุ', 'ตำแหน่ง', 'สังกัด', 'ชื่อ-สกุล ผู้รับทราบ', 'วันที่-เวลารับทราบ', 'สถานะซ่อม', 'ชื่อ-สกุล ผู้แจ้งซ่อมแซม', 'ตำแหน่ง', 'สังกัด'
    ]];

    // ---- ชีทข้อมูลทรัพย์สิน (แยกตามกลุ่ม) ----
    const ASSET_HEADER = ['กลุ่ม', 'ชื่ออุปกรณ์', 'Serial Number', 'Model', 'PEA No.', 'IP Address', 'ราคาซื้อ', 'Manufacturer', 'สถานที่ติดตั้ง', 'วันที่เริ่มประกัน', 'วันที่หมดประกัน', 'สถานะประกัน'];
    const assetData = [ASSET_HEADER];

    // ฟังก์ชันเพิ่มแถวอุปกรณ์
    const pushAssetRow = (devName, groupName) => {
        const docData = dataMap[devName]; const assetInfo = docData?.assetInfo || {};
        const warrantyStatus = getWarrantyStatus(assetInfo.warrantyEnd);
        let warrantyStatusText = 'N/A';
        switch(warrantyStatus) { case 'ok': warrantyStatusText = 'รับประกัน'; break; case 'warn': warrantyStatusText = 'ใกล้หมดประกัน'; break; case 'bad': warrantyStatusText = 'หมดประกัน'; break; }
        assetData.push([ groupName, getDeviceDisplayNameById(devName), assetInfo.serial || '-', assetInfo.model || '-', assetInfo.peaNo || '-', assetInfo.ipAddress || '-', assetInfo.price || '-', assetInfo.manufacturer || '-', assetInfo.location || '-', formatThaiDate(assetInfo.warrantyStart), formatThaiDate(assetInfo.warrantyEnd), warrantyStatusText ]);
    };
    // เพิ่มตามกลุ่มก่อน
    const assignedDevices = new Set();
    for (const group of exportGroups) {
        if (group.deviceKeys.length === 0) continue;
        // แถวหัวกลุ่ม (merge label)
        assetData.push([`── ${group.name} (${group.deviceKeys.length} อุปกรณ์) ──`, '', '', '', '', '', '', '', '', '', '']);
        for (const dk of group.deviceKeys) {
           if (configuredDeviceIds.includes(dk)) { pushAssetRow(dk, group.name); assignedDevices.add(dk); }
        }
    }
    // อุปกรณ์อื่นๆ
    const ungrouped = configuredDeviceIds.filter(d => d !== 'Other' && !assignedDevices.has(d));
    if (ungrouped.length > 0) {
        assetData.push([`── อื่นๆ (${ungrouped.length} อุปกรณ์) ──`, '', '', '', '', '', '', '', '', '', '']);
        for (const dk of ungrouped) { pushAssetRow(dk, '(อื่นๆ)'); }
    }

    // ---- records data (ทุกอุปกรณ์ตามลำดับ devices) ----
    for (const deviceEntry of siteData.devices) {
        const devName = getDeviceId(deviceEntry);
        const docData = dataMap[devName]; if (!docData) continue;
        const records = docData.records || []; records.sort((a, b) => a.ts - b.ts); let downCount = 0; 
        records.forEach(r => {
            let duration = '-', sequenceNumber = '-'; if (r.counted) { downCount++; sequenceNumber = downCount; }
            if (r.brokenDate) { if (r.fixedDate) duration = formatDuration(calculateDaysDifference(r.brokenDate, r.fixedDate)); else if (r.status === 'down' || r.status === 'abnormal') duration = formatDuration(calculateDaysDifference(r.brokenDate, null)) + ' (ยังไม่ซ่อม)'; }
            let statusTH = r.status === 'down' ? 'ชำรุด' : (r.status === 'abnormal' ? 'ผิดปกติ' : 'ใช้งานได้');
            const repairState = (r.acknowledgedAt && (r.status === 'down' || r.status === 'abnormal') && !r.fixedDate) ? 'กำลังซ่อมแซม' : '-';
            let devNameFinal = r.subDevice ? `${getDeviceDisplayNameById(devName)} (${r.subDevice})` : getDeviceDisplayNameById(devName);
            recordsData.push([ 
                formatThaiDateTime(r.ts), r.customId || '-', devNameFinal, sequenceNumber, 
                formatThaiDate(r.brokenDate), formatThaiDate(r.fixedDate), 
                duration, statusTH, r.description || '-', r.brokenFileUrl || '-', r.solution || '-', r.fixedFileUrl || '-', 
                r.orderNumber || '-', r.repairCost || '-', r.docMinistry || '-', r.ministryFileUrl || '-', formatThaiDate(r.docPEA) || '-',
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
            { wch: 18 }, // IP Address
            { wch: 14 }, // ราคา
            { wch: 20 }, // Manufacturer
            { wch: 22 }, // สถานที่ติดตั้ง
            { wch: 18 }, // วันเริ่ม
            { wch: 18 }, // วันหมด
            { wch: 16 }, // สถานะ
        ];
        XLSX.utils.book_append_sheet(wb, wsAsset, "ข้อมูลทรัพย์สิน");
    }
    if (logData.length > 1) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(logData), "ประวัติการใช้งาน");

    XLSX.writeFile(wb, `Device_Export_${siteData.name.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await createLog("EXPORT_DATA", `ส่งออกข้อมูล Excel ของไซต์ ${siteData.name} (อุปกรณ์ ${assetData.length - 1} รายการ, ประวัติ ${recordsData.length - 1} รายการ)`);
    Swal.fire('ส่งออกสำเร็จ', 'ไฟล์ถูกบันทึกแล้ว', "success");
};

window.resetFilters = function() { document.getElementById('searchInput').value = ''; document.getElementById('sortOrder').value = 'desc'; document.getElementById('filterStatus').value = 'all'; document.getElementById('fromDate').value = ''; document.getElementById('toDate').value = ''; currentPage = 1; try { window.updateDeviceSummary(); } catch (e) {} }

window.clearAllDevices = async function() {
if (!isAdminRole()) return;
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
        const active = id === tabId;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-current', active ? 'page' : 'false');
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
