/* หัวข้อ: Config - เก็บรายชื่อไซต์ รายการอุปกรณ์ และค่า default ที่แก้ไขได้ง่ายโดยไม่แตะ logic หลัก */
window.AppConfig = window.AppConfig || {};
window.AppConfig.firebaseConfig = {
    apiKey: "AIzaSyCe-qS_uKPYASKJHHL0JuV4eCCzajbpzRY",
    authDomain: "microgrid-th.firebaseapp.com",
    projectId: "microgrid-th",
    storageBucket: "microgrid-th.firebasestorage.app",
    messagingSenderId: "88058740399",
    appId: "1:88058740399:web:bbb38da765672dc4969e5a",
    measurementId: "G-L45B835SV4"
};

window.AppConfig.defaultSites = {
    "ko-phaluay": { name: "ไมโครกริดเกาะพะลวย อ.เกาะสมุย จ.สุราษฎร์ธานี", devices: ["Other"] },
    "mae-sariang": { name: "ไมโครกริดแม่สะเรียง อ.แม่สะเรียง จ.แม่ฮ่องสอน", devices: ["Other"] },
    "betong": { name: "ไมโครกริดเบตง อ.เบตง จ.ยะลา", devices: ["Other"] },
    "phrao": { name: "ระบบกักเก็บพลังงานแบตเตอรี่พร้าว อ.พร้าว จ.เชียงใหม่", devices: ["Other"] }
};
window.AppConfig.otherSubdevices = {
    phrao: ["Office","Current Transformer","Voltage Transformer","Step-up Transformer 5 MVA",
            "Service Transformer 160 KVA","Disconnecting Switch","Fire Alarm","The Other"],
    betong: ["Office","SVG","Fire Alarm System","The Other"],
  "ko-phaluay": ["ระบบควบคุมอาคาร","เครื่องปรับอากาศ","Cable","Riser Pole","Recloser",
"ไฟฉุกเฉิน","ถังดับเพลิง","PQM","Generator","PV","Battery","โทรศัพท์","วิทยุสื่อสาร","Breaker","The Other"]
};
window.AppConfig.sitePrefixes = {
    "ko-phaluay": "KPL",
    "betong": "BTG",
    "mae-sariang": "MSR",
    "phrao": "PRA"
};
