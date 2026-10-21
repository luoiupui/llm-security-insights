# OSINT Dirty-Data Robustness — v2 (live pipeline, after the KB fix)

**Run date:** 2026-10-21 · **Pipeline:** threat-preprocess → threat-extract (frozen model, zero-shot, T = 0, seed 42) → kb-validate → threat-conflicts
**Supersedes for live figures:** `osint-dirty-data-robustness.md` (v1). v1 is kept unchanged as the historical record.
**Raw data:** `data/osint-dirty-robustness-results-v2.json`

---

## 1. What changed since v1

| Item | v1 | v2 |
|---|---|---|
| Knowledge base loaded by the live check | 1,000 of 2,968 entries (paging bug) | **All 2,968 entries** (paged reads) |
| Indicator format checks (IPv4 octets, hash length, CVE format) | Scoring script only | **Live**, in kb-validate |
| Harmless infrastructure (public DNS, CDN/cloud prefixes, vendor update domains) | Scoring script only | **Live**, in kb-validate |
| Unknown CVE with impossible year (e.g. CVE-2099-x) | Marked "non-canonical" | **Marked "hallucinated"** |
| Reliability drop (R4 floor 0.4; R11/R8 weak-support attribution) | Scoring script only | **Live**, in threat-conflicts |
| Invalid IPs such as 312.45.7.19 in preprocessing | Accepted as indicators | **Rejected** (0/60 runs accepted it) |
| "Fixed" numbers came from | Re-scoring v1 output in a script | **Live pipeline output, read back unchanged** |

Every level in v2 reads directly from fields the live pipeline returns: L0 = extracted entities, L1 = `admitted_entities` from kb-validate, L2 = L1 entities that threat-conflicts also lists as `supported_entities`.

A filter bug found during the v2 run was fixed before the final scoring: CVE names with a suffix (e.g. "CVE-2020-11651_Exploitation") were being dropped as malformed. kb-validate was redeployed and run again on the saved extractions (no new AI calls). After that, the only item dropped from clean data is "T1506", a revoked ATT&CK technique, so the drop is correct.

## 2. Test design (unchanged from v1)

| Property | Value |
|---|---|
| Seed cases | 20 Gold CTI cases (public CISA KEV-style advisories) |
| Variants | 60 = 20 × {clean, low noise, high noise} |
| Planted fakes | 180 (60 low, 120 high) |
| Noise types | N1 malformed indicator · N2 harmless infrastructure · N3 made-up KB ID · N4 unreliable attribution · N5 spam/copy-paste · N6 contradicting reply |
| Source reliability | clean 0.75 · noisy (forum) 0.50 |
| Errors | 0/60 extract, 0/60 kb-validate, 0/60 conflicts |

## 3. Fakes admitted (95 % Wilson CI)

| Noise | L0 Raw LLM | L1 + Ontology/KB | **L2 Full stack (live)** |
|---|---|---|---|
| Low (60 fakes) | 86.7 % [75.8–93.1] | 45.0 % [33.1–57.5] | **10.0 % [4.7–20.1]** |
| High (120 fakes) | 83.3 % [75.7–88.9] | 41.7 % [33.2–50.6] | **9.2 % [5.2–15.7]** |

The full stack removes about 89 % of planted fakes at both noise levels.

## 4. Gold accuracy

| Data | Level | Gold recall | Precision | F1 |
|---|---|---|---|---|
| Clean | L0 | 94.2 % (81/86) | 62.2 | 74.9 |
| Clean | **L2** | 94.2 % | 62.7 | **75.3** |
| Low | L0 | 91.9 % | 46.1 | 61.4 |
| Low | L1 | 91.9 % | 54.2 | 68.2 |
| Low | **L2** | 90.7 % [82.7–95.2] | 63.9 | **75.0** |
| High | L0 | 91.9 % | 37.5 | 53.3 |
| High | L1 | 91.9 % | 49.4 | 64.2 |
| High | **L2** | 88.4 % [79.9–93.6] | 64.7 | **74.7** |

The filters cost no recall on clean data. Under high noise, F1 returns to the clean level (74.7 vs 75.3). The price is 3 gold entities lost at L2 (they were low-confidence).

## 5. Results by noise type (high noise, n = 20 each)

