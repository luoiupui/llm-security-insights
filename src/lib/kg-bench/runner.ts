/**
 * KG-Bench runner — drives the project's existing pipeline as the
 * "system under test" and scores the result against gold annotations.
 * Adapted from LLM-KG-Bench 3.0 (which evaluates an LLM directly); here
 * we evaluate the full Preprocess → Extract → Validate → Conflicts pipeline.
 */

import { preprocessText, extractThreats, extractHyperedges, validateAgainstKB, detectConflicts } from "@/lib/threat-pipeline";
import { scoreTriples, scoreEntityList, scoreOntologyConformance, scoreTurtleRoundtrip, scoreCorroborations, type Triple, type ScoreResult } from "./scorers";
import { getCorpus, type BenchCase, type TaskCategory, CATEGORIES, GOLD_VERSION } from "./corpus";
import { getOntology } from "@/lib/ontology";
import { persistPathwayRun, type Pathway } from "@/lib/hyperedge-persistence";
import type { Domain } from "@/contexts/DomainContext";

/** PH5 — per-pathway metrics carried alongside a CaseResult. */
export interface PathwayMetric {
  f1: number;          // category-specific quality score (atomicity Jaccard / explanation cost ratio)
  cost: number;        // # KG lookups to explain (Cat 11) — 0 elsewhere
  participantsCovered: number;  // Cat 10 — best single-edge coverage
  notes?: string;
}

export interface CaseResult {
  caseId: string;
  category: TaskCategory;
  name: string;
  language?: string;
  score: ScoreResult;
  latencyMs: number;
  predictedEntities: string[];
  predictedTriples: Triple[];
  /** PH5 — populated for `atomicity` and `explanation_cost` cases. */
  pathwayMetrics?: Partial<Record<Pathway, PathwayMetric>>;
  notes?: string;
  error?: string;
}

export interface BenchRun {
  domain: Domain;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  results: CaseResult[];
  perCategory: Record<TaskCategory, { f1: number; n: number }>;
  benchScore: number; // macro F1 across categories with data
  comparisonF1?: number; // vanilla LLM baseline (optional)
}


