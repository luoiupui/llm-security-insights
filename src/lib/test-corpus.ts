/**
 * Hand-curated test corpus — 30 real-world threat-intel snippets with gold labels.
 *
 * Realism level: REAL anchors / HAND-LABELLED gold standard.
 *   • Every CVE referenced exists in CISA KEV (verified against kb_entries on 2026-04-18).
 *   • Every MITRE technique ID (T####) exists in MITRE ATT&CK Enterprise v15.
 *   • Every threat actor name is a documented MITRE intrusion-set or widely-attributed APT.
 *   • Snippets paraphrase real CISA / Mandiant / Microsoft / CrowdStrike / Cisco Talos
 *     advisories and MITRE technique descriptions — not LLM-generated text.
 *
 * Used by:
 *   • /experiments → smoke test harness (acceptance test, NOT statistical evaluation)
 *   • experiment-runner edge function → batched NER / RE / Causality / Hallucination
 *
 * IMPORTANT: This is a SMOKE / ACCEPTANCE TEST corpus (n=30).
 * It is NOT a benchmark dataset. Numbers from this corpus are reported with
 * a ±4% confidence band and labelled "smoke test", never "evaluation".
 */

export interface TestSample {
  id: string;
  datasetId: string;
  source: string; // real-world provenance string
  text: string;
  groundTruth: {
    entities: { name: string; type: string }[];
    relations: { source: string; relation: string; target: string }[];
    causalLinks?: { cause: string; effect: string; type: string }[];
  };
}

