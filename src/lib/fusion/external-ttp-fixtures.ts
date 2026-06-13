/**
 * External (narrative) CTI TTP fixtures — Phase 4 matcher input.
 *
 * Small set of vendor-report-style TTP claims used as the "external" side of
 * the multi-modal join. Each carries an independent `conf_narrative` and a
 * `published_at` (drives R12 staleness decay in the matcher).
 *
 * NOTE: Real deployment swaps this fixture for live `kg_entities` rows whose
 * `source_modality = 'external_cti'`. Shape stays identical.
 */

export interface ExternalTtpClaim {
  id: string;
  actor: string;
  /** MITRE ATT&CK technique id (e.g. "T1071.001"). Join key. */
  technique_id: string;
  technique_name: string;
  source_url: string;
  /** Source reliability (NATO admiralty A=1.0 .. F=0.1). */
  reliability: number;
  /** Per-claim confidence in the narrative report itself. */
  conf_narrative: number;
  /** ISO-8601 publication time — used by R12 freshness decay. */
  published_at: string;
}

export const EXTERNAL_TTP_CLAIMS: ExternalTtpClaim[] = [
  {
    id: "ext-apt29-t1071001",
    actor: "APT-29",
    technique_id: "T1071.001",
    technique_name: "Application Layer Protocol: Web",
    source_url: "vendor-report.example.com/2026-apt29",
    reliability: 0.9,
    conf_narrative: 0.91,
    published_at: "2026-04-10T00:00:00Z",
  },
  {
    id: "ext-fin7-t1048003",
    actor: "FIN7",
    technique_id: "T1048.003",
    technique_name: "Exfiltration Over Unencrypted Non-C2 Protocol",
    source_url: "vendor-report.example.com/2026-fin7-dns",
    reliability: 0.8,
    conf_narrative: 0.84,
    published_at: "2026-04-05T00:00:00Z",
  },
  {
    id: "ext-generic-t1046",
    actor: "Unattributed",
    technique_id: "T1046",
    technique_name: "Network Service Scanning",
    source_url: "osint-blog.example.com/scan-bursts-2026",
    reliability: 0.5,
    conf_narrative: 0.65,
    published_at: "2026-02-01T00:00:00Z",
  },
  // Stale + unverified claim — used to demonstrate R11+R12 clamping.
  {
    id: "ext-stale-t1090",
    actor: "Rumored",
    technique_id: "T1090",
    technique_name: "Proxy",
    source_url: "anon-paste.example.com/abc",
    reliability: 0.2,
    conf_narrative: 0.88,
    published_at: "2025-08-01T00:00:00Z",
  },
];
