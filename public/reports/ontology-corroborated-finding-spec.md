# Ontology Extension: `CorroboratedFinding` Node + Fusion Edges

**Status:** Specification only. `src/lib/ontology/cti.ts` is **not** edited in this
revision. This document is the contract a follow-up build task will implement.

Companion to `cti-multimodal-fusion.md` (concept) and
`conflict-rules-multimodal-extension.md` (rules that consume these types).

---

## 1. New node type — `CorroboratedFinding`

A `CorroboratedFinding` is a typed pair of references — one external/narrative,
one internal/behavioral — that together represent a single fused conclusion. It
is the *only* place in the KG where cross-modal confidence is materialised.

### 1.1 Fields

| Field             | Type                                                          | Required | Notes                                                                  |
|-------------------|---------------------------------------------------------------|----------|------------------------------------------------------------------------|
| `id`              | uuid                                                          | yes      | Stable across re-runs of the same evidence window                      |
| `ttp_ref`         | KG node id                                                    | yes      | Must reference a node tagged `source_modality = external_cti`          |
| `flow_ref`        | KG node id                                                    | yes      | Must reference a node tagged `source_modality = internal_telemetry`    |
| `conf_narrative`  | float `[0,1]`                                                 | yes      | Copied from `ttp_ref` at corroboration time                            |
| `conf_behavioral` | float `[0,1]`                                                 | yes      | Copied from `flow_ref` at corroboration time                           |
| `fused_conf`      | float `[0,1]`                                                 | derived  | **Never persisted as the sole confidence.** Computed at read time.      |
| `fusion_method`   | enum `noisy_or \| dempster_shafer \| min \| weighted`         | yes      | Default `noisy_or`                                                     |
| `evidence_window` | `{ start: ISO-8601, end: ISO-8601 }`                          | yes      | Time range over which the behavioral evidence was observed             |
| `created_at`      | ISO-8601                                                      | yes      |                                                                        |
| `provenance`      | `{ producer, version, run_id, repro_preset }`                 | yes      | Mirrors existing pipeline provenance                                   |

### 1.2 Storage rule (non-negotiable)

`conf_narrative` and `conf_behavioral` are **independent stored fields**. Code
that reads a `CorroboratedFinding` MUST recompute `fused_conf` via the declared
`fusion_method`. This is what allows R13 (`cross_modal_disagreement`) to detect
a divergence — once collapsed, the signal is gone forever.

### 1.3 Default fusion function

```
noisy_or:        fused = 1 − (1 − conf_narrative) × (1 − conf_behavioral)
min:             fused = min(conf_narrative, conf_behavioral)
weighted(α):     fused = α × conf_narrative + (1−α) × conf_behavioral, default α=0.5
dempster_shafer: documented as research extension; implementation deferred
```

## 2. New edge types

### 2.1 `corroborates`

- Direction: `external_cti_node → internal_telemetry_node`
- Carries its own `confidence ∈ [0,1]`; this confidence is **not** averaged into
  the endpoints' confidences.
- Required tags: `evidence_window`, `created_at`, `provenance`.
- Cardinality: many-to-many. A TTP node may corroborate multiple flow nodes; a
  flow node may be corroborated by multiple TTPs.

### 2.2 `contradicts`

- Direction: undirected, asserted between an `external_cti_node` and an
  `internal_telemetry_node`.
- Used by R13 when the LLM resolver returns verdict `A) PROMOTE` (behavioral is
  benign; narrative claim is contradicted on this asset).
- Carries its own confidence and a `resolver_run_id` for audit.

### 2.3 Why edges carry their own confidence

If an edge's confidence is just a function of endpoint confidences, the fusion
layer is invisible to the credibility score. Keeping it independent lets the
neuro-symbolic engine (`mem://architecture/threat-reasoning`) reason about
*linkage strength* separately from *endpoint strength*.

## 3. Universal `source_modality` tag

Every KG node from this revision forward MUST carry one of:

- `external_cti` — from a vendor report, blog, advisory, STIX bundle, etc.
- `internal_telemetry` — derived from internal flow / sensor data.
- `fused` — only valid on `CorroboratedFinding` nodes.

### 3.1 Migration strategy

