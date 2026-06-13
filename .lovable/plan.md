# Flow-Feature Ingest Spec + Pure Fusion Foundations

Combined low-risk plan covering Option 4 (spec) and Option 1 (pure code + fixtures). Zero impact on future Option 2 (schema migration) or Option 3 (pipeline + KG-Bench): no DB changes, no edge functions, no changes to existing pipeline stages, no KG-Bench gold-version bump. Everything added is additive and behind no runtime call path.

---

## Part A — Flow-Feature Ingest Spec (Option 4, peer of heart-sound T2)

**File:** `public/reports/cti-flow-feature-ingest-spec.md` (new)

Mirrors the structure of `clinical-feature-ingest-spec.md` so the two domains stay symmetric.

Sections:
1. **Purpose & scope** — CICIDS-style flow features as a de-identified intermediate for CTI KG. Non-goals: raw pcap handling, inline DPI, online streaming.
2. **Position in pipeline** — sibling of `threat-preprocess` on the CTI internal-telemetry branch. Emits the same normalized document shape `threat-extract` already consumes, with a machine-readable `features` block and an auto-rendered `text_view` for the LLM. Respects `pipeline-stage-contracts`.
3. **Tier selection** — three tiers documented, **T2 (flow-aggregate) is v1**:
   - T1 packet-level (Parquet, out of scope v1)
   - **T2 flow-aggregate** (per-bidirectional-flow record) ✓ v1
   - T3 host/window-aggregate (rolling stats, out of scope v1)
4. **Record schema (T2)** — one JSON object per bidirectional flow:
   - `record_id`, `schema_version: "1.0"`
   - `asset_ref` (opaque pseudonym for the internal host, never raw IP), `peer_ref` (opaque or external IP/ASN depending on allow-list)
   - `flow_meta`: `start_ts`, `end_ts`, `duration_s`, `protocol`, `src_port`, `dst_port`, `direction`, `vlan?`, `sensor_id`
   - `features` (T2 aggregates, CICIDS-2017-aligned):
     - Counts: `fwd_packets`, `bwd_packets`, `total_bytes_fwd`, `total_bytes_bwd`
     - Length stats: `pkt_len_mean/std/max/min`, `fwd_pkt_len_mean/std`, `bwd_pkt_len_mean/std`
     - Inter-arrival: `iat_mean/std/min/max`, `fwd_iat_mean/std`, `bwd_iat_mean/std`
     - Rates: `flow_bytes_per_s`, `flow_packets_per_s`
     - Flags: `syn_count`, `ack_count`, `fin_count`, `rst_count`, `psh_count`, `urg_count`
     - Window: `init_win_bytes_fwd`, `init_win_bytes_bwd`
     - Active/idle: `active_mean/std`, `idle_mean/std`
     - Entropy: `payload_entropy_bits_per_byte`
     - Fingerprints: `ja3?`, `ja3s?`, `tls_sni?` (sni only if allow-listed)
   - `derived` (optional): `anomaly_score (0–1)`, `baseline_percentile`, `cluster_id`
   - `findings` (optional T3-style passthrough): `[{ code_system, code, display, confidence, evidence_refs[] }]` (e.g. `MITRE:T1071.001` candidate)
   - `provenance`: `producer_model_id`, `producer_version`, `preprocessing_chain[]`, `calibration_id`, `created_at`, `quality_flags[]`
   - `text_view` (auto-derived natural-language summary for LLM ingest)
