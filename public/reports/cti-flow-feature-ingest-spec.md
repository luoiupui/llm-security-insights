# CTI Flow-Feature Ingest Spec (v1.0)

**Status:** Specification only. Peer of `clinical-feature-ingest-spec.md` on the CTI internal-telemetry branch. Companion to:
- `cti-multimodal-fusion.md` — concept
- `ontology-corroborated-finding-spec.md` — node/edge types this spec feeds
- `conflict-rules-multimodal-extension.md` — rules R11–R13 that consume these records

No runtime code, edge function, DB schema, or KG-Bench gold-version bump is performed by this revision. Pure-code helpers landed in the same Phase 1 PR live under `src/lib/fusion/` and `src/lib/ontology/cdn-asn-allowlist.*`; the synthetic fixture lives under `src/lib/test-corpus/flow-samples.ts`.

---

## 1. Purpose & scope

External CTI is narrative and after-event; internal telemetry is statistical and live. This spec defines the **internal-telemetry input contract** for the CTI KG: a de-identified, compact, CICIDS-2017-aligned flow-aggregate record that an external DSP/IDS pipeline produces and uploads. The KG layer consumes the record's `features` block for symbolic reasoning and its `text_view` for LLM extraction, mirroring the heart-sound T2 contract on the Clinical side.

**Non-goals (v1):** raw pcap ingest, inline DPI, online streaming, encrypted-traffic decryption, model retraining on CICIDS labels.

## 2. Position in pipeline

Sibling of `threat-preprocess` on the CTI internal-telemetry branch. Emits the same normalized "document" shape that `threat-extract` already consumes (see `pipeline-stage-contracts`):

```text
External CICIDS-style producer
        │  (CICIDS-2017 column set)
        ▼
flow-ingest (FUTURE edge function, not in v1)
        │  (this spec's record format)
        ▼
threat-extract (existing) ── consumes features + text_view
        │
        ▼
threat-fuse (FUTURE) ─── corroborates external TTP nodes ─► CorroboratedFinding
```

The contract is shaped so that when the future `flow-ingest` edge function is added, no existing stage's response shape changes — preserving the cardinal rule.

## 3. Tier selection

Three tiers documented; **only T2 is v1**:

| Tier | Granularity                          | Format           | v1 status         |
|------|--------------------------------------|------------------|-------------------|
| T1   | Packet-level                         | Parquet / NDJSON | Out of scope      |
| T2   | Flow-aggregate (per bidirectional flow) | JSON / NDJSON | **In scope (v1)** |
| T3   | Host / window aggregate (rolling)    | JSON             | Out of scope      |

Rationale: T2 is the CICIDS-2017 native granularity, small enough to ship per record, large enough to support behavioral fingerprinting without raw payloads.

## 4. Record schema (T2)

One JSON object per **bidirectional flow**.

| Field             | Type                                  | Notes                                                                  |
|-------------------|---------------------------------------|------------------------------------------------------------------------|
| `record_id`       | uuid                                  | Stable across re-ingest                                                |
| `schema_version`  | const `"1.0"`                         |                                                                        |
| `asset_ref`       | string, regex `^[A-Za-z0-9_-]{6,64}$` | **Opaque pseudonym** for internal host. Never raw IP/MAC/AD name       |
| `peer_ref`        | string                                | Opaque iff peer IP is in CDN/cloud allow-list; else raw IP/host allowed |
| `flow_meta`       | object — see §4.1                     |                                                                        |
| `features`        | object — see §4.2                     | CICIDS-2017-aligned                                                    |
| `derived`         | object?                               | Optional anomaly outputs                                               |
| `findings`        | array?                                | Optional T3-style passthrough                                          |
| `provenance`      | object — see §4.3                     | Required                                                               |
| `text_view`       | string                                | Auto-derived natural-language summary for LLM                          |

### 4.1 `flow_meta`

```text
start_ts        ISO-8601, required
end_ts          ISO-8601, required, > start_ts
duration_s      number ≥ 0, required (UCUM s)
protocol        enum: tcp | udp | icmp | other
src_port        integer 0–65535
dst_port        integer 0–65535
direction       enum: ingress | egress | lateral
vlan            integer? 0–4094
sensor_id       string, required (opaque sensor identifier)
```

### 4.2 `features` (T2 aggregates)

Counts: `fwd_packets`, `bwd_packets`, `total_bytes_fwd`, `total_bytes_bwd` — all integers ≥ 0.

Length stats (bytes): `pkt_len_mean`, `pkt_len_std`, `pkt_len_max`, `pkt_len_min`, `fwd_pkt_len_mean`, `fwd_pkt_len_std`, `bwd_pkt_len_mean`, `bwd_pkt_len_std` — all numbers ≥ 0.

Inter-arrival (seconds): `iat_mean`, `iat_std`, `iat_min`, `iat_max`, `fwd_iat_mean`, `fwd_iat_std`, `bwd_iat_mean`, `bwd_iat_std` — all numbers ≥ 0.

Rates: `flow_bytes_per_s` (B/s), `flow_packets_per_s` (1/s) — both ≥ 0.

Flags (counts): `syn_count`, `ack_count`, `fin_count`, `rst_count`, `psh_count`, `urg_count` — integers ≥ 0.

Window: `init_win_bytes_fwd`, `init_win_bytes_bwd` — integers ≥ 0 (use 0 for non-TCP).

