# Robustness on Dirty OSINT Data: Filtering Spurious Indicators with Graph-Ontology Constraints

**Run:** 2026-10-21, 01:33–01:40 UTC, live deployed pipeline.
**Pipeline:** `threat-preprocess → threat-extract (deterministic, T=0, seed 42) → kb-validate → threat-conflicts`.
**Backbone:** `google/gemini-3-flash-preview`, frozen and zero-shot.
**Raw data:** `reports/data/osint-dirty-robustness-results.json`. It holds all 60 variants with input text, injected fakes, entities, KB findings, rule outcomes and timings.

---

## 1. Question

Earlier evaluations used curated advisories (CISA, Mandiant, MITRE). Open-source intelligence (OSINT) community data is noisier. Typical problems are:
- reposts with malformed indicators;
- benign infrastructure reported as malicious;
- invented technique or CVE IDs;
- unsupported attribution claims;
- spam;
- contradictory replies.

**Can the graph-ontology and symbolic layers automatically identify and filter these fake indicators, and how much real knowledge is lost doing so?**

## 2. Experimental design

### 2.1 Corpus
- **Seeds:** 20 Gold-56 CTI cases, sampled evenly (kev-001…kev-013, mitre-001…mitre-011, chain-002/004, drift-001, jump-001, alias-001, adv-002, ml-ja-001). They contain 86 gold entities.
- **Three variants per seed (60 in total):**
  - **clean:** the original text, `source_type = report`.
  - **low noise:** the seed text wrapped as an "[OSINT repost, unverified]" forum post with **3** injected fake indicators.
  - **high noise:** the same wrapper with **6** fakes, one from each category.
- **Totals:** 180 labelled fakes: 60 in low-noise and 120 in high-noise variants. Both noisy levels use `source_type = forum`, so the preprocessing stage assigns reliability 0.5.

### 2.2 Noise taxonomy (each fake is a labelled string)

| Code | Category | Example injected text | Fake token |
|---|---|---|---|
| N1 | Malformed IOC | "C2 at 312.45.7.19 per my sandbox"; a 33-hex-character "hash"; "CVE-2023-99" | invalid octet / length / format |
| N2 | Benign infrastructure | "beacons resolve to 8.8.8.8"; "payload pulled from 1.1.1.1"; "C2 domain is update.microsoft.com" | public DNS / CDN / vendor domain |
| N3 | Fabricated KB ID | "technique T1999.042"; "CVE-2099-48213"; "ATT&CK T9876" | syntactically valid, non-existent |
| N4 | Unreliable attribution | "An anonymous Telegram poster claims this is ShadowKraken Team, no evidence given." | invented actor |
| N5 | Spam / copypasta | "FREE OrbitHydra RAT 2026 FUD download link in bio!!!" | invented malware or service |
| N6 | Contradictory reply | "Reply: no, this is definitely the Rocket Kitten group…" | real actor, wrong case |

### 2.3 Filtering levels (cumulative)

| Level | What is applied | Implemented where |
|---|---|---|
| **L0 Raw LLM** | Entities emitted by `threat-extract` | Live |
| **L1 + Ontology / KB** | Remove entities that: kb-validate marks hallucinated; have a type outside the STIX/CTI vocabulary; carry an IOC failing identifier hygiene (IPv4 octet ≤ 255, hash length 32/40/64, CVE format, CDN/cloud ASN allow-list, public-DNS and vendor-domain list) | kb-validate is live. The hygiene checks follow `ontology-corroborated-finding-spec.md` §4 and use the project's real allow-list (`src/lib/ontology/cdn-asn-allowlist.ts`), but this study applied them in the scoring script; the live extraction path does not yet apply them |
| **L2 + Symbolic / reliability** | Additionally: R4 confidence floor (≥ 0.4, after confidence × source reliability), plus the R11/R8 logic: a threat-actor node from a low-reliability source (≤ 0.5) with ≤ 1 graph edge and confidence < 0.6 is treated as unsupported | Rule outcomes are live (`threat-conflicts`); the drop decision was applied in the scoring script |

