# CTI Multi-Modal Fusion: External KG Profiles ⊕ Internal CICIDS Flow Profiles

**Status:** Specification / research note. Companion to:
- `conflict-rules-multimodal-extension.md` (Deliverable 2)
- `ontology-corroborated-finding-spec.md` (Deliverable 3)
- `MultiModalFusionMock` panel on `/kg-construction` (Deliverable 4)

Cross-refers to White Paper §2–§4 (`white-paper.md`) and to the credibility scoring
formula in `mem://architecture/threat-reasoning`.

---

## 1. Problem statement

The KG Construction pipeline currently consumes **external, after-event, narrative**
CTI: vendor reports, CERT advisories, blogs, STIX bundles. The same defender also
operates **internal, live, statistical** telemetry (CICIDS-2017-shaped NetFlow
records, IDS alerts, tap sensors). Both describe "threats", but along almost
orthogonal axes. Naïvely merging them either dilutes the KG with stale claims or
buries genuine internal anomalies under unrelated external narrative.

This document formalizes the mismatch, catalogues the failure modes it creates,
and specifies the guards and fusion patterns the project uses to extract
**multi-modal** value without inheriting either side's weaknesses.

## 2. Modality comparison

| Dimension       | External CTI (KG input)                          | Internal CICIDS (flow input)                       |
|-----------------|--------------------------------------------------|----------------------------------------------------|
| Origin          | Outside the company — vendor, CERT, blog, STIX   | Inside the company — taps, NetFlow, IDS sensors    |
| Temporality     | Post-event, retrospective (days–weeks)           | Live / near-real-time                              |
| Subject         | Someone else's incident, generalized to TTPs     | Your hosts, your IPs, your users                   |
| Granularity     | Coarse, narrative, actor-level                   | Fine, statistical, flow-level                      |
| Truth model     | Analyst-asserted prose                           | Machine-measured, numeric                          |
| Identifiers     | Aliases, hashes, CVEs, campaign names            | IPs, ports, MACs, hostnames                        |
| Modality        | Unstructured text → symbolic graph               | Structured tabular → statistical vectors           |
| Stability       | Concepts persist (TTPs); IoCs decay fast         | Snapshots; baseline drifts continuously            |

Treat them as **two modalities of the same phenomenon**: external = *semantic /
narrative*, internal = *behavioral / empirical*.

## 3. Where the mismatch creates insight

Insight emerges only at the **join**:

- External: *"APT29 uses HTTPS beaconing every 60 s ± jitter to `*.cdn-fake.com`."*
- Internal CICIDS flow: *host `10.0.7.21 → 203.0.113.4:443`, inter-arrival 58–62 s,
  low payload entropy.*

Neither alone is a verdict. Together: a grounded attribution hypothesis with a
measurable footprint. External provides the **hypothesis space**; internal
provides the **evidence**.

## 4. Failure modes (what naïve fusion gets wrong)

1. **Stale IoC trap** — IP/hash IoCs age out in days; matching today's flows
   against a 6-month-old report yields false positives on now-benign infra.
2. **Misattribution by coincidence** — a flow pattern "looks like" APT29
   beaconing but is a legitimate SaaS heartbeat. Narrative confidence ≠
   behavioral confidence.
3. **Scope confusion** — external report describes someone else's victim sector;
   assuming your environment is the same target distorts priority.
4. **Identifier collision** — a public CDN IP appears in both an APT report and
   normal traffic. Naïve graph-joining links benign hosts to threat actors.
5. **Temporal inversion** — using a post-event narrative to predict a live flow
   is fine; using a live flow to retro-confirm a narrative without timestamp
   checks creates circular reasoning.
6. **Confidence laundering** — multiplying high-confidence flow stats by
   high-confidence narrative claims yields falsely high fused scores.

## 5. Guard catalog

| Guard                          | Mechanism                                                                                                                                                |
|--------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Provenance separation          | Every KG node/edge tagged with `source_modality ∈ {external_cti, internal_telemetry, fused}` and `observed_at`. No untyped collapse.                     |
| Temporal decay                 | Existing credibility formula `S = Σ(wᵢ × confᵢ × reliabilityᵢ)/N` extended with `freshness(age)` (half-life 30 d for IPs, 180 d for hashes, 365 d for TTPs). |
| Modality-typed edges           | `corroborates` / `contradicts` edges between external TTP nodes and internal FlowPattern nodes — see Deliverable 3.                                       |
| Asymmetric trust               | Internal telemetry is "what is"; external CTI is "what was claimed elsewhere". Internal evidence can promote an external hypothesis; external claims alone cannot demote internal ground truth. |
| Conflict-rule extension        | New rules R11/R12/R13 — see Deliverable 2.                                                                                                                |
| Identifier hygiene             | Allow-list of shared/CDN/cloud IPs excluded from `indicator_match` edges but allowed for `behavioral_match`.                                              |
| Independent confidence channels| `conf_narrative` and `conf_behavioral` stored separately; fused only at read time.                                                                        |
| Two-key promotion              | "Confirmed threat" label requires both modalities above per-modality thresholds — mirrors the agent's `needsApproval` pattern on the `persist` tool.      |

## 6. Three fusion patterns

1. **Hypothesis → Hunt** (external drives internal). KG enumerates TTPs/IoCs for a
   relevant actor → query CICIDS-derived flow features for matching behavioral
   signatures → result is a prioritized hunt list with narrative justification +
   statistical anomaly score.

2. **Anomaly → Context** (internal drives external). CICIDS flags an anomalous
   flow → reverse-lookup destination IP/ASN/JA3 in KG → if it matches an external
   campaign node, upgrade the anomaly with attribution context; otherwise demote
   to "unattributed anomaly" but keep for review.

3. **Bidirectional reinforcement / cross-modal credibility**. Introduce a node
   type `CorroboratedFinding` whose only purpose is to carry a typed pair
   `(ttp_ref, flow_ref)` with independent confidences and a derived `fused_conf`.
   Only `CorroboratedFinding`s feed attribution graph-path scoring.

## 7. Multi-modal framing — parallel with the Clinical track

| Track    | Narrative layer                | Numeric layer                       | Fusion edge                            |
|----------|--------------------------------|-------------------------------------|----------------------------------------|
| CTI      | External report → KG TTP node  | CICIDS flow → FlowPattern node      | `corroborates` → `CorroboratedFinding` |
| Clinical | Free-text note → KG Finding    | Heart-sound T2 features (per `clinical-feature-ingest-spec.md`) | `evidences` → `CorroboratedFinding` (Clinical variant) |

Same architecture: **one symbolic KG layer + one numeric feature layer + a typed
fusion edge with its own confidence**. The PHI-scrub / opaque-ref discipline on
the clinical side maps onto **internal-IP redaction / asset-pseudonymization**
on the CTI side. Both prevent the narrative layer leaking identifiers into the
numeric layer.

## 8. Cross-references and out-of-scope

- Conflict rules R11/R12/R13: see `conflict-rules-multimodal-extension.md`.
- Node/edge schema and STIX 2.1 sighting mapping: see
  `ontology-corroborated-finding-spec.md`.
- Visual contract: collapsible "Multi-Modal Fusion" panel on `/kg-construction`.

Out of scope for this revision: a real CICIDS ingest path, flow-feature
extractor, DB schema for `CorroboratedFinding`, KG-Bench gold cases for the new
node type (would require a gold-version bump per the cardinal rule in
`pipeline-stage-contracts`).
