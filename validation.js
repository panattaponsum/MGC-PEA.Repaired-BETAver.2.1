/* หัวข้อ: Validation - รวมกฎตรวจสอบข้อมูลก่อนบันทึกและก่อนนำเข้า Excel */
(function () {
    const VALID_STATUSES = new Set(['ok', 'down', 'abnormal']);

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function validateSitesConfig(sitesConfig) {
        if (!isPlainObject(sitesConfig)) return false;
        return Object.entries(sitesConfig).every(([key, site]) => {
            return typeof key === 'string' && key.trim() &&
                isPlainObject(site) &&
                typeof site.name === 'string' && site.name.trim() &&
                Array.isArray(site.devices) &&
                site.devices.every(device => {
                    if (typeof device === 'string') return device.trim();
                    return isPlainObject(device) &&
                        typeof device.id === 'string' && device.id.trim() &&
                        typeof device.name === 'string' && device.name.trim();
                });
        });
    }

    function validateSavePermission({ currentUser, currentDevice, currentSiteKey, canAcknowledgeIssue }) {
        if (!currentUser) return { ok: false, message: 'กรุณาเข้าสู่ระบบก่อนบันทึกข้อมูล' };
        if (!currentDevice) return { ok: false, message: 'กรุณาเลือกอุปกรณ์ก่อนบันทึกข้อมูล' };
        if (typeof canAcknowledgeIssue === 'function' && !canAcknowledgeIssue(currentSiteKey)) {
            return { ok: false, message: 'คุณไม่มีสิทธิ์บันทึกข้อมูลในสถานที่นี้' };
        }
        return { ok: true };
    }

    function validateImportedRecords(recordsToImport, allowedDevices) {
        const errors = [];
        const deviceSet = new Set(allowedDevices || []);
        recordsToImport.forEach((item, index) => {
            const rowNo = index + 2;
            if (!item || !item.deviceName) errors.push(`แถว ${rowNo}: ไม่พบชื่ออุปกรณ์`);
            if (item?.deviceName && deviceSet.size && !deviceSet.has(String(item.deviceName).trim())) {
                errors.push(`แถว ${rowNo}: อุปกรณ์ "${item.deviceName}" ไม่อยู่ใน config ของไซต์นี้`);
            }
            const record = item?.record || {};
            if (!VALID_STATUSES.has(record.status)) errors.push(`แถว ${rowNo}: สถานะไม่ถูกต้อง`);
            if ((record.status === 'down' || record.status === 'abnormal') && !record.brokenDate) {
                errors.push(`แถว ${rowNo}: รายการชำรุด/ผิดปกติต้องมีวันที่เกิดเหตุ`);
            }
            if (record.fixedDate && record.brokenDate && new Date(record.fixedDate) < new Date(record.brokenDate)) {
                errors.push(`แถว ${rowNo}: วันที่ซ่อมแซมต้องหลังวันที่เกิดเหตุ`);
            }
        });
        return { ok: errors.length === 0, errors };
    }

    function validateExcelWorkbook({ workbook, assetsToImport, recordsToImport, allowedDevices }) {
        const errors = [];
        if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) errors.push('ไฟล์ Excel ไม่มีชีทข้อมูล');
        if ((assetsToImport?.length || 0) === 0 && (recordsToImport?.length || 0) === 0) errors.push('ไม่พบข้อมูลที่นำเข้าได้');
        const recordResult = validateImportedRecords(recordsToImport || [], allowedDevices || []);
        errors.push(...recordResult.errors);
        return { ok: errors.length === 0, errors };
    }

    window.AppValidation = {
        validateSitesConfig,
        validateSavePermission,
        validateImportedRecords,
        validateExcelWorkbook
    };
})();