Two KB modes are scored:
- **as-is:** the deployed `kb-validate`.
- **fixed:** a corrected KB lookup (see §4.1), plus one new ontology plausibility constraint: CVE year must be between 1999 and the current year.

### 2.4 Metrics
- **Fake admission rate:** share of injected fakes that survive as entities. Lower is better.
- **Gold recall:** share of the 86 gold entities kept. Measures collateral loss.
- **Precision** against gold: undercounted, because gold lists only key entities.
- **F1.**
- 95 % Wilson intervals throughout.

## 3. Results

### 3.1 Headline: fake admission by filtering level

| Noise | L0 Raw LLM | L1 + Ontology/KB (as-is) | L2 Full (as-is) | L1 (fixed) | **L2 Full (fixed)** |
|---|---|---|---|---|---|
| Low (n = 60 fakes) | 93.3 % [84.1–97.4] | 53.3 % [40.9–65.4] | 13.3 % [6.9–24.2] | 46.7 % [34.6–59.1] | **8.3 % [3.6–18.1]** |
| High (n = 120 fakes) | 82.5 % [74.7–88.3] | 47.5 % [38.8–56.4] | 16.7 % [11.1–24.3] | 42.5 % [34.0–51.4] | **11.7 % [7.1–18.6]** |

**The raw LLM extracts almost all of the noise:** 83–93 % of fakes become graph entities. Graph-native CoT does not filter dirty input by itself. The ontology and KB layer removes roughly half of the fakes, and the symbolic and reliability layer removes most of the rest. The full fixed stack cuts admission by about **90 %** relative to raw extraction (93.3 → 8.3 %; 82.5 → 11.7 %).

### 3.2 Collateral loss and overall quality

| Variant | Level | Gold recall | Precision | F1 |
|---|---|---|---|---|
| clean | L0 | 95.3 % [88.6–98.2] | 60.7 | 74.2 |
| clean | L2 as-is | 82.6 % [73.2–89.1] | 59.4 | 69.1 |
| clean | **L2 fixed** | **95.3 %** | 61.2 | **74.5** |
| low | L0 | 94.2 % | 46.7 | 62.5 |
| low | L2 as-is | 80.2 % | 62.7 | 70.4 |
| low | **L2 fixed** | **93.0 %** [85.6–96.8] | 67.2 | **78.1** |
| high | L0 | 91.9 % | 38.3 | 54.1 |
| high | L2 as-is | 77.9 % | 59.0 | 67.1 |
| high | **L2 fixed** | **90.7 %** [82.7–95.2] | 65.0 | **75.7** |

- **Without filtering, noise cuts F1 by 20 points** (74.2 clean → 54.1 high), mainly through precision (60.7 → 38.3).
- **With the full fixed stack, high-noise F1 (75.7) is back to the clean level (74.5)**, while recall drops by only 4.6 points.
- The **as-is** stack costs about 13 points of gold recall even on *clean* data. Section 4.1 explains why.

### 3.3 Which constraint catches which noise (high noise, fixed KB, n = 20 per category)

| Category | L0 admitted | After ontology/KB (L1) | After symbolic/reliability (L2) | Responsible constraint |
|---|---|---|---|---|
| N1 Malformed IOC | 16/20 | **0/20** | 0/20 | Identifier syntax (octet range, hash length, CVE format) |
| N2 Benign infrastructure | 18/20 | **1/20** | 1/20 | CDN/cloud ASN allow-list + public-DNS/vendor domains |
| N3 Fabricated KB ID | 16/20 | **1/20** (as-is: 7/20) | 1/20 | KB existence (techniques) + CVE-year plausibility |
| N4 Unreliable attribution | 20/20 | 20/20 | **1/20** | Reliability × confidence + weak graph support (R4/R11/R8) |
| N6 Contradictory reply | 20/20 | 20/20 | **2/20** | Same, plus R6 Attribution Contradiction firing in 19/20 high-noise cases |
| N5 Spam / copypasta | 9/20 | 9/20 | **9/20** | **Not caught:** a well-typed invented malware name passes every constraint |

