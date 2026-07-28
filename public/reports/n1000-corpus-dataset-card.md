# N1K Corpus — Dataset Card (CTI-only)

**Status**: living document. Live counts as of last edit: **166 / 1,000 rows in `bench_cases`** (2026-07-28). Regenerate the Snapshot table by running the SQL in §7.

Related reports:
[`n1000-ingest-runbook.md`](n1000-ingest-runbook.md) ·
[`issue3-n1000-impact-analysis.md`](issue3-n1000-impact-analysis.md) ·
[`issue3-corpus-scaleup-feasibility.md`](issue3-corpus-scaleup-feasibility.md) ·
[`corpus-expansion-and-statistics.md`](corpus-expansion-and-statistics.md).

---

## 1. Purpose (what N1K is and what it is not)

The project uses a **two-corpus model**:

| Corpus | Location | Size | Gold labels? | Used for |
|---|---|---:|:---:|---|
| **Gold eval** | `src/lib/test-corpus.ts` (bundled) | 56 | ✅ | F1 / Precision / Recall, McNemar, Wilson CI, regression gate |
| **N1K ingest** | `public.bench_cases` (DB) | 166 → 1,000 target | ❌ | Throughput, latency, token cost, C3 rule-mining signal, GraphRAG bootstrap, demo persistence |

**N1K cannot replace the gold set for accuracy scoring** — its rows carry no gold triples or hyperedges. The KG-Bench scorers in `src/lib/kg-bench/scorers.ts` require reference triples/hyperedges and therefore run only against the gold-56 set. Any headline F1 in the paper continues to be reported on n=56 with Wilson 95 % CI; N1K contributes scale-side numbers (p50/p95 latency, tokens/sample, throughput, rule-mining recall).

---

## 2. Sources & attribution

Every row in `bench_cases` stores `source_feed`, `source_url`, `publisher`, `license`, `retrieved_at`, `language`, `stratum`, `title`, and `raw_text`. No un-attributed samples are accepted.

| Feed key       | Publisher          | License                     | Adapter (edge fn)                       | Refresh                     | URL pattern                                                     |
|----------------|--------------------|-----------------------------|------------------------------------------|-----------------------------|------------------------------------------------------------------|
| `cisa_kev`     | CISA               | US-Gov Public Domain        | `corpus-ingest-cisa-kev`                 | on-demand (daily upstream)  | `cisa.gov/known-exploited-vulnerabilities-catalog`               |
| `mitre_attack` | MITRE Corporation  | Apache-2.0                  | `corpus-ingest-mitre-groups`             | on-demand (versioned)       | `attack.mitre.org/groups/G####/`                                 |
| `jpcert`       | JPCERT/CC          | attribution-required        | `corpus-ingest-rss` (`feed_id=jpcert`)   | on-demand (weekly upstream) | `jpcert.or.jp/at/`                                               |
| `cncert`       | CNCERT/CC          | attribution-required        | `corpus-ingest-rss` (`feed_id=cncert`)   | on-demand                   | `cert.org.cn/`                                                   |
| `cisco_psirt`  | Cisco PSIRT        | vendor-quote-only           | `corpus-ingest-rss`                      | on-demand                   | `sec.cloudapps.cisco.com/security/center/`                       |
| `fortinet_psirt` | Fortinet PSIRT   | vendor-quote-only           | `corpus-ingest-rss`                      | on-demand                   | `fortiguard.com/psirt`                                           |
| `msrc`         | Microsoft MSRC     | vendor-quote-only           | `corpus-ingest-rss`                      | on-demand                   | `msrc.microsoft.com/update-guide`                                |

Dedup key: `(source_feed, source_url)` — re-ingesting is idempotent.

---

## 3. Content taxonomy (stratum → CTI class)

`stratum` is the primary axis for stratified sampling and per-slice reporting.

| Stratum          | CTI content class                                       | Typical feed(s)                             | Why we want it                                    |
|------------------|----------------------------------------------------------|---------------------------------------------|---------------------------------------------------|
| `kev`            | CVE-anchored exploit chain (known-exploited)             | `cisa_kev`                                  | Grounds facts in a public, dated authority         |
| `apt-narrative`  | Threat-actor / intrusion-set narrative                   | `mitre_attack`                              | Long-form entity + relation density                |
| `psirt`          | Vendor security advisory                                 | `cisco_psirt`, `fortinet_psirt`, `msrc`     | Product-specific mitigation & version scoping      |
| `multilingual`   | Non-English advisory (JA / ZH)                           | `jpcert`, `cncert`                          | Cross-lingual generalisation                       |
| `ics-ot`         | ICS/OT advisory *(planned)*                              | CISA ICS-CERT                               | Non-IT terminology, safety impact                  |
| `adversarial`    | Hard negative / injection / temporal contradiction *(planned)* | curated                                | Robustness & hallucination control                 |

