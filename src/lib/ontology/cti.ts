import type { Ontology } from "./index";

export const ctiOntology: Ontology = {
  id: "cti",
  label: "CTI",
  fullName: "Cyber Threat Intelligence",
  badgeClass: "bg-primary/20 text-primary border-primary/30",
  entityTypes: [
    { id: "threat_actor", label: "Threat Actor", color: "hsl(0, 72%, 55%)" },
    { id: "malware", label: "Malware", color: "hsl(25, 95%, 53%)" },
    { id: "ttp", label: "TTP", color: "hsl(160, 70%, 45%)" },
    { id: "vulnerability", label: "Vulnerability", color: "hsl(38, 92%, 50%)" },
    { id: "software", label: "Software", color: "hsl(200, 80%, 55%)" },
    { id: "infrastructure", label: "Infrastructure", color: "hsl(215, 12%, 55%)" },
    { id: "campaign", label: "Campaign", color: "hsl(280, 70%, 60%)" },
    { id: "indicator", label: "Indicator", color: "hsl(190, 70%, 50%)" },
    { id: "identity", label: "Identity", color: "hsl(50, 70%, 55%)" },
    // Phase 3 — multi-modal fusion (spec: public/reports/ontology-corroborated-finding-spec.md)
    { id: "flow_pattern", label: "Flow Pattern", color: "hsl(195, 80%, 60%)" },
    { id: "corroborated_finding", label: "Corroborated Finding", color: "hsl(140, 60%, 50%)" },
  ],
  relationTypes: [
    "uses", "targets", "attributed-to", "communicates-with", "exploits",
    "delivers", "drops", "indicates", "mitigates", "derived-from", "related-to",
    // Phase 3 — fusion edges (spec §2)
    "corroborates", "contradicts", "matches_ioc",
  ],
  disclaimer: null,
  sampleText: `In December 2020, FireEye discovered that SolarWinds Orion software updates had been trojanized by APT-29 (Cozy Bear). The SUNBURST backdoor exploited CVE-2020-10148 and communicated via avsvmcloud[.]com (185.225.69.24). TEARDROP loaded Cobalt Strike beacons (T1059.001) for lateral movement.`,
};
