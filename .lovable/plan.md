# Plan: Corpus scale-up feasibility memo (N=56 → N≥500)

Create one new research artefact — no code, UI, schema, or edge-function changes. It answers: *is it feasible to collect ≥500 CTI documents from public sources, comparable to DNRTI (175 docs / ~10k entities), CASIE (1,000), CTIBench (thousands)?*

## Deliverable

`public/reports/issue3-corpus-scaleup-feasibility.md` (append entry to `public/reports/manifest.json`).

## Structure

1. **Question & framing** — restate reviewer challenge; define "feasible" along four axes: (a) source availability, (b) licensing, (c) annotation cost, (d) statistical sufficiency.

2. **Target sizing table** — three tiers with justification:
   - Tier-1 N=200 (matches DNRTI/APTNER band, closes P0 in `issue3-sota-benchmark-gap.md`)
   - Tier-2 N=500 (matches CASIE band, enables per-stratum CIs)
   - Tier-3 N=1,000+ (matches CTIBench band, enables fine-tuning comparators)

3. **Public source inventory** with realistic yield/year and license class:
   | Source | Yield/yr | License | Notes |
   |---|---|---|---|
   | CISA KEV catalog | ~200 | US-Gov public domain | already wired in `cisa-advisories-ingest` |
   | CISA ICS-CERT advisories | ~400 | US-Gov PD | ICS/OT stratum |
   | MITRE ATT&CK procedure examples | ~1,500 static | Apache-2.0 | atomic stratum |
   | Vendor PSIRTs (MSRC, Cisco Talos, Fortinet, Ivanti, Palo Alto, Check Point) | ~2,000 combined | vendor T&C — paraphrase-only | CVE-anchored |
   | Mandiant / CrowdStrike / Microsoft threat blogs | ~500 | copyrighted — paraphrase + cite | APT campaigns |
   | JPCERT/CC 注意喚起 & weekly | ~150 | JPCERT terms — cite | JA stratum |
   | CNCERT/CC 通报 + QiAnXin ATI | ~200 | source-cite | ZH stratum |
   | STIX/TAXII public feeds (OASIS Open, LimoTracker, abuse.ch) | ~5,000 IoC-bundles | CC0/CC-BY | machine-readable, needs narrative synthesis |
   | AlienVault OTX pulses | ~10,000/yr | OTX ToS — research OK | community-labeled |
   | Academic reuse: DNRTI (175), APTNER (344), CASIE (1000), MalwareTextDB | fixed | mixed (CC-BY / research-only) | **reuse as test-split, not merge** |
   
   **Conclusion**: gross public supply per year is 5–10k candidate documents. N=500 is comfortably feasible; N=1,000 within one annotator-quarter.

4. **Licensing & redistribution** — three-lane strategy:
   - Lane A (redistributable corpus): CISA + MITRE + STIX/TAXII CC0/CC-BY + OTX under research clause → target ~300 docs publishable.
   - Lane B (paraphrase-only): vendor PSIRT + Mandiant/CrowdStrike/JPCERT/CNCERT → store *paraphrased narrative + source URL + hash of original*, never redistribute source text. Precedent: DNRTI and APTNER both paraphrase.
   - Lane C (reference test split): DNRTI/APTNER/CASIE consumed under their published licenses for **held-out benchmarking only**, not merged into training pool.

5. **Annotation cost model** — using the actual stats layer already in `src/lib/kg-bench/stats.ts`:
   - Single-annotator throughput observed: ~12 min/doc for entities+relations+kill-chain.
   - N=500 ⇒ ~100 annotator-hours ⇒ 2.5 person-weeks. Dual-annotation on a 15 % subset for Cohen's κ adds ~30 h.
   - Weak-supervision bootstrap: run existing `threat-extract` (Pathway B) as silver labels, then human-adjudicate — cuts effort ~40 %.
   - Cost at 3 domain-expert annotators × 3 weeks = feasible for a Master's / small-lab budget; N=1,000 requires ~6 weeks or crowd-augmentation with expert review.

6. **Entity density note** — DNRTI's ~10k entities on 175 docs (~57 ent/doc) is high because long APT reports. Our current 56 docs already yield ~19 ent/doc (from `corpusStats`). Projected N=500 at same density ≈ 9,500 entities — **entity-count parity with DNRTI reachable at N≈500**, not requiring 1,000.

7. **Statistical payoff** (ties back to `stats.ts`):
   - N=200 → Wilson 95 % CI half-width on F1≈0.85 shrinks from ±0.09 (n=56) to ±0.05.
   - N=500 → ±0.03, enough to claim SOTA-band membership at *p*<0.05 via McNemar.
   - N=1,000 → per-stratum CIs (7 strata) each with n≥50 — enables the per-type F1 tables reviewers demand.

8. **Risk register** — cite-cost creep, source-drift over time, non-English annotator scarcity, license reinterpretation risk on paraphrased vendor blogs, JPCERT/CNCERT redistribution ambiguity → mitigations for each.

9. **Recommendation** — commit to **Tier-2 (N=500)** as the paper-defensible target: entity-count parity with DNRTI, doc-count parity with CASIE, achievable in ~3 person-weeks under Lane A+B licensing without any private data. Tier-3 (N=1,000) marked as "post-thesis extension" aligning with fine-tuned upper-bound P2 item already in `issue3-sota-benchmark-gap.md`.

10. **Cross-refs** — link to `corpus-expansion-and-statistics.md`, `issue3-sota-benchmark-gap.md`, `implementation-roadmap.md` P0 bucket (update roadmap to reflect N=500 target on approval, in a follow-up turn).

## Out of scope

No changes to `src/lib/test-corpus.ts`, no new edge functions, no UI. Pure research memo.
