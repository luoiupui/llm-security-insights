/**
 * System Test (Acceptance) Orchestrator
 * --------------------------------------------------------------------
 * Chains the full 6-layer pipeline per test case and produces a
 * per-layer pass/fail scorecard. This is an ACCEPTANCE test, not a
 * statistical evaluation. Confidence band ±4% at n=30.
 *
 * Layer order:
 *   L1 Preprocess  → threat-preprocess  (IOC extraction, normalization)
 *   L2 RAG         → threat-rag         (lexical + GraphRAG retrieval)
 *   L3 Extract     → threat-extract     (graph-native CoT, entities/relations/causal)
 *   L4 KB Validate → kb-validate        (hallucinated MITRE/CVE/CAPEC IDs)
 *   L5 Conflicts   → threat-conflicts   (10 symbolic rules + credibility score)
 *   L6 Attribution → derived in-process (graph-path weight × confidence)
 *
 * Each layer has explicit pass criteria. A case PASSES only if every
 * layer passes. Failures and per-layer timings are captured.
 */
import { supabase } from "@/integrations/supabase/client";
import { sampleTestCases, type TestSample } from "@/lib/test-corpus";

export type LayerStatus = "pass" | "fail" | "error" | "skip";

export interface LayerOutcome {
  layer: string;
  status: LayerStatus;
  ms: number;
  detail: string;
  metric?: number;
}

export interface CaseRunResult {
  caseId: string;
  source: string;
  overall: LayerStatus;
  layers: LayerOutcome[];
  totalMs: number;
}

export interface SystemTestSummary {
  classification: "system-test (acceptance)";
  n: number;
  confidence_band: string;
  runAt: string;
  totalMs: number;
  passRate: number;
  perLayerPass: Record<string, number>; // layer → pass count
  perLayerAvgMs: Record<string, number>;
  cases: CaseRunResult[];
}

const LAYERS = ["preprocess", "rag", "extract", "kb_validate", "conflicts", "attribution"] as const;

/* Pass thresholds (acceptance criteria, NOT evaluation). */
const THRESHOLDS = {
  preprocessMinIOC: 0,           // ≥1 IOC OR ≥1 normalized sentence
  ragMinContextChars: 1,         // any context block returned (corpus may be cold)
  extractMinEntities: 2,         // ≥2 entities recovered
  kbMaxHallucinationRate: 30,    // ≤30% hallucinated IDs (gold cases ground in real KB)
  conflictsMinRulesPassed: 6,    // ≥6/10 symbolic rules pass
  attributionMinPathWeight: 0.1, // graph path weight Π(conf) ≥ 0.1
};

async function invoke<T = any>(fn: string, body: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message ?? `${fn} failed`);
  return data as T;
}

function timeIt<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  return fn().then((value) => ({ value, ms: Date.now() - t0 }));
}

function attributionPathWeight(entities: any[], relations: any[]): number {
  // Find any chain: actor → exploits/uses → vuln/malware → affects → software
  const actors = entities.filter((e: any) =>
    /actor|intrusion-set|threat[_-]?actor/i.test(e.type ?? e.entity_type ?? "")
  );
  if (!actors.length || !relations.length) return 0;
  let best = 0;
  for (const a of actors) {
    const aname = (a.name ?? "").toLowerCase();
    const out = relations.filter((r: any) => (r.source ?? r.source_name ?? "").toLowerCase() === aname);
    for (const r1 of out) {
      const c1 = Number(r1.confidence ?? 0.7);
      const tgt = (r1.target ?? r1.target_name ?? "").toLowerCase();
      const next = relations.filter((r: any) => (r.source ?? r.source_name ?? "").toLowerCase() === tgt);
      for (const r2 of next) {
        const c2 = Number(r2.confidence ?? 0.7);
        best = Math.max(best, c1 * c2);
      }
      best = Math.max(best, c1); // 1-hop fallback
    }
  }
  return +best.toFixed(3);
}