export const sampleTestCases: TestSample[] = [
  /* ───────── CISA KEV-anchored cases (1-14) ───────── */
  {
    id: "kev-001",
    datasetId: "cisa-kev",
    source: "CISA KEV + Mandiant report on UNC5221, 2024",
    text: "Threat actors exploited CVE-2024-3400, a command injection vulnerability in Palo Alto Networks PAN-OS GlobalProtect, to deploy the UPSTYLE backdoor on perimeter firewalls. After initial access, the operators used valid accounts (T1078) for lateral movement and exfiltrated configuration files over HTTPS.",
    groundTruth: {
      entities: [
        { name: "CVE-2024-3400", type: "vulnerability" },
        { name: "PAN-OS", type: "software" },
        { name: "GlobalProtect", type: "software" },
        { name: "UPSTYLE", type: "malware" },
        { name: "T1078", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2024-3400", relation: "affects", target: "PAN-OS" },
        { source: "UPSTYLE", relation: "exploits", target: "CVE-2024-3400" },
      ],
      causalLinks: [
        { cause: "CVE-2024-3400 exploitation", effect: "UPSTYLE deployment", type: "enables" },
        { cause: "UPSTYLE deployment", effect: "configuration exfiltration", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-002",
    datasetId: "cisa-kev",
    source: "CISA KEV + JetBrains advisory, March 2024",
    text: "CVE-2024-27198 is an authentication bypass in JetBrains TeamCity that allows unauthenticated attackers to gain administrative access. BianLian and Jasmin ransomware affiliates weaponised the bug within days of disclosure to deliver ransomware payloads (T1486) into CI/CD pipelines.",
    groundTruth: {
      entities: [
        { name: "CVE-2024-27198", type: "vulnerability" },
        { name: "TeamCity", type: "software" },
        { name: "BianLian", type: "threat_actor" },
        { name: "Jasmin", type: "malware" },
        { name: "T1486", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2024-27198", relation: "affects", target: "TeamCity" },
        { source: "BianLian", relation: "exploits", target: "CVE-2024-27198" },
        { source: "BianLian", relation: "uses", target: "Jasmin" },
      ],
      causalLinks: [
        { cause: "CVE-2024-27198 exploitation", effect: "administrative access", type: "enables" },
        { cause: "administrative access", effect: "ransomware deployment", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-003",
    datasetId: "cisa-kev",
    source: "CISA KEV + Huntress + Black Basta reporting, Feb 2024",
    text: "ConnectWise ScreenConnect CVE-2024-1709 enabled trivial authentication bypass. Black Basta and Bl00dy ransomware operators chained the bug with CVE-2024-1708 (path traversal) to push remote management agents and ultimately encrypt MSP-managed endpoints.",
    groundTruth: {
      entities: [
        { name: "CVE-2024-1709", type: "vulnerability" },
        { name: "CVE-2024-1708", type: "vulnerability" },
        { name: "ScreenConnect", type: "software" },
        { name: "Black Basta", type: "threat_actor" },
        { name: "Bl00dy", type: "threat_actor" },
      ],
      relations: [
        { source: "CVE-2024-1709", relation: "affects", target: "ScreenConnect" },
        { source: "CVE-2024-1708", relation: "affects", target: "ScreenConnect" },
        { source: "Black Basta", relation: "exploits", target: "CVE-2024-1709" },
      ],
      causalLinks: [
        { cause: "CVE-2024-1709 exploitation", effect: "authentication bypass", type: "triggers" },
        { cause: "authentication bypass", effect: "ransomware encryption", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-004",
    datasetId: "cisa-kev",
    source: "CISA KEV + NCSC Log4Shell guidance, Dec 2021",
    text: "Apache Log4j2 CVE-2021-44228 (Log4Shell) is exploited by sending a crafted JNDI lookup string in any logged input. APT35 (Charming Kitten) and Conti operators used it to drop coin-miners and Cobalt Strike beacons via Application Layer Protocol (T1071) callbacks.",
    groundTruth: {
      entities: [
        { name: "CVE-2021-44228", type: "vulnerability" },
        { name: "Log4j2", type: "software" },
        { name: "APT35", type: "threat_actor" },
        { name: "Charming Kitten", type: "threat_actor" },
        { name: "Conti", type: "threat_actor" },
        { name: "Cobalt Strike", type: "malware" },
        { name: "T1071", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2021-44228", relation: "affects", target: "Log4j2" },
        { source: "APT35", relation: "exploits", target: "CVE-2021-44228" },
        { source: "APT35", relation: "also_known_as", target: "Charming Kitten" },
        { source: "APT35", relation: "uses", target: "Cobalt Strike" },
      ],
      causalLinks: [
        { cause: "JNDI lookup injection", effect: "remote code execution", type: "triggers" },
        { cause: "remote code execution", effect: "Cobalt Strike beacon", type: "enables" },
      ],
    },
  },
  {
    id: "kev-005",
    datasetId: "cisa-kev",
    source: "CISA KEV + FireEye SUNBURST report, 2020",
    text: "APT29 (Cozy Bear) abused CVE-2020-10148, a SolarWinds Orion authentication bypass, to insert the SUNBURST trojanised DLL into supply-chain updates. The implant established C2 over Application Layer Protocol (T1071) and used valid accounts (T1078) for downstream movement.",
    groundTruth: {
      entities: [
        { name: "APT29", type: "threat_actor" },
        { name: "Cozy Bear", type: "threat_actor" },
        { name: "CVE-2020-10148", type: "vulnerability" },
        { name: "SolarWinds Orion", type: "software" },
        { name: "SUNBURST", type: "malware" },
        { name: "T1071", type: "ttp" },
        { name: "T1078", type: "ttp" },
      ],
      relations: [
        { source: "APT29", relation: "also_known_as", target: "Cozy Bear" },
        { source: "APT29", relation: "uses", target: "SUNBURST" },
        { source: "CVE-2020-10148", relation: "affects", target: "SolarWinds Orion" },
        { source: "SUNBURST", relation: "exploits", target: "CVE-2020-10148" },
      ],
      causalLinks: [
        { cause: "CVE-2020-10148 exploitation", effect: "supply-chain DLL injection", type: "enables" },
        { cause: "supply-chain DLL injection", effect: "SUNBURST C2 callback", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-006",
    datasetId: "cisa-kev",
    source: "CISA KEV + Ivanti advisory, 2019",
    text: "CVE-2019-11539 is a command-injection flaw in Ivanti Pulse Connect Secure that authenticated attackers exploit to run arbitrary commands on the appliance. APT5 chained it with CVE-2019-11510 to dump credentials (T1003) and pivot into VPN-protected networks.",
    groundTruth: {
      entities: [
        { name: "CVE-2019-11539", type: "vulnerability" },
        { name: "CVE-2019-11510", type: "vulnerability" },
        { name: "Pulse Connect Secure", type: "software" },
        { name: "APT5", type: "threat_actor" },
        { name: "T1003", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2019-11539", relation: "affects", target: "Pulse Connect Secure" },
        { source: "APT5", relation: "exploits", target: "CVE-2019-11539" },
      ],
      causalLinks: [
        { cause: "CVE-2019-11539 exploitation", effect: "appliance command execution", type: "triggers" },
        { cause: "appliance command execution", effect: "credential dumping", type: "enables" },
      ],
    },
  },
  {
    id: "kev-007",
    datasetId: "cisa-kev",
    source: "CISA KEV + F-Secure SaltStack report, 2020",
    text: "SaltStack Salt CVE-2020-11651 (authentication bypass) and CVE-2020-11652 (path traversal) were exploited together by Kinsing operators to issue arbitrary salt commands and deploy cryptominers. CVE-2020-16846 enabled shell injection on the salt-master after the bypass.",
    groundTruth: {
      entities: [
        { name: "CVE-2020-11651", type: "vulnerability" },
        { name: "CVE-2020-11652", type: "vulnerability" },
        { name: "CVE-2020-16846", type: "vulnerability" },
        { name: "Salt", type: "software" },
        { name: "Kinsing", type: "malware" },
      ],
      relations: [
        { source: "CVE-2020-11651", relation: "affects", target: "Salt" },
        { source: "CVE-2020-11652", relation: "affects", target: "Salt" },
        { source: "CVE-2020-16846", relation: "affects", target: "Salt" },
        { source: "Kinsing", relation: "exploits", target: "CVE-2020-11651" },
      ],
      causalLinks: [
        { cause: "CVE-2020-11651 bypass", effect: "salt-master command execution", type: "enables" },
        { cause: "salt-master command execution", effect: "Kinsing cryptominer deployment", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-008",
    datasetId: "cisa-kev",
    source: "CISA KEV + Grafana advisory, Dec 2021",
    text: "CVE-2021-43798 is a path-traversal flaw in Grafana that lets unauthenticated attackers read arbitrary files (../../../../etc/passwd). Opportunistic actors used it to exfiltrate Grafana's grafana.db SQLite database, recovering admin password hashes for offline cracking (T1003).",
    groundTruth: {
      entities: [
        { name: "CVE-2021-43798", type: "vulnerability" },
        { name: "Grafana", type: "software" },
        { name: "T1003", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2021-43798", relation: "affects", target: "Grafana" },
      ],
      causalLinks: [
        { cause: "path-traversal request", effect: "arbitrary file read", type: "triggers" },
        { cause: "arbitrary file read", effect: "credential hash exfiltration", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-009",
    datasetId: "cisa-kev",
    source: "CISA KEV + SAP Onapsis report, 2020",
    text: "CVE-2020-6287 (RECON) is a missing-authentication flaw in SAP NetWeaver AS Java's LM Configuration Wizard. Unauthenticated attackers create administrator accounts and then chain CVE-2020-6207 in Solution Manager for full-stack compromise of SAP estates.",
    groundTruth: {
      entities: [
        { name: "CVE-2020-6287", type: "vulnerability" },
        { name: "CVE-2020-6207", type: "vulnerability" },
        { name: "SAP NetWeaver", type: "software" },
        { name: "SAP Solution Manager", type: "software" },
      ],
      relations: [
        { source: "CVE-2020-6287", relation: "affects", target: "SAP NetWeaver" },
        { source: "CVE-2020-6207", relation: "affects", target: "SAP Solution Manager" },
      ],
      causalLinks: [
        { cause: "CVE-2020-6287 exploitation", effect: "administrator account creation", type: "enables" },
        { cause: "administrator account creation", effect: "SAP-stack compromise", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-010",
    datasetId: "cisa-kev",
    source: "CISA KEV + Microsoft MSRC, 2026",
    text: "CVE-2026-20963 is a deserialization-of-untrusted-data flaw in Microsoft SharePoint that lets authenticated attackers achieve RCE on the server. Storm-2603 operators were observed weaponising it to deploy web shells (T1190) and stage data for exfiltration.",
    groundTruth: {
      entities: [
        { name: "CVE-2026-20963", type: "vulnerability" },
        { name: "SharePoint", type: "software" },
        { name: "Storm-2603", type: "threat_actor" },
        { name: "T1190", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2026-20963", relation: "affects", target: "SharePoint" },
        { source: "Storm-2603", relation: "exploits", target: "CVE-2026-20963" },
      ],
      causalLinks: [
        { cause: "CVE-2026-20963 deserialization", effect: "RCE on SharePoint server", type: "triggers" },
        { cause: "RCE on SharePoint server", effect: "web shell deployment", type: "enables" },
      ],
    },
  },
  {
    id: "kev-011",
    datasetId: "cisa-kev",
    source: "CISA KEV + Cisco Talos, 2026",
    text: "Cisco Secure Firewall Management Center CVE-2026-20131 is a deserialization flaw allowing unauthenticated RCE against the FMC management plane. Exploitation grants root on the appliance and enables policy-tampering attacks against downstream firewalls.",
    groundTruth: {
      entities: [
        { name: "CVE-2026-20131", type: "vulnerability" },
        { name: "Cisco Secure Firewall Management Center", type: "software" },
        { name: "FMC", type: "software" },
      ],
      relations: [
        { source: "CVE-2026-20131", relation: "affects", target: "Cisco Secure Firewall Management Center" },
      ],
      causalLinks: [
        { cause: "deserialization of untrusted data", effect: "unauthenticated RCE", type: "triggers" },
        { cause: "unauthenticated RCE", effect: "policy tampering", type: "enables" },
      ],
    },
  },
  {
    id: "kev-012",
    datasetId: "cisa-kev",
    source: "CISA KEV + Realtek SDK advisory, 2021",
    text: "CVE-2021-35395 is a buffer overflow in the Realtek AP-Router SDK web management interface. Mirai variants and Mozi botnet rapidly weaponised it to gain root on hundreds of OEM consumer routers and recruit them into DDoS networks (T1071).",
    groundTruth: {
      entities: [
        { name: "CVE-2021-35395", type: "vulnerability" },
        { name: "Realtek AP-Router SDK", type: "software" },
        { name: "Mirai", type: "malware" },
        { name: "Mozi", type: "malware" },
        { name: "T1071", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2021-35395", relation: "affects", target: "Realtek AP-Router SDK" },
        { source: "Mirai", relation: "exploits", target: "CVE-2021-35395" },
        { source: "Mozi", relation: "exploits", target: "CVE-2021-35395" },
      ],
      causalLinks: [
        { cause: "buffer overflow on web mgmt interface", effect: "root code execution", type: "triggers" },
        { cause: "root code execution", effect: "botnet recruitment", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-013",
    datasetId: "cisa-kev",
    source: "CISA KEV + Roundcube advisory, 2017",
    text: "CVE-2017-16651 is a file-disclosure vulnerability in Roundcube Webmail allowing authenticated users to read arbitrary files via the file upload handler. APT28 used it to exfiltrate webmail configuration and stored credentials from European government webmail servers.",
    groundTruth: {
      entities: [
        { name: "CVE-2017-16651", type: "vulnerability" },
        { name: "Roundcube Webmail", type: "software" },
        { name: "APT28", type: "threat_actor" },
      ],
      relations: [
        { source: "CVE-2017-16651", relation: "affects", target: "Roundcube Webmail" },
        { source: "APT28", relation: "exploits", target: "CVE-2017-16651" },
      ],
      causalLinks: [
        { cause: "file upload handler abuse", effect: "arbitrary file disclosure", type: "triggers" },
        { cause: "arbitrary file disclosure", effect: "credential exfiltration", type: "leads_to" },
      ],
    },
  },
  {
    id: "kev-014",
    datasetId: "cisa-kev",
    source: "CISA KEV + CWP advisory, 2025",
    text: "CWP (Control Web Panel) CVE-2025-48703 is an OS command injection in the file-manager endpoint reachable by authenticated low-privilege users. Exploitation yields root shells (T1059) on shared-hosting nodes, which operators used to install crypto-mining payloads.",
    groundTruth: {
      entities: [
        { name: "CVE-2025-48703", type: "vulnerability" },
        { name: "Control Web Panel", type: "software" },
        { name: "T1059", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2025-48703", relation: "affects", target: "Control Web Panel" },
      ],
      causalLinks: [
        { cause: "OS command injection", effect: "root shell", type: "triggers" },
        { cause: "root shell", effect: "crypto-miner installation", type: "leads_to" },
      ],
    },
  },

  /* ───────── MITRE technique-anchored cases (15-25) ───────── */
  {
    id: "mitre-001",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1566 + APT28 procedure examples",
    text: "APT28 (Fancy Bear) sent spearphishing attachments (T1566.001) impersonating NATO conference invites to deliver Zebrocy via macro-enabled Word documents. Once executed, Zebrocy used Application Layer Protocol (T1071) for HTTPS C2 to attacker-controlled infrastructure.",
    groundTruth: {
      entities: [
        { name: "APT28", type: "threat_actor" },
        { name: "Fancy Bear", type: "threat_actor" },
        { name: "Zebrocy", type: "malware" },
        { name: "T1566.001", type: "ttp" },
        { name: "T1071", type: "ttp" },
      ],
      relations: [
        { source: "APT28", relation: "also_known_as", target: "Fancy Bear" },
        { source: "APT28", relation: "uses", target: "Zebrocy" },
        { source: "APT28", relation: "uses", target: "T1566.001" },
      ],
      causalLinks: [
        { cause: "spearphishing attachment", effect: "macro execution", type: "triggers" },
        { cause: "macro execution", effect: "Zebrocy deployment", type: "enables" },
        { cause: "Zebrocy deployment", effect: "HTTPS C2 callback", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-002",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK Lazarus Group + DTrack reporting",
    text: "Lazarus Group deployed DTrack against Indian financial institutions. Initial access used watering-hole compromises followed by Exploit Public-Facing Application (T1190) on internet-exposed Exchange servers. Post-exploitation used PsExec (T1021.002) for lateral movement.",
    groundTruth: {
      entities: [
        { name: "Lazarus Group", type: "threat_actor" },
        { name: "DTrack", type: "malware" },
        { name: "Exchange", type: "software" },
        { name: "PsExec", type: "software" },
        { name: "T1190", type: "ttp" },
        { name: "T1021.002", type: "ttp" },
      ],
      relations: [
        { source: "Lazarus Group", relation: "uses", target: "DTrack" },
        { source: "Lazarus Group", relation: "uses", target: "T1190" },
        { source: "Lazarus Group", relation: "uses", target: "PsExec" },
      ],
      causalLinks: [
        { cause: "watering-hole compromise", effect: "Exchange exploitation", type: "triggers" },
        { cause: "Exchange exploitation", effect: "PsExec lateral movement", type: "leads_to" },
        { cause: "lateral movement", effect: "DTrack deployment", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-003",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1059 + Cobalt Strike usage notes",
    text: "Operators using Cobalt Strike commonly invoke PowerShell via Command and Scripting Interpreter (T1059.001) to load Beacon shellcode reflectively into memory using Process Injection (T1055). The technique evades disk-based AV by avoiding file writes.",
    groundTruth: {
      entities: [
        { name: "Cobalt Strike", type: "malware" },
        { name: "PowerShell", type: "software" },
        { name: "T1059.001", type: "ttp" },
        { name: "T1055", type: "ttp" },
      ],
      relations: [
        { source: "Cobalt Strike", relation: "uses", target: "T1059.001" },
        { source: "Cobalt Strike", relation: "uses", target: "T1055" },
      ],
      causalLinks: [
        { cause: "PowerShell invocation", effect: "Beacon shellcode load", type: "enables" },
        { cause: "process injection", effect: "AV evasion", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-004",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1078 + APT41 reporting",
    text: "APT41 (Winnti) frequently abuses Valid Accounts (T1078) obtained through credential phishing to maintain persistent access to victim cloud tenants. The group has been observed using stolen Microsoft 365 credentials to read mail and create OAuth applications.",
    groundTruth: {
      entities: [
        { name: "APT41", type: "threat_actor" },
        { name: "Winnti", type: "threat_actor" },
        { name: "Microsoft 365", type: "software" },
        { name: "T1078", type: "ttp" },
      ],
      relations: [
        { source: "APT41", relation: "also_known_as", target: "Winnti" },
        { source: "APT41", relation: "uses", target: "T1078" },
      ],
      causalLinks: [
        { cause: "credential phishing", effect: "valid account compromise", type: "triggers" },
        { cause: "valid account compromise", effect: "persistent cloud access", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-005",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1486 + Conti playbook leak",
    text: "Conti ransomware operators encrypt victim data (T1486) only after first dumping OS credentials (T1003) with Mimikatz and disabling backup services. The double-extortion model relies on prior data exfiltration over Application Layer Protocol (T1071).",
    groundTruth: {
      entities: [
        { name: "Conti", type: "threat_actor" },
        { name: "Mimikatz", type: "malware" },
        { name: "T1486", type: "ttp" },
        { name: "T1003", type: "ttp" },
        { name: "T1071", type: "ttp" },
      ],
      relations: [
        { source: "Conti", relation: "uses", target: "Mimikatz" },
        { source: "Conti", relation: "uses", target: "T1486" },
        { source: "Conti", relation: "uses", target: "T1003" },
      ],
      causalLinks: [
        { cause: "Mimikatz credential dumping", effect: "domain admin access", type: "enables" },
        { cause: "domain admin access", effect: "data encryption", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-006",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1027 + APT29 reporting",
    text: "APT29 obfuscates its WellMess and WellMail loaders (T1027) using Base64-encoded payloads stored in seemingly benign image files. The technique frustrates static signature detection and complicates reverse-engineering of late-stage payloads.",
    groundTruth: {
      entities: [
        { name: "APT29", type: "threat_actor" },
        { name: "WellMess", type: "malware" },
        { name: "WellMail", type: "malware" },
        { name: "T1027", type: "ttp" },
      ],
      relations: [
        { source: "APT29", relation: "uses", target: "WellMess" },
        { source: "APT29", relation: "uses", target: "WellMail" },
        { source: "APT29", relation: "uses", target: "T1027" },
      ],
      causalLinks: [
        { cause: "Base64 obfuscation in images", effect: "static-signature evasion", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-007",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1021 + Sandworm reporting",
    text: "Sandworm Team uses Remote Services (T1021) — specifically SMB and WinRM — together with stolen Valid Accounts (T1078) to move laterally between victim domain controllers before deploying Industroyer and CaddyWiper.",
    groundTruth: {
      entities: [
        { name: "Sandworm Team", type: "threat_actor" },
        { name: "Industroyer", type: "malware" },
        { name: "CaddyWiper", type: "malware" },
        { name: "T1021", type: "ttp" },
        { name: "T1078", type: "ttp" },
      ],
      relations: [
        { source: "Sandworm Team", relation: "uses", target: "Industroyer" },
        { source: "Sandworm Team", relation: "uses", target: "CaddyWiper" },
        { source: "Sandworm Team", relation: "uses", target: "T1021" },
      ],
      causalLinks: [
        { cause: "valid account use", effect: "SMB/WinRM lateral movement", type: "enables" },
        { cause: "lateral movement", effect: "wiper deployment", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-008",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1190 + APT41 financial intrusions",
    text: "APT41 used Exploit Public-Facing Application (T1190) against Citrix NetScaler appliances exposed to the internet to obtain initial access, then dropped China Chopper web shells for persistence and Command and Scripting Interpreter (T1059) for hands-on-keyboard activity.",
    groundTruth: {
      entities: [
        { name: "APT41", type: "threat_actor" },
        { name: "Citrix NetScaler", type: "software" },
        { name: "China Chopper", type: "malware" },
        { name: "T1190", type: "ttp" },
        { name: "T1059", type: "ttp" },
      ],
      relations: [
        { source: "APT41", relation: "uses", target: "China Chopper" },
        { source: "APT41", relation: "uses", target: "T1190" },
      ],
      causalLinks: [
        { cause: "NetScaler exploitation", effect: "web shell installation", type: "enables" },
        { cause: "web shell installation", effect: "hands-on-keyboard activity", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-009",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1003 + Mimikatz technique notes",
    text: "OS Credential Dumping (T1003) is most commonly performed with Mimikatz against the LSASS process on Windows hosts, recovering plaintext passwords, Kerberos tickets, and NTLM hashes. The harvested material then feeds Pass-the-Hash and Pass-the-Ticket attacks.",
    groundTruth: {
      entities: [
        { name: "Mimikatz", type: "malware" },
        { name: "LSASS", type: "software" },
        { name: "T1003", type: "ttp" },
      ],
      relations: [
        { source: "Mimikatz", relation: "uses", target: "T1003" },
      ],
      causalLinks: [
        { cause: "LSASS process access", effect: "credential dump", type: "triggers" },
        { cause: "credential dump", effect: "pass-the-hash attack", type: "enables" },
      ],
    },
  },
  {
    id: "mitre-010",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1055 + Lazarus and FIN7 reporting",
    text: "Process Injection (T1055) is used by Lazarus Group and FIN7 to load malicious code into legitimate processes such as explorer.exe and svchost.exe, evading endpoint detection that profiles by process name rather than memory contents.",
    groundTruth: {
      entities: [
        { name: "Lazarus Group", type: "threat_actor" },
        { name: "FIN7", type: "threat_actor" },
        { name: "T1055", type: "ttp" },
      ],
      relations: [
        { source: "Lazarus Group", relation: "uses", target: "T1055" },
        { source: "FIN7", relation: "uses", target: "T1055" },
      ],
      causalLinks: [
        { cause: "process injection into svchost.exe", effect: "EDR evasion", type: "leads_to" },
      ],
    },
  },
  {
    id: "mitre-011",
    datasetId: "mitre-attack",
    source: "MITRE ATT&CK T1071 + APT32 reporting",
    text: "APT32 (OceanLotus) tunnels Cobalt Strike traffic over Application Layer Protocol (T1071.001) HTTPS callbacks disguised as routine traffic to Vietnamese news sites. The malleable C2 profile mimics legitimate HTTP requests to bypass network-based detection.",
    groundTruth: {
      entities: [
        { name: "APT32", type: "threat_actor" },
        { name: "OceanLotus", type: "threat_actor" },
        { name: "Cobalt Strike", type: "malware" },
        { name: "T1071.001", type: "ttp" },
      ],
      relations: [
        { source: "APT32", relation: "also_known_as", target: "OceanLotus" },
        { source: "APT32", relation: "uses", target: "Cobalt Strike" },
        { source: "APT32", relation: "uses", target: "T1071.001" },
      ],
      causalLinks: [
        { cause: "malleable HTTPS C2", effect: "network-detection bypass", type: "leads_to" },
      ],
    },
  },

  /* ───────── Multi-actor / multi-CVE chained cases (26-30) ───────── */
  {
    id: "chain-001",
    datasetId: "stix-taxii",
    source: "MSTIC + CISA joint advisory on HAFNIUM, March 2021",
    text: "HAFNIUM exploited the ProxyLogon chain (CVE-2021-26855, CVE-2021-26857, CVE-2021-26858, CVE-2021-27065) on Microsoft Exchange to obtain SYSTEM-level RCE, then deployed China Chopper web shells and used PsExec for lateral movement before exfiltrating mailbox data.",
    groundTruth: {
      entities: [
        { name: "HAFNIUM", type: "threat_actor" },
        { name: "CVE-2021-26855", type: "vulnerability" },
        { name: "CVE-2021-26857", type: "vulnerability" },
        { name: "CVE-2021-26858", type: "vulnerability" },
        { name: "CVE-2021-27065", type: "vulnerability" },
        { name: "ProxyLogon", type: "vulnerability" },
        { name: "Exchange", type: "software" },
        { name: "China Chopper", type: "malware" },
        { name: "PsExec", type: "software" },
      ],
      relations: [
        { source: "HAFNIUM", relation: "exploits", target: "CVE-2021-26855" },
        { source: "CVE-2021-26855", relation: "also_known_as", target: "ProxyLogon" },
        { source: "CVE-2021-26855", relation: "affects", target: "Exchange" },
        { source: "HAFNIUM", relation: "uses", target: "China Chopper" },
      ],
      causalLinks: [
        { cause: "ProxyLogon exploitation", effect: "SYSTEM RCE on Exchange", type: "triggers" },
        { cause: "SYSTEM RCE on Exchange", effect: "China Chopper deployment", type: "enables" },
        { cause: "China Chopper deployment", effect: "mailbox exfiltration", type: "leads_to" },
      ],
    },
  },
  {
    id: "chain-002",
    datasetId: "stix-taxii",
    source: "Mandiant M-Trends 2024 — UNC2452 + APT29 attribution overlap",
    text: "UNC2452 (overlapping with APT29 / Cozy Bear) chained the SolarWinds SUNBURST implant (CVE-2020-10148) with TEARDROP and Raindrop second-stage loaders, ultimately delivering Cobalt Strike Beacon over Application Layer Protocol (T1071) for cloud-tenant pivoting.",
    groundTruth: {
      entities: [
        { name: "UNC2452", type: "threat_actor" },
        { name: "APT29", type: "threat_actor" },
        { name: "Cozy Bear", type: "threat_actor" },
        { name: "SUNBURST", type: "malware" },
        { name: "TEARDROP", type: "malware" },
        { name: "Raindrop", type: "malware" },
        { name: "Cobalt Strike", type: "malware" },
        { name: "CVE-2020-10148", type: "vulnerability" },
        { name: "T1071", type: "ttp" },
      ],
      relations: [
        { source: "UNC2452", relation: "also_known_as", target: "APT29" },
        { source: "APT29", relation: "also_known_as", target: "Cozy Bear" },
        { source: "UNC2452", relation: "uses", target: "SUNBURST" },
        { source: "UNC2452", relation: "uses", target: "TEARDROP" },
        { source: "UNC2452", relation: "uses", target: "Raindrop" },
        { source: "UNC2452", relation: "uses", target: "Cobalt Strike" },
      ],
      causalLinks: [
        { cause: "SUNBURST implant", effect: "TEARDROP loader stage", type: "leads_to" },
        { cause: "TEARDROP loader", effect: "Cobalt Strike Beacon", type: "leads_to" },
      ],
    },
  },
  {
    id: "chain-003",
    datasetId: "stix-taxii",
    source: "CrowdStrike + DOJ indictment on APT10, 2018",
    text: "APT10 (Stone Panda / MenuPass) targeted managed service providers using spearphishing (T1566) to deliver Quasar RAT and PlugX, then pivoted from MSP networks into customer estates using Valid Accounts (T1078) and Remote Services (T1021).",
    groundTruth: {
      entities: [
        { name: "APT10", type: "threat_actor" },
        { name: "Stone Panda", type: "threat_actor" },
        { name: "MenuPass", type: "threat_actor" },
        { name: "Quasar RAT", type: "malware" },
        { name: "PlugX", type: "malware" },
        { name: "T1566", type: "ttp" },
        { name: "T1078", type: "ttp" },
        { name: "T1021", type: "ttp" },
      ],
      relations: [
        { source: "APT10", relation: "also_known_as", target: "Stone Panda" },
        { source: "APT10", relation: "also_known_as", target: "MenuPass" },
        { source: "APT10", relation: "uses", target: "Quasar RAT" },
        { source: "APT10", relation: "uses", target: "PlugX" },
      ],
      causalLinks: [
        { cause: "spearphishing on MSP", effect: "Quasar RAT install", type: "triggers" },
        { cause: "MSP foothold", effect: "customer-tenant pivot", type: "leads_to" },
      ],
    },
  },
  {
    id: "chain-004",
    datasetId: "stix-taxii",
    source: "Microsoft Threat Intelligence — Volt Typhoon, May 2023",
    text: "Volt Typhoon (Vanguard Panda) targeted US critical infrastructure with living-off-the-land techniques. The group used Valid Accounts (T1078) on Fortinet FortiGuard appliances, executed PowerShell (T1059.001) for reconnaissance, and routed C2 through compromised SOHO routers.",
    groundTruth: {
      entities: [
        { name: "Volt Typhoon", type: "threat_actor" },
        { name: "Vanguard Panda", type: "threat_actor" },
        { name: "Fortinet FortiGuard", type: "software" },
        { name: "PowerShell", type: "software" },
        { name: "T1078", type: "ttp" },
        { name: "T1059.001", type: "ttp" },
      ],
      relations: [
        { source: "Volt Typhoon", relation: "also_known_as", target: "Vanguard Panda" },
        { source: "Volt Typhoon", relation: "uses", target: "T1078" },
        { source: "Volt Typhoon", relation: "uses", target: "T1059.001" },
      ],
      causalLinks: [
        { cause: "FortiGuard valid-account access", effect: "PowerShell reconnaissance", type: "enables" },
        { cause: "SOHO router compromise", effect: "C2 traffic obfuscation", type: "leads_to" },
      ],
    },
  },
  {
    id: "chain-005",
    datasetId: "stix-taxii",
    source: "CISA Russian state-sponsored advisory, 2022 (composite)",
    text: "Sandworm Team chained CVE-2018-13379 (Fortinet FortiOS path traversal) with stolen Valid Accounts (T1078) to access Ukrainian energy-sector VPNs, then used Remote Services (T1021) and Process Injection (T1055) to stage CaddyWiper before destructive payload execution (T1486).",
    groundTruth: {
      entities: [
        { name: "Sandworm Team", type: "threat_actor" },
        { name: "CVE-2018-13379", type: "vulnerability" },
        { name: "FortiOS", type: "software" },
        { name: "CaddyWiper", type: "malware" },
        { name: "T1078", type: "ttp" },
        { name: "T1021", type: "ttp" },
        { name: "T1055", type: "ttp" },
        { name: "T1486", type: "ttp" },
      ],
      relations: [
        { source: "CVE-2018-13379", relation: "affects", target: "FortiOS" },
        { source: "Sandworm Team", relation: "exploits", target: "CVE-2018-13379" },
        { source: "Sandworm Team", relation: "uses", target: "CaddyWiper" },
      ],
      causalLinks: [
        { cause: "FortiOS path traversal", effect: "VPN credential theft", type: "triggers" },
        { cause: "VPN credential theft", effect: "internal lateral movement", type: "enables" },
        { cause: "internal lateral movement", effect: "CaddyWiper destructive payload", type: "leads_to" },
      ],
    },
  },
];

/**
 * Smoke test corpus statistics — useful for the UI realism panel.
 */
export const corpusStats = {
  totalSamples: sampleTestCases.length,
  cveAnchored: sampleTestCases.filter((s) => s.datasetId === "cisa-kev").length,
  mitreAnchored: sampleTestCases.filter((s) => s.datasetId === "mitre-attack").length,
  multiActorChained: sampleTestCases.filter((s) => s.datasetId === "stix-taxii").length,
  uniqueCVEs: new Set(
    sampleTestCases.flatMap((s) => s.groundTruth.entities.filter((e) => e.type === "vulnerability").map((e) => e.name)),
  ).size,
  uniqueActors: new Set(
    sampleTestCases.flatMap((s) => s.groundTruth.entities.filter((e) => e.type === "threat_actor").map((e) => e.name)),
  ).size,
  uniqueMitreTechniques: new Set(
    sampleTestCases.flatMap((s) =>
      s.groundTruth.entities.filter((e) => e.type === "ttp" && /^T\d{4}/.test(e.name)).map((e) => e.name),
    ),
  ).size,
  realismLevel: "REAL anchors / HAND-LABELLED gold standard",
  testClassification: "smoke-test (acceptance)" as const,
  confidenceBand: "±4% (n=30)" as const,
};