5. **Units & coding** — bytes/packets unit-less, durations in seconds (UCUM `s`), rates in `1/s` and `B/s`; MITRE ATT&CK TIDs for `findings.code` when `code_system = "MITRE"`; project-local codes for engineered features registered as a follow-up in `src/lib/ontology/cti.ts`.
6. **STIX 2.1 mapping** — record → STIX `network-traffic` SCO + `observed-data` SDO; `findings` map to candidate `sighting`s with the `extension-definition--threatgraph-corroborated-finding-v1` extension introduced in Spec 3. Spec only — no STIX exporter implemented.
7. **File formats** — JSON for single records, NDJSON for batches; gzip allowed; max 5 MB per record. Parquet for T1, HDF5, raw pcap explicitly out of scope.
8. **Validation rules** — required-field list, range checks (`duration_s ≥ 0`, `payload_entropy_bits_per_byte ∈ [0, 8]`, `*_pkt_len_* ≥ 0`, monotonic `start_ts < end_ts`), protocol enum (tcp/udp/icmp/other), UCUM conformance for units, presence of all provenance fields. Records failing validation are rejected at ingest with a structured error.
9. **Internal-asset redaction guard** — `asset_ref` MUST be opaque (regex `^[A-Za-z0-9_-]{6,64}$`); spec forbids raw internal MAC, raw RFC1918 IP, or AD computer name in any field. `peer_ref` is opaque iff peer IP is in the CDN/cloud allow-list (Part B); otherwise raw IP allowed. Mirror of the PHI guard on the Clinical side.
10. **Mapping to KG triples** — worked example: external report → KG TTP node `T1071.001`; flow record → `FlowPattern f1` node tagged `source_modality=internal_telemetry`; `corroborates(T1071.001 → f1, conf_behavioral=anomaly_score)`; `CorroboratedFinding cf1` materialised per Spec 3.
11. **KG-Bench Cat 9 hook** — describes gold-case shape for `(external TTP, flow features) → CorroboratedFinding` triples. Notes that authoring those gold cases requires a gold-version bump per the cardinal rule and is **not** in this plan.
12. **Open extension points (not v1)** — T1 packet-level, T3 host-window aggregates, streaming ingest, encrypted-traffic fingerprint expansion (JARM, SPKI), real CICIDS labels passthrough.

**Companion artifacts:**
- `public/schemas/cti-flow-features.v1.schema.json` — JSON Schema Draft 2020-12 with `$id` pointing at the public path so external producers can validate offline. Mirrors `heart-sound-features.v1.schema.json`.
- `public/schemas/examples/cti-flow-features.example.json` — one synthetic record showing a beaconing-like flow with `anomaly_score=0.74` (matches the mock panel from Spec 4).

---

## Part B — Pure Fusion Foundations (Option 1, no schema/runtime impact)

All code is pure (no I/O, no Supabase, no edge functions). Existing modules are not edited. Safe to ship without Option 2 or Option 3.

### B1. CDN / cloud ASN allow-list

**File:** `src/lib/ontology/cdn-asn-allowlist.json` (new, static)

Seed entries: CloudFront, Akamai, Fastly, Cloudflare, GCP, AWS, Azure (major ASNs and well-known IP ranges). Schema:
```json
{
  "version": "1.0",
  "updated_at": "2026-06-13",
  "entries": [
    { "name": "Cloudflare", "asn": 13335, "kind": "cdn", "ip_ranges": ["1.1.1.0/24", "..."] },
    ...
  ]
}
```

**File:** `src/lib/ontology/cdn-asn-allowlist.ts` (new) — tiny loader exporting:
- `getAllowlist()` — typed array
- `isAllowlistedAsn(asn: number): boolean`
- `isAllowlistedIp(ip: string): boolean` (CIDR match, IPv4 only in v1)
- `allowlistVerdict(ip, asn): { indicator_match: boolean; behavioral_match: boolean }` — implements the table from Spec 3 §4

### B2. Pure fusion math module

**File:** `src/lib/fusion/index.ts` (new) — no dependencies beyond TS lib.
- `noisyOr(a, b): number`
- `minFusion(a, b): number`
- `weightedFusion(a, b, alpha = 0.5): number`
- `fuse(method, a, b, alpha?): number` (dispatcher)
- `freshness(ageDays, halfLifeDays): number` — `0.5 ** (age/halfLife)` clamped `[0.05, 1.0]`
- `decayHalfLife(kind: "ip" | "domain" | "hash" | "ttp"): number` — defaults from Spec 2 §1
- `applyFreshness(conf, ageDays, kind): number`