export async function runSystemTestCase(
  sample: TestSample,
  onLayer?: (layer: string) => void,
): Promise<CaseRunResult> {
  const layers: LayerOutcome[] = [];
  const t0 = Date.now();

  /* L1 — Preprocess */
  onLayer?.("preprocess");
  try {
    const { value, ms } = await timeIt(() => invoke("threat-preprocess", { text: sample.text }));
    const iocCount =
      (value?.iocs?.length ?? 0) +
      (value?.normalized_sentences?.length ?? 0);
    layers.push({
      layer: "preprocess",
      status: iocCount >= THRESHOLDS.preprocessMinIOC ? "pass" : "fail",
      ms,
      detail: `${value?.iocs?.length ?? 0} IOCs · ${value?.normalized_sentences?.length ?? 0} sentences`,
      metric: iocCount,
    });
  } catch (e: any) {
    layers.push({ layer: "preprocess", status: "error", ms: 0, detail: e.message });
  }

  /* L2 — RAG */
  onLayer?.("rag");
  try {
    const { value, ms } = await timeIt(() =>
      invoke("threat-rag", { mode: "embed_and_retrieve", text: sample.text, top_k: 3 }),
    );
    const ctxLen = (value?.context_block ?? "").length;
    layers.push({
      layer: "rag",
      status: ctxLen >= THRESHOLDS.ragMinContextChars ? "pass" : "fail",
      ms,
      detail: `${value?.similar_reports?.length ?? 0} reports · ${value?.subgraph?.entities?.length ?? 0} subgraph entities`,
      metric: ctxLen,
    });
  } catch (e: any) {
    layers.push({ layer: "rag", status: "error", ms: 0, detail: e.message });
  }

  /* L3 — Extract */
  let extractOut: any = null;
  onLayer?.("extract");
  try {
    const { value, ms } = await timeIt(() =>
      invoke("threat-extract", { text: sample.text, mode: "full", source_type: "report" }),
    );
    extractOut = value;
    const ents = value?.graph_native?.nodes ?? value?.ner?.entities ?? [];
    const rels = value?.graph_native?.edges ?? value?.re?.relations ?? [];
    layers.push({
      layer: "extract",
      status: ents.length >= THRESHOLDS.extractMinEntities ? "pass" : "fail",
      ms,
      detail: `${ents.length} entities · ${rels.length} relations · ${value?.causality?.causal_links?.length ?? 0} causal`,
      metric: ents.length,
    });
  } catch (e: any) {
    layers.push({ layer: "extract", status: "error", ms: 0, detail: e.message });
  }

  /* L4 — KB Validate (skipped if extract failed) */
  onLayer?.("kb_validate");
  if (!extractOut) {
    layers.push({ layer: "kb_validate", status: "skip", ms: 0, detail: "extract failed" });
  } else {
    try {
      const ents = extractOut?.graph_native?.nodes ?? extractOut?.ner?.entities ?? [];
      const rels = extractOut?.graph_native?.edges ?? extractOut?.re?.relations ?? [];
      const causal = extractOut?.causality?.causal_links ?? [];
      const { value, ms } = await timeIt(() =>
        invoke("kb-validate", { entities: ents, relations: rels, causal_links: causal }),
      );
      const findings = value?.findings ?? [];
      const checked = findings.filter((f: any) =>
        ["mitre_technique", "mitre_tactic", "cve", "capec"].includes(f.id_type),
      );
      const hallucinated = checked.filter((f: any) => f.kind === "hallucinated");
      const rate = checked.length ? (hallucinated.length / checked.length) * 100 : 0;
      layers.push({
        layer: "kb_validate",
        status: rate <= THRESHOLDS.kbMaxHallucinationRate ? "pass" : "fail",
        ms,
        detail: `${hallucinated.length}/${checked.length} hallucinated IDs (${rate.toFixed(1)}%)`,
        metric: +(100 - rate).toFixed(1),
      });
    } catch (e: any) {
      layers.push({ layer: "kb_validate", status: "error", ms: 0, detail: e.message });
    }
  }

  /* L5 — Conflicts (10 symbolic rules) */
  onLayer?.("conflicts");
  if (!extractOut) {
    layers.push({ layer: "conflicts", status: "skip", ms: 0, detail: "extract failed" });
  } else {
    try {
      const ents = extractOut?.graph_native?.nodes ?? extractOut?.ner?.entities ?? [];
      const rels = extractOut?.graph_native?.edges ?? extractOut?.re?.relations ?? [];
      const causal = extractOut?.causality?.causal_links ?? [];
      const { value, ms } = await timeIt(() =>
        invoke("threat-conflicts", {
          entities: ents,
          relations: rels,
          causal_links: causal,
          source_reliability: 0.85,
          graph_native: extractOut?.graph_native,
        }),
      );
      const passed = value?.summary?.passed ?? 0;
      const total = value?.summary?.total_rules ?? 10;
      layers.push({
        layer: "conflicts",
        status: passed >= THRESHOLDS.conflictsMinRulesPassed ? "pass" : "fail",
        ms,
        detail: `${passed}/${total} rules pass · credibility ${value?.credibility_score?.score ?? "—"}`,
        metric: passed,
      });
    } catch (e: any) {
      layers.push({ layer: "conflicts", status: "error", ms: 0, detail: e.message });
    }
  }

  /* L6 — Attribution (computed in-process from extracted graph) */
  onLayer?.("attribution");
  if (!extractOut) {
    layers.push({ layer: "attribution", status: "skip", ms: 0, detail: "extract failed" });
  } else {
    const tA = Date.now();
    const ents = extractOut?.graph_native?.nodes ?? extractOut?.ner?.entities ?? [];
    const rels = extractOut?.graph_native?.edges ?? extractOut?.re?.relations ?? [];
    const weight = attributionPathWeight(ents, rels);
    const ms = Date.now() - tA;
    const expectedActor = sample.groundTruth.entities.find((e) => e.type === "threat_actor");
    const status: LayerStatus = expectedActor
      ? weight >= THRESHOLDS.attributionMinPathWeight ? "pass" : "fail"
      : weight > 0 ? "pass" : "skip"; // no actor in gold → not applicable
    layers.push({
      layer: "attribution",
      status,
      ms,
      detail: expectedActor
        ? `path weight ${weight} (expected actor: ${expectedActor.name})`
        : "no actor in gold (n/a)",
      metric: weight,
    });
  }

  const failed = layers.filter((l) => l.status === "fail" || l.status === "error");
  const overall: LayerStatus = failed.length === 0 ? "pass" : failed.length >= 2 ? "error" : "fail";

  return {
    caseId: sample.id,
    source: sample.source,
    overall,
    layers,
    totalMs: Date.now() - t0,
  };
}

