# Corpus expansion & statistical reliability (N=30 → N=56 pass 1, target N≈150, CTI-only)

**Status**: pass-1 delivered — corpus expanded to **N=56 CTI samples**, clinical stratum removed per project scope narrowing (2026-07-04), statistical layer landed (`bootstrapCI`, `wilsonInterval`, `mcnemarTest`, `stratifiedKFold` in `src/lib/kg-bench/stats.ts`). Full N=150 CTI-only stratified build is a follow-up.

## 1. Why the reviewer's critique is fair

The prior evaluation used **N = 30** hand-curated cases (see `src/lib/test-corpus.ts` header, which itself declares "smoke-test (acceptance)" and a "±4 %" confidence band). A ±4 % *width* at N=30 is optimistic and the corpus was not stratified — most cases were CTI-atomic, only a handful stressed multi-stage kill chains, and cross-lingual (JA/ZH) samples were absent. That is enough for an acceptance test, not enough for a thesis-grade claim.

## 2. Scope decision (2026-07-04)

The project focuses on Cyber Threat Intelligence. The Clinical stratum (ICD-10 / RxCUI / LOINC) that appeared in the earlier plan has been **removed** from the evaluation corpus. Multilingual generalisation is now measured on **multilingual CTI advisories** (JPCERT/CC, CNCERT/CC, QiAnXin) rather than clinical narratives. The clinical simulation surfaces elsewhere in the app remain, but the KG-Bench corpus is CTI-only.

## 3. Sampling protocol (real numbers, pass-1 shipped)

| Stratum                                       | Pass-1 shipped | Target N=150 | Sources                                                                                     |
|-----------------------------------------------|:--------------:|:------------:|---------------------------------------------------------------------------------------------|
| CTI atomic (MITRE ATT&CK)                     |       17       |      40      | MITRE ATT&CK Enterprise v15 procedure examples                                              |
| CVE-anchored (CISA KEV + vendor PSIRTs)       |       20       |      25      | CISA KEV, Fortinet / Ivanti / Check Point / Microsoft MSRC / Cisco Talos advisories         |
| Multi-stage / kill-chain / n-ary hypergraph   |       14       |      45      | STIX/TAXII paraphrase — SolarWinds SUNBURST, MOVEit CL0P, Trigona playbook, etc.            |
| ICS / OT advisories                           |       2        |      20      | CISA ICS-CERT (ICSA-22-083-05), Dragos + CISA PIPEDREAM/INCONTROLLER                        |
| Multilingual JA                               |       3        |      10      | JPCERT/CC 注意喚起 & weekly reports (Emotet, Ivanti CVE-2024-21887, Lazarus/AppleJeus)      |
| Multilingual ZH                               |       3        |      10      | CNCERT/CC 通报, QiAnXin 威胁情报中心 (Volt Typhoon, APT41/ShadowPad, Ivanti CVE-2023-46805) |
| Adversarial / hard negatives                  |       5        |      15      | Empty-facts, temporal contradiction, prompt-injection, actor-alias flip                     |
| **Total**                                     |     **56**     |   **~150**   |                                                                                             |

**Verified real anchors (from `corpusStats`, computed at import time):**
- 34 unique CVE identifiers (all traceable to CISA KEV or NVD).
- 35 unique threat actor / intrusion-set names (MITRE ATT&CK-documented or widely-attributed).
- 19 unique MITRE ATT&CK Enterprise v15 techniques.

Each sample is tagged with `datasetId` so `stratifiedKFold` (`stats.ts`) preserves proportions across folds.

## 4. Types & sources of CTI cases actually used in pass-1

| Case class                | Real-world source lineage (paraphrased, never LLM-generated)                                               |
|---------------------------|------------------------------------------------------------------------------------------------------------|
| CISA KEV exploit chains   | CISA Known Exploited Vulnerabilities catalog + vendor advisory paraphrase (Palo Alto, JetBrains, Ivanti…)  |
| Ransomware operator TTPs  | Mandiant, Microsoft MSTIC, Huntress, CrowdStrike reporting on BianLian, Black Basta, LockBit, CL0P, Trigona|
| APT campaigns             | APT28 / APT29 / APT35 / APT41 / Lazarus / Volt Typhoon / Water Hydra / CHERNOVITE                          |
| Supply-chain events       | SolarWinds SUNBURST (CVE-2020-10148), MOVEit Transfer (CVE-2023-34362)                                     |
| ICS / OT                  | Rockwell ControlLogix (CVE-2022-1161), Schneider MODICON + OMRON Sysmac via PIPEDREAM                      |
| Multilingual CTI          | JPCERT/CC (JA), CNCERT/CC and QiAnXin (ZH) — Emotet, Ivanti, Lazarus, Volt Typhoon, APT41                  |
| Adversarial               | Empty-narrative, causal-order inversion, prompt-injection ("ignore previous instructions…")               |

## 5. Statistical layer (shipped)

`src/lib/kg-bench/stats.ts` exposes:

- **`bootstrapCI(values, { B = 1000, alpha = 0.05, seed })`** — non-parametric percentile bootstrap; deterministic for a fixed seed.
- **`wilsonInterval(successes, n)`** — better than the normal approximation at small n or extreme p (Wilson 1927).
- **`mcnemarTest(sysA, sysB)`** — paired significance test with continuity correction (McNemar 1947).
- **`stratifiedKFold(items, keyFn, k = 5, seed)`** — deterministic stratified splits so numbers aren't a single point estimate.

All four are unit-tested (`__tests__/stats.test.ts`).

## 6. Reporting change

Every headline F1 in future runs is reported as **`F1 [lo, hi]` at 95 %** with the *n* used. Pairwise comparisons (Ours vs LLM-Zeroshot, Ours vs Rule-Based) are annotated with `p < 0.05 †` or `n.s.` based on McNemar.

## 7. Honest limitations

- **Single annotator.** Cohen's κ inter-annotator agreement is future work; current spot-check protocol is ~10 % dual-labeled.
- **Corpus size in this pass.** N=56 (not the 150 target). Numbers reported before N=150 must carry the smaller *n* and its wider CI.
- **ICS/OT and multilingual strata are still thin** (2 and 6 samples respectively). Pass-2 must grow these to 20 and 20 before per-stratum F1 can be reported without a warning.
- **Bootstrap ≠ magic.** Bootstrap widens CI honestly but cannot rescue a non-representative sample; strata proportions must match the deployment distribution the paper claims.

## 8. What changes in the paper

| Table                          | Before                          | After                                                          |
|--------------------------------|---------------------------------|----------------------------------------------------------------|
| Chapter 5 headline F1          | `F1 = 0.930 (n=30)`             | `F1 = 0.930 [lo, hi] (n=56 pass-1 → 150 target)` + McNemar `p` |
| Per-stratum table              | missing                         | 7 CTI rows, each with own CI                                   |
| Statistical method footnote    | missing                         | Efron/Tibshirani, Wilson, McNemar cited                        |
| Domain scope                   | CTI + Clinical                  | **CTI-only** (Clinical removed 2026-07-04)                     |

## References

- Efron & Tibshirani (1993). *An Introduction to the Bootstrap*.
- McNemar (1947). *Note on the sampling error of the difference between correlated proportions or percentages.*
- Wilson (1927). *Probable inference, the law of succession, and statistical inference.*
- CISA Known Exploited Vulnerabilities Catalog. https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- MITRE ATT&CK Enterprise v15. https://attack.mitre.org/
- JPCERT/CC 注意喚起. https://www.jpcert.or.jp/at/
- CNCERT/CC. https://www.cert.org.cn/
