/**
 * KG-Bench corpus — gold-annotated mini-cases.
 * Triples are (source_entity, relation, target_entity). Matching is case- and
 * punctuation-insensitive; partial / superset extractions are still scored.
 */

import type { Triple } from "./scorers";
import type { Domain } from "@/contexts/DomainContext";

/**
 * Gold-corpus version. Bumped whenever cases are added/removed or scoring
 * rubric changes — per the cardinal rule in `pipeline-stage-contracts`.
 *
 *   v1 — initial 7-category corpus (CTI + Clinical multilingual).
 *   v2 — Phase 3 bump: adds `fusion_corroboration` category and the
 *        CorroboratedFinding-aware cases (CTI + Clinical).
 */
export const GOLD_VERSION = "v2" as const;

export type TaskCategory =
  | "fact_extraction"
  | "ontology_conformance"
  | "serialization"
  | "qa"
  | "repair"
  | "hallucination"
  | "multilingual"
  | "fusion_corroboration";

/**
 * A gold corroboration pair: the case asserts that a TTP described in the
 * narrative text should be paired (via a `corroborates` edge) with an
 * internal flow signature whose stable id is `flow_ref`. Until the fusion
 * job lands, the pipeline will not emit these pairs and the case will
 * score 0 — this is the intended baseline, ready to climb once the
 * matcher exists.
 */
export interface CorroborationPair {
  ttp: string;
  flow_ref: string;
  expected_conf_narrative_min?: number; // optional sanity bound
}

export interface BenchCase {
  id: string;
  category: TaskCategory;
  name: string;
  text: string;
  goldEntities: string[];
  goldTriples: Triple[];
  language?: "en" | "ja" | "zh";
  /** Present only on `fusion_corroboration` cases. */
  goldCorroborations?: CorroborationPair[];
}

/* ── CTI corpus ── */
export const ctiCases: BenchCase[] = [
  {
    id: "cti-fx-1",
    category: "fact_extraction",
    name: "SUNBURST supply-chain",
    text: "APT-29 trojanized SolarWinds Orion updates. The SUNBURST backdoor exploited CVE-2020-10148 and communicated with avsvmcloud[.]com.",
    goldEntities: ["APT-29", "SolarWinds Orion", "SUNBURST", "CVE-2020-10148", "avsvmcloud.com"],
    goldTriples: [
      { s: "APT-29", p: "uses", o: "SUNBURST" },
      { s: "SUNBURST", p: "exploits", o: "CVE-2020-10148" },
      { s: "SUNBURST", p: "communicates-with", o: "avsvmcloud.com" },
    ],
  },
  {
    id: "cti-fx-2",
    category: "fact_extraction",
    name: "Conti ransomware",
    text: "Conti ransomware operators used Cobalt Strike (T1059.001) after initial access via TrickBot, targeting healthcare providers.",
    goldEntities: ["Conti", "Cobalt Strike", "TrickBot", "T1059.001"],
    goldTriples: [
      { s: "Conti", p: "uses", o: "Cobalt Strike" },
      { s: "Conti", p: "uses", o: "TrickBot" },
      { s: "Conti", p: "targets", o: "healthcare" },
    ],
  },
  {
    id: "cti-on-1",
    category: "ontology_conformance",
    name: "STIX type adherence",
    text: "Lazarus Group deployed WannaCry exploiting CVE-2017-0144 on Windows hosts via the EternalBlue exploit.",
    goldEntities: ["Lazarus Group", "WannaCry", "CVE-2017-0144", "EternalBlue", "Windows"],
    goldTriples: [],
  },
  {
    id: "cti-qa-1",
    category: "qa",
    name: "Attribution Q&A",
    text: "FIN7 used Carbanak malware to target US restaurants via spear-phishing campaigns documented in 2017.",
    goldEntities: ["FIN7", "Carbanak"],
    goldTriples: [
      { s: "FIN7", p: "uses", o: "Carbanak" },
      { s: "FIN7", p: "targets", o: "restaurants" },
    ],
  },
  {
    id: "cti-rp-1",
    category: "repair",
    name: "Malformed CVE rejection",
    text: "An attacker exploited CVE-INVALID-XX and MITRE T9999.999 (both fabricated) alongside real CVE-2021-44228 (Log4Shell).",
    goldEntities: ["CVE-2021-44228", "Log4Shell"],
    goldTriples: [{ s: "Log4Shell", p: "related-to", o: "CVE-2021-44228" }],
  },
  {
    id: "cti-hl-1",
    category: "hallucination",
    name: "No-fact paragraph",
    text: "The conference dinner featured a discussion about cybersecurity trends and the importance of public-private partnerships.",
    goldEntities: [],
    goldTriples: [],
  },
];

