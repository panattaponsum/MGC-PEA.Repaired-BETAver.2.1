/* หัวข้อ: Config - เก็บรายชื่อไซต์ รายการอุปกรณ์ และค่า default ที่แก้ไขได้ง่ายโดยไม่แตะ logic หลัก */
/* ค่า __PLACEHOLDER__ ด้านล่างถูกแทนที่ด้วยค่าจริงจาก .env ผ่าน scripts/generate-config.sh (local) หรือ GitHub Actions secrets (deploy) */
window.AppConfig = window.AppConfig || {};
window.AppConfig.firebaseConfig = {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "__FIREBASE_AUTH_DOMAIN__",
    projectId: "__FIREBASE_PROJECT_ID__",
    storageBucket: "__FIREBASE_STORAGE_BUCKET__",
    messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
    appId: "__FIREBASE_APP_ID__",
    measurementId: "__FIREBASE_MEASUREMENT_ID__"
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
    betong: ["Office","SVG","Fire Alarm System","CCTV","The Other"],
  "ko-phaluay": ["ระบบควบคุมอาคาร","เครื่องปรับอากาศ","Cable","Riser Pole","Recloser",
"ไฟฉุกเฉิน","ถังดับเพลิง","PQM","Generator","PV","Battery","โทรศัพท์","วิทยุสื่อสาร","Breaker","The Other"]
};
window.AppConfig.sitePrefixes = {
    "ko-phaluay": "KPL",
    "betong": "BTG",
    "mae-sariang": "MSR",
    "phrao": "PRA"
};