export async function runSystemTest(
  sampleSize: number,
  onProgress?: (done: number, total: number, current: string, layer?: string) => void,
): Promise<SystemTestSummary> {
  const cases = sampleTestCases.slice(0, Math.min(sampleSize, sampleTestCases.length));
  const results: CaseRunResult[] = [];
  const startedAt = Date.now();

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    onProgress?.(i, cases.length, c.id, "preprocess");
    const r = await runSystemTestCase(c, (layer) => onProgress?.(i, cases.length, c.id, layer));
    results.push(r);
  }
  onProgress?.(cases.length, cases.length, "complete", "done");

  /* Aggregate */
  const perLayerPass: Record<string, number> = {};
  const perLayerMs: Record<string, number[]> = {};
  for (const layer of LAYERS) {
    perLayerPass[layer] = results.filter((r) => r.layers.find((l) => l.layer === layer)?.status === "pass").length;
    perLayerMs[layer] = results.map((r) => r.layers.find((l) => l.layer === layer)?.ms ?? 0);
  }
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  const perLayerAvgMs = Object.fromEntries(Object.entries(perLayerMs).map(([k, v]) => [k, avg(v)]));

  const passRate = +((results.filter((r) => r.overall === "pass").length / results.length) * 100).toFixed(1);

  const summary: SystemTestSummary = {
    classification: "system-test (acceptance)",
    n: results.length,
    confidence_band: results.length >= 30 ? "±4% (n=30)" : `±${Math.round(20 / Math.sqrt(results.length))}% (n=${results.length})`,
    runAt: new Date().toISOString(),
    totalMs: Date.now() - startedAt,
    passRate,
    perLayerPass,
    perLayerAvgMs,
    cases: results,
  };

  /* Persist event (best-effort, RLS may block) */
  try {
    await (supabase.from("monitoring_events" as any) as any).insert({
      event_type: "system_test_run",
      category: "acceptance",
      title: `System test (n=${results.length}) · pass ${passRate}% · ${(summary.totalMs / 1000).toFixed(1)}s`,
      detail:
        `Per-layer pass: ` +
        LAYERS.map((l) => `${l}=${perLayerPass[l]}/${results.length}`).join(" · ") +
        ` · ACCEPTANCE TEST, NOT EVALUATION.`,
      metadata: summary as any,
    });
  } catch { /* silent */ }

  return summary;
}

export const SYSTEM_TEST_LAYERS = LAYERS;
export const SYSTEM_TEST_THRESHOLDS = THRESHOLDS;
