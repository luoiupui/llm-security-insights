import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Eye, ShieldOff, Play, Loader2, AlertTriangle } from "lucide-react";
import { runRedactionPipeline, PipelineOutput } from "@/lib/redaction/pipeline";
import { PolicyDomain } from "@/lib/redaction/policy";
import { renderDiffHTML } from "@/lib/redaction/mask";
import clinicalCorpus from "@/lib/redaction/corpus/clinical-phi.json";
import ctiCorpus from "@/lib/redaction/corpus/cti-tlp.json";
import archiveCorpus from "@/lib/redaction/corpus/archive.json";
import hardNeg from "@/lib/redaction/corpus/hard-negatives.json";
import { scoreRedactionSpans } from "@/lib/kg-bench/scorers";

type CorpusDoc = {
  id: string; lang: string; text: string;
  metadata?: { year?: number; sealed_until?: number | null };
  gold: Array<{ start: number; end: number; axis: string; rule_id: string; action: string }>;
};

const CORPORA: Record<PolicyDomain | "hard-negatives", CorpusDoc[]> = {
  clinical: clinicalCorpus.docs as CorpusDoc[],
  cti: ctiCorpus.docs as CorpusDoc[],
  archive: archiveCorpus.docs as CorpusDoc[],
  "hard-negatives": hardNeg.docs as CorpusDoc[],
};

const AXIS_COLOR: Record<string, string> = {
  pii: "hsl(0 75% 55%)",
  cultural: "hsl(280 60% 60%)",
  legal_restricted: "hsl(38 92% 50%)",
  security_classified: "hsl(160 70% 45%)",
};

export default function RedactionLab() {
  const [domain, setDomain] = useState<PolicyDomain | "hard-negatives">("clinical");
  const [docId, setDocId] = useState<string>(CORPORA.clinical[0].id);
  const [useLlm, setUseLlm] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PipelineOutput | null>(null);
  const [score, setScore] = useState<ReturnType<typeof scoreRedactionSpans> | null>(null);

  const doc = useMemo(
    () => CORPORA[domain].find(d => d.id === docId) ?? CORPORA[domain][0],
    [domain, docId],
  );

  useEffect(() => { setDocId(CORPORA[domain][0].id); setResult(null); setScore(null); }, [domain]);

  const run = async () => {
    if (!doc) return;
    setRunning(true);
    try {
      const pipelineDomain: PolicyDomain = domain === "hard-negatives" ? "archive" : domain;
      const out = await runRedactionPipeline({
        text: doc.text, domain: pipelineDomain, metadata: doc.metadata, useLlm,
      });
      setResult(out);
      setScore(scoreRedactionSpans(out.trace.decisions, doc.gold));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldOff className="w-5 h-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">Redaction Lab</h1>
              <Badge variant="outline" className="font-mono text-[10px]">§9 · simulation</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Open-domain selective redaction. One-way masking. Federated resolver (stub-cached). No real PHI.
            </p>
          </div>
        </div>

        <Alert className="border-yellow-500/40">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="text-xs">
            Simulation only. Federated resolvers (Wikidata, GeoNames, LCSH) are stub-cached against bundled
            fixtures — no live HTTPS. Masking is one-way: placeholder mappings are not persisted.
          </AlertDescription>
        </Alert>

        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Domain</Label>
              <Select value={domain} onValueChange={(v: PolicyDomain | "hard-negatives") => setDomain(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinical">Clinical (HIPAA Safe Harbor)</SelectItem>
                  <SelectItem value="cti">CTI (TLP / STIX)</SelectItem>
                  <SelectItem value="archive">Archive (federated)</SelectItem>
                  <SelectItem value="hard-negatives">Hard Negatives (should mask ≈ 0)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Document</Label>
              <Select value={docId} onValueChange={setDocId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CORPORA[domain].map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.id} <span className="text-muted-foreground">[{d.lang}]</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">LLM Adjudicator</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={useLlm} onCheckedChange={setUseLlm} />
                <span className="text-xs text-muted-foreground">
                  {useLlm ? "Enabled — guard rejects downgrades" : "Disabled — rules only"}
                </span>
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={run} disabled={running || !doc} className="w-full">
                {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                Run pipeline
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Original</h3>
              {doc && <Badge variant="outline" className="font-mono text-[10px]">{doc.lang}</Badge>}
            </div>
            <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed p-3 bg-muted/30 rounded">
              {doc?.text}
            </pre>
          </Card>

          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldOff className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Masked (one-way)</h3>
              {result?.trace.llmInvoked && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  llm · {result.trace.llmUpgrades} upgrade(s)
                </Badge>
              )}
            </div>
            {result ? (
              <pre
                className="text-xs whitespace-pre-wrap font-mono leading-relaxed p-3 bg-muted/30 rounded"
                dangerouslySetInnerHTML={{ __html: renderDiffHTML(doc!.text, result.trace.decisions) }}
              />
            ) : (
              <div className="text-xs text-muted-foreground p-3">Click Run pipeline to mask.</div>
            )}
          </Card>
        </div>

        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Policy trace</h3>
              <div className="flex flex-wrap gap-2 text-[10px]">
                {Object.entries(AXIS_COLOR).map(([axis, color]) => (
                  <div key={axis} className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
                    <span className="font-mono">{axis}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto text-xs">
                {result.trace.decisions.length === 0 && (
                  <div className="text-muted-foreground italic">No spans masked.</div>
                )}
                {result.trace.decisions.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30 font-mono">
                    <span className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ background: AXIS_COLOR[d.axis] }} />
                    <div className="flex-1">
                      <div>
                        <span className="text-foreground">{d.rule_id}</span>
                        <span className="text-muted-foreground"> · {d.action} · {d.source}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        [{d.start}-{d.end}] {d.rationale}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono pt-2 border-t">
                policy v{result.trace.policyVersion} · resolverHits={result.trace.resolverHits} · {result.trace.durationMs}ms
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">KG-Bench Cat 8 score</h3>
              {score && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Metric label="Precision" value={score.precision} />
                  <Metric label="Recall" value={score.recall} />
                  <Metric label="F1" value={score.f1} />
                  <Metric label="Over-redaction" value={score.overRedaction} invert />
                  <Metric label="Utility (skip-aware)" value={score.utility} />
                  <Metric label="Bench-Score-8" value={score.benchScore} highlight />
                </div>
              )}
              <div className="text-[10px] text-muted-foreground font-mono pt-2 border-t">
                Bench-Score-8 = 0.5·F1 + 0.3·utility − 0.2·over_redaction
              </div>
            </Card>
          </div>
        )}
      </div>
  );
}

function Metric({ label, value, invert, highlight }: { label: string; value: number; invert?: boolean; highlight?: boolean }) {
  const pct = (value * 100).toFixed(1);
  return (
    <div className={`p-2 rounded ${highlight ? "bg-primary/10 border border-primary/30" : "bg-muted/30"}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-mono ${invert ? "text-yellow-500" : highlight ? "text-primary" : "text-foreground"}`}>
        {pct}%
      </div>
    </div>
  );
}
