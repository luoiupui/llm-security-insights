/**
 * Synthetic T2 CTI flow-feature fixtures.
 *
 * Conforms to public/schemas/cti-flow-features.v1.schema.json.
 * Used by unit tests and (eventually) by the Multi-Modal Fusion mock panel
 * once it is wired off static state. Pure data, no I/O.
 */

export interface FlowFeatureRecord {
  record_id: string;
  schema_version: "1.0";
  asset_ref: string;
  peer_ref: string;
  flow_meta: {
    start_ts: string;
    end_ts: string;
    duration_s: number;
    protocol: "tcp" | "udp" | "icmp" | "other";
    src_port: number;
    dst_port: number;
    direction: "ingress" | "egress" | "lateral";
    vlan?: number | null;
    sensor_id: string;
  };
  features: Record<string, number | string>;
  derived?: {
    anomaly_score?: number;
    baseline_percentile?: number;
    cluster_id?: string;
  };
  findings?: Array<{
    code_system: string;
    code: string;
    display: string;
    confidence: number;
    evidence_refs?: string[];
  }>;
  provenance: {
    producer_model_id: string;
    producer_version: string;
    preprocessing_chain?: string[];
    calibration_id?: string;
    created_at: string;
    quality_flags?: string[];
  };
  text_view: string;
}

const baseProvenance = {
  producer_model_id: "cicflowmeter",
  producer_version: "4.0.1",
  preprocessing_chain: ["tap_capture", "bidirectional_flow_assembly", "entropy_calc"],
  calibration_id: "baseline-2026Q2",
  created_at: "2026-04-12T12:01:14Z",
  quality_flags: [] as string[],
};

