---
mem_path: mem://features/flow-feature-ingest
name: CTI Flow-Feature Ingest (T2)
description: T2 CICIDS-style bidirectional-flow feature record contract (JSON Schema + STIX mapping) plus pure fusion math and CDN/cloud allow-list. Spec + pure code only; no DB, no edge function.
type: feature
exported_at: 2026-06-13
---

CTI internal-telemetry input contract — peer of the heart-sound T2 spec on the
Clinical side. T2 bidirectional-flow records carry CICIDS-2017-aligned
aggregate features, opaque `asset_ref`, allow-list-gated `peer_ref`, optional
`derived.anomaly_score`, MITRE TID `findings`, full provenance, and an
auto-derived `text_view` for LLM ingest.

Artifacts (Phase 1):
- Spec: `public/reports/cti-flow-feature-ingest-spec.md`
- JSON Schema: `public/schemas/cti-flow-features.v1.schema.json`
- Example: `public/schemas/examples/cti-flow-features.example.json`
- CDN/cloud ASN allow-list: `src/lib/ontology/cdn-asn-allowlist.{json,ts}`
- Pure fusion math: `src/lib/fusion/index.ts` (noisy_or / min / weighted / freshness / decayHalfLife)
- Synthetic fixture: `src/lib/test-corpus/flow-samples.ts` (5 cases: benign-CDN, SaaS-heartbeat, APT29-beacon, DNS-exfil, port-scan)
- Unit tests under each module's `__tests__/`

Phase 1 deliberately ships no DB migration, no edge function, no edits to
existing pipeline stages or ontology types, and no KG-Bench gold-version bump.
The pure helpers and the allow-list are dead code until Option 2 (schema) and
Option 3 (pipeline + KG-Bench) wire them in.
