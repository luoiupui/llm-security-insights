import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Database, Play, Upload, Link as LinkIcon } from "lucide-react";
import { useDomain } from "@/contexts/DomainContext";
import { useToast } from "@/hooks/use-toast";
import { runBenchOnCases, type BenchRun } from "@/lib/kg-bench/runner";
import { loadFromUrl, loadFromFile, type ExternalFormat, type AdapterResult } from "@/lib/kg-bench/external-adapters";

const FORMATS: { value: ExternalFormat; label: string; hint: string }[] = [
  { value: "generic", label: "Generic JSON",  hint: "[{id,text,entities[],triples[{s,p,o}]}]" },
  { value: "dnrti",   label: "DNRTI (BIO)",   hint: "[{id,tokens[],tags[]}] — entity-only" },
  { value: "casie",   label: "CASIE (events)", hint: "[{id,text,events[{trigger,arguments[]}]}]" },
];

export function ExternalBenchmarksPanel() {
  const { domain } = useDomain();
  const { toast } = useToast();
  const [format, setFormat] = useState<ExternalFormat>("generic");
  const [url, setUrl] = useState("/external/dnrti-sample.json");
  const [loaded, setLoaded] = useState<AdapterResult | null>(null);
  const [run, setRun] = useState<BenchRun | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });

  const handleUrl = useCallback(async () => {
    try {
      const r = await loadFromUrl(url, format);
      setLoaded(r); setRun(null);
      toast({ title: "Loaded", description: `${r.cases.length} cases from ${r.sourceLabel}` });
    } catch (e: any) { toast({ title: "Load failed", description: e.message, variant: "destructive" }); }
  }, [url, format, toast]);

  const handleFile = useCallback(async (f: File) => {
    try {
      const r = await loadFromFile(f, format);
      setLoaded(r); setRun(null);
      toast({ title: "Loaded", description: `${r.cases.length} cases from ${f.name}` });
    } catch (e: any) { toast({ title: "Parse failed", description: e.message, variant: "destructive" }); }
  }, [format, toast]);

  const handleRun = useCallback(async () => {
    if (!loaded) return;
    setRunning(true); setRun(null);
    setProgress({ done: 0, total: loaded.cases.length, current: "" });
    try {
      const result = await runBenchOnCases(domain, loaded.cases, (d, t, c) => setProgress({ done: d, total: t, current: c }));
      setRun(result);
      toast({ title: "External bench complete", description: `Bench-Score ${(result.benchScore * 100).toFixed(1)} · n=${result.results.length}` });
    } catch (e: any) { toast({ title: "Bench failed", description: e.message, variant: "destructive" }); }
    finally { setRunning(false); }
  }, [domain, loaded, toast]);

  const avgP = run ? run.results.reduce((a, r) => a + r.score.precision, 0) / (run.results.length || 1) : 0;
  const avgR = run ? run.results.reduce((a, r) => a + r.score.recall, 0) / (run.results.length || 1) : 0;

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="w-4 h-4 text-accent" />
          External Benchmarks · loader (no data committed)
        </CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Point at a local JSON copy of DNRTI, CASIE, or any pre-normalised set. Cases run through the same pipeline as gold-56 and are scored with the same P/R/F1 rubric. Data lives only in this browser session.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* format */}
        <div className="flex flex-wrap gap-1">
          {FORMATS.map(f => (
            <Button key={f.value} size="sm" variant={format === f.value ? "default" : "outline"}
              className="h-7 text-[10px]" onClick={() => setFormat(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">shape: {FORMATS.find(f => f.value === format)!.hint}</p>

        {/* load controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div className="flex gap-1">
            <Input value={url} onChange={e => setUrl(e.target.value)} className="h-8 text-[11px] font-mono" placeholder="/external/mydata.json or https://…" />
            <Button size="sm" variant="outline" onClick={handleUrl}><LinkIcon className="w-3 h-3 mr-1" />Fetch</Button>
          </div>
          <label className="flex items-center gap-2 border border-dashed border-border/50 rounded px-2 h-8 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
            <Upload className="w-3 h-3" />
            <span>Upload local JSON</span>
            <input type="file" accept="application/json,.json" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        </div>

        {/* loaded summary */}
        {loaded && (
          <div className="flex items-center justify-between rounded bg-secondary/30 p-2">
            <div className="text-[11px]">
              <span className="text-foreground font-mono">{loaded.cases.length}</span>{" "}
              <span className="text-muted-foreground">cases from</span>{" "}
              <span className="text-foreground font-mono">{loaded.sourceLabel}</span>
              {loaded.warnings.length > 0 && (
                <span className="text-warning ml-2">· {loaded.warnings.length} warning(s)</span>
              )}
            </div>
            <Button size="sm" onClick={handleRun} disabled={running || loaded.cases.length === 0}>
              <Play className="w-3 h-3 mr-1" />{running ? "Running…" : `Run on ${loaded.cases.length}`}
            </Button>
          </div>
        )}

        {running && (
          <div className="space-y-1">
            <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} className="h-1" />
            <p className="text-[10px] text-muted-foreground font-mono">{progress.done}/{progress.total} · {progress.current}</p>
          </div>
        )}

        {/* result summary */}
        {run && (
          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/30">
            <Metric label="Bench-F1" value={(run.benchScore * 100).toFixed(1)} tone="primary" />
            <Metric label="Precision" value={(avgP * 100).toFixed(1)} />
            <Metric label="Recall" value={(avgR * 100).toFixed(1)} />
            <Metric label="Latency" value={`${(run.totalMs / 1000).toFixed(1)}s`} />
          </div>
        )}

        {run && (
          <div className="max-h-64 overflow-auto rounded border border-border/30">
            <table className="w-full text-[10px] font-mono">
              <thead className="text-muted-foreground bg-secondary/30 sticky top-0">
                <tr><th className="text-left px-2 py-1">Case</th><th className="text-right px-2">P</th><th className="text-right px-2">R</th><th className="text-right px-2">F1</th><th className="text-right px-2">ms</th></tr>
              </thead>
              <tbody>
                {run.results.map(r => (
                  <tr key={r.caseId} className="border-t border-border/10">
                    <td className="px-2 py-1 text-foreground">{r.name}</td>
                    <td className="px-2 text-right">{(r.score.precision * 100).toFixed(0)}</td>
                    <td className="px-2 text-right">{(r.score.recall * 100).toFixed(0)}</td>
                    <td className={`px-2 text-right ${r.score.f1 >= 0.7 ? "text-success" : r.score.f1 >= 0.4 ? "text-warning" : "text-destructive"}`}>{(r.score.f1 * 100).toFixed(0)}</td>
                    <td className="px-2 text-right text-muted-foreground">{r.latencyMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Results here are <Badge variant="outline" className="text-[8px] py-0">informational</Badge> — they do <span className="text-foreground">not</span> feed the regression gate, which stays anchored on the curated gold-56. See <code>public/reports/external-benchmarks-loader.md</code>.
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className="rounded bg-secondary/30 p-2">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-mono ${tone === "primary" ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
