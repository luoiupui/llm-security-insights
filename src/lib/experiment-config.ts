/**
 * Experiment Configuration & Dataset Definitions
 * Two-stage experiment design:
 *   Stage 1: MITRE ATT&CK + CAPEC (core CTI ontology)
 *   Stage 2: + NVD/CVE + STIX/TAXII feeds (scale & diversity)
 * Baselines: BERT-NER, Rule-Based Extraction
 */

/* ── Dataset Definitions ── */

export interface DatasetConfig {
  id: string;
  name: string;
  source: string;
  description: string;
  entityTypes: string[];
  sampleCount: number;
  stage: 1 | 2;
}

export const datasets: DatasetConfig[] = [
  {
    id: "mitre-attack",
    name: "MITRE ATT&CK v15",
    source: "https://attack.mitre.org",
    description: "Enterprise techniques, groups, software — 14 tactics, 201 techniques, 143 groups",
    entityTypes: ["threat_actor", "malware", "ttp", "software", "campaign"],
    sampleCount: 580,
    stage: 1,
  },
  {
    id: "mitre-capec",
    name: "MITRE CAPEC v3.9",
    source: "https://capec.mitre.org",
    description: "Attack patterns catalog — 559 patterns with prerequisite chains and consequences",
    entityTypes: ["ttp", "vulnerability", "software"],
    sampleCount: 420,
    stage: 1,
  },
  {
    id: "nvd-cve",
    name: "NVD/CVE 2023-2024",
    source: "https://nvd.nist.gov",
    description: "Recent CVEs with CVSS scores, affected products, and CWE mappings",
    entityTypes: ["vulnerability", "software", "infrastructure"],
    sampleCount: 1200,
    stage: 2,
  },
  {
    id: "stix-taxii",
    name: "STIX/TAXII Feeds (CIRCL + OTX)",
    source: "https://www.circl.lu/doc/misp-taxii/",
    description: "Real-world structured threat reports with IOCs, TTPs, and actor profiles",
    entityTypes: ["threat_actor", "malware", "indicator", "campaign", "infrastructure"],
    sampleCount: 850,
    stage: 2,
  },
];

/* ── Baseline Definitions ── */

export interface BaselineConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  method: string;
  color: string;
}

export const baselines: BaselineConfig[] = [
  {
    id: "llm-zeroshot",
    name: "LLM Zero-Shot (vanilla Gemini, no CoT)",
    shortName: "LLM Zero-Shot",
    description: "Same Gemini backbone as ours but with a vanilla 1-shot prompt — isolates the value of graph-native CoT vs plain LLM prompting (replaces the prior simulated BERT baseline)",
    method: "google/gemini-3-flash-preview · single-step JSON extraction prompt · no STIX constraint, no CoT, no graph reasoning",
    color: "hsl(200, 80%, 55%)",
  },
  {
    id: "rule-based",
    name: "Rule-Based Extraction (real, deterministic)",
    shortName: "Rule-Based",
    description: "Real regex + dictionary extractor (CVEs, MITRE IDs, hashes, IPs, known APT/malware/software names + co-occurrence relations). No randomness — replaces the prior simulated baseline.",
    method: "Pattern matching + curated dictionaries; relations inferred via 120-char co-occurrence window",
    color: "hsl(38, 92%, 50%)",
  },
];

export const ourSystem: BaselineConfig = {
  id: "ours",
  name: "LLM+KG (Graph-Native)",
  shortName: "Ours",
  description: "Graph-native LLM with 8-step CoT, STIX ontology, and causal inference",
  method: "Gemini backbone with in-reasoning KG construction, conflict detection, and attribution",
  color: "hsl(160, 70%, 45%)",
};

/* ── Experiment Definitions ── */

export interface ExperimentTask {
  id: string;
  name: string;
  description: string;
  metrics: string[];
  chapter: string;
}

export const experimentTasks: ExperimentTask[] = [
  {
    id: "ner",
    name: "Named Entity Recognition",
    description: "Extract threat actors, malware, CVEs, TTPs from unstructured text",
    metrics: ["precision", "recall", "f1"],
    chapter: "Ch. 5.4.1",
  },
  {
    id: "re",
    name: "Relation Extraction",
    description: "Identify relationships between entities (uses, exploits, targets, attributed_to)",
    metrics: ["precision", "recall", "f1"],
    chapter: "Ch. 5.4.1",
  },
  {
    id: "causality",
    name: "Causality Detection",
    description: "Extract causal chains (enables → leads_to → triggers) with temporal ordering",
    metrics: ["precision", "recall", "f1", "temporal_accuracy"],
    chapter: "Ch. 5.4.2",
  },
  {
    id: "attribution",
    name: "Threat Attribution",
    description: "Attribute attacks to threat actors using graph-based evidence chains",
    metrics: ["accuracy", "top3_accuracy", "evidence_quality"],
    chapter: "Ch. 5.4.3",
  },
  {
    id: "hallucination",
    name: "Hallucination Control",
    description: "Measure false entity/relation generation rate and confidence calibration",
    metrics: ["false_entity_rate", "false_relation_rate", "confidence_calibration"],
    chapter: "Ch. 5.5",
  },
];

/* ── Sample Test Cases (MITRE ATT&CK) ── */

export interface TestSample {
  id: string;
  datasetId: string;
  text: string;
  groundTruth: {
    entities: { name: string; type: string }[];
    relations: { source: string; relation: string; target: string }[];
    causalLinks?: { cause: string; effect: string; type: string }[];
  };
}

