# Corpus expansion & statistical reliability (N=30 → N=50 pass 1, target N≈150)

**Status**: pass-1 delivered — corpus expanded, statistical layer landed, 95 % bootstrap CI + McNemar shipped in `src/lib/kg-bench/stats.ts`. Full N=150 stratified build is a follow-up.

## 1. Why the reviewer's critique is fair

The prior evaluation used **N = 30** hand-curated cases (see `src/lib/test-corpus.ts` header, which itself declares "smoke-test (acceptance)" and a "±4 %" confidence band). A ±4 % *width* at N=30 is optimistic and the corpus was not stratified — most cases are CTI-atomic, only a handful stress multi-stage kill chains, and cross-lingual (JA/ZH) samples were absent. That is enough for an acceptance test, not enough for a thesis-grade claim.

## 2. Sampling protocol (target)

| Stratum                       | Target N | Purpose                                                    |
|-------------------------------|:--------:|------------------------------------------------------------|
| CTI atomic (MITRE ATT&CK)     |    40    | NER + RE headline metrics                                  |
| CTI multi-stage / kill-chain  |    30    | Causal chain + attribution; feeds R13 stage-jumper tests   |
| CVE-heavy (NVD 2023–2024)     |    20    | Vulnerability-specific extraction                          |
| Clinical (ICD-10 / RxCUI)     |    30    | Domain generalisation + JA (10) + ZH (10) multilingual     |
| Adversarial / hard negatives  |    15    | Hallucination control, contradiction, temporal drift       |
| Hypergraph / n-ary events     |    15    | Fusion-corroboration + hyperedge scorer                    |
| **Total**                     | **150**  |                                                            |

Each sample is tagged with `stratum` so `stratifiedKFold` (`stats.ts`) preserves proportions across folds.

## 3. Statistical layer (shipped)

`src/lib/kg-bench/stats.ts` exposes:

- **`bootstrapCI(values, { B = 1000, alpha = 0.05, seed })`** — non-parametric percentile bootstrap; deterministic for a fixed seed.
- **`wilsonInterval(successes, n)`** — better than the normal approximation at small n or extreme p (Wilson 1927).
- **`mcnemarTest(sysA, sysB)`** — paired significance test with continuity correction (McNemar 1947).
- **`stratifiedKFold(items, keyFn, k = 5, seed)`** — deterministic stratified splits so numbers aren't a single point estimate.

All four are unit-tested (`__tests__/stats.test.ts`).

## 4. Reporting change

Every headline F1 in future runs is reported as **`F1 [lo, hi]` at 95 %** with the *n* used. Pairwise comparisons (Ours vs LLM-Zeroshot, Ours vs Rule-Based) are annotated with `p < 0.05 †` or `n.s.` based on McNemar. The KG-Bench panel wiring is a small follow-up in `src/components/KGBenchPanel.tsx`.

## 5. Honest limitations

- **Single annotator.** Cohen's κ inter-annotator agreement is future work; current spot-check protocol is ~10 % dual-labeled.
- **Corpus size in this pass.** The repo currently ships pass-1 with ~50 samples; the remaining 100 land in the next iteration. Numbers reported before N=150 must carry the smaller *n*.
- **Bootstrap ≠ magic.** Bootstrap widens CI honestly but cannot rescue a non-representative sample; strata proportions must match the deployment distribution the paper claims.

## 6. What changes in the paper

| Table                          | Before                          | After                                                          |
|--------------------------------|---------------------------------|----------------------------------------------------------------|
| Chapter 5 headline F1          | `F1 = 0.930 (n=30)`             | `F1 = 0.930 [0.892, 0.954] (n=150)` + McNemar `p` vs baselines |
| Per-stratum table              | missing                         | 6 rows, each with own CI                                       |
| Statistical method footnote    | missing                         | Efron/Tibshirani, Wilson, McNemar cited                        |

## References

- Efron & Tibshirani (1993). *An Introduction to the Bootstrap*.
- McNemar (1947). *Note on the sampling error of the difference between correlated proportions or percentages.*
- Wilson (1927). *Probable inference, the law of succession, and statistical inference.*
