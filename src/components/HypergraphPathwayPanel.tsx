/**
 * HypergraphPathwayPanel (PH6)
 * --------------------------------------------------------------------
 * Live A/B between Pathway B (triples) and Pathway C (hyperedges)
 * on a user-provided CTI passage. Calls both `extractThreats` and
 * `extractHyperedges`, displays side-by-side counts + arity histogram,
 * and offers an optional "persist this run" action that writes to
 * `kg_pathway_runs` (PH4 schema) so the corpus comparison panel can
 * pick the data up.
 *
 * Scope: CTI only — `extractHyperedges` rejects clinical at the edge
 * function. We surface that explicitly via a dimmed callout when the
 * domain switch is set to clinical.
 */
import { useMemo, useState } from "react";
import { Loader2, GitFork, Play, ArrowRight, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  extractThreats,
  extractHyperedges,
  preprocessText,
  type HyperedgeRecord,
  type ThreatRelation,
} from "@/lib/threat-pipeline";
import { useDomain } from "@/contexts/DomainContext";
import { persistPathwayRun, persistHyperedges } from "@/lib/hyperedge-persistence";

const SAMPLE =
  "On 2025-03-12, APT-29 (linked to SVR) compromised SolarFlare Update Server " +
  "to deploy SUNBURST against the GovCloud tenant in the EU-West region. " +
  "FIN7 also ran a parallel Carbanak spear-phishing campaign targeting US retail finance teams.";

interface RunSnapshot {
  startedAt: string;
  bMs: number;
  cMs: number;
  triples: ThreatRelation[];
  hyperedges: HyperedgeRecord[];
  notes?: string;
}

