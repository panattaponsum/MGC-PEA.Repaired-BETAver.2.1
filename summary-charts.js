/* Extracted from main.js: 1407-1651. Keep script order in index.html. */
window.updateDeviceSummary = async function() {
    const requestedSiteKey = currentSiteKey;
    const requestedSwitchVersion = siteSwitchVersion;
    const siteData = sites[requestedSiteKey]; if (!siteData) return;
     if (!canReadSiteData(requestedSiteKey)) {
        const tbody = document.getElementById('summaryBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center py-10 text-slate-400 italic">🔒 ไม่มีสิทธิ์ดูข้อมูลไซต์นี้</td></tr>';
        ['cardTotal', 'cardNormal', 'cardBroken'].forEach(id => { const el = document.getElementById(id); if (el) el.innerText = '0'; });
        return;
     }
    const search = document.getElementById('searchInput').value.toLowerCase(); const sortOrder = document.getElementById('sortOrder').value; const filterStatus = document.getElementById('filterStatus').value; const from = document.getElementById('fromDate').value; const to = document.getElementById('toDate').value;
    const dataMap = await getMergedDeviceDataMap(requestedSiteKey);
    if (requestedSiteKey !== currentSiteKey || requestedSwitchVersion !== siteSwitchVersion) return;
    let summary = []; let totalDevices = 0; let currentBrokenCount = 0; let currentNormalCount = 0;

     for (const deviceEntry of siteData.devices) {
        const dev = getDeviceId(deviceEntry);
        const devDisplayName = getDeviceDisplayName(deviceEntry);
        const docData = dataMap[dev]; const records = docData?.records || []; if (records.length > 0) records.sort((a, b) => a.ts - b.ts);
        const subDevices = (dev === 'Other' && OTHER_SUBDEVICES[requestedSiteKey]) ? OTHER_SUBDEVICES[requestedSiteKey] : [null];

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

            const deviceLabel = subDeviceName ? `${devDisplayName} / ${subDeviceName}` : devDisplayName;
            const deviceValue = subDeviceName ? `${dev} / ${subDeviceName}` : dev;
            if (search && !deviceLabel.toLowerCase().includes(search)) continue;

            const unacknowledgedCount = remainingIssues.filter(r => !r.acknowledgedAt).length; 
            summary.push({ device: deviceValue, deviceLabel: deviceLabel, count: downCount, remaining: remainingCount, brokenDate: earliestBrokenDate, fixedDate: latestFixedDate, status: currentStatusDisplay, latestDescription: latestRecord?.description || '-', latestSolution: latestRecord?.solution || '-', latestBrokenDuration: latestBrokenDuration, latestBrokenDays: latestBrokenDays, unacknowledgedCount: unacknowledgedCount });
        }
    }

    if (document.getElementById('cardTotal')) document.getElementById('cardTotal').innerText = totalDevices; if (document.getElementById('cardNormal')) document.getElementById('cardNormal').innerText = currentNormalCount; if (document.getElementById('cardBroken')) document.getElementById('cardBroken').innerText = currentBrokenCount;
   summary.sort((a, b) => {
        const issueSort = Number(b.count > 0) - Number(a.count > 0);
        if (issueSort !== 0) return issueSort;

        const activeIssueSort = Number(b.remaining > 0) - Number(a.remaining > 0);
        if (activeIssueSort !== 0) return activeIssueSort;

        const nameSort = compareTextNatural(a.deviceLabel || a.device, b.deviceLabel || b.device);
        if (nameSort !== 0) return nameSort;

        const countSort = sortOrder === 'desc' ? b.count - a.count : a.count - b.count;
        if (countSort !== 0) return countSort;
        return b.latestBrokenDays - a.latestBrokenDays;
    });
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

            const alertBadgeHtml = s.unacknowledgedCount > 0 ? `<span class="history-alert-badge" title="มีรายการชำรุด/ผิดปกติที่ยังไม่รับทราบ ${s.unacknowledgedCount} รายการ">✕</span>` : '';
            const tr = document.createElement('tr'); tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors group cursor-pointer'; 
             tr.innerHTML = `<td class="p-4"><div class="font-bold text-slate-700 group-hover:text-blue-600 transition-colors flex items-center">${alertBadgeHtml}${escapeHtml(s.deviceLabel || s.device)}</div></td><td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-xs font-bold ${s.count > 0 ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}">${s.count} / ${s.remaining}</span></td> <td class="p-4 text-center text-xs text-slate-500 font-mono">${formatThaiDate(s.brokenDate)}</td><td class="p-4 text-center text-xs text-slate-500 font-mono">${formatThaiDate(s.fixedDate)}</td><td class="p-4 text-center">${statusBadge}</td><td class="p-4 text-center"><span class="text-xs font-bold ${(s.status !== 'ปกติ') ? 'text-red-500' : 'text-slate-600'}">${s.latestBrokenDuration}</span></td><td class="p-4"><p class="text-xs text-slate-500 truncate max-w-[150px]" title="${escapeHtml(s.latestDescription)}">${escapeHtml(s.latestDescription || '-')}</p></td><td class="p-4"><p class="text-xs text-slate-500 truncate max-w-[150px]" title="${escapeHtml(s.latestSolution)}">${escapeHtml(s.latestSolution || '-')}</p></td>`;
            tr.onclick = () => window.openForm(s.device); tbody.appendChild(tr);
        });
    }

    const pagination = document.getElementById('pagination');
    if (pagination) {
        pagination.className = "flex items-center justify-between px-6 py-4 bg-slate-50/50";
        pagination.innerHTML = `<div class="text-xs font-bold text-slate-400 uppercase tracking-widest">Showing ${startIndex + 1} to ${Math.min(startIndex + pageSize, summary.length)} of ${summary.length} entries</div><div class="flex items-center gap-1"><button onclick="changePage(-1)" ${currentPage===1?'disabled':''} class="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg></button><div class="px-4 py-1 bg-white rounded-lg shadow-sm border border-slate-200 text-sm font-bold text-blue-600">${currentPage} / ${totalPages}</div><button onclick="changePage(1)" ${currentPage===totalPages?'disabled':''} class="p-2 rounded-lg hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg></button></div>`;
    }
    if (typeof renderDashboardCharts === 'function') {
       renderDashboardCharts(requestedSiteKey);
    }
};



