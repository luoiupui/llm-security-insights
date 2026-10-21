# Dirty-Data Robustness Experiment v2 (re-run after the KB fix)

## Status of the fix (done)
- The live knowledge-base check now loads all 2,968 entries (it used to stop at 1,000).
- Live test: T1486, T1078, T1059.001 now pass as "ok"; the fake T1999.042 is still flagged "hallucinated".

## Step 1 — Move the remaining filters into the live pipeline
Version 1 applied these filters only in the scoring script. They become part of the live check, so v2 measures the real system:
- Indicator format checks: IPv4 octets 0–255, hash length 32/40/64, CVE format.
- Harmless-infrastructure list: public DNS, CDN/cloud ranges, vendor update domains.
- CVE-year check: no future years, and an unknown CVE is flagged "hallucinated" rather than "non-canonical".
- Reliability drop: a low-reliability actor with weak graph support and low confidence is marked unsupported (R4/R11/R8).
- Fix the extraction step so it stops accepting invalid IPs such as 312.x.x.x.
- Add small tests for each rule, for example 312.1.1.1 rejected, 8.8.8.8 marked harmless, CVE-2099-x rejected, T1486 accepted.

## Step 2 — Re-run the experiment
- Same 20 gold cases, same 60 variants (clean / low / high noise), same 6 noise types, same 180 fakes. Settings fixed: T=0, seed 42.
- Run every variant through the live pipeline: preprocess → extract → kb-validate → conflicts.
- Score three levels: L0 raw LLM, L1 + ontology/KB, L2 + symbolic/reliability, all taken from live output.
- Optional extra: a fourth level, L3, with a two-source rule for new malware names, aimed at the N5 spam gap.
- Cost: about 180–240 AI calls (roughly 60–80 credits), about 40 minutes.

## Step 3 — New report
- New report v2 (v1 stays unchanged as the historical record).
- Tables: test design, fakes admitted per level with 95% Wilson CIs, gold recall / precision / F1, results per noise type, pipeline signals.
- A v1-vs-v2 comparison table, showing which numbers were script-only before and are live now.
- Raw results saved as a new data file; both added to the reports list.

## Technical details
- Filters are added to `kb-validate` and `threat-preprocess`; rule tests sit next to the existing tests.
- Changes are additive: no database changes, and the model stays frozen (zero-shot).