export function HypergraphPathwayPanel() {
  const { domain } = useDomain();
  const ctiOnly = domain === "cti";
  const [text, setText] = useState(SAMPLE);
  const [label, setLabel] = useState("live-ab");
  const [running, setRunning] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [run, setRun] = useState<RunSnapshot | null>(null);

  const arityHistogram = useMemo(() => {
    if (!run) return [] as { arity: number; count: number }[];
    const buckets = new Map<number, number>();
    for (const h of run.hyperedges) {
      const a = h.node_ids.length;
      buckets.set(a, (buckets.get(a) ?? 0) + 1);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([arity, count]) => ({ arity, count }));
  }, [run]);

  const maxArity = useMemo(() => {
    if (!run || run.hyperedges.length === 0) return 0;
    return Math.max(...run.hyperedges.map(h => h.node_ids.length));
  }, [run]);

  async function handleRun() {
    if (!ctiOnly) {
      toast.error("Pathway C is CTI-only. Switch the domain to CTI to run the A/B.");
      return;
    }
    if (!text.trim()) {
      toast.error("Paste a CTI passage first.");
      return;
    }
    setRunning(true);
    setRun(null);
    try {
      const pre = await preprocessText(text, "auto", "cti");
      const t0 = performance.now();
      const ex = await extractThreats(
        pre.cleaned_text, "full", pre.source_type, pre.reliability_score, "", undefined, "cti",
      );
      const bMs = Math.round(performance.now() - t0);
      const t1 = performance.now();
      const hy = await extractHyperedges(
        pre.cleaned_text, pre.source_type, pre.reliability_score,
      );
      const cMs = Math.round(performance.now() - t1);

      setRun({
        startedAt: new Date().toISOString(),
        bMs,
        cMs,
        triples: ex.re?.relations ?? [],
        hyperedges: hy.hypergraph?.hyperedges ?? [],
        notes: hy.hypergraph?.graph_warnings?.map(w => `${w.type}: ${w.detail}`).join(" | ") || undefined,
      });
      toast.success(`A/B complete — B: ${ex.re?.relations?.length ?? 0} triples · C: ${hy.hypergraph?.hyperedges?.length ?? 0} hyperedges`);
    } catch (e: any) {
      toast.error(e?.message ?? "Pathway run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handlePersist() {
    if (!run) return;
    setPersisting(true);
    try {
      const bRes = await persistPathwayRun({
        source_label: label || "live-ab",
        pathway: "B",
        triples_count: run.triples.length,
        hyperedges_count: 0,
        conflicts_count: 0,
        credibility_score: null,
        latency_ms: run.bMs,
        bench_scores: {},
        notes: "live A/B from KG Construction panel",
      });
      const cRes = await persistPathwayRun({
        source_label: label || "live-ab",
        pathway: "C",
        triples_count: 0,
        hyperedges_count: run.hyperedges.length,
        conflicts_count: 0,
        credibility_score: null,
        latency_ms: run.cMs,
        bench_scores: { avg_arity: avg(run.hyperedges.map(h => h.node_ids.length)) },
        notes: "live A/B from KG Construction panel",
      });
      const hyRes = await persistHyperedges(run.hyperedges, { pathway: "C" });
      const ok = bRes.ok && cRes.ok;
      if (ok) toast.success(`Run persisted (${hyRes.written} hyperedges saved)`);
      else toast.error(`Persist partial: ${bRes.error ?? cRes.error ?? "rls"}`);
    } finally {
      setPersisting(false);
    }
  }

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <GitFork className="h-4 w-4 text-primary" />
            Hypergraph Pathway A/B — B (triples) vs C (n-ary hyperedges)
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">PH6 · CTI only</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!ctiOnly && (
          <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Pathway C is CTI-only. Switch the domain to CTI in the header to enable this A/B.
          </div>
        )}
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          className="font-mono text-xs bg-background/60"
          placeholder="Paste a CTI passage (preferably one with a multi-actor or multi-target event)"
          disabled={running}
        />
        <div className="flex items-center gap-2">
          <Input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="source_label for persistence"
            className="h-8 text-xs font-mono max-w-[240px]"
            disabled={running || persisting}
          />
          <Button
            size="sm"
            onClick={handleRun}
            disabled={running || !ctiOnly}
            className="font-mono"
          >
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {running ? "Running B + C…" : "Run A/B"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePersist}
            disabled={!run || persisting}
            className="font-mono"
          >
            {persisting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Persist run
          </Button>
        </div>

        {run && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <PathwayCard
              label="Pathway B · triples"
              variant="b"
              primary={`${run.triples.length}`}
              primaryLabel="triples emitted"
              latency={run.bMs}
              footer={
                <div className="text-[11px] text-muted-foreground font-mono">
                  binary edges, no joint-participant guarantee
                </div>
              }
            />
            <PathwayCard
              label="Pathway C · hyperedges"
              variant="c"
              primary={`${run.hyperedges.length}`}
              primaryLabel="hyperedges emitted"
              latency={run.cMs}
              footer={
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground font-mono">
                    avg arity {fmt(avg(run.hyperedges.map(h => h.node_ids.length)))} · max {maxArity}
                  </div>
                  {arityHistogram.length > 0 && (
                    <div className="flex items-end gap-1 h-8 pt-1">
                      {arityHistogram.map(b => (
                        <div
                          key={b.arity}
                          className="flex flex-col items-center gap-0.5"
                          title={`arity ${b.arity}: ${b.count}`}
                        >
                          <div
                            className="w-3 bg-primary/70 rounded-sm"
                            style={{ height: `${Math.max(4, (b.count / Math.max(...arityHistogram.map(x => x.count))) * 24)}px` }}
                          />
                          <span className="text-[9px] text-muted-foreground font-mono">{b.arity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              }
            />
          </div>
        )}

        {run && run.hyperedges.length > 0 && (
          <div className="rounded-md border border-border/40 bg-background/40 p-2 mt-2">
            <div className="text-[11px] font-mono text-muted-foreground mb-2 flex items-center gap-1">
              <ArrowRight className="h-3 w-3" /> Pathway C hyperedges (first 4)
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {run.hyperedges.slice(0, 4).map(h => (
                <div key={h.id} className="border-l-2 border-primary/60 pl-2 text-xs">
                  <div className="font-mono text-primary">
                    {h.type}({h.node_ids.length})  ·  conf {fmt(h.confidence)}
                  </div>
                  <div className="text-muted-foreground">
                    [{h.node_ids.join(", ")}]
                  </div>
                  {h.source_passage && (
                    <div className="text-[10px] italic text-muted-foreground/80 mt-0.5">
                      "{truncate(h.source_passage, 160)}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {run?.notes && (
          <div className="text-[11px] font-mono text-amber-500/80">⚠ {run.notes}</div>
        )}
      </CardContent>
    </Card>
  );
}

function PathwayCard({
  label, variant, primary, primaryLabel, latency, footer,
}: {
  label: string;
  variant: "b" | "c";
  primary: string;
  primaryLabel: string;
  latency: number;
  footer: React.ReactNode;
}) {
  const accent = variant === "c" ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background/40";
  return (
    <div className={`rounded-md border ${accent} p-3`}>
      <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className="text-2xl font-mono text-foreground">{primary}</div>
        <div className="text-xs text-muted-foreground">{primaryLabel}</div>
      </div>
      <div className="text-[11px] font-mono text-muted-foreground">latency {latency} ms</div>
      <div className="mt-2">{footer}</div>
    </div>
  );
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function fmt(n: number) { return Number.isFinite(n) ? n.toFixed(2) : "—"; }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
