/**
 * PathwayComparisonPanel (PH6)
 * --------------------------------------------------------------------
 * Reads `kg_pathway_runs` (PH4 schema) and renders the corpus-level
 * B vs C deltas the PH5 KG-Bench runner persists. For each source_label,
 * pairs the most recent B and C rows and shows verdict badges per metric
 * (atomicity, explanation cost). The hypothesis the panel makes
 * falsifiable: **C ≤ B / 3** on explanation cost.
 */
import { useEffect, useMemo, useState } from "react";
import { GitFork, RefreshCw, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchPathwayRuns, type PathwayRunMetrics } from "@/lib/hyperedge-persistence";

interface Pair {
  source_label: string;
  B?: PathwayRunMetrics;
  C?: PathwayRunMetrics;
}

export function PathwayComparisonPanel() {
  const [rows, setRows] = useState<PathwayRunMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await fetchPathwayRuns();
      setRows(r);
      setLoadedAt(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  const pairs = useMemo<Pair[]>(() => {
    // For each source_label, keep the most recent B and most recent C row.
    const byLabel = new Map<string, Pair>();
    for (const r of rows) {
      const p = byLabel.get(r.source_label) ?? { source_label: r.source_label };
      // rows are ordered desc by created_at in fetchPathwayRuns
      if (r.pathway === "B" && !p.B) p.B = r;
      if (r.pathway === "C" && !p.C) p.C = r;
      byLabel.set(r.source_label, p);
    }
    return Array.from(byLabel.values()).sort((a, b) => a.source_label.localeCompare(b.source_label));
  }, [rows]);

  const aggregates = useMemo(() => {
    const atom: { B: number[]; C: number[] } = { B: [], C: [] };
    const cost: { B: number[]; C: number[] } = { B: [], C: [] };
    for (const p of pairs) {
      const bA = bench(p.B, "atomicity");
      const cA = bench(p.C, "atomicity");
      if (bA != null) atom.B.push(bA);
      if (cA != null) atom.C.push(cA);
      const bC = bench(p.B, "explanation_cost");
      const cC = bench(p.C, "explanation_cost");
      if (bC != null) cost.B.push(bC);
      if (cC != null) cost.C.push(cC);
    }
    return {
      atomicityB: mean(atom.B),
      atomicityC: mean(atom.C),
      costB: mean(cost.B),
      costC: mean(cost.C),
      n: pairs.length,
    };
  }, [pairs]);

  const costRatio = aggregates.costB > 0 ? aggregates.costC / aggregates.costB : null;
  const costVerdict =
    costRatio == null ? "no data"
    : costRatio <= 1 / 3 ? "C wins (≤ B/3)"
    : costRatio < 1 ? "C cheaper, hypothesis NOT met"
    : "C not cheaper";

  const atomDelta = aggregates.atomicityC - aggregates.atomicityB;
  const atomVerdict =
    aggregates.atomicityB === 0 && aggregates.atomicityC === 0 ? "no data"
    : atomDelta > 0.1 ? "C wins (atomic n-ary preserved)"
    : atomDelta < -0.05 ? "B unexpectedly wins"
    : "tie";

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <GitFork className="h-4 w-4 text-primary" />
            Pathway B vs C — corpus comparison (kg_pathway_runs)
          </span>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">PH6 · falsifiable</Badge>
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-7 font-mono text-xs">
              {loading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Reload
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pairs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/50 p-4 text-center text-xs text-muted-foreground">
            No persisted pathway runs yet. Run KG-Bench (Cat 10 / 11 cases) or use the live A/B panel on the
            KG Construction page and click <span className="font-mono text-foreground">Persist run</span>.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <VerdictCard
                title="Atomicity (Cat 10)"
                bValue={aggregates.atomicityB}
                cValue={aggregates.atomicityC}
                format={pct}
                verdict={atomVerdict}
                hypothesis="C ≥ B + 0.10"
                positive={atomDelta > 0.1}
              />
              <VerdictCard
                title="Explanation cost (Cat 11)"
                bValue={aggregates.costB}
                cValue={aggregates.costC}
                format={n => fmt(n) + " lookups"}
                verdict={costVerdict}
                hypothesis="C ≤ B / 3"
                positive={costRatio != null && costRatio <= 1 / 3}
              />
            </div>

            <div className="rounded-md border border-border/40 overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left px-2 py-1.5">source_label</th>
                    <th className="text-right px-2 py-1.5">B triples</th>
                    <th className="text-right px-2 py-1.5">C hyperedges</th>
                    <th className="text-right px-2 py-1.5">B atom</th>
                    <th className="text-right px-2 py-1.5">C atom</th>
                    <th className="text-right px-2 py-1.5">B cost</th>
                    <th className="text-right px-2 py-1.5">C cost</th>
                    <th className="text-right px-2 py-1.5">B ms / C ms</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map(p => (
                    <tr key={p.source_label} className="border-t border-border/40">
                      <td className="px-2 py-1.5 text-foreground">{p.source_label}</td>
                      <td className="px-2 py-1.5 text-right">{p.B?.triples_count ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right">{p.C?.hyperedges_count ?? "—"}</td>
                      <td className="px-2 py-1.5 text-right">{cell(bench(p.B, "atomicity"), pct)}</td>
                      <td className="px-2 py-1.5 text-right">{cell(bench(p.C, "atomicity"), pct)}</td>
                      <td className="px-2 py-1.5 text-right">{cell(bench(p.B, "explanation_cost"), fmt)}</td>
                      <td className="px-2 py-1.5 text-right">{cell(bench(p.C, "explanation_cost"), fmt)}</td>
                      <td className="px-2 py-1.5 text-right text-muted-foreground">
                        {p.B?.latency_ms ?? "—"} / {p.C?.latency_ms ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground text-right">
              {aggregates.n} paired source{aggregates.n === 1 ? "" : "s"} · last loaded {loadedAt ?? "—"}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VerdictCard({
  title, bValue, cValue, format, verdict, hypothesis, positive,
}: {
  title: string;
  bValue: number;
  cValue: number;
  format: (n: number) => string;
  verdict: string;
  hypothesis: string;
  positive: boolean;
}) {
  const tone = verdict === "no data"
    ? "border-border/40 bg-background/40 text-muted-foreground"
    : positive
    ? "border-primary/60 bg-primary/10"
    : "border-amber-500/40 bg-amber-500/5";
  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="flex items-baseline gap-3 mt-1">
        <div className="text-xs font-mono">
          <div className="text-muted-foreground">Pathway B</div>
          <div className="text-base text-foreground">{format(bValue)}</div>
        </div>
        <div className="text-xs font-mono">
          <div className="text-muted-foreground">Pathway C</div>
          <div className="text-base text-foreground">{format(cValue)}</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] font-mono">
        <span className="text-muted-foreground">hypothesis </span>
        <span className="text-foreground">{hypothesis}</span>
      </div>
      <div className="text-[11px] font-mono">
        <span className="text-muted-foreground">verdict </span>
        <span className={positive ? "text-primary" : verdict === "no data" ? "text-muted-foreground" : "text-amber-500"}>
          {verdict}
        </span>
      </div>
    </div>
  );
}

function bench(m: PathwayRunMetrics | undefined, key: string): number | null {
  if (!m) return null;
  const v = m.bench_scores?.[key];
  return typeof v === "number" ? v : null;
}
function cell(v: number | null, f: (n: number) => string): string { return v == null ? "—" : f(v); }
function mean(xs: number[]): number { return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length; }
function fmt(n: number): string { return Number.isFinite(n) ? n.toFixed(2) : "—"; }
function pct(n: number): string { return Number.isFinite(n) ? (n * 100).toFixed(1) + "%" : "—"; }
