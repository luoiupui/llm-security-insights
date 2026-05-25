// EXPERIMENTAL: Pathway A — true AI-SDK agent loop (NOT benchmarked by KG-Bench).
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bot, Wrench, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDomain } from "@/contexts/DomainContext";

interface ToolCall { name: string; input: unknown }
interface ToolResult { name: string; output: unknown }
interface TraceStep { step: number; text: string; tool_calls: ToolCall[]; tool_results: ToolResult[] }
interface AgentResult {
  ok: boolean;
  domain: string;
  elapsed_ms: number;
  steps_taken: number;
  finish_reason: string;
  summary: string;
  trace: TraceStep[];
  scratch: Record<string, unknown>;
  error?: string;
}

const DEFAULT_TEXT = `APT-29 used SUNBURST backdoor in the SolarWinds Orion supply chain attack (T1195.002). SUNBURST exploited CVE-2020-10148 and communicated via avsvmcloud[.]com.`;

export function AgentLoopPanel() {
  const { domain } = useDomain();
  const [text, setText] = useState(DEFAULT_TEXT);
  const [query, setQuery] = useState("Which actor is behind this campaign?");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);

  const run = async () => {
    setLoading(true); setResult(null);
    const t0 = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("threat-agent", {
        body: { text, query, domain },
      });
      if (error) throw error;
      const r = data as AgentResult;
      setResult(r);
      if (r.ok) toast.success(`Agent finished in ${r.steps_taken} steps (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      else toast.error(`Agent error: ${r.error}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      toast.error(`Agent run failed: ${msg}`);
      setResult({ ok: false, error: msg } as AgentResult);
    } finally { setLoading(false); }
  };

  return (
    <Card className="border-primary/40 bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bot className="w-4 h-4 text-primary" />
          Pathway A — Agent Loop (Experimental)
          <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-500">EXPERIMENTAL · not benchmarked</Badge>
          <Badge variant="outline" className="text-[10px] ml-auto">AI SDK · stopWhen(50)</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          True tool-calling agent (Vercel AI SDK + Lovable AI Gateway). The LLM decides which tool to run, in what
          order, and when to stop — vs the deterministic pipeline below. KG-Bench scores the deterministic pathway only.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={4}
          className="font-mono text-xs"
          placeholder={domain === "clinical" ? "Paste a desensitised clinical note…" : "Paste a CTI report…"}
        />
        <div className="flex items-center gap-2">
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Optional natural-language goal (e.g. 'attribute the actor')"
            className="flex-1 h-9 px-3 rounded-md bg-background border border-border text-xs"
          />
          <Button onClick={run} disabled={loading || text.trim().length < 10} size="sm" className="gap-1">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Run agent
          </Button>
        </div>

        {result && result.ok && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <Metric label="Steps" value={String(result.steps_taken)} />
              <Metric label="Elapsed" value={`${(result.elapsed_ms / 1000).toFixed(1)}s`} />
              <Metric label="IOCs" value={String(result.scratch.preprocess_iocs ?? "—")} />
              <Metric label="Nodes" value={String(result.scratch.extract_nodes ?? "—")} />
              <Metric label="Credibility" value={typeof result.scratch.credibility === "number" ? result.scratch.credibility.toFixed(2) : "—"} />
            </div>
            <div className="rounded-md border border-border/50 bg-muted/30 p-3 text-xs">
              <div className="font-medium text-foreground mb-1">Agent summary</div>
              <div className="text-muted-foreground whitespace-pre-wrap">{result.summary}</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Tool-call trace ({result.trace.length} steps)
              </div>
              {result.trace.map((s) => {
                const isOpen = openStep === s.step;
                const calls = s.tool_calls.map((c) => c.name).join(" · ") || "(reasoning only)";
                return (
                  <div key={s.step} className="rounded border border-border/40 bg-background/40">
                    <button
                      onClick={() => setOpenStep(isOpen ? null : s.step)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/40"
                    >
                      {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <span className="font-mono text-muted-foreground">#{s.step}</span>
                      <span className="font-medium">{calls}</span>
                    </button>
                    {isOpen && (
                      <div className="px-3 py-2 border-t border-border/40 space-y-2">
                        {s.text && <pre className="text-[11px] whitespace-pre-wrap text-muted-foreground">{s.text}</pre>}
                        {s.tool_calls.map((c, i) => (
                          <div key={i} className="text-[11px]">
                            <div className="text-primary font-mono">→ {c.name}({JSON.stringify(c.input).slice(0, 200)})</div>
                            {s.tool_results[i] && (
                              <div className="text-info font-mono pl-3">← {JSON.stringify(s.tool_results[i].output).slice(0, 300)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {result && !result.ok && (
          <div className="text-xs text-destructive p-2 rounded border border-destructive/30 bg-destructive/10">
            {result.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/50 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-mono">{value}</div>
    </div>
  );
}