export const SAMPLE_FLOWS: FlowFeatureRecord[] = [
  // 1) Benign HTTPS to CDN (allow-listed peer)
  {
    record_id: "11111111-1111-4111-8111-111111111111",
    schema_version: "1.0",
    asset_ref: "pseudo-host-001a",
    peer_ref: "cdn-cloudflare-001",
    flow_meta: {
      start_ts: "2026-04-12T08:00:00Z",
      end_ts: "2026-04-12T08:00:12Z",
      duration_s: 12,
      protocol: "tcp", src_port: 51022, dst_port: 443, direction: "egress",
      vlan: 10, sensor_id: "sensor-edge-1",
    },
    features: {
      fwd_packets: 84, bwd_packets: 142, total_bytes_fwd: 12800, total_bytes_bwd: 184320,
      pkt_len_mean: 870, pkt_len_std: 240, pkt_len_max: 1460, pkt_len_min: 60,
      fwd_pkt_len_mean: 152, fwd_pkt_len_std: 40, bwd_pkt_len_mean: 1298, bwd_pkt_len_std: 220,
      iat_mean: 0.052, iat_std: 0.018, iat_min: 0.001, iat_max: 0.41,
      fwd_iat_mean: 0.06, fwd_iat_std: 0.02, bwd_iat_mean: 0.045, bwd_iat_std: 0.015,
      flow_bytes_per_s: 16426.7, flow_packets_per_s: 18.83,
      syn_count: 1, ack_count: 226, fin_count: 1, rst_count: 0, psh_count: 18, urg_count: 0,
      init_win_bytes_fwd: 65535, init_win_bytes_bwd: 64240,
      active_mean: 8.4, active_std: 1.2, idle_mean: 0, idle_std: 0,
      payload_entropy_bits_per_byte: 7.81,
      ja3: "e7d705a3286e19ea42f587b344ee6865",
    },
    derived: { anomaly_score: 0.05, baseline_percentile: 0.42, cluster_id: "web-cdn-bulk" },
    provenance: baseProvenance,
    text_view:
      "Short egress HTTPS flow from pseudo-host-001a to allow-listed CDN peer. 226 packets in 12s, high-entropy payload (7.81 b/B) consistent with TLS bulk transfer. Anomaly 0.05 (baseline p42).",
  },
  // 2) SaaS heartbeat (regular 30s intervals)
  {
    record_id: "22222222-2222-4222-8222-222222222222",
    schema_version: "1.0",
    asset_ref: "pseudo-host-002b",
    peer_ref: "saas-vendor-edge-7",
    flow_meta: {
      start_ts: "2026-04-12T07:00:00Z",
      end_ts: "2026-04-12T09:00:00Z",
      duration_s: 7200,
      protocol: "tcp", src_port: 49301, dst_port: 443, direction: "egress",
      vlan: 10, sensor_id: "sensor-edge-1",
    },
    features: {
      fwd_packets: 240, bwd_packets: 240, total_bytes_fwd: 30720, total_bytes_bwd: 24576,
      pkt_len_mean: 115, pkt_len_std: 18, pkt_len_max: 180, pkt_len_min: 80,
      fwd_pkt_len_mean: 128, fwd_pkt_len_std: 12, bwd_pkt_len_mean: 102, bwd_pkt_len_std: 14,
      iat_mean: 30.0, iat_std: 2.1, iat_min: 27.4, iat_max: 33.5,
      fwd_iat_mean: 30.0, fwd_iat_std: 2.1, bwd_iat_mean: 30.0, bwd_iat_std: 2.1,
      flow_bytes_per_s: 7.68, flow_packets_per_s: 0.067,
      syn_count: 1, ack_count: 479, fin_count: 1, rst_count: 0, psh_count: 240, urg_count: 0,
      init_win_bytes_fwd: 65535, init_win_bytes_bwd: 64240,
      active_mean: 0.12, active_std: 0.03, idle_mean: 29.9, idle_std: 2.1,
      payload_entropy_bits_per_byte: 6.4,
      ja3: "a0e9f5d64fbb5d9b386dd06c2b8a3b9e",
    },
    derived: { anomaly_score: 0.18, baseline_percentile: 0.72, cluster_id: "saas-heartbeat-30s" },
    provenance: baseProvenance,
    text_view:
      "Regular 30s heartbeat to known SaaS edge over 2h. Symmetric packet counts, moderate entropy 6.4 b/B. Anomaly 0.18 — pattern looks beaconing-like but matches known SaaS baseline (p72).",
  },
  // 3) APT29-style beaconing (60s ± 1.8s) — matches the mock panel
  {
    record_id: "33333333-3333-4333-8333-333333333333",
    schema_version: "1.0",
    asset_ref: "pseudo-7f3c-a42b",
    peer_ref: "203.0.113.4",
    flow_meta: {
      start_ts: "2026-04-12T00:00:00Z",
      end_ts: "2026-04-12T12:00:00Z",
      duration_s: 43200,
      protocol: "tcp", src_port: 49234, dst_port: 443, direction: "egress",
      vlan: 10, sensor_id: "sensor-edge-3",
    },
    features: {
      fwd_packets: 720, bwd_packets: 718, total_bytes_fwd: 184320, total_bytes_bwd: 92160,
      pkt_len_mean: 192.1, pkt_len_std: 12.4, pkt_len_max: 256, pkt_len_min: 128,
      fwd_pkt_len_mean: 256, fwd_pkt_len_std: 8.1, bwd_pkt_len_mean: 128.3, bwd_pkt_len_std: 7.2,
      iat_mean: 60.4, iat_std: 1.8, iat_min: 57.9, iat_max: 62.7,
      fwd_iat_mean: 60.4, fwd_iat_std: 1.8, bwd_iat_mean: 60.4, bwd_iat_std: 1.8,
      flow_bytes_per_s: 6.4, flow_packets_per_s: 0.0333,
      syn_count: 1, ack_count: 1437, fin_count: 1, rst_count: 0, psh_count: 720, urg_count: 0,
      init_win_bytes_fwd: 65535, init_win_bytes_bwd: 64240,
      active_mean: 0.18, active_std: 0.04, idle_mean: 60.2, idle_std: 1.8,
      payload_entropy_bits_per_byte: 4.2,
      ja3: "e7d705a3286e19ea42f587b344ee6865",
    },
    derived: { anomaly_score: 0.74, baseline_percentile: 0.99, cluster_id: "beacon-60s" },
    findings: [
      { code_system: "MITRE", code: "T1071.001", display: "Application Layer Protocol: Web", confidence: 0.74, evidence_refs: ["beacon_pattern", "low_entropy_payload"] },
    ],
    provenance: baseProvenance,
    text_view:
      "Egress TCP flow from pseudo-7f3c-a42b to 203.0.113.4:443 over 12h. Periodic 60.4s inter-arrival (jitter 1.8s), low payload entropy 4.2 b/B. Anomaly 0.74 at p99. Candidate MITRE T1071.001.",
  },
  // 4) DNS exfiltration (high uplink/downlink ratio)
  {
    record_id: "44444444-4444-4444-8444-444444444444",
    schema_version: "1.0",
    asset_ref: "pseudo-host-004d",
    peer_ref: "198.51.100.27",
    flow_meta: {
      start_ts: "2026-04-12T10:15:00Z",
      end_ts: "2026-04-12T10:25:00Z",
      duration_s: 600,
      protocol: "udp", src_port: 53312, dst_port: 53, direction: "egress",
      vlan: 20, sensor_id: "sensor-edge-2",
    },
    features: {
      fwd_packets: 1820, bwd_packets: 1820, total_bytes_fwd: 491400, total_bytes_bwd: 109200,
      pkt_len_mean: 165, pkt_len_std: 22, pkt_len_max: 256, pkt_len_min: 60,
      fwd_pkt_len_mean: 270, fwd_pkt_len_std: 18, bwd_pkt_len_mean: 60, bwd_pkt_len_std: 5,
      iat_mean: 0.33, iat_std: 0.05, iat_min: 0.21, iat_max: 0.48,
      fwd_iat_mean: 0.33, fwd_iat_std: 0.05, bwd_iat_mean: 0.33, bwd_iat_std: 0.05,
      flow_bytes_per_s: 1001.0, flow_packets_per_s: 6.07,
      syn_count: 0, ack_count: 0, fin_count: 0, rst_count: 0, psh_count: 0, urg_count: 0,
      init_win_bytes_fwd: 0, init_win_bytes_bwd: 0,
      active_mean: 600, active_std: 0, idle_mean: 0, idle_std: 0,
      payload_entropy_bits_per_byte: 7.6,
    },
    derived: { anomaly_score: 0.82, baseline_percentile: 0.995, cluster_id: "dns-tunnel" },
    findings: [
      { code_system: "MITRE", code: "T1048.003", display: "Exfiltration Over Unencrypted Non-C2 Protocol", confidence: 0.82, evidence_refs: ["uplink_skew", "high_entropy_queries"] },
    ],
    provenance: baseProvenance,
    text_view:
      "Sustained UDP/53 flow with 4.5× uplink-to-downlink byte ratio over 10 min. High-entropy query payloads (7.6 b/B). Anomaly 0.82 at p99.5. Candidate MITRE T1048.003 (DNS exfil).",
  },
  // 5) Port scan (many short flows aggregated)
  {
    record_id: "55555555-5555-4555-8555-555555555555",
    schema_version: "1.0",
    asset_ref: "pseudo-host-005e",
    peer_ref: "192.0.2.99",
    flow_meta: {
      start_ts: "2026-04-12T11:00:00Z",
      end_ts: "2026-04-12T11:00:08Z",
      duration_s: 8,
      protocol: "tcp", src_port: 0, dst_port: 0, direction: "egress",
      vlan: 30, sensor_id: "sensor-edge-2",
    },
    features: {
      fwd_packets: 2048, bwd_packets: 64, total_bytes_fwd: 122880, total_bytes_bwd: 3840,
      pkt_len_mean: 60, pkt_len_std: 4, pkt_len_max: 78, pkt_len_min: 54,
      fwd_pkt_len_mean: 60, fwd_pkt_len_std: 2, bwd_pkt_len_mean: 60, bwd_pkt_len_std: 2,
      iat_mean: 0.0039, iat_std: 0.0011, iat_min: 0.0008, iat_max: 0.02,
      fwd_iat_mean: 0.0039, fwd_iat_std: 0.0011, bwd_iat_mean: 0.05, bwd_iat_std: 0.02,
      flow_bytes_per_s: 15840, flow_packets_per_s: 264,
      syn_count: 2048, ack_count: 64, fin_count: 0, rst_count: 1984, psh_count: 0, urg_count: 0,
      init_win_bytes_fwd: 1024, init_win_bytes_bwd: 0,
      active_mean: 8, active_std: 0, idle_mean: 0, idle_std: 0,
      payload_entropy_bits_per_byte: 0.0,
    },
    derived: { anomaly_score: 0.91, baseline_percentile: 0.999, cluster_id: "tcp-syn-scan" },
    findings: [
      { code_system: "MITRE", code: "T1046", display: "Network Service Scanning", confidence: 0.91, evidence_refs: ["syn_rst_ratio", "fanout_burst"] },
    ],
    provenance: baseProvenance,
    text_view:
      "2048 SYN packets in 8s with 96.9% RST response ratio. Fixed 60-byte packets, zero payload entropy. Anomaly 0.91. Candidate MITRE T1046 (port scan).",
  },
];
