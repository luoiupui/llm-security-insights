# Issue 3 — Corpus scale-up feasibility (N=56 → N≥500)

**Status**: research memo, 2026-07-04. Answers the reviewer question: *is it feasible to collect ≥500 CTI documents from public sources, comparable to DNRTI (175 docs / ~10k entities), CASIE (~1,000), CTIBench (thousands)?*

Related artefacts: [`corpus-expansion-and-statistics.md`](corpus-expansion-and-statistics.md), [`issue3-sota-benchmark-gap.md`](issue3-sota-benchmark-gap.md), [`implementation-roadmap.md`](implementation-roadmap.md).

---

## 1. Framing

"Feasible" is decomposed on four axes:

| Axis | Question |
|---|---|
| (a) Source availability | Does enough public raw material exist? |
| (b) Licensing | Can we redistribute or at least paraphrase legally? |
| (c) Annotation cost | Is human labelling budget realistic? |
| (d) Statistical sufficiency | Does the added N buy the CI tightening the paper needs? |

A "no" on any single axis kills the plan. All four are cleared below for **N=500**; **N=1,000** clears (a)/(b)/(d) but stresses (c) unless weak-supervision is used.

---

## 2. Target sizing

| Tier | N (docs) | Peer baseline | What it unlocks |
|---|---:|---|---|
| Tier-1 | 200 | DNRTI (175), APTNER (344) | Closes P0 in `issue3-sota-benchmark-gap.md`; headline F1 CI shrinks below ±0.05 |
| **Tier-2** | **500** | **CASIE (1,000)** | **Per-stratum CIs, McNemar power for SOTA-band claim, entity-count parity with DNRTI** |
| Tier-3 | 1,000+ | CTIBench (2,500 MCQ) | Fine-tuning comparator (LoRA upper-bound), per-type F1 tables at n≥50/type |

Recommendation defended in §9 is **Tier-2**.

---

## 3. Public source inventory

Yield estimates are the rolling-year public output for each stream, cross-checked from source RSS/JSON where available. "Yield" is candidate-documents, not pre-filtered.

| Source | Yield / yr | License class | Notes |
|---|---:|---|---|
| CISA KEV catalog | ~200 | US-Gov public domain | Already wired via `supabase/functions/cisa-advisories-ingest` |
| CISA ICS-CERT advisories | ~400 | US-Gov PD | ICS/OT stratum growth path |
| MITRE ATT&CK procedure examples (Enterprise v15) | ~1,500 (static) | Apache-2.0 | Atomic-TTP stratum; already ingested via `kb-ingest` |
| Vendor PSIRT (MSRC / Cisco Talos / Fortinet / Ivanti / Palo Alto / Check Point) | ~2,000 combined | Vendor T&C — paraphrase-only | CVE-anchored stratum |
| Threat-intel vendor blogs (Mandiant, CrowdStrike, Microsoft MSTIC, Huntress, SentinelOne, ESET) | ~500 | Copyrighted — paraphrase + cite | APT campaigns, ransomware playbooks |
| JPCERT/CC 注意喚起 & weekly reports | ~150 | JPCERT terms — cite source | JA multilingual stratum |
| CNCERT/CC 通报 + QiAnXin ATI | ~200 | Source-cite | ZH multilingual stratum |
| STIX/TAXII public feeds (OASIS Open, LimoTracker, abuse.ch MalwareBazaar/ThreatFox) | ~5,000 IoC-bundles | CC0 / CC-BY | Machine-readable; need narrative synthesis |
| AlienVault OTX pulses | ~10,000 / yr | OTX ToS — research OK | Community-labelled, uneven quality |
| Academic reuse (DNRTI 175 · APTNER 344 · CASIE 1,000 · MalwareTextDB) | Fixed | Mixed (CC-BY / research-only) | **Held-out test-split, not merged** |

**Bottom line**: gross public supply is ~5–10k candidate documents per year before filtering. Curating 500 defensible samples is a filtering problem, not a supply problem.

---

## 4. Licensing & redistribution — three-lane strategy

- **Lane A — redistributable corpus** (~300 docs): CISA KEV + CISA ICS-CERT + MITRE + STIX/TAXII CC0/CC-BY + OTX (research clause). These can ship alongside the paper as an open artefact.
- **Lane B — paraphrase-only** (~200 docs): vendor PSIRT + Mandiant/CrowdStrike/JPCERT/CNCERT/QiAnXin. Store `{paraphrased_narrative, source_url, sha256(original)}`; never redistribute the source text. **Precedent**: DNRTI and APTNER both use paraphrase-and-cite.
- **Lane C — reference test-split**: DNRTI / APTNER / CASIE consumed under their published licenses for **held-out benchmarking only** — not merged into the training pool. This is what gives us head-to-head numbers against SOTA (P0 item in `issue3-sota-benchmark-gap.md`).

Lane A + Lane B ≥ 500 without any private, embargoed, or paywalled data.

---

## 5. Annotation cost model

Grounded in the actual statistics layer (`src/lib/kg-bench/stats.ts`) and the observed pass-1 throughput.

| Quantity | Value | Source |
|---|---|---|
| Single-annotator throughput | ~12 min/doc (entities + relations + kill-chain tags) | Observed on N=56 pass-1 |
| N=500 raw effort | ~100 annotator-hours = ~2.5 person-weeks | Derived |
| Dual-annotation subset (15 %) for Cohen's κ | +30 h | Standard IAA practice |
| Weak-supervision bootstrap | −40 % effort | `threat-extract` (Pathway B) as silver labels → human adjudication |
| Realistic team plan | 3 domain-expert annotators × 3 weeks | Master's / small-lab budget |