| Code | Noise type | L0 | L1 | L2 | Caught by |
|---|---|---|---|---|---|
| N1 | Malformed indicator | 17/20 | **0/20** | 0/20 | Format checks |
| N2 | Harmless infrastructure | 18/20 | **0/20** | 0/20 | Public DNS / CDN / vendor-domain list |
| N3 | Made-up KB ID | 15/20 | **0/20** | 0/20 | Full KB + CVE-year check |
| N4 | Unreliable attribution | 20/20 | 20/20 | **1/20** | R4/R11/R8 reliability drop |
| N6 | Contradicting reply | 20/20 | 20/20 | **0/20** | Same, plus R6 contradiction |
| N5 | Spam / copy-paste | 10/20 | 10/20 | **10/20** | **Not caught — open gap** |

Of the 11 fakes still admitted under high noise, 10 come from N5.

## 6. Why each item was dropped (live, all 60 runs)

| Reason | Clean | Low | High |
|---|---|---|---|
| L1 kb_hallucinated | 1 | 7 | 15 |
| L1 ioc_malformed | 0 | 9 | 17 |
| L1 ioc_benign | 0 | 9 | 18 |
| L2 R4 confidence floor | 0 | 24 | 31 |
| L2 R11/R8 unsupported attribution | 0 | 4 | 11 |

## 7. Pipeline signals (mean per case)

| Signal | Clean | Low | High |
|---|---|---|---|
| Source reliability | 0.75 | 0.50 | 0.50 |
| Entities extracted | 6.75 | 8.35 | 10.40 |
| Rules not passing | 1.85 | 2.70 | 3.60 |
| Credibility score | 0.823 | 0.602 | 0.580 |
| R4 Credibility Assessment fired | 0/20 | 19/20 | 20/20 |
| R6 Attribution Contradiction fired | 1/20 | 10/20 | 20/20 |
| R11 Unverified External fired | 4/20 | 6/20 | 12/20 |
| Wall time per variant | p50 19.2 s · p95 22.4 s (6 parallel) | | |

## 8. v1 vs v2

| Metric (high noise unless stated) | v1 as-is (bug) | v1 "fixed" (script) | **v2 live** |
|---|---|---|---|
| Fakes admitted, full stack | 16.7 % | 11.7 % | **9.2 %** |
| Fakes admitted, low noise | 13.3 % | 8.3 % | **10.0 %** |
| Gold recall, clean | 82.6 % | 95.3 % | **94.2 %** |
| F1, clean | 69.1 | 74.5 | **75.3** |
| F1, low noise | 70.4 | 78.1 | **75.0** |
| F1, high noise | 67.1 | 75.7 | **74.7** |
| N3 made-up KB ID survives | 7/20 | 1/20 | **0/20** |
| N5 spam survives | 9/20 | 9/20 | **10/20** |

The v2 live numbers fall within the confidence intervals of the v1 "fixed" projection. So the v1 projection was sound, and the gains are now real in the deployed system. The small differences (e.g. low-noise F1 75.0 vs 78.1) come from the model producing slightly different output between runs, even at T = 0.

## 9. Conclusions

1. The 1,000-entry bug was the main cause of the v1 recall loss. With the full KB, clean recall is unchanged by the filters.
2. Ontology checks (L1) remove all malformed, harmless-infrastructure and made-up-ID fakes (N1–N3: 50/50 → 0/60 at high noise).
3. Symbolic and reliability checks (L2) remove almost all unreliable and contradicting attributions (N4 + N6: 40/40 → 1/40).
4. **Open gap:** spam that invents a well-formed malware name (N5) passes every check. Next step: a corroboration rule requiring ≥ 2 independent sources before a never-seen malware name becomes a node.

## 10. Limitations

- 20 seed cases; the noise is synthetic but modelled on real forum patterns.
- The thresholds (0.4 floor, 0.5 reliability, 0.6 actor confidence) were set before v2 and not tuned on these results, but they are not independently validated either.
- The CDN/cloud list is a seed snapshot, not a full ASN dump.
- The model is frozen and zero-shot; nothing was trained.

## 11. Reproduction

1. Variants: `variants.json` (same as v1) → send each through threat-preprocess, threat-extract (`deterministic: true`), kb-validate, threat-conflicts.
2. L1 = `kb-validate.admitted_entities`; L2 = L1 ∩ `threat-conflicts.supported_entities`.
3. A fake counts as admitted if its token matches an entity name or ID at that level. Wilson 95 % CIs.
4. Filter rules: `supabase/functions/_shared/osint-filters.ts`; tests: `src/lib/ontology/__tests__/osint-filters.test.ts` (13 pass).
