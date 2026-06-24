/* หัวข้อ: Config - เก็บรายชื่อไซต์ รายการอุปกรณ์ และค่า default ที่แก้ไขได้ง่ายโดยไม่แตะ logic หลัก */
window.AppConfig = window.AppConfig || {};

window.AppConfig.defaultSites = {
"ko-phaluay": { name: "ไมโครกริดเกาะพะลวย อ.เกาะสมุย จ.สุราษฎร์ธานี", devices: [ "HMI Server 12",
"HMI Server 2","EWS","Printer","Time Server","MGC","ETH Switch 1","ETH Switch 2","ETH Switch 3","ETH Switch 4",
"ETH Switch 5 (REC No.1)","REC No.1","ETH Switch 6 (REC No.2)","REC No.2","ETH Switch 7 (RCS No.1)","RCS No.1",
"ETH Switch 8 (RCS No.2)","RCS No.2","COV 1 (Mosbus to IEC104)","COV 2 (Mosbus to IEC104)","BCP","PCS",
"Inverter 1","Inverter 2","Inverter 3","Inverter 4","Inverter 5","Inverter 6",
"Inverter 7","Inverter 8","Inverter 9","Inverter 10",
"Diesel Generator 1","Diesel Generator 2","Diesel Generator Master",
"Gateway 1 (IEC104 to DNP3)","Gateway 2 (IEC104 to DNP3)",
"Firewall 1","Firewall 2","Firewall 3",
"GPS","Weather","Jump Server","CCTV",
"4G Router 1","4G Router 2","4G Router 3","33 Switchgear Panal","Meter", "other" ] },
"mae-sariang": { name: "ไมโครกริดแม่สะเรียง อ.แม่สะเรียง จ.แม่ฮ่องสอน", devices: [ "FireWall 1","Web Server",
"PCS-9893 (Web Server B)", "HMI Display 1", "HMI Display 2", "HMI Main 1", "(PCS-9895 Cyber Security Manager)", "Scada 1", "Scada 2", "Switch 1", "Switch 2", "Switch 3", "Switch 4", "Switch 5", "Switch 6", "Switch 7", "ETH Switch 1", "ETH Switch 2", "PCS-9892 (Cyber Security Gateway)", "PCS-9893 (Web Server A)", "PCS-9799 (Gateway A)", "PCS-9799 (Gateway B)", "PCS-9617 (MGC 1)", "PCS-9617 (MGC 2)", "PCS-9651 (ATS)", "PCS-9794 (Protocol Converter A)", "PCS-9617 (Diesel Generator Controller)", "PCS-9794 (Protocol Converter B)", "PCS-9726 (Transformer Protection)", "PCS-9567C (BESS Controller)", "PCS-9567 (PCS 1)", "PCS-9567 (PCS 2)", "PCS-9567 (PCS 3)", "PCS-9567 (PCS 4)", "PCS-9567 (PCS 5)", "PCS-9567 (PCS 6)", "ETH Switch 3", "BMS 1", "BMS 2", "BMS 3", "BMS 4", "BMS 5", "BMS 6", "FRTU 1-15", "other" ] },
"betong": { name: "ไมโครกริดเบตง อ.เบตง จ.ยะลา", devices: [ "Operator HMI 24", "Operator HMI 27", "ETH Switch 1", "ETH Switch 2", "ETH Switch 3", "ETH Switch 4", "ETH Switch 5", "ETH Switch 6", "ETH Switch 7", "eMC-N-Controller INC1", "eMC-N-Controller BAAN3", "eMC-N-Controller BAAN4", "RTU SVG", "RTU Substation", "eMC-G-Controller", "ADMS-1", "ADMS-2", "Firewall 1", "Firewall 2", "Firewall 3", "RTU Gateway -1", "RTU Gateway -2", "Security HMI", "GPS", "emC-Scada","emC-P-Controller","emC-E-Controller", "emC-LUC-1-Controller", "emC-LUC-2-Controller", "emC-LUC-3-Controller", "emC-LUC-4-Controller", "Battery System", "Diesel Generator System","Inverter System",
    "Recloser-1", "Recloser-2", "Recloser-3", "Recloser-4", "Recloser-5", "Recloser-6", "Recloser-7", "Recloser-8", "Recloser-9", "Recloser-10",
    "Recloser-11", "Recloser-12", "Recloser-13", "Recloser-14", "Recloser-15", "Recloser-16", "Recloser-17", "Recloser-18", "Recloser-19", "Recloser-20",
    "Recloser-21", "Recloser-22", "Recloser-23", "Recloser-24", "Recloser-25", "Recloser-26", "Recloser-27", "Recloser-28", "Recloser-29", "Recloser-30",
    "Recloser-31", "Recloser-32", "Recloser-33", "Recloser-34", "Recloser-35", "other" ] },
"phrao": { name: "ระบบกักเก็บพลังงานแบตเตอรี่พร้าว อ.พร้าว จ.เชียงใหม่", devices: [ "GPS Antenna", "work station", "Insight server",
"Network Switch 1", "Clock server", "Network Switch 2", "Back start controller", "Firewall 1", "EMS Controller",
"ETH Switch 1 (LC1000-1) ", "ETH Switch 2 (LC1000-1) ", "Local Controller 200-1", "Local Controller 200-2",
"Local Controller 200-3", "ETH Switch 1 (LC1000-2) ", "ETH Switch 2 (LC1000-2) ", "PCS-1", "PCS-2", "PCS-3",
"Sync. Relay (RCS)", "RCS","ETH Switch (RCS) ", "Recloser","ETH Switch (Recloser)", "BATT-1", "BATT-2", "other" ] }
};
window.AppConfig.otherSubdevices = {
    phrao: ["Office","Current Transformer","Voltage Transformer","Step-up Transformer 5 MVA",
            "Service Transformer 160 KVA","Disconnecting Switch","Fire Alarm","PQ Meter","Power Meter","The Other"],
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