Strict input clamping: every input clamped to `[0,1]`; NaN → 0.

### B3. Synthetic flow fixture

**File:** `src/lib/test-corpus/flow-samples.ts` (new) — 5 synthetic T2 flow records as TS objects conforming to the new JSON Schema:
1. Benign HTTPS to CDN (allow-listed peer, high traffic, anomaly 0.05)
2. SaaS heartbeat (regular 30s intervals, anomaly 0.18)
3. APT29-style beaconing (60s ± 1.8s intervals, low entropy, anomaly 0.74) — matches the mock panel
4. DNS exfiltration (high uplink/downlink ratio, anomaly 0.82)
5. Port scan (many short flows, anomaly 0.91)

Each record carries opaque `asset_ref` and `peer_ref`, valid `provenance`, and an auto-derived `text_view` string. Exported as `SAMPLE_FLOWS: FlowFeatureRecord[]`.

### B4. Unit tests

**File:** `src/lib/fusion/__tests__/fusion.test.ts` (new, vitest)
- `noisyOr`/`min`/`weighted` produce expected values for known pairs
- `freshness(0, _)` = 1; `freshness(halfLife, halfLife)` = 0.5; `freshness(10*halfLife, halfLife)` clamped to 0.05
- Clamping behavior (negative inputs, NaN, >1)

**File:** `src/lib/ontology/__tests__/cdn-asn-allowlist.test.ts` (new, vitest)
- Known CDN IP resolves to `indicator_match=false, behavioral_match=true`
- Unknown IP resolves to `indicator_match=true, behavioral_match=true`
- CIDR membership for at least one Cloudflare and one AWS prefix

**File:** `src/lib/test-corpus/__tests__/flow-samples.test.ts` (new, vitest)
- Every sample record passes a thin runtime validator (range checks from spec §8) — validator inlined in the test, not yet a shared module
- Opaque-ref regex holds for `asset_ref` on all samples
- `text_view` is non-empty for all samples

---

## Memory & docs updates

- New file `docs/memory/features/flow-feature-ingest.md` (type: `feature`) — one paragraph linking the spec, schema, example, allow-list, fusion module, and fixture.
- Edit `docs/memory/index.md` — add the new entry.
- Edit `docs/memory/features/multimodal-fusion.md` — append a "Status update (Phase 1 landed)" footnote pointing at the new spec + pure-code modules.
- Edit `public/reports/manifest.json` — add the new spec file entry (same shape as the existing multimodal entries).
- Edit `public/reports/cti-multimodal-fusion.md` — add a one-line cross-reference to the new flow-feature spec in §8.

---

## Verification

After writes, run `bunx vitest run src/lib/fusion src/lib/ontology src/lib/test-corpus` to confirm the new unit tests pass. No other tests or pipelines are touched.

---

## Why this is safe for future Option 2 and Option 3

- **No schema migration** — Option 2 remains a clean, single PR.
- **No edits to existing edge functions, hooks, ontology types, or pipeline stages** — Option 3 inherits a clean baseline; the cardinal rule on stage-contract changes is not triggered.
- **No KG-Bench gold-version bump** — Cat 9 gold cases are explicitly deferred to Option 3's PR.
- **Pure modules + JSON fixtures + spec docs only** — the new code is dead until Option 2/3 wires it in, so any later API adjustment is a local refactor.
- **Allow-list and fusion math are the *only* things Options 2 and 3 would otherwise re-derive**, so landing them now is strictly de-risking, never blocking.

## Out of scope (intentionally)

- Any DB migration, RLS, or GRANT change.
- Any edge function (no `flow-ingest`, no `threat-fuse`, no `threat-conflicts` edits).
- Any change to `src/lib/ontology/cti.ts`, `src/lib/threat-pipeline.ts`, `src/hooks/use-threat-pipeline.ts`, or `AgentLoopPanel.tsx`.
- KG-Bench gold cases or scorer changes.
- Wiring the mock panel to the new fixture (it stays static — swapping to live samples is a one-line follow-up).
- UI work on `/data-ingestion`.