Existing nodes default to `external_cti` (the current pipeline produces nothing
else). The tag is added by a one-shot backfill in the same migration that
introduces the column. New nodes from the (future) flow ingest path are tagged
`internal_telemetry` at creation.

## 4. Identifier hygiene — shared/CDN/cloud allow-list

Some IPs and ASNs legitimately appear in both external reports and benign
internal traffic. The allow-list governs which edge types may be created from
such matches:

| Match against allow-list entry | `indicator_match` edge | `behavioral_match` edge |
|--------------------------------|------------------------|-------------------------|
| Exact IP in allow-list         | **forbidden**          | allowed                 |
| ASN in allow-list, IP not      | allowed (with note)    | allowed                 |
| Not in allow-list              | allowed                | allowed                 |

Allow-list source: a static JSON under `src/lib/ontology/` (to be created in
the implementation task), seeded with the major CDN/cloud ASNs (CloudFront,
Akamai, Fastly, Cloudflare, GCP, AWS, Azure). Updatable without code changes.

## 5. STIX 2.1 alignment

A `CorroboratedFinding` maps to a STIX **Sighting Relationship Object (SRO)**
with a custom extension. Extension URI (project-local):

```
extension-definition--threatgraph-corroborated-finding-v1
```

| STIX field                                 | Source                                      |
|--------------------------------------------|---------------------------------------------|
| `sighting_of_ref`                          | `ttp_ref` (resolved to STIX SDO id)         |
| `observed_data_refs[]`                     | Flow observation derived from `flow_ref`    |
| `first_seen` / `last_seen`                 | `evidence_window.start` / `.end`            |
| `count`                                    | Number of flow observations in window       |
| `extensions[ext].conf_narrative`           | `conf_narrative`                            |
| `extensions[ext].conf_behavioral`          | `conf_behavioral`                           |
| `extensions[ext].fusion_method`            | `fusion_method`                             |
| `extensions[ext].fused_conf_at_export`     | `fused_conf` (snapshot, with timestamp)     |

`contradicts` edges export as a custom relationship type
`x-threatgraph-contradicts`, preserving resolver provenance.

## 6. Two-key promotion rule

No KG node receives the `confirmed_threat` label without at least one
`CorroboratedFinding` linking it to internal telemetry above per-modality
thresholds (defaults: `conf_narrative ≥ 0.7` AND `conf_behavioral ≥ 0.5`). This
mirrors the `needsApproval` pattern already used on the agent's `persist` tool
(`mem://architecture/agent-harness`).

## 7. Worked example

External vendor report names APT-29 using HTTPS beaconing (TTP `T1071.001`)
with `conf=0.91`. Internal CICIDS-derived FlowPattern node summarises host
`10.0.7.21 → 203.0.113.4:443` with inter-arrival mean 60.4 s, jitter 1.8 s,
payload entropy 4.2 bits/byte, anomaly score `0.74` → `conf_behavioral=0.74`.

Fusion step (executed by the future fusion job, not in this revision):

```
1. Detect candidate pair via JA3 / destination ASN / TTP pattern matcher.
2. Create CorroboratedFinding cf_1 {
     ttp_ref: T1071.001,
     flow_ref: FlowPattern#a42b,
     conf_narrative: 0.91,
     conf_behavioral: 0.74,
     fusion_method: 'noisy_or',
     evidence_window: { start: ..., end: ... },
   }
3. Create edge corroborates(T1071.001 → FlowPattern#a42b, conf=0.82).
4. Run conflict engine — R13 does not fire (both ≥ thresholds).
5. Attribution path scoring picks up cf_1 with
      fused_conf = 1 − (1−0.91)(1−0.74) = 0.977
   capped by R11 if no other internal evidence exists for APT-29.
6. Two-key rule satisfied → APT-29 node may now carry `confirmed_threat` for
   this asset/window pair.
```

## 8. Out of scope

- Implementation in `src/lib/ontology/cti.ts`.
- DB schema / migration for the new node + edge types.
- The fusion job itself (matcher between external TTPs and internal flow patterns).
- The static CDN/cloud allow-list JSON.
- KG-Bench gold cases for the new types (gold-version bump required).