/* ── Clinical corpus (synthetic, de-identified, multilingual) ── */
export const clinicalCases: BenchCase[] = [
  {
    id: "cl-fx-1",
    category: "fact_extraction",
    name: "T2DM discharge (EN)",
    language: "en",
    text: "Patient with Type 2 Diabetes Mellitus (E11.9) and Hypertension (I10). Prescribed Metformin 1000mg BID (RxCUI 860975) and Lisinopril 20mg daily. HbA1c 8.9%.",
    goldEntities: ["Type 2 Diabetes Mellitus", "Hypertension", "Metformin", "Lisinopril", "HbA1c"],
    goldTriples: [
      { s: "patient", p: "diagnosed_with", o: "Type 2 Diabetes Mellitus" },
      { s: "patient", p: "diagnosed_with", o: "Hypertension" },
      { s: "Metformin", p: "prescribed_for", o: "patient" },
      { s: "Lisinopril", p: "prescribed_for", o: "patient" },
    ],
  },
  {
    id: "cl-fx-2",
    category: "fact_extraction",
    name: "Anaphylaxis ED (EN)",
    language: "en",
    text: "ED visit for acute urticaria (L50.0) and anaphylaxis (T78.2) after amoxicillin. Administered adrenaline IM (RxCUI 7512) and methylprednisolone IV.",
    goldEntities: ["urticaria", "anaphylaxis", "amoxicillin", "adrenaline", "methylprednisolone"],
    goldTriples: [
      { s: "patient", p: "diagnosed_with", o: "anaphylaxis" },
      { s: "amoxicillin", p: "causes_adverse_event", o: "anaphylaxis" },
      { s: "adrenaline", p: "administered_to", o: "patient" },
    ],
  },
  {
    id: "cl-ml-ja",
    category: "multilingual",
    name: "退院サマリー (JP)",
    language: "ja",
    text: "患者は心筋梗塞 (I21.9) と高血圧 (I10) の診断。アスピリン (RxCUI 1191) とクロピドグレル (RxCUI 32968) を処方。PCI 施行。",
    goldEntities: ["心筋梗塞", "高血圧", "アスピリン", "クロピドグレル", "PCI"],
    goldTriples: [
      { s: "patient", p: "diagnosed_with", o: "心筋梗塞" },
      { s: "アスピリン", p: "prescribed_for", o: "patient" },
    ],
  },
  {
    id: "cl-ml-zh",
    category: "multilingual",
    name: "出院小结 (CN)",
    language: "zh",
    text: "患者诊断为2型糖尿病伴肾病 (E11.2) 及高血压 (I10)。处方二甲双胍 (RxCUI 860975)、胰岛素甘精 (RxCUI 285018)。HbA1c 9.4%, eGFR 48。",
    goldEntities: ["2型糖尿病", "高血压", "二甲双胍", "胰岛素甘精"],
    goldTriples: [
      { s: "patient", p: "diagnosed_with", o: "2型糖尿病" },
      { s: "二甲双胍", p: "prescribed_for", o: "patient" },
    ],
  },
  {
    id: "cl-on-1",
    category: "ontology_conformance",
    name: "Clinical vocab adherence",
    language: "en",
    text: "Patient on Pembrolizumab and Carboplatin for NSCLC. ECOG 1. Grade 2 peripheral neuropathy noted.",
    goldEntities: ["Pembrolizumab", "Carboplatin", "NSCLC", "neuropathy"],
    goldTriples: [],
  },
  {
    id: "cl-rp-1",
    category: "repair",
    name: "Allergy↔Med contradiction",
    language: "en",
    text: "Patient with documented penicillin allergy. Amoxicillin 500mg TID was prescribed by mistake. Withheld pending allergy review.",
    goldEntities: ["penicillin", "Amoxicillin"],
    goldTriples: [
      { s: "patient", p: "allergic_to", o: "penicillin" },
      { s: "Amoxicillin", p: "contraindicates", o: "patient" },
    ],
  },
  {
    id: "cl-hl-1",
    category: "hallucination",
    name: "Administrative note",
    language: "en",
    text: "Appointment rescheduled to next Monday at 10:00. Patient confirmed via portal message.",
    goldEntities: [],
    goldTriples: [],
  },
];