Active/idle (seconds): `active_mean`, `active_std`, `idle_mean`, `idle_std` — numbers ≥ 0.

Entropy: `payload_entropy_bits_per_byte` — number `[0, 8]`.

Fingerprints (optional): `ja3?`, `ja3s?` (32-hex), `tls_sni?` (string, present only if peer is allow-listed).

### 4.3 `derived` (optional)

```text
anomaly_score          number [0, 1]
baseline_percentile    number [0, 1]
cluster_id             string
```

### 4.4 `findings` (optional T3-style passthrough)

Array of `{ code_system, code, display, confidence, evidence_refs[] }`. Example `{ code_system: "MITRE", code: "T1071.001", display: "Application Layer Protocol: Web", confidence: 0.74, evidence_refs: ["beacon_pattern"] }`.

### 4.5 `provenance`

```text
producer_model_id        string, required (e.g. "cicflowmeter")
producer_version         string, required
preprocessing_chain      string[]
calibration_id           string?
created_at               ISO-8601, required
quality_flags            string[]   (e.g. "truncated_flow", "asymmetric_capture")
```

## 5. Units & coding

- Durations: UCUM `s`. Rates: `1/s`, `B/s`. Counts: unit-less integers.
- `findings.code` uses MITRE ATT&CK TID when `code_system = "MITRE"`; project-local codes registered as a follow-up in `src/lib/ontology/cti.ts`.

## 6. STIX 2.1 mapping (informational)

| This spec                              | STIX 2.1                                                                                                                               |
|----------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| record (flow)                          | `network-traffic` SCO + `observed-data` SDO; `start` / `end` from `flow_meta`; `src_port` / `dst_port` direct                          |
| `asset_ref` / `peer_ref`               | Referenced via `src_ref` / `dst_ref` to opaque `identity` objects (never raw IPs unless peer is allow-listed)                          |
| `findings[i]` (MITRE TID)              | Candidate STIX `sighting`; `sighting_of_ref` resolves to the attack-pattern SDO                                                        |
| `derived.anomaly_score`                | Custom extension `extension-definition--threatgraph-corroborated-finding-v1` (see ontology spec)                                       |
| `provenance`                           | `granular_marking` / custom extension fields                                                                                           |

No STIX exporter is implemented in this revision.

## 7. File formats

- JSON per record; NDJSON for batches; gzip allowed.
- Max 5 MB per record (compressed).
- Parquet, HDF5, raw pcap explicitly out of scope.

## 8. Validation rules

Records failing any of the below are rejected at ingest with a structured error:

- All required fields present per §4.
- `end_ts > start_ts`; `duration_s ≥ 0`.
- `payload_entropy_bits_per_byte ∈ [0, 8]`.
- All `*_pkt_len_*`, all `*_iat_*`, all `*_bytes_*`, all flag counts ≥ 0.
- `protocol` ∈ `{tcp, udp, icmp, other}`.
- `asset_ref` matches opaque regex; must not match RFC1918 IP, MAC (`[0-9a-f:]{17}`), or AD name pattern.
- `provenance.created_at`, `producer_model_id`, `producer_version` all present.
- UCUM conformance for any explicitly-typed quantity.

## 9. Internal-asset redaction guard

Mirror of the PHI guard on the Clinical side.

- `asset_ref` MUST be opaque per regex `^[A-Za-z0-9_-]{6,64}$`.
- No raw RFC1918 IP, no raw MAC, no AD computer name in any field.
- `peer_ref` is opaque iff peer IP is in the CDN/cloud allow-list (`src/lib/ontology/cdn-asn-allowlist.json`); otherwise raw external IP / hostname is allowed.
- `tls_sni` is recorded only when peer is allow-listed (otherwise the SNI is itself an external indicator and may carry sensitive context).

## 10. Mapping to KG triples (worked example)

External CTI report yields KG TTP node `T1071.001` with `conf_narrative = 0.91` (`source_modality = external_cti`).

A T2 flow record arrives:

```text
asset_ref: pseudo-7f3c
peer_ref:  203.0.113.4   (not allow-listed)
iat_mean:  60.4  iat_std: 1.8
payload_entropy_bits_per_byte: 4.2
derived.anomaly_score: 0.74
```

Future fusion job (not in v1) materialises:

```text
node FlowPattern f1   (source_modality = internal_telemetry, conf_behavioral = 0.74)
edge corroborates(T1071.001 → f1, confidence = 0.82)
node CorroboratedFinding cf1 {
  ttp_ref: T1071.001, flow_ref: f1,
  conf_narrative: 0.91, conf_behavioral: 0.74,
  fusion_method: noisy_or,
  evidence_window: { start: 2026-04-12T00:00Z, end: 2026-04-12T12:00Z }
}
```

`fused_conf` is recomputed at read time via the pure helpers in `src/lib/fusion/` per the ontology spec storage rule.

## 11. KG-Bench Cat 9 hook (informational)

Gold-case shape for `(external TTP, T2 flow record) → CorroboratedFinding` triples; minimum case set per the conflict-rule extension. Authoring the gold cases requires a **gold-version bump** per the cardinal rule in `pipeline-stage-contracts` and is **not** in this revision.

## 12. Open extension points (not v1)

- T1 packet-level (Parquet).
- T3 host/window aggregates (rolling stats).
- Streaming ingest (WebSocket / SSE).
- Encrypted-traffic fingerprint expansion: JARM, SPKI hash, HASSH.
- Real CICIDS class-label passthrough for supervised baselines.