The constraints split into two groups:
- **Identifier-level fakes (N1–N3)** are handled almost entirely by *ontology / KB* constraints. These are deterministic and essentially free.
- **Claim-level fakes (N4, N6)** pass the ontology, because a threat actor is a valid type. They are caught only by *graph-structural and provenance* logic: low source reliability, weak connectivity, contradiction with another attribution.
- **N5 spam is the open gap.** In 9/20 cases the LLM extracted names such as "PhantomVIP Stealer" or "OrbitHydra RAT" as malware with confidence 0.4–0.8. Neither the ontology nor any rule can distinguish an invented but well-typed malware name from a new real one.

### 3.4 Rule-engine reaction to noise (live `threat-conflicts` output)

| Signal (mean per case) | clean | low | high |
|---|---|---|---|
| Source reliability (preprocess) | 0.75 | 0.50 | 0.50 |
| Entities extracted | 7.0 | 8.5 | 10.3 |
| Rules not passing | 1.60 | 3.00 | 3.55 |
| Credibility score | **0.826** | **0.601** | **0.589** |
| R4 Credibility Assessment fired | 0/20 | 19/20 | 20/20 |
| R6 Attribution Contradiction fired | 0/20 | 10/20 | 19/20 |
| R11 Unverified External fired | 3/20 | 7/20 | 13/20 |

Even without dropping anything, the live engine **flags dirty inputs**. Credibility falls by 0.23, and the attribution-contradiction rule fires in almost every high-noise case. So the noisy report is downgraded as a whole, which is the behaviour an analyst queue needs.

### 3.5 Deterministic IOC extractor (preprocess regex)

Of the 90 IOC-shaped fakes (N1–N3), the preprocessing regex picked up 40 as indicators. Applying identifier hygiene to them removes 30, which leaves 10, all `CVE-2099-48213`. The CVE-year plausibility rule removes those as well. This matters because regex-extracted IOCs are what would feed an automated blocklist.

### 3.6 Cost
- About 60 × (one extraction + one KB lookup + one rule pass).
- End-to-end wall time: p50 16.6 s, p95 19.3 s per variant, measured with 6 runs in parallel. This includes all four stages, longer noisy inputs and the conflict-resolution AI call.
- The filtering layers themselves use **no LLM tokens**.

## 4. Defects and gaps found by the experiment

### 4.1 KB lookup truncation (a real bug, as-is mode)
`kb-validate` loads the knowledge base with a single unpaginated `select("*")`. The API caps that at 1,000 rows, but the table holds 2,968: 1,647 CVEs, 714 techniques, 15 tactics, 174 groups and 418 aliases. Because of this, valid techniques such as **T1078, T1059.001, T1486, T1490 and T1550.002 are reported as hallucinated**, even though they are in the database. This single defect explains most of the gap between the as-is and fixed columns:
- **−12.7 points gold recall on clean data**, and
- **6 of the 7** surviving N3 fakes in the as-is high-noise column.

**Fix:** paginate the lookup or filter by ID. This also affects earlier KB-validation and hallucination numbers.

### 4.2 Unknown CVEs are "non-canonical", not "hallucinated"
By design, a CVE missing from the KEV-derived snapshot is only marked non-canonical, because the snapshot is not all of NVD. So `CVE-2099-48213` survives the KB check. A temporal plausibility constraint (year ≤ current year) closes this gap. Checking against full NVD would be stronger.

### 4.3 Preprocess regex accepts invalid IPv4
The IPv4 regex in `threat-preprocess` accepts octets above 255 (e.g. `312.45.7.19`). It also does not apply the CDN allow-list, so `1.1.1.1` and `8.8.8.8` are emitted as IOCs.