async function runCase(c: BenchCase, domain: Domain): Promise<CaseResult> {
  const t0 = performance.now();
  try {
    const pre = await preprocessText(c.text, "auto", domain);
    const ex = await extractThreats(
      pre.cleaned_text, "full", pre.source_type, pre.reliability_score, "", undefined, domain,
    );
    const entities = ex.ner?.entities || [];
    const relations = ex.re?.relations || [];
    const causal = ex.causality?.causal_links || [];
    // run validators (do not fail bench if they error)
    try { await validateAgainstKB(entities, relations, causal, pre.cleaned_text); } catch { /* noop */ }
    try { await detectConflicts(entities, relations, causal, pre.reliability_score, ex.graph_native); } catch { /* noop */ }

    const predictedEntities = entities.map(e => e.name);
    const predictedTriples: Triple[] = relations.map(r => ({ s: r.source, p: r.relation, o: r.target }));
    const latencyMs = Math.round(performance.now() - t0);

    let score: ScoreResult;
    let notes = "";
    switch (c.category) {
      case "ontology_conformance": {
        const allowed = getOntology(domain).entityTypes.map(t => t.id);
        const types = entities.map(e => e.type);
        score = scoreOntologyConformance(types, allowed);
        notes = `${score.tp}/${types.length} typed entities conform`;
        break;
      }
      case "serialization": {
        score = scoreTurtleRoundtrip(predictedTriples);
        notes = `${predictedTriples.length} triples serialized`;
        break;
      }
      case "hallucination": {
        // Reward emptiness — F1 = 1 if no facts predicted, decays with extras.
        const k = predictedEntities.length + predictedTriples.length;
        const f = k === 0 ? 1 : Math.max(0, 1 - k / 6);
        score = { precision: f, recall: f, f1: f, tp: 0, fp: k, fn: 0 };
        notes = k === 0 ? "no fabrication" : `${k} unsolicited items`;
        break;
      }
      case "fusion_corroboration": {
        // Phase 3 — extract `corroborates` triples from the pipeline output and
        // match against gold (ttp, flow_ref) pairs. Pre-fusion-job baseline: 0.
        const gold = (c.goldCorroborations ?? []).map(g => ({ ttp: g.ttp, flow_ref: g.flow_ref }));
        const predicted = predictedTriples
          .filter(t => t.p.toLowerCase() === "corroborates")
          .map(t => ({ ttp: t.s, flow_ref: t.o }));
        score = scoreCorroborations(predicted, gold);
        notes = `${predicted.length} corroborates triple(s) vs ${gold.length} gold`;
        break;
      }
      case "atomicity":
      case "explanation_cost": {
        // PH5 — Pathway C (hypergraph) vs Pathway B (triples) comparison.
        // CTI only; for clinical bench, treat as no-data.
        if (domain !== "cti") {
          score = { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 };
          notes = "skipped (CTI-only category)";
          break;
        }
        const pathwayMetrics: Partial<Record<Pathway, PathwayMetric>> = {};
        // Triples-side hyperedge view (Pathway B): cluster by shared subject
        // — the strongest pseudo-reassembly possible without `evidence` tags.
        const bEdges = clusterTriplesAsHyperedges(predictedTriples);
        // Native hyperedges (Pathway C):
        let cEdges: { node_ids: string[] }[] = [];
        try {
          const h = await extractHyperedges(pre.cleaned_text, pre.source_type, pre.reliability_score);
          cEdges = (h.hypergraph?.hyperedges ?? []).map(e => ({ node_ids: e.node_ids }));
        } catch (err: any) {
          notes = `hyperedge extraction failed: ${err?.message ?? "unknown"}`;
        }

        if (c.category === "atomicity") {
          const gold = c.goldHyperedges ?? [];
          const bF1 = atomicityF1(gold, bEdges);
          const cF1 = atomicityF1(gold, cEdges);
          pathwayMetrics.B = { f1: bF1, cost: 0, participantsCovered: bestCoverage(gold, bEdges) };
          pathwayMetrics.C = { f1: cF1, cost: 0, participantsCovered: bestCoverage(gold, cEdges) };
          // Headline score = Pathway C (the system-under-test for Cat 10).
          score = { precision: cF1, recall: cF1, f1: cF1, tp: 0, fp: 0, fn: 0 };
          notes = `B-atomicity=${bF1.toFixed(2)}  C-atomicity=${cF1.toFixed(2)}  (gold n-ary=${gold.length})`;
        } else {
          // explanation_cost
          const q = c.goldExplanation;
          const answer = q?.answer_participants ?? [];
          const bCost = explanationCost(answer, bEdges, predictedTriples.length);
          const cCost = explanationCost(answer, cEdges, 0); // Pathway C: 1 lookup if covered, else fallback
          // Score = 1 - cost_C / max(cost_B, 1), clamped to [0,1]. PH plan hypothesis: C ≤ B/3 → score ≥ 0.67.
          const ratio = bCost > 0 ? cCost / bCost : 1;
          const f = Math.max(0, Math.min(1, 1 - ratio));
          pathwayMetrics.B = { f1: 0, cost: bCost, participantsCovered: bestCoverage([{ node_ids: answer }], bEdges) };
          pathwayMetrics.C = { f1: 1, cost: cCost, participantsCovered: bestCoverage([{ node_ids: answer }], cEdges) };
          score = { precision: f, recall: f, f1: f, tp: 0, fp: 0, fn: 0 };
          notes = `B-cost=${bCost} lookups  C-cost=${cCost} lookups  ratio=${ratio.toFixed(2)}`;
        }

        // Persist per-pathway metrics (best-effort).
        for (const p of ["B", "C"] as Pathway[]) {
          const m = pathwayMetrics[p];
          if (!m) continue;
          void persistPathwayRun({
            source_label: c.id,
            pathway: p,
            triples_count: predictedTriples.length,
            hyperedges_count: p === "C" ? cEdges.length : bEdges.length,
            conflicts_count: 0,
            credibility_score: c.category === "atomicity" ? m.f1 : null,
            latency_ms: Math.round(performance.now() - t0),
            bench_scores: {
              [c.category]: m.f1,
              participants_covered: m.participantsCovered,
              explanation_cost: m.cost,
            },
            notes: notes || undefined,
          }).catch(() => { /* swallow — best effort */ });
        }
        return {
          caseId: c.id, category: c.category, name: c.name, language: c.language,
          score, latencyMs: Math.round(performance.now() - t0),
          predictedEntities, predictedTriples, notes, pathwayMetrics,
        };
      }
      default: {
        // fact_extraction, qa, repair, multilingual → triple + entity F1, averaged
        const tF = scoreTriples(predictedTriples, c.goldTriples);
        const eF = scoreEntityList(predictedEntities, c.goldEntities);
        const f1 = c.goldTriples.length === 0 ? eF.f1 : (tF.f1 + eF.f1) / 2;
        const precision = c.goldTriples.length === 0 ? eF.precision : (tF.precision + eF.precision) / 2;
        const recall = c.goldTriples.length === 0 ? eF.recall : (tF.recall + eF.recall) / 2;
        score = { precision, recall, f1, tp: tF.tp + eF.tp, fp: tF.fp + eF.fp, fn: tF.fn + eF.fn };
      }
    }

    return {
      caseId: c.id, category: c.category, name: c.name, language: c.language,
      score, latencyMs, predictedEntities, predictedTriples, notes,
    };

  } catch (e: any) {
    return {
      caseId: c.id, category: c.category, name: c.name, language: c.language,
      score: { precision: 0, recall: 0, f1: 0, tp: 0, fp: 0, fn: 0 },
      latencyMs: Math.round(performance.now() - t0),
      predictedEntities: [], predictedTriples: [],
      error: e?.message || String(e),
    };
  }
}

