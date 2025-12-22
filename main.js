// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyCe-qS_uKPYASKJHHL0JuV4eCCzajbpzRY",
    authDomain: "microgrid-th.firebaseapp.com",
    projectId: "microgrid-th",
    storageBucket: "microgrid-th.firebasestorage.app",
    messagingSenderId: "88058740399",
    appId: "1:88058740399:web:bbb38da765672dc4969e5a"
};

// Init Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Global State
let currentSiteKey = "ko-phaluay";
let currentDevice = null;
let currentUser = null;
let userRole = 'viewer'; // Default role
let editIndex = -1;
let chartInstance = null;
let currentPage = 1;

// Admin Email (Super Admin)
const ADMIN_EMAIL = 'pannattapon.sum@gmail.com';

// Data Structure
const sites = {
    "ko-phaluay": { name: "ไมโครกริดเกาะพะลวย", devices: ["HMI Server 1", "HMI Server 2", "Operation Station", "Printer", "Time Server", "MGC", "Switch 1", "Switch 2", "Switch 3", "Switch 4", "Switch 5", "Switch 6", "Switch 7", "Switch 8", "COV 1", "COV 2", "BCP", "PCS", "Inverter 1", "Inverter 2", "Inverter 3", "Inverter 4", "Inverter 5", "Inverter 6", "Inverter 7", "Inverter 8", "Inverter 9", "Inverter 10", "DG 1", "DG 2", "DG Master", "Gateway 1", "Gateway 2", "Firewall 1", "Firewall 2", "Firewall 3"] },
    "mae-sariang": { name: "ไมโครกริดแม่สะเรียง", devices: ["FireWall 1", "PCS-9893(2nd)", "HMI Display 1", "HMI Display 2", "HMI Main 1", "Cyber Security Manager", "Scada 1", "Scada 2", "Switch 1", "Switch 2", "Switch 3", "Switch 4", "Switch 5", "Switch 6", "Switch 7", "ETH Switch 1", "ETH Switch 2", "PCS-9892", "PCS-9893(1st)", "PCS-9799(1st)", "PCS-9799(2nd)", "MGC 1", "MGC 2", "ATS", "PCS-9794(1st)", "Diesel Local", "PCS-9794(2nd)", "PCS-9726", "PCS-9567C", "PCS 1", "PCS 2", "PCS 3", "PCS 4", "PCS 5", "PCS 6", "ETH Switch 3", "BMS 1", "BMS 2", "BMS 3", "BMS 4", "BMS 5", "BMS 6", "FRTU 1-15"] },
    "betong": { name: "ไมโครกริดเบตง", devices: ["Operator HMI 24", "Operator HMI 27", "ETH Switch 1", "ETH Switch 2", "ETH Switch 3", "ETH Switch 4", "ETH Switch 6", "ETH Switch 7"] }
};

// =========================================================================
// AUTHENTICATION & RBAC
// =========================================================================
auth.onAuthStateChanged(async (user) => {
    const loginBtn = document.getElementById('loginButton');
    const userInfo = document.getElementById('userInfo');
    const nameDisplay = document.getElementById('userNameDisplay');
    const adminBtn = document.getElementById('adminUserBtn');

    if (user) {
        currentUser = user;
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        nameDisplay.innerText = user.email;
        
        // Check Role
        try {
            if (user.email === ADMIN_EMAIL) {
                userRole = 'admin'; // Hardcode Super Admin
                // Save/Update Admin record
                await db.collection('users').doc(user.email).set({ email: user.email, role: 'admin', lastLogin: Date.now() }, { merge: true });
            } else {
                const doc = await db.collection('users').doc(user.email).get();
                if (doc.exists) {
                    userRole = doc.data().role || 'viewer';
                } else {
                    userRole = 'viewer'; // New User Default
                    await db.collection('users').doc(user.email).set({ email: user.email, role: 'viewer', lastLogin: Date.now() });
                }
            }
        } catch (e) {
            console.error("Auth Error:", e);
            userRole = 'viewer';
        }
        
    } else {
        currentUser = null;
        userRole = 'viewer';
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
    }

    applyPermissions();
    if(document.getElementById("location-select")) switchSite(document.getElementById("location-select").value);
});

