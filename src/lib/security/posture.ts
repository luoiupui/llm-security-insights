// Security posture registry — static catalog of threats vs mitigations,
// mapped onto the ThreatGraph architecture (Pathways A + B + KG storage + UI).
// Sources: OWASP LLM Top-10, MITRE ATLAS, NIST AI RMF.

export type ControlState = "active" | "simulated" | "planned";

export interface PostureRow {
  layer: string;
  component: string;
  threat: string;
  reference: string; // OWASP / ATLAS / NIST tag
  mitigation: string;
  state: ControlState;
  forward_link?: string; // how this control feeds the FL/PPC future
}

export const POSTURE: PostureRow[] = [
  // ── Data Acquisition ──
  {
    layer: "Data Acquisition",
    component: "threat-preprocess / kb-ingest / cisa-advisories-ingest",
    threat: "Poisoned threat feed (training-data poisoning)",
    reference: "OWASP LLM03 · ATLAS AML.T0020",
    mitigation: "Source reliability score (0–1), per-source-type sanitizer, IOC dedup",
    state: "active",
    forward_link: "Same provenance score becomes the FL client trust-weight.",
  },
  {
    layer: "Data Acquisition",
    component: "threat-preprocess (clinical mode)",
    threat: "PHI leakage in synthetic clinical notes",
    reference: "HIPAA Safe Harbor · NIST AI RMF MS-2.10",
    mitigation: "PHI safety-net regex scrub (MRN, NHS, SSN, email, phone, provider names)",
    state: "active",
    forward_link: "Pre-FL de-identification gate. No raw PHI ever crosses the client boundary.",
  },
  {
    layer: "Data Acquisition",
    component: "All ingest paths",
    threat: "Indirect prompt injection via ingested document",
    reference: "OWASP LLM01",
    mitigation: "Prompt-firewall pre-scan (zero-width chars, system-role overrides, embedded tool syntax)",
    state: "simulated",
  },

  // ── LLM Extraction ──
  {
    layer: "LLM Extraction",
    component: "threat-extract (8-step Graph-Native CoT)",
    threat: "Prompt injection / jailbreak",
    reference: "OWASP LLM01 · ATLAS AML.T0051",
    mitigation: "Zod-validated structured output + ontology-bound entity_type allow-list",
    state: "active",
  },
  {
    layer: "LLM Extraction",
    component: "kb-validate / threat-conflicts",
    threat: "Hallucinated entities, schema drift",
    reference: "OWASP LLM09",
    mitigation: "KB cross-check + symbolic conflict arbitration + credibility score",
    state: "active",
  },
  {
    layer: "LLM Extraction",
    component: "Output guard",
    threat: "Out-of-ontology entity slipping into KG",
    reference: "NIST AI RMF MS-2.5",
    mitigation: "Post-LLM allow-list (CTI vs Clinical ontology), deny-log to monitoring_events",
    state: "simulated",
  },

  // ── Agent Loop (Pathway A) ──
  {
    layer: "Agent Loop (Pathway A)",
    component: "threat-agent / AI SDK tool loop",
    threat: "Runaway tool calls, infinite loop",
    reference: "OWASP LLM06 · ATLAS AML.T0050",
    mitigation: "stopWhen(stepCountIs(50)), per-tool step accounting",
    state: "active",
  },
  {
    layer: "Agent Loop (Pathway A)",
    component: "persist tool",
    threat: "Unsanctioned KG mutation by agent",
    reference: "OWASP LLM08",
    mitigation: "needsApproval gate before any DB write",
    state: "active",
    forward_link: "Same approval gate sits in front of any FL aggregation round.",
  },
  {
    layer: "Agent Loop (Pathway A)",
    component: "Tool argument trace",
    threat: "Exfiltration via verbose tool args",
    reference: "OWASP LLM02",
    mitigation: "Per-domain tool allow-list + truncation of args > 500 chars in streamed trace",
    state: "simulated",
  },

  // ── KG Storage ──
  {
    layer: "KG Storage",
    component: "Supabase RPC (match_threat_reports, fetch_subgraph)",
    threat: "Privilege escalation via SECURITY DEFINER RPC",
    reference: "CWE-269 · Supabase advisory",
    mitigation: "Converted to SECURITY INVOKER · EXECUTE revoked from anon/authenticated/public · service_role only",
    state: "active",
    forward_link: "Aggregator-only write boundary — exactly the trust model FedAvg needs.",
  },
  {
    layer: "KG Storage",
    component: "All public.* tables",
    threat: "Unrestricted write via REST",
    reference: "OWASP LLM10",
    mitigation: "RLS enabled, public has SELECT only; INSERT/UPDATE/DELETE blocked by default",
    state: "active",
  },

  // ── UI / Reports ──
  {
    layer: "UI / Reports",
    component: "Threat-text rendering",
    threat: "Stored XSS via ingested report",
    reference: "CWE-79",
    mitigation: "React default escaping · no dangerouslySetInnerHTML on user content",
    state: "active",
  },
  {
    layer: "UI / Reports",
    component: "Generated .md / .csv downloads",
    threat: "Secret-pattern leakage in reports",
    reference: "OWASP LLM02",
    mitigation: "Secret-pattern detector (AKIA…, ghp_…, hashes longer than expected) before download",
    state: "planned",
  },

  // ── Privacy / FL forward track ──
  {
    layer: "Privacy & FL (forward)",
    component: "De-identification pipeline",
    threat: "Re-identification via quasi-identifiers",
    reference: "HIPAA §164.514 · NIST SP 800-188",
    mitigation: "Safe Harbor 18-identifier checklist + residual-risk score",
    state: "simulated",
  },
  {
    layer: "Privacy & FL (forward)",
    component: "Differential Privacy budget",
    threat: "Aggregate-query reconstruction",
    reference: "Dwork 2006 · NIST AI RMF MS-2.10",
    mitigation: "Laplace/Gaussian noise on KG aggregates; user-chosen ε with utility curve",
    state: "simulated",
  },
  {
    layer: "Privacy & FL (forward)",
    component: "Federated Learning simulator (FedAvg)",
    threat: "Centralized PHI pooling",
    reference: "McMahan 2017",
    mitigation: "Client-side N-shard FedAvg over frozen Gemini embeddings; raw notes never leave shard",
    state: "simulated",
  },
  {
    layer: "Privacy & FL (forward)",
    component: "Secure aggregation (mock)",
    threat: "Aggregator inspects per-client gradient",
    reference: "Bonawitz 2017",
    mitigation: "Pairwise-mask sum visualization (illustrative, not cryptographic)",
    state: "simulated",
  },
  {
    layer: "Privacy & FL (forward)",
    component: "Membership-inference probe",
    threat: "Shadow-model attack reveals training membership",
    reference: "Shokri 2017 · ATLAS AML.T0024",
    mitigation: "Built-in MIA probe; visualizes leakage drop as ε decreases",
    state: "simulated",
  },
];

export const STATE_META: Record<ControlState, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-success/15 text-success border-success/30" },
  simulated: { label: "Simulated", cls: "bg-info/15 text-info border-info/30" },
  planned: { label: "Planned", cls: "bg-warning/15 text-warning border-warning/30" },
};