export async function runBench(
  domain: Domain,
  selectedIds: string[] | null,
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<BenchRun> {
  const all = getCorpus(domain);
  const cases = selectedIds ? all.filter(c => selectedIds.includes(c.id)) : all;
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  const results: CaseResult[] = [];

  // synthesize a serialization case from the first fact_extraction case
  const serializationSeed = cases.find(c => c.category === "fact_extraction");
  const expandedCases: BenchCase[] = [...cases];
  if (serializationSeed && !cases.some(c => c.category === "serialization")) {
    expandedCases.push({ ...serializationSeed, id: `${serializationSeed.id}-ser`, category: "serialization", name: `${serializationSeed.name} (serialize)` });
  }

  for (let i = 0; i < expandedCases.length; i++) {
    const c = expandedCases[i];
    onProgress?.(i, expandedCases.length, c.name);
    results.push(await runCase(c, domain));
  }
  onProgress?.(expandedCases.length, expandedCases.length, "complete");

  const perCategory: Record<TaskCategory, { f1: number; n: number }> = {} as any;
  for (const cat of CATEGORIES) {
    const rs = results.filter(r => r.category === cat);
    perCategory[cat] = {
      f1: rs.length ? +(rs.reduce((a, b) => a + b.score.f1, 0) / rs.length).toFixed(3) : 0,
      n: rs.length,
    };
  }
  const activeCats = Object.values(perCategory).filter(c => c.n > 0);
  const benchScore = activeCats.length ? +(activeCats.reduce((a, b) => a + b.f1, 0) / activeCats.length).toFixed(3) : 0;
  const finishedAt = new Date().toISOString();
  const totalMs = Math.round(performance.now() - t0);

  return { domain, startedAt, finishedAt, totalMs, results, perCategory, benchScore };
}

export function exportBenchMarkdown(run: BenchRun): string {
  const lines: string[] = [];
  lines.push(`# KG-Bench Report (${run.domain.toUpperCase()})`);
  lines.push(``);
  lines.push(`Generated: ${run.finishedAt}  ·  Duration: ${(run.totalMs / 1000).toFixed(1)}s  ·  Gold version: ${GOLD_VERSION}`);
  lines.push(``);
  lines.push(`**Bench-Score (macro-F1 across categories): ${(run.benchScore * 100).toFixed(1)}**`);
  lines.push(``);
  lines.push(`## Capability Profile`);
  lines.push(``);
  lines.push(`| Category | F1 | N |`);
  lines.push(`|---|---|---|`);
  for (const [cat, v] of Object.entries(run.perCategory)) {
    lines.push(`| ${cat} | ${(v.f1 * 100).toFixed(1)} | ${v.n} |`);
  }
  lines.push(``);
  lines.push(`## Per-Case Results`);
  lines.push(``);
  lines.push(`| Case | Category | F1 | Latency (ms) | Notes |`);
  lines.push(`|---|---|---|---|---|`);
  for (const r of run.results) {
    lines.push(`| ${r.name} | ${r.category} | ${(r.score.f1 * 100).toFixed(1)} | ${r.latencyMs} | ${r.error ? "ERR: " + r.error : (r.notes ?? "")} |`);
  }
  lines.push(``);
  lines.push(`## Methodology`);
  lines.push(``);
  lines.push(`Adapted from LLM-KG-Bench 3.0 (arXiv:2505.13098). Upstream evaluates an LLM call in isolation; this run evaluates the full pipeline (Preprocess → Graph-Native Extract → KB-Validate → Conflicts). Triple matching is case- and punctuation-insensitive over (subject, predicate, object). Hallucination score rewards empty output on no-fact paragraphs. Ontology-conformance scores predicted entity types against the active ${run.domain} ontology.`);
  return lines.join("\n");
}