---

## 4. Correlation to gold n=56

N1K is designed to *widen* the strata the gold set already samples — not to duplicate them.

| Gold-56 stratum (from `corpus-expansion-and-statistics.md` §3) | Gold n | N1K stratum that stresses the same signal | N1K live n |
|---|---:|---|---:|
| CTI atomic (MITRE ATT&CK)             | 17 | `apt-narrative`                | 50 |
| CVE-anchored (CISA KEV + PSIRTs)      | 20 | `kev`, `psirt`                 | 50 + 60 |
| Multi-stage / kill-chain / n-ary      | 14 | *(partial — via `apt-narrative`)* | (subset) |
| ICS / OT                              | 2  | `ics-ot` *(planned)*           | 0 |
| Multilingual JA                       | 3  | `multilingual` (jpcert)        | 6 |
| Multilingual ZH                       | 3  | `multilingual` (cncert)        | 0 (feed 403s) |
| Adversarial / hard negatives          | 5  | `adversarial` *(planned)*      | 0 |

**Coverage gaps to close before N=1,000 headline claim:** `ics-ot`, `adversarial`, and CNCERT (blocked upstream — falls back to QiAnXin mirror per feasibility memo).

---

## 5. Usage matrix (which module reads N1K)

| Consumer                                      | Reads N1K? | Reads gold-56? | Notes                                                       |
|-----------------------------------------------|:----------:|:--------------:|-------------------------------------------------------------|
| `bench-schedule` → `bench-worker` (Pathway B/C batch) | ✅ | ⛔ | Fan-out / worker / aggregate; writes `bench_runs`           |
| KG-Bench scorer (`src/lib/kg-bench/scorers.ts`)| ⛔ | ✅ | Needs gold triples/hyperedges                               |
| C3 LLM rule-mining candidates (`kg_conflict_rule_candidates`) | ✅ | ✅ | N1K provides volume; gold provides labeled counter-examples |
| GraphRAG bootstrap (`threat-rag` embeddings)  | ✅ | ✅ | Both feed `threat_reports.embedding`                        |
| Latency / cost instrumentation (`pipeline_perf_events`) | ✅ | ✅ | Same pipeline; N1K provides the larger sample for p50/p95   |
| Single-case demo on **KG Construction** page  | ✅ (via new "N1K batch" tab) | ✅ (via "Curated n=56" tab) | Two-corpus tabs are visually separated                     |
| **Accuracy scoring (F1 / McNemar / Wilson)**  | **⛔** | **✅** | Gold-only, by design                                       |

---

## 6. What N1K deliberately does *not* do

- **No gold labels.** Adding them is a separate annotation project (see feasibility memo §Annotation cost — ~2.5 person-weeks with weak-supervision bootstrap, ~6 without).
- **No fine-tuning.** The pipeline is zero-shot Gemini-3-Flash; "training" reduces to prompt/rule engineering and C3 candidate mining.
- **No PII / PHI / TLP:RED.** Only public-web CTI. Feeds behind auth or TLP restriction are excluded at the adapter layer.

---

## 7. Reproducing the Snapshot

```sql
SELECT source_feed, stratum, language, COUNT(*)
FROM public.bench_cases
GROUP BY 1, 2, 3
ORDER BY 1, 2;

SELECT COUNT(*) AS total FROM public.bench_cases;
SELECT pathway, status, COUNT(*) FROM public.bench_runs GROUP BY 1, 2;
```

Snapshot at 2026-07-28:

```
 source_feed  | stratum        | lang | count
--------------+----------------+------+------
 cisa_kev     | kev            | en   | 50
 cisco_psirt  | psirt          | en   | 30
 jpcert       | multilingual   | en   |  6
 mitre_attack | apt-narrative  | en   | 50
 msrc         | psirt          | en   | 30
Total: 166   bench_runs: 0 (no batch executed yet)
```

---

## 8. Operational next steps

1. Continue ingest via **Experiments → Corpus N1K → Fetch** buttons until each feed reaches the target in the panel.
2. Add the two missing planned strata (`ics-ot`, `adversarial`) — new adapter or hand-curated JSON drop into `bench_cases`.
3. Kick a **Pathway B/C bench run** (`Schedule` → `Run workers` → `Aggregate`) once total ≥500 to publish first N1K-scale throughput and latency table.
4. Continue reporting headline accuracy on gold-56 with Wilson CI; report N1K numbers as scale/cost only.

## References

- CISA KEV — https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- MITRE ATT&CK Enterprise — https://attack.mitre.org/
- JPCERT/CC — https://www.jpcert.or.jp/at/
- CNCERT/CC — https://www.cert.org.cn/
- Wilson (1927), McNemar (1947), Efron & Tibshirani (1993) — cited in `corpus-expansion-and-statistics.md`.
