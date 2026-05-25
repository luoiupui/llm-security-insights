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
