import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Play, Download, FileBarChart, Languages, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend,
} from "recharts";
import { useDomain } from "@/contexts/DomainContext";
import { useToast } from "@/hooks/use-toast";
import { getCorpus, CATEGORIES, CATEGORY_LABEL } from "@/lib/kg-bench/corpus";
import { runBench, exportBenchMarkdown, type BenchRun } from "@/lib/kg-bench/runner";
import { getOntology } from "@/lib/ontology";
import { ExternalBenchmarksPanel } from "@/components/ExternalBenchmarksPanel";

export function KGBenchPanel() {
  const { domain } = useDomain();
  const { toast } = useToast();
  const ontology = getOntology(domain);
  const corpus = useMemo(() => getCorpus(domain), [domain]);

  const [selected, setSelected] = useState<Set<string>>(() => new Set(corpus.map(c => c.id)));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [run, setRun] = useState<BenchRun | null>(null);

  const toggle = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleRun = useCallback(async () => {
    setRunning(true); setRun(null);
    setProgress({ done: 0, total: selected.size, current: "" });
    try {
      const ids = Array.from(selected);
      const result = await runBench(domain, ids, (done, total, current) =>
        setProgress({ done, total, current }),
      );
      setRun(result);
      toast({
        title: "KG-Bench complete",
        description: `Bench-Score ${(result.benchScore * 100).toFixed(1)} · ${(result.totalMs / 1000).toFixed(1)}s`,
      });
    } catch (e: any) {
      toast({ title: "Bench failed", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  }, [domain, selected, toast]);

  const handleExport = useCallback(() => {
    if (!run) return;
    const md = exportBenchMarkdown(run);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kg-bench-${domain}-${run.finishedAt.replace(/[:.]/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [run, domain]);

  const radarData = run ? CATEGORIES
    .filter(c => run.perCategory[c].n > 0)
    .map(c => ({ category: CATEGORY_LABEL[c], f1: +(run.perCategory[c].f1 * 100).toFixed(1) }))
    : [];

  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileBarChart className="w-4 h-4 text-primary" />
                  KG-Bench · LLM-KG-Bench 3.0 (adapted for pipeline)
                </CardTitle>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Evaluates the <span className="text-foreground">full KG-generation pipeline</span>, not the LLM in isolation.
                  Tasks ported from arXiv:2505.13098v1 · ontology = <Badge variant="outline" className={`ml-1 ${ontology.badgeClass}`}>{ontology.label}</Badge>
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleRun} disabled={running || selected.size === 0}>
                  <Play className="w-3 h-3 mr-1" /> {running ? "Running…" : `Run Bench (${selected.size})`}
                </Button>
                <Button size="sm" variant="outline" onClick={handleExport} disabled={!run}>
                  <Download className="w-3 h-3 mr-1" /> Export .md
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {running && (
              <div className="space-y-1">
                <Progress value={(progress.done / Math.max(progress.total, 1)) * 100} className="h-1" />
                <p className="text-[10px] text-muted-foreground font-mono">
                  {progress.done}/{progress.total} · {progress.current}
                </p>
              </div>
            )}

            {/* Task selector grouped by category */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {CATEGORIES.filter(cat => corpus.some(c => c.category === cat)).map(cat => (
                <div key={cat} className="rounded border border-border/40 bg-secondary/20 p-2">
                  <div className="flex items-center gap-1 mb-1">
                    {cat === "multilingual" && <Languages className="w-3 h-3 text-accent" />}
                    {cat === "hallucination" && <ShieldCheck className="w-3 h-3 text-success" />}
                    <span className="text-[11px] font-semibold text-foreground">{CATEGORY_LABEL[cat]}</span>
                  </div>
                  <div className="space-y-1">
                    {corpus.filter(c => c.category === cat).map(c => (
                      <label key={c.id} className="flex items-center gap-2 text-[10px] cursor-pointer">
                        <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                        <span className="text-muted-foreground">{c.name}</span>
                        {c.language && <Badge variant="outline" className="text-[8px] py-0">{c.language}</Badge>}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {run && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="border-border/50 bg-card/80 lg:col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Bench-Score</CardTitle></CardHeader>
              <CardContent>
                <div className="text-4xl font-mono text-primary">{(run.benchScore * 100).toFixed(1)}</div>
                <p className="text-[10px] text-muted-foreground mt-1">macro-F1 across {Object.values(run.perCategory).filter(c => c.n > 0).length} active categories · n={run.results.length} cases · {(run.totalMs / 1000).toFixed(1)}s</p>
                <div className="mt-3 space-y-1">
                  {CATEGORIES.filter(c => run.perCategory[c].n > 0).map(c => (
                    <div key={c} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{CATEGORY_LABEL[c]}</span>
                      <span className="font-mono text-foreground">{(run.perCategory[c].f1 * 100).toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80 lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Capability Radar</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(220, 14%, 18%)" />
                    <PolarAngleAxis dataKey="category" tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                    <Radar name="Pipeline F1" dataKey="f1" stroke="hsl(160, 70%, 45%)" fill="hsl(160, 70%, 45%)" fillOpacity={0.25} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "hsl(215, 12%, 55%)" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Per-Case Results</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono">
                  <thead className="text-muted-foreground border-b border-border/30">
                    <tr>
                      <th className="text-left py-1 pr-2">Case</th>
                      <th className="text-left py-1 pr-2">Category</th>
                      <th className="text-right py-1 pr-2">P</th>
                      <th className="text-right py-1 pr-2">R</th>
                      <th className="text-right py-1 pr-2">F1</th>
                      <th className="text-right py-1 pr-2">ms</th>
                      <th className="text-left py-1 pl-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.results.map(r => (
                      <tr key={r.caseId} className="border-b border-border/10">
                        <td className="py-1 pr-2 text-foreground">{r.name}</td>
                        <td className="py-1 pr-2 text-muted-foreground">{CATEGORY_LABEL[r.category]}</td>
                        <td className="py-1 pr-2 text-right">{(r.score.precision * 100).toFixed(0)}</td>
                        <td className="py-1 pr-2 text-right">{(r.score.recall * 100).toFixed(0)}</td>
                        <td className={`py-1 pr-2 text-right ${r.score.f1 >= 0.7 ? "text-success" : r.score.f1 >= 0.4 ? "text-warning" : "text-destructive"}`}>{(r.score.f1 * 100).toFixed(0)}</td>
                        <td className="py-1 pr-2 text-right text-muted-foreground">{r.latencyMs}</td>
                        <td className="py-1 pl-2 text-muted-foreground/80 text-[10px]">{r.error ? `ERR: ${r.error}` : (r.notes ?? "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <ExternalBenchmarksPanel />
    </div>
  );
}