export const sampleTestCases: TestSample[] = [
  {
    id: "attack-001",
    datasetId: "mitre-attack",
    text: "APT28 (Fancy Bear) used X-Agent malware with keylogging capabilities to exfiltrate credentials from government networks. The attack leveraged CVE-2017-0199 in Microsoft Office to deliver the initial payload via spearphishing attachments.",
    groundTruth: {
      entities: [
        { name: "APT28", type: "threat_actor" },
        { name: "Fancy Bear", type: "threat_actor" },
        { name: "X-Agent", type: "malware" },
        { name: "CVE-2017-0199", type: "vulnerability" },
        { name: "Microsoft Office", type: "software" },
      ],
      relations: [
        { source: "APT28", relation: "uses", target: "X-Agent" },
        { source: "APT28", relation: "also_known_as", target: "Fancy Bear" },
        { source: "X-Agent", relation: "exploits", target: "CVE-2017-0199" },
        { source: "CVE-2017-0199", relation: "affects", target: "Microsoft Office" },
      ],
      causalLinks: [
        { cause: "spearphishing attachment", effect: "CVE-2017-0199 exploitation", type: "triggers" },
        { cause: "CVE-2017-0199 exploitation", effect: "X-Agent deployment", type: "enables" },
        { cause: "X-Agent deployment", effect: "credential exfiltration", type: "leads_to" },
      ],
    },
  },
  {
    id: "attack-002",
    datasetId: "mitre-attack",
    text: "Lazarus Group deployed DTrack backdoor targeting Indian financial institutions. The attack chain started with watering hole compromises using CVE-2021-26855 (ProxyLogon) to gain initial access to Exchange servers, followed by lateral movement using PsExec.",
    groundTruth: {
      entities: [
        { name: "Lazarus Group", type: "threat_actor" },
        { name: "DTrack", type: "malware" },
        { name: "CVE-2021-26855", type: "vulnerability" },
        { name: "ProxyLogon", type: "vulnerability" },
        { name: "PsExec", type: "software" },
        { name: "Exchange", type: "software" },
      ],
      relations: [
        { source: "Lazarus Group", relation: "uses", target: "DTrack" },
        { source: "Lazarus Group", relation: "exploits", target: "CVE-2021-26855" },
        { source: "CVE-2021-26855", relation: "also_known_as", target: "ProxyLogon" },
        { source: "CVE-2021-26855", relation: "affects", target: "Exchange" },
      ],
      causalLinks: [
        { cause: "watering hole compromise", effect: "ProxyLogon exploitation", type: "triggers" },
        { cause: "ProxyLogon exploitation", effect: "Exchange server access", type: "enables" },
        { cause: "Exchange server access", effect: "lateral movement via PsExec", type: "leads_to" },
        { cause: "lateral movement", effect: "DTrack deployment", type: "leads_to" },
      ],
    },
  },
  {
    id: "capec-001",
    datasetId: "mitre-capec",
    text: "The attacker performed SQL injection (CAPEC-66) against the web application's login form to bypass authentication. After gaining access, they escalated privileges through improper authorization checks (CAPEC-122) and installed a web shell for persistent access.",
    groundTruth: {
      entities: [
        { name: "SQL Injection", type: "ttp" },
        { name: "CAPEC-66", type: "ttp" },
        { name: "CAPEC-122", type: "ttp" },
        { name: "web shell", type: "malware" },
      ],
      relations: [
        { source: "SQL Injection", relation: "mapped_to", target: "CAPEC-66" },
        { source: "CAPEC-66", relation: "precedes", target: "CAPEC-122" },
      ],
      causalLinks: [
        { cause: "SQL injection on login form", effect: "authentication bypass", type: "enables" },
        { cause: "authentication bypass", effect: "privilege escalation", type: "leads_to" },
        { cause: "privilege escalation", effect: "web shell installation", type: "enables" },
      ],
    },
  },
];

/* ── Experiment Result Types ── */

export interface MetricResult {
  precision: number;
  recall: number;
  f1: number;
  support?: number;
}

export interface ExperimentResult {
  taskId: string;
  datasetId: string;
  systemId: string;
  metrics: Record<string, number>;
  runTime: number;
  timestamp: string;
  sampleResults?: {
    sampleId: string;
    predicted: unknown;
    groundTruth: unknown;
    correct: boolean;
  }[];
}

export interface StageResult {
  stage: 1 | 2;
  datasets: string[];
  results: ExperimentResult[];
  summary: {
    systemId: string;
    avgF1: number;
    avgPrecision: number;
    avgRecall: number;
  }[];
}

/* ── Simulated Baseline Results ── */

// Reference baselines (replaced by Live Run for real numbers).
// These are placeholder summaries; the Live Run tab now produces real measured F1.
export function getStage1Results(): StageResult {
  return {
    stage: 1,
    datasets: ["mitre-attack", "mitre-capec"],
    results: [],
    summary: [
      { systemId: "ours", avgF1: 93.0, avgPrecision: 94.2, avgRecall: 91.8 },
      { systemId: "llm-zeroshot", avgF1: 82.4, avgPrecision: 84.1, avgRecall: 80.7 },
      { systemId: "rule-based", avgF1: 71.5, avgPrecision: 88.2, avgRecall: 60.1 },
    ],
  };
}

export function getStage2Results(): StageResult {
  return {
    stage: 2,
    datasets: ["mitre-attack", "mitre-capec", "nvd-cve", "stix-taxii"],
    results: [],
    summary: [
      { systemId: "ours", avgF1: 91.4, avgPrecision: 92.8, avgRecall: 90.1 },
      { systemId: "llm-zeroshot", avgF1: 76.8, avgPrecision: 78.5, avgRecall: 75.2 },
      { systemId: "rule-based", avgF1: 58.9, avgPrecision: 82.1, avgRecall: 45.8 },
    ],
  };
}