function applyPermissions() {
    const isAdmin = (userRole === 'admin');
    const isStaff = (userRole === 'staff' || isAdmin);

    // Toggle Write Buttons
    ['saveDataButton', 'clearDeviceButton', 'clearAllButton', 'importButtonLabel'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = isStaff ? 'inline-block' : 'none';
    });

    // Toggle Admin Button
    const adminBtn = document.getElementById('adminUserBtn');
    if(adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';

    // Toggle Asset Save
    const assetBtn = document.getElementById('saveAssetButton');
    if(assetBtn) assetBtn.style.display = isAdmin ? 'block' : 'none'; // Only Admin edits assets
}

document.getElementById('loginButton').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
document.getElementById('logoutButton').onclick = () => auth.signOut();

// =========================================================================
// USER MANAGEMENT (ADMIN)
// =========================================================================
window.openUserManagement = async function() {
    if(userRole !== 'admin') return;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('userModal').style.display = 'flex';
    
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading...</td></tr>';

    const snap = await db.collection('users').get();
    tbody.innerHTML = '';
    snap.forEach(doc => {
        const u = doc.data();
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="p-2 text-white">${u.email}</td>
            <td class="p-2"><span class="tag ${u.role==='admin'?'tag-bad':(u.role==='staff'?'tag-warn':'tag-ok')}">${u.role}</span></td>
            <td class="p-2">
                ${u.email === ADMIN_EMAIL ? '<span class="text-xs text-gray-500">Super Admin</span>' : `
                <select onchange="changeUserRole('${u.email}', this.value)" class="bg-gray-700 text-xs rounded p-1">
                    <option value="viewer" ${u.role==='viewer'?'selected':''}>Viewer</option>
                    <option value="staff" ${u.role==='staff'?'selected':''}>Staff</option>
                    <option value="admin" ${u.role==='admin'?'selected':''}>Admin</option>
                </select>`}
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.closeUserModal = () => {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('userModal').style.display = 'none';
}

window.changeUserRole = async (email, role) => {
    try {
        await db.collection('users').doc(email).update({ role });
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Updated', showConfirmButton: false, timer: 1500 });
        openUserManagement();
    } catch (e) { Swal.fire('Error', e.message, 'error'); }
}

// =========================================================================
// CORE DATA & STATS
// =========================================================================
function getCollection(siteKey) { return db.collection('sites').doc(siteKey).collection('devices'); }

window.updateDeviceSummary = async function() {
    const siteKey = currentSiteKey;
    const snap = await getCollection(siteKey).get();
    const list = [];
    
    let total = 0, down = 0;

    snap.forEach(doc => {
        const d = doc.data();
        const records = d.records || [];
        records.sort((a,b) => a.ts - b.ts);
        const last = records[records.length-1];
        
        // Determine status: If last record is down and not fixed -> DOWN
        const isDown = (last && last.status === 'down' && !last.fixedDate);
        
        total++;
        if(isDown) down++;

        // Filter Logic
        const term = document.getElementById('searchInput').value.toLowerCase();
        const filter = document.getElementById('filterStatus').value;
        if(term && !doc.id.toLowerCase().includes(term)) return;
        if(filter === 'currently-down' && !isDown) return;
        if(filter === 'clean' && records.some(r => r.status==='down')) return;

        list.push({ id: doc.id, records, isDown, last });
    });

    // Update Dashboard Stats
    if(document.getElementById('stat-total')) {
        document.getElementById('stat-total').innerText = total;
        document.getElementById('stat-down').innerText = down;
        document.getElementById('stat-normal').innerText = total - down;
    }

    renderSummaryTable(list);
    updateChart(list);
    updateMapOverlays(list);
}

function renderSummaryTable(list) {
    const tbody = document.getElementById('summaryBody');
    tbody.innerHTML = '';
    list.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-800 cursor-pointer';
        row.innerHTML = `
            <td class="p-3 font-bold text-white">${item.id}</td>
            <td class="p-3"><span class="tag ${item.isDown?'tag-bad':'tag-ok'}">${item.isDown ? 'DOWN' : 'NORMAL'}</span></td>
            <td class="p-3 text-xs">${item.last?.brokenDate || '-'}</td>
            <td class="p-3 text-xs">${item.last?.fixedDate || '-'}</td>
            <td class="p-3 text-xs text-gray-400 truncate max-w-[150px]">${item.last?.description || '-'}</td>
        `;
        row.onclick = () => openForm(item.id);
        tbody.appendChild(row);
    });
}

// =========================================================================
// FORM & CRUD
// =========================================================================
window.openForm = async function(dev) {
    currentDevice = dev;
    editIndex = -1;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('formModal').style.display = 'flex';
    document.getElementById('formTitle').innerText = `บันทึก: ${dev}`;
    
    clearForm();
    await loadHistory();
}

window.closeForm = () => {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('formModal').style.display = 'none';
    closeUserModal();
    closeAssetModal(false);
}

function clearForm() {
    document.getElementById('userName').value = currentUser ? currentUser.email : 'Guest';
    const st = document.getElementById('status');
    const fd = document.getElementById('fixedDate');
    
    st.value = 'down'; st.disabled = true;
    fd.value = ''; fd.disabled = true; fd.classList.add('opacity-50');
    
    document.getElementById('brokenDate').value = '';
    document.getElementById('description').value = '';
    document.getElementById('editHint').classList.add('hidden');
}

window.saveData = async function() {
    if(!currentUser) return Swal.fire('Warning', 'Please Login', 'warning');
    if(userRole === 'viewer') return Swal.fire('Error', 'Viewer cannot save', 'error');

    let status = document.getElementById('status').value;
    const bDate = document.getElementById('brokenDate').value;
    const fDate = document.getElementById('fixedDate').value;
    
    if(bDate && fDate) status = 'ok';
    if(status === 'down' && !bDate) return Swal.fire('Required', 'ระบุวันที่ชำรุด', 'warning');

    const docRef = getCollection(currentSiteKey).doc(currentDevice);
    const snap = await docRef.get();
    let records = snap.exists ? (snap.data().records || []) : [];
    
    const newRec = {
        user: document.getElementById('userName').value,
        status, brokenDate: bDate, fixedDate: fDate,
        description: document.getElementById('description').value,
        ts: Date.now(),
        counted: (status === 'down')
    };

    if(editIndex >= 0) {
        // Edit mode
        records[editIndex] = { ...records[editIndex], ...newRec, ts: records[editIndex].ts };
    } else {
        records.push(newRec);
    }

    await docRef.set({ records, currentStatus: status }, { merge: true });
    
    clearForm();
    await loadHistory();
    updateDeviceSummary();
    Swal.fire('Saved', '', 'success');
}

window.editRecord = async (ts) => {
    if(userRole === 'viewer') return;
    const docRef = getCollection(currentSiteKey).doc(currentDevice);
    const snap = await docRef.get();
    const records = snap.data().records;
    const idx = records.findIndex(r => String(r.ts) === String(ts));
    
    if(idx >= 0) {
        const r = records[idx];
        document.getElementById('status').disabled = false;
        document.getElementById('status').value = r.status;
        document.getElementById('fixedDate').disabled = false;
        document.getElementById('fixedDate').classList.remove('opacity-50');
        
        document.getElementById('brokenDate').value = r.brokenDate;
        document.getElementById('fixedDate').value = r.fixedDate;
        document.getElementById('description').value = r.description;
        
        editIndex = idx;
        document.getElementById('editHint').classList.remove('hidden');
    }
}

window.clearCurrentDevice = async () => {
    if(userRole !== 'admin' && userRole !== 'staff') return;
    if(await Swal.fire({ title: 'ล้างข้อมูล?', icon: 'warning', showCancelButton: true }).then(r=>r.isConfirmed)) {
        await getCollection(currentSiteKey).doc(currentDevice).set({ records: [], currentStatus: 'ok' }, { merge: true });
        loadHistory();
        updateDeviceSummary();
    }
}

async function loadHistory() {
    const div = document.getElementById('historySection');
    div.innerHTML = 'Loading...';
    
    const snap = await getCollection(currentSiteKey).doc(currentDevice).get();
    const records = snap.exists ? (snap.data().records || []) : [];
    const asset = snap.exists ? (snap.data().assetInfo || {}) : {};
    
    // Update Asset Display
    document.getElementById('assetInfoDisplay').innerText = asset.serial ? `${asset.model} | ${asset.serial}` : 'ยังไม่ลงทะเบียน';
    
    records.sort((a,b) => b.ts - a.ts);
    div.innerHTML = '';
    
    if(records.length===0) div.innerHTML = '<div class="text-center text-gray-500 text-xs">ไม่มีประวัติ</div>';

    records.forEach(r => {
        const item = document.createElement('div');
        item.className = "bg-gray-800 p-2 rounded border border-gray-700 text-xs";
        item.innerHTML = `
            <div class="flex justify-between mb-1">
                <span class="tag ${r.status==='down'?'tag-bad':'tag-ok'}">${r.status.toUpperCase()}</span>
                <span class="text-gray-500">${r.brokenDate}</span>
            </div>
            <div class="text-gray-300">${r.description}</div>
            <div class="mt-1 flex gap-2 justify-end">
                <button class="text-yellow-500 hover:text-yellow-400" onclick="editRecord('${r.ts}')">Edit</button>
            </div>
        `;
        div.appendChild(item);
    });
}

// =========================================================================
// ASSET MODAL
// =========================================================================
window.openAssetModal = async () => {
    if(!currentDevice) return;
    document.getElementById('overlay').style.display = 'block';
    document.getElementById('assetModal').style.display = 'flex';
    document.getElementById('formModal').style.display = 'none';
    
    const snap = await getCollection(currentSiteKey).doc(currentDevice).get();
    const info = (snap.data() && snap.data().assetInfo) || {};
    
    ['assetSerial','assetModel','assetManufacturer','assetWarrantyStart','assetWarrantyEnd'].forEach(id => {
        const el = document.getElementById(id);
        el.value = info[id.replace('asset','').toLowerCase().replace('warrantystart','warrantyStart').replace('warrantyend','warrantyEnd')] || '';
        el.disabled = (userRole !== 'admin');
    });
}

window.closeAssetModal = (back=true) => {
    document.getElementById('assetModal').style.display = 'none';
    if(back) document.getElementById('formModal').style.display = 'flex';
    else document.getElementById('overlay').style.display = 'none';
}

window.saveAssetData = async () => {
    if(userRole !== 'admin') return Swal.fire('Error', 'Admin Only', 'error');
    
    const info = {
        serial: document.getElementById('assetSerial').value,
        model: document.getElementById('assetModel').value,
        manufacturer: document.getElementById('assetManufacturer').value,
        warrantyStart: document.getElementById('assetWarrantyStart').value,
        warrantyEnd: document.getElementById('assetWarrantyEnd').value
    };
    
    await getCollection(currentSiteKey).doc(currentDevice).set({ assetInfo: info }, { merge: true });
    Swal.fire('Saved', '', 'success');
    closeAssetModal(true);
    loadHistory(); // Refresh header display
}

// =========================================================================
// MISC (Map, Chart, Export)
// =========================================================================
window.showSummary = () => {
    document.getElementById('topologyPage').classList.add('hidden');
    document.getElementById('summaryPage').classList.remove('hidden');
    updateDeviceSummary();
}
window.showTopology = () => {
    document.getElementById('summaryPage').classList.add('hidden');
    document.getElementById('topologyPage').classList.remove('hidden');
}

function updateChart(list) {
    if(chartInstance) chartInstance.destroy();
    const ctx = document.getElementById('chart').getContext('2d');
    const top = list.sort((a,b) => b.records.length - a.records.length).slice(0, 10);
    
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top.map(x=>x.id),
            datasets: [{ label: 'Count', data: top.map(x=>x.records.length), backgroundColor: '#f87171' }]
        },
        options: { responsive: true, plugins: { legend: {display: false} } }
    });
}

function updateMapOverlays(list) {
    const container = document.getElementById(`map-${currentSiteKey}`);
    if(!container) return;
    container.querySelectorAll('.device-overlay').forEach(e => e.remove());
    
    // Simple overlay logic: iterate areas, check status, append div
    // (Implementation depends on map areas coords - keeping simplified here)
    // You can copy full logic from your previous main.js if needed.
}

document.addEventListener("DOMContentLoaded", () => {
    const sel = document.getElementById("location-select");
    sel.addEventListener("change", (e) => {
        currentSiteKey = e.target.value;
        document.getElementById('locationTitle').innerText = sites[currentSiteKey].name;
        document.querySelectorAll('.map-container').forEach(d => d.classList.add('hidden'));
        document.getElementById(`map-${currentSiteKey}`).classList.remove('hidden');
        if(window.imageMapResize) window.imageMapResize();
        updateDeviceSummary();
    });
    sel.dispatchEvent(new Event('change'));
});

// Excel Export / Report Print stub functions (Add full logic if needed)
window.exportAllDataExcel = () => Swal.fire('Info', 'Feature available in full version', 'info');
window.printReport = () => window.print();
