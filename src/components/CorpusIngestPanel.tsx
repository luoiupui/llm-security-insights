/**
 * CorpusIngestPanel — Phase N1K GUI.
 * Drives the N=1000 corpus scale-up: per-source ingest buttons, run scheduler
 * for Pathway B/C, live status polling, and aggregate results.
 *
 * CTI-only. All operations go through Lovable Cloud edge functions:
 *   corpus-ingest-{cisa-kev,mitre-groups,rss}, bench-{schedule,worker,aggregate}.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDomain } from "@/contexts/DomainContext";
import {
  Download, Play, RefreshCw, ExternalLink, Database, ListChecks,
} from "lucide-react";

type SourceRow = {
  id: string;                 // internal key
  label: string;
  publisher: string;
  license: string;
  target: number;
  fn: string;                 // edge-function name
  payload: Record<string, unknown>;
  feedKey: string;            // source_feed value in DB
};

const SOURCES: SourceRow[] = [
  { id: "cisa_kev", label: "CISA KEV", publisher: "CISA",
    license: "US-Gov Public Domain", target: 300,
    fn: "corpus-ingest-cisa-kev", payload: { limit: 50 }, feedKey: "cisa_kev" },
  { id: "mitre_attack", label: "MITRE ATT&CK Groups", publisher: "MITRE Corporation",
    license: "Apache-2.0", target: 150,
    fn: "corpus-ingest-mitre-groups", payload: { limit: 50 }, feedKey: "mitre_attack" },
  { id: "jpcert", label: "JPCERT/CC", publisher: "JPCERT/CC",
    license: "attribution-required", target: 120,
    fn: "corpus-ingest-rss", payload: { feed_id: "jpcert", limit: 30 }, feedKey: "jpcert" },
  { id: "cncert", label: "CNCERT/CC (ZH)", publisher: "CNCERT/CC",
    license: "attribution-required", target: 100,
    fn: "corpus-ingest-rss", payload: { feed_id: "cncert", limit: 30 }, feedKey: "cncert" },
  { id: "cisco_psirt", label: "Cisco PSIRT", publisher: "Cisco PSIRT",
    license: "vendor-quote-only", target: 60,
    fn: "corpus-ingest-rss", payload: { feed_id: "cisco_psirt", limit: 30 }, feedKey: "cisco_psirt" },
  { id: "fortinet_psirt", label: "Fortinet PSIRT", publisher: "Fortinet PSIRT",
    license: "vendor-quote-only", target: 60,
    fn: "corpus-ingest-rss", payload: { feed_id: "fortinet_psirt", limit: 30 }, feedKey: "fortinet_psirt" },
  { id: "msrc", label: "Microsoft MSRC", publisher: "Microsoft MSRC",
    license: "vendor-quote-only", target: 60,
    fn: "corpus-ingest-rss", payload: { feed_id: "msrc", limit: 30 }, feedKey: "msrc" },
];

const TARGET_TOTAL = SOURCES.reduce((n, s) => n + s.target, 0); // 850+ ≈ 1,000 with headroom

export function CorpusIngestPanel() {
  const { toast } = useToast();
  const { domain } = useDomain();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [pathwayB, setPathwayB] = useState(true);
  const [pathwayC, setPathwayC] = useState(false);
  const [sample, setSample] = useState<number>(50);
  const [runBatch, setRunBatch] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    queued: number; running: number; done: number; error: number;
  }>({ queued: 0, running: 0, done: 0, error: 0 });
  const [aggregate, setAggregate] = useState<any | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const refreshCounts = useCallback(async () => {
    const { data } = await supabase
      .from("bench_cases")
      .select("source_feed");
    const c: Record<string, number> = {};
    for (const r of data ?? []) c[r.source_feed] = (c[r.source_feed] ?? 0) + 1;
    setCounts(c);
  }, []);
  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const totalInDb = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);

  const runIngest = async (src: SourceRow) => {
    setBusy(src.id);
    try {
      const { data, error } = await supabase.functions.invoke(src.fn, { body: src.payload });
      if (error) throw error;
      toast({
        title: `${src.label}: +${data?.inserted ?? 0}`,
        description: data?.note ?? `Attribution stored (publisher, URL, license, retrieved_at).`,
      });
      await refreshCounts();
    } catch (e) {
      toast({
        title: `${src.label} ingest failed`,
        description: e instanceof Error ? e.message : "unknown",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const startRun = async () => {
    const pathways = [pathwayB && "B", pathwayC && "C"].filter(Boolean) as string[];
    if (pathways.length === 0) {
      toast({ title: "Pick at least one pathway", variant: "destructive" });
      return;
    }
    setScheduling(true);
    setAggregate(null);
    try {
      const { data, error } = await supabase.functions.invoke("bench-schedule", {
        body: { batch_size: sample, pathways },
      });
      if (error) throw error;
      setRunBatch(data.run_batch);
      toast({
        title: `Bench run scheduled`,
        description: `${data.queued} tasks queued (batch ${String(data.run_batch).slice(0, 8)}…)`,
      });
    } catch (e) {
      toast({ title: "Schedule failed", description: e instanceof Error ? e.message : "unknown",
        variant: "destructive" });
    } finally {
      setScheduling(false);
    }
  };

  // Poll bench_runs while a run is active.
  useEffect(() => {
    if (!runBatch) return;
    let cancelled = false;
    const tick = async () => {
      const { data } = await supabase.from("bench_runs")
        .select("status").eq("run_batch", runBatch);
      if (cancelled) return;
      const s = { queued: 0, running: 0, done: 0, error: 0 };
      for (const r of data ?? []) s[r.status as keyof typeof s]++;
      setStatus(s);
      if (s.queued === 0 && s.running === 0 && (data?.length ?? 0) > 0) {
        // finished — pull aggregate once
        const { data: agg } = await supabase.functions.invoke("bench-aggregate", {
          body: { run_batch: runBatch },
        });
        if (!cancelled) setAggregate(agg);
      }
    };
    tick();
    const int = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(int); };
  }, [runBatch]);

  const downloadJson = () => {
    if (!aggregate) return;
    const blob = new Blob([JSON.stringify(aggregate, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `bench-run-${String(runBatch).slice(0, 8)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (domain !== "cti") {
    return (
      <Card className="border-border/50 bg-card/80">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Corpus ingest is CTI-only. Switch domain to CTI in the header to use this panel.
        </CardContent>
      </Card>
    );
  }

  const totalDone = status.done + status.error;
  const totalTasks = totalDone + status.queued + status.running;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Corpus Ingest & Bench Runner
            <Badge variant="outline" className="text-[10px] ml-2">CTI · N1K</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            Phase N1K scales the corpus from the built-in <b>N=56</b> gold set toward
            <b> N≥1,000</b> using public feeds. Every case stores publisher, canonical
            URL, license, and retrieval date in <code>bench_cases</code> — no
            attribution-less samples are accepted.
          </p>
          <p>
            Runs are dispatched via <b>fan-out → worker → aggregate</b>
            (<code>bench-schedule</code> / <code>bench-worker</code> / <code>bench-aggregate</code>),
            checkpointed in the <code>bench_runs</code> table. Killing a tab does
            not lose progress.
          </p>
        </CardContent>
      </Card>

      {/* 1. INGEST */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">1 · Ingest — public sources</CardTitle>
          <Button size="sm" variant="ghost" onClick={refreshCounts}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-xs mb-2 flex items-center gap-3">
            <span className="text-muted-foreground">
              Total in DB: <b className="text-foreground">{totalInDb}</b> / target ~{TARGET_TOTAL}
            </span>
            <div className="flex-1 max-w-xs">
              <Progress value={Math.min(100, (totalInDb / 1000) * 100)} className="h-1.5" />
            </div>
            <span className="text-muted-foreground">
              {Math.round((totalInDb / 1000) * 100)}% of N=1,000
            </span>
          </div>
          <div className="border border-border/50 rounded overflow-hidden text-xs">
            <div className="grid grid-cols-[1.6fr_1fr_1.4fr_.6fr_.6fr_.7fr] bg-secondary/40 px-3 py-1.5 font-medium">
              <div>Source</div><div>Publisher</div><div>License</div>
              <div className="text-right">In&nbsp;DB</div>
              <div className="text-right">Target</div>
              <div className="text-right">Action</div>
            </div>
            {SOURCES.map((s) => {
              const n = counts[s.feedKey] ?? 0;
              return (
                <div key={s.id}
                  className="grid grid-cols-[1.6fr_1fr_1.4fr_.6fr_.6fr_.7fr] px-3 py-1.5 border-t border-border/40 items-center">
                  <div className="font-medium">{s.label}</div>
                  <div className="text-muted-foreground">{s.publisher}</div>
                  <div className="text-muted-foreground text-[11px]">{s.license}</div>
                  <div className="text-right">{n}</div>
                  <div className="text-right text-muted-foreground">{s.target}</div>
                  <div className="text-right">
                    <Button size="sm" variant="outline" className="h-6 text-[11px]"
                      disabled={busy === s.id} onClick={() => runIngest(s)}>
                      {busy === s.id ? "…" : `Fetch ${s.payload.limit ?? "N"}`}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Feeds behind CDN/anti-bot walls (e.g. MSRC, CNCERT) can return 0 items;
            the response is still recorded in the Threat Feed for audit.
          </p>
        </CardContent>
      </Card>

      {/* 2. RUN */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">2 · Run bench (fan-out / worker / aggregate)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <Checkbox checked={pathwayB} onCheckedChange={(v) => setPathwayB(!!v)} />
              Pathway B (Graph-Native)
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={pathwayC} onCheckedChange={(v) => setPathwayC(!!v)} />
              Pathway C (Hypergraph)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Sample size:</span>
              <Input type="number" value={sample} min={1} max={1000}
                className="h-7 w-20"
                onChange={(e) => setSample(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            <Button size="sm" disabled={scheduling || totalInDb === 0} onClick={startRun}>
              <Play className="w-3 h-3 mr-1" />
              {scheduling ? "Scheduling…" : "Start run"}
            </Button>
          </div>
          {totalInDb === 0 && (
            <p className="text-amber-500">Ingest at least one source before running a bench.</p>
          )}
          {runBatch && (
            <div className="pt-2 border-t border-border/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-muted-foreground">
                  run_batch: <code>{String(runBatch).slice(0, 8)}…</code>
                </span>
                <span>
                  {totalDone}/{totalTasks} tasks done
                </span>
              </div>
              <Progress
                value={totalTasks ? (totalDone / totalTasks) * 100 : 0}
                className="h-1.5" />
              <div className="grid grid-cols-4 gap-2 mt-2 text-center">
                <div className="border border-border/40 rounded p-2">
                  <div className="text-[10px] text-muted-foreground">Queued</div>
                  <div className="text-lg font-semibold">{status.queued}</div>
                </div>
                <div className="border border-border/40 rounded p-2">
                  <div className="text-[10px] text-muted-foreground">Running</div>
                  <div className="text-lg font-semibold text-blue-400">{status.running}</div>
                </div>
                <div className="border border-border/40 rounded p-2">
                  <div className="text-[10px] text-muted-foreground">Done</div>
                  <div className="text-lg font-semibold text-emerald-400">{status.done}</div>
                </div>
                <div className="border border-border/40 rounded p-2">
                  <div className="text-[10px] text-muted-foreground">Error</div>
                  <div className="text-lg font-semibold text-red-400">{status.error}</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. RESULTS */}
      {aggregate && (
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-emerald-400" />
              3 · Aggregate results
            </CardTitle>
            <Button size="sm" variant="outline" onClick={downloadJson}>
              <Download className="w-3 h-3 mr-1" /> JSON
            </Button>
          </CardHeader>
          <CardContent className="text-xs space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(aggregate.pathway ?? {}).map(([p, v]: any) => (
                <div key={p} className="border border-border/40 rounded p-2">
                  <div className="font-medium mb-1">Pathway {p}</div>
                  <div className="text-muted-foreground">
                    done {v.done} · error {v.error}
                  </div>
                  <div className="mt-1">
                    mean latency <b>{v.mean_latency_ms ?? "—"} ms</b> ·
                    tokens (est) <b>{(v.total_tokens_est ?? 0).toLocaleString()}</b>
                  </div>
                  <div className="text-muted-foreground">
                    entities/doc {v.mean_entities_per_doc ?? "—"} ·
                    relations/doc {v.mean_relations_per_doc ?? "—"}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="font-medium mb-1">Per-stratum</div>
              <div className="border border-border/40 rounded overflow-hidden">
                <div className="grid grid-cols-3 bg-secondary/40 px-2 py-1 font-medium">
                  <div>Stratum</div><div className="text-right">Done</div><div className="text-right">Total</div>
                </div>
                {Object.entries(aggregate.stratum ?? {}).map(([k, v]: any) => (
                  <div key={k} className="grid grid-cols-3 px-2 py-1 border-t border-border/40">
                    <div>{k}</div>
                    <div className="text-right">{v.done}</div>
                    <div className="text-right">{v.total}</div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Scoring vs the N=56 gold slice (P/R/F1) is computed offline via
              <code> src/lib/kg-bench/runner.ts</code> — this panel reports
              throughput + structural yield for the full ingested corpus.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4. WORKFLOW HELP */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Operation workflow</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <div><b className="text-foreground">1. Ingest</b> — click <i>Fetch N</i> per source. Each row is
            written to <code>bench_cases</code> with mandatory source_url + publisher + license.</div>
          <div><b className="text-foreground">2. Schedule</b> — pick pathway(s) + sample size, click
            <i> Start run</i>. This calls <code>bench-schedule</code>, which queues a row in
            <code> bench_runs</code> for every (case, pathway).</div>
          <div><b className="text-foreground">3. Fan-out</b> — <code>bench-schedule</code> spawns
            <code> bench-worker</code> in chunks of 10; each worker handles up to 20 tasks with
            concurrency 4, staying inside the 150 s edge-function budget.</div>
          <div><b className="text-foreground">4. Watch</b> — the status block polls
            <code> bench_runs</code> every 3 s; killed tabs resume cleanly (state is in the DB).</div>
          <div><b className="text-foreground">5. Aggregate</b> — when queued+running hits 0, this panel
            auto-calls <code>bench-aggregate</code> and renders the per-pathway / per-stratum table.</div>
          <div><b className="text-foreground">6. Export</b> — <i>JSON</i> for paper appendix.</div>
          <div className="pt-1 flex items-center gap-1">
            <ExternalLink className="w-3 h-3" />
            <a href="/reports/n1000-ingest-runbook.md" target="_blank" rel="noreferrer"
              className="underline">n1000-ingest-runbook.md</a>
            <span>· full source list, licenses, and dedup keys.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
