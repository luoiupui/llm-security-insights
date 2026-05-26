/**
 * KG-Bench scorers — adapted from LLM-KG-Bench 3.0 (arxiv 2505.13098v1).
 * Upstream scores an LLM in isolation. Here we score the whole pipeline output
 * (entities/relations/triples) against a curated gold set.
 */

export interface Triple { s: string; p: string; o: string }
export interface ScoreResult {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]+/g, "").trim();
const tripleKey = (t: Triple) => `${norm(t.s)}|${norm(t.p)}|${norm(t.o)}`;

export function scoreTriples(predicted: Triple[], gold: Triple[]): ScoreResult {
  const pSet = new Set(predicted.map(tripleKey));
  const gSet = new Set(gold.map(tripleKey));
  let tp = 0;
  pSet.forEach(k => { if (gSet.has(k)) tp++; });
  const fp = pSet.size - tp;
  const fn = gSet.size - tp;
  const precision = pSet.size ? tp / pSet.size : 0;
  const recall = gSet.size ? tp / gSet.size : 0;
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn };
}

export function scoreEntityList(predicted: string[], gold: string[]): ScoreResult {
  return scoreTriples(
    predicted.map(x => ({ s: x, p: "is", o: "entity" })),
    gold.map(x => ({ s: x, p: "is", o: "entity" })),
  );
}

/** Ontology conformance: fraction of predicted types found in the allowed vocab. */
export function scoreOntologyConformance(predictedTypes: string[], allowed: string[]): ScoreResult {
  const allow = new Set(allowed.map(norm));
  const tp = predictedTypes.filter(t => allow.has(norm(t))).length;
  const fp = predictedTypes.length - tp;
  const precision = predictedTypes.length ? tp / predictedTypes.length : 1;
  // recall not meaningful here; report precision as f1 proxy
  return { precision, recall: precision, f1: precision, tp, fp, fn: 0 };
}

/** Turtle serialization smoke check: parse predicates roundtrip. */
export function scoreTurtleRoundtrip(triples: Triple[]): ScoreResult {
  // emit toy Turtle, then "parse" by regex-extracting <s> <p> <o> .
  const ttl = triples.map(t =>
    `<urn:e:${encodeURIComponent(t.s)}> <urn:p:${encodeURIComponent(t.p)}> <urn:e:${encodeURIComponent(t.o)}> .`,
  ).join("\n");
  const re = /<urn:e:([^>]+)>\s+<urn:p:([^>]+)>\s+<urn:e:([^>]+)>\s+\./g;
  const parsed: Triple[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(ttl))) {
    parsed.push({ s: decodeURIComponent(m[1]), p: decodeURIComponent(m[2]), o: decodeURIComponent(m[3]) });
  }
  return scoreTriples(parsed, triples);
}

/* ──────────────────────────────────────────────────────────────────────
 * KG-Bench Category 8 — Redaction (forward port from white paper §9)
 * Bench-Score-8 = 0.5·F1 + 0.3·utility − 0.2·over_redaction_rate
 * ────────────────────────────────────────────────────────────────────── */

export interface RedactionSpan { start: number; end: number; axis?: string; rule_id?: string; action?: string }
export interface RedactionScore extends ScoreResult {
  overRedaction: number;   // fraction of predicted spans not in gold (≈ FP rate)
  utility: number;         // 1 − fraction of doc area masked (proxy for downstream usability)
  benchScore: number;      // composite per rubric
  skipped: number;         // gold spans that fell inside a masked region (skip-counter)
}

/** Span overlap predicate — any character overlap counts as a match. */
function overlaps(a: RedactionSpan, b: RedactionSpan) {
  return a.start < b.end && b.start < a.end;
}

export function scoreRedactionSpans(
  predicted: RedactionSpan[],
  gold: RedactionSpan[],
  docLength?: number,
): RedactionScore {
  const matchedGold = new Set<number>();
  let tp = 0;
  for (const p of predicted) {
    const gi = gold.findIndex((g, i) => !matchedGold.has(i) && overlaps(p, g));
    if (gi >= 0) { tp++; matchedGold.add(gi); }
  }
  const fp = predicted.length - tp;
  const fn = gold.length - matchedGold.size;
  const precision = predicted.length ? tp / predicted.length : (gold.length === 0 ? 1 : 0);
  const recall = gold.length ? tp / gold.length : 1;
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : (gold.length === 0 && predicted.length === 0 ? 1 : 0);

  const overRedaction = predicted.length ? fp / predicted.length : 0;
  const maskedChars = predicted.reduce((s, p) => s + Math.max(0, p.end - p.start), 0);
  const len = docLength ?? Math.max(1, ...predicted.map(p => p.end), ...gold.map(g => g.end));
  const utility = Math.max(0, 1 - maskedChars / len);
  const benchScore = Math.max(0, 0.5 * f1 + 0.3 * utility - 0.2 * overRedaction);

  return { precision, recall, f1, tp, fp, fn, overRedaction, utility, benchScore, skipped: matchedGold.size };
}