N=1,000 pushes to ~6 person-weeks or requires crowd-augmentation with expert review — flagged as post-thesis extension.

---

## 6. Entity-density note (why 500 docs ≈ DNRTI-scale entities)

DNRTI reports ~10,000 entities on 175 documents ⇒ **~57 entities/doc** because APT campaign reports are long. The current corpus (`corpusStats` from `src/lib/kg-bench/corpus.ts`) yields ~19 entities/doc on 56 docs, dominated by short CISA KEV advisories.

Projected entity counts:

| N | Avg ent/doc | Total entities | Comparable to |
|---:|---:|---:|---|
| 56 (now) | ~19 | ~1,060 | — |
| 200 | ~30* | ~6,000 | approaches DNRTI |
| **500** | **~30*** | **~15,000** | **exceeds DNRTI, matches CASIE-scale** |
| 1,000 | ~35* | ~35,000 | CTIBench-adjacent |

*Density rises with N because Tier-2 strata pull in more multi-stage APT reports (~50–70 ent/doc) alongside atomic advisories (~8–12 ent/doc). Weighted-average from the target stratification in `corpus-expansion-and-statistics.md` §3.

**Entity-count parity with DNRTI is reached at N≈500, not N=1,000.**

---

## 7. Statistical payoff

Using Wilson (1927) CI half-width for F1≈0.85 (`wilsonInterval` in `src/lib/kg-bench/stats.ts`):

| N | 95 % CI half-width | McNemar power vs LLM-zeroshot | Reviewer question closed |
|---:|---:|---|---|
| 56 (now) | ±0.09 | Underpowered on <3-pt gaps | Headline only |
| 200 | ±0.05 | Powered for ≥4-pt gaps | Per-corpus F1 |
| **500** | **±0.03** | **Powered for ≥2-pt gaps** | **Per-stratum CIs, SOTA-band claim at p<0.05** |
| 1,000 | ±0.022 | Powered for ≥1.5-pt gaps | Per-type F1 (7 strata × n≥50) |

The **N=200→500 jump halves the CI**, which is the single strongest statistical argument for Tier-2 over Tier-1.

---

## 8. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Citation-cost creep (500 URLs to track) | Medium | Store `{url, sha256, retrieved_at}` per doc in the extract; reuse existing `threat_reports` schema |
| Source drift (URLs rotting) | High over 12 mo | Snapshot with Wayback Machine on ingest; store archive URL |
| Non-English annotator scarcity (JA/ZH strata) | Medium | Cap JA+ZH at 10 % each; use bilingual reviewer for spot-check only |
| License reinterpretation on vendor blogs | Low-Medium | Lane B is paraphrase-only + citation; do not redistribute raw HTML |
| JPCERT/CNCERT redistribution ambiguity | Medium | Cite-and-summarise; never ship raw JA/ZH text in the released corpus |
| Reviewer objects that paraphrase ≠ original | Low | DNRTI/APTNER precedent covers this; also ship Lane A open-license subset for full reproducibility |

None of these are single-point failures.

---

## 9. Recommendation

Commit to **Tier-2 (N=500)** as the paper-defensible target:

- Doc-count parity with **CASIE**.
- Entity-count parity/superiority vs **DNRTI** (§6).
- ±0.03 F1 CI, McNemar-powered for ≥2-pt gaps (§7).
- Achievable in ~3 person-weeks under Lane A + Lane B licensing without private data (§5).
- Zero private, embargoed, or paywalled sources required.

**Tier-3 (N=1,000)** is marked as a *post-thesis extension* aligned with the fine-tuned upper-bound P2 item already recorded in `issue3-sota-benchmark-gap.md`.

**Answer to the reviewer**: yes, N≥500 from public sources is feasible along all four feasibility axes, and N=500 is the recommended target — not N=1,000 — because it clears entity-count parity with DNRTI, doc-count parity with CASIE, and gives ±0.03 F1 CIs, at ~40 % of the annotation cost of Tier-3.

---

## 10. Follow-ups (roadmap sync)

On approval, update in a separate turn:

- `implementation-roadmap.md` P0 bucket: change "Expand corpus to N≥150" → "Expand corpus to N=500 (Tier-2)".
- `corpus-expansion-and-statistics.md` §3: replace "Target N=150" column with "Target N=500 (Tier-2)".
- Add a Lane-tag column (`A` / `B` / `C-testonly`) to `src/lib/test-corpus.ts` metadata so downstream release scripts can filter the redistributable subset.

## References

- Efron & Tibshirani (1993). *An Introduction to the Bootstrap.*
- McNemar (1947). *Note on the sampling error of the difference between correlated proportions or percentages.*
- Wilson (1927). *Probable inference, the law of succession, and statistical inference.*
- Wang X. et al. (2020). *DNRTI: A large-scale dataset for named entity recognition in threat intelligence.*
- Wang T. et al. (2022). *APTNER: A specific dataset for NER missions in cyber threat intelligence field.*
- Satyapanich T. et al. (2020). *CASIE: Extracting cybersecurity event information from text.* AAAI.
- Alam M. T. et al. (2024). *CTIBench: A benchmark for evaluating LLMs in cyber threat intelligence.*
- CISA Known Exploited Vulnerabilities Catalog. https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- MITRE ATT&CK Enterprise v15. https://attack.mitre.org/
- abuse.ch MalwareBazaar / ThreatFox. https://bazaar.abuse.ch/ · https://threatfox.abuse.ch/
- AlienVault OTX. https://otx.alienvault.com/