### 4.4 Forum "signature stripping" is a double-edged filter
In the first run, all injected comments sat below a `-- comments --` separator, and the forum cleaner treats `--` as an email signature. Everything below it was deleted *before* extraction, so all fakes disappeared, along with any real content placed there. That run is kept as `results_run1_sigstrip` in the working notes but excluded from the tables. It shows that source-specific cleaning heuristics can silently drop content. Cleaning should be logged and reversible, not destructive.

## 5. How graph-ontology constraints filter fake indicators: mechanism summary

| Constraint layer | Graph / ontology principle | Catches | Measured effect (high noise) |
|---|---|---|---|
| Identifier syntax | Every IOC node must satisfy its type's lexical grammar | N1 | 16/20 → 0/20 |
| Benign-infrastructure ontology | IPs in CDN/cloud ASNs cannot create *indicator-match* edges, only behavioural ones | N2 | 18/20 → 1/20 |
| KB existence + temporal plausibility | Technique and CVE nodes must resolve to a real KB entity and a possible date | N3 | 16/20 → 1/20 (fixed) |
| Provenance-weighted confidence | Node confidence = extraction confidence × source reliability; nodes below the floor are dropped | N4, N6 | 40/40 → 3/40 together |
| Graph support | Attribution needs ≥ 2 supporting edges, or a non-forum source | N4, N6 | Included in the row above |
| Contradiction detection (R6) | Two attribution edges for one campaign raise a failure | N6 | Fired in 19/20 high-noise cases |
| *(missing)* Corroboration / novelty | A new malware name should need ≥ 2 independent sources before it becomes a node | N5 | 9/20 survive: **open gap** |

## 6. Recommendations

1. **Fix the KB pagination bug** (§4.1) and re-run the earlier hallucination evaluations.
2. **Move the identifier-hygiene checks into the live path**, in `threat-preprocess` and in a post-extraction filter: IPv4 range, hash length, CVE-year, CDN allow-list.
3. **Add a corroboration rule** for new malware and actor names: if a name is seen in only one low-reliability source, mark it "novel, unconfirmed". It stays out of blocklists and attribution until a second independent source confirms it (see `dynamic-rules-and-novel-apt-defense.md` §4.5). This targets the N5 gap.
4. **Make source-specific cleaning non-destructive:** keep the removed spans and log them.
5. **Scale the study:** all 56 gold cases, several noise seeds, and a *real* OSINT sample (e.g. paste-site or Telegram dumps labelled by an analyst) to complement the synthetic noise.

## 7. Limitations

- **Synthetic noise.** Its patterns are modelled on OSINT but generated from templates. Real community data is more varied (screenshots, defanged formats, multilingual slang).
- **Partly offline filtering.** The L1 hygiene checks and the L2 drop decisions were applied in the scoring script, using project code and project rule semantics. Only the extraction, KB validation and rule outcomes come from the live pipeline. The numbers show what the constraints *can* achieve once wired in, not current production behaviour (except for §3.4).
- **Sample size.** 20 seeds, one run each at T = 0. The confidence intervals are wide, ±5–12 points.
- **Gold-based precision is undercounted**, because gold lists only key entities. Fake admission and gold recall are the reliable metrics here.
- **The fake-matching heuristic** is normalised substring matching, so a few borderline matches are possible.

## 8. Reproduction

1. Seeds: every 2nd CTI case of `src/lib/test-corpus.ts`, first 20.
2. Noise injection: the templates in §2.2, rotated deterministically per case index.
3. Send each variant through the four live functions with `deterministic: true`.
4. Score the levels L0–L2 as described in §2.3 against the injected-fake labels and gold entities.

All inputs and outputs are in `reports/data/osint-dirty-robustness-results.json`.

## Related
`graph-native-boundary-examples.md` · `dynamic-rules-and-novel-apt-defense.md` · `ontology-corroborated-finding-spec.md` · `symbolic-rules-formal-specification.md` · `ablation_update.md` · `engineering_center_report.md`