/* ── Fusion-corroboration corpus (Phase 3, GOLD_VERSION v2) ──
 * Cases describe a narrative TTP claim alongside an internal flow signature
 * keyed by a stable `flow_ref` (matches `cti-flow-feature-ingest-spec.md`).
 * The scorer rewards `corroborates` triples whose subject matches the gold
 * TTP and whose object equals the `flow_ref`. Until the fusion job lands,
 * these cases anchor the baseline at 0 — by design.
 */
const fusionCorroborationCases: BenchCase[] = [
  {
    id: "cti-fc-1",
    category: "fusion_corroboration",
    name: "APT-29 beaconing ↔ flow#a42b",
    text:
      "Vendor report: APT-29 used HTTPS beaconing (T1071.001) against the corporate enclave. " +
      "Internal SOC observed flow flow#a42b: 10.0.7.21 → 203.0.113.4:443 with 60s inter-arrival, " +
      "1.8s jitter, payload entropy 4.2 bits/byte (anomaly score 0.74).",
    goldEntities: ["APT-29", "T1071.001", "flow#a42b"],
    goldTriples: [
      { s: "APT-29", p: "uses", o: "T1071.001" },
    ],
    goldCorroborations: [
      { ttp: "T1071.001", flow_ref: "flow#a42b", expected_conf_narrative_min: 0.7 },
    ],
  },
  {
    id: "cti-fc-2",
    category: "fusion_corroboration",
    name: "Cobalt Strike C2 ↔ flow#9e07",
    text:
      "Mandiant noted Cobalt Strike (T1059.001) command-and-control activity attributed to FIN7. " +
      "Internal flow flow#9e07 from 10.0.4.12 to 198.51.100.22:8443 shows malleable-profile JA3 fingerprint, " +
      "30-second beacon cadence, 5% jitter.",
    goldEntities: ["FIN7", "Cobalt Strike", "T1059.001", "flow#9e07"],
    goldTriples: [
      { s: "FIN7", p: "uses", o: "Cobalt Strike" },
    ],
    goldCorroborations: [
      { ttp: "T1059.001", flow_ref: "flow#9e07", expected_conf_narrative_min: 0.7 },
    ],
  },
];

const clinicalFusionCases: BenchCase[] = [
  {
    id: "cl-fc-1",
    category: "fusion_corroboration",
    name: "Sepsis bundle adherence ↔ vitals#v17",
    language: "en",
    text:
      "Discharge summary asserts SEP-1 bundle compliance for septic shock (R65.21). " +
      "Internal vitals trace vitals#v17 records MAP < 65 for 42 min before antibiotic administration, " +
      "lactate 4.8 mmol/L drawn at t+18m.",
    goldEntities: ["septic shock", "SEP-1", "vitals#v17"],
    goldTriples: [
      { s: "patient", p: "diagnosed_with", o: "septic shock" },
    ],
    goldCorroborations: [
      { ttp: "SEP-1", flow_ref: "vitals#v17", expected_conf_narrative_min: 0.6 },
    ],
  },
];

// Append fusion cases to each domain (kept as separate arrays for readability)
ctiCases.push(...fusionCorroborationCases);
clinicalCases.push(...clinicalFusionCases);

export function getCorpus(domain: Domain): BenchCase[] {
  return domain === "clinical" ? clinicalCases : ctiCases;
}

export const CATEGORIES: TaskCategory[] = [
  "fact_extraction", "ontology_conformance", "serialization",
  "qa", "repair", "hallucination", "multilingual",
  "fusion_corroboration",
];

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  fact_extraction: "Fact Extraction",
  ontology_conformance: "Ontology Conformance",
  serialization: "Turtle Serialization",
  qa: "Subgraph Q&A",
  repair: "Schema / Repair",
  hallucination: "Hallucination Ctrl",
  multilingual: "Multilingual",
  fusion_corroboration: "Fusion Corroboration",
};