window.chart1 = null;
window.chart2 = null;

window.renderDashboardCharts = async function(siteKey) {
     if (!canReadSiteData(siteKey)) return;
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
     if (!canReadSiteData(siteKey) || currentUserRole === 'viewer') return;
    
    if (!useCache) {
        const docsSnap = await getAllDevicesDocs(siteKey); 
        cachedDeviceStatus[siteKey] = {};
        cachedDeviceAlerts[siteKey] = {};
        docsSnap.forEach(d => { 
            const data = d.data();
            if (data && data.currentStatus) cachedDeviceStatus[siteKey][d.id] = data.currentStatus; 
            // เพิ่มใหม่: ตรวจสอบว่ามีรายการชำรุด/ผิดปกติที่ "ยังไม่กดรับทราบ" หรือไม่
            const records = (data && data.records) || [];
            const unacknowledged = records.filter(r => 
                (r.status === 'down' || r.status === 'abnormal') && 
                (!r.fixedDate || r.fixedDate === '' || r.fixedDate === '-' || r.fixedDate === 'null') &&
                !r.acknowledgedAt
            );
            if (unacknowledged.length > 0) cachedDeviceAlerts[siteKey][d.id] = unacknowledged.length;
        });
    }
    const devicesStatus = cachedDeviceStatus[siteKey] || {};
    const devicesAlerts = cachedDeviceAlerts[siteKey] || {};

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
            if(!deviceName || deviceName === 'The Other' || deviceName === 'To Powerstore' || deviceName === 'Back to Main') return; 
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
