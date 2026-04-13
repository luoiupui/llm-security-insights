import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, GitBranch, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Cpu, ArrowRight, Link2, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useThreatPipeline } from "@/hooks/use-threat-pipeline";

const causalTypeColors: Record<string, string> = {
  enables: "text-success border-success/30",
  leads_to: "text-info border-info/30",
  triggers: "text-warning border-warning/30",
  precedes: "text-muted-foreground border-border/30",
};

const ruleStatusIcons: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  pass: { icon: CheckCircle2, className: "text-success" },
  warn: { icon: AlertTriangle, className: "text-warning" },
  fail: { icon: XCircle, className: "text-destructive" },
};

const SAMPLE_TEXT = `In December 2020, APT-29 (Cozy Bear) compromised SolarWinds Orion via supply chain attack (T1195.002). The SUNBURST backdoor communicated via DNS C2 to avsvmcloud[.]com. TEARDROP dropper deployed Cobalt Strike beacons. SAML token forgery (T1550.001) enabled cloud access. Data exfiltrated via HTTPS (T1041). CVE-2020-10148 was exploited. C2 IP: 185.225.69.24.`;

export default function Attribution() {
  const [queryText, setQueryText] = useState(SAMPLE_TEXT);
  const pipeline = useThreatPipeline();

  const handleRunPipeline = () => pipeline.runFull(queryText);

  const entities = pipeline.extraction?.ner?.entities || [];
  const relations = pipeline.extraction?.re?.relations || [];
  const causalLinks = pipeline.extraction?.causality?.causal_links || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attribution & Causality Reasoning</h1>
          <p className="text-sm text-muted-foreground mt-1">Live LLM-driven attribution, causal analysis & conflict detection (Ch. 4)</p>
        </div>
        {pipeline.isProcessing && (
          <Badge variant="secondary" className="bg-info/20 text-info gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {pipeline.currentStep}
          </Badge>
        )}
      </div>

      {/* Pipeline Input */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Intelligence Input → Full Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={queryText} onChange={(e) => setQueryText(e.target.value)}
            placeholder="Paste threat report for attribution analysis..."
            className="min-h-[100px] font-mono text-xs bg-secondary/30" />
          <Button onClick={handleRunPipeline} disabled={pipeline.isProcessing} className="gap-2">
            <Play className="w-4 h-4" /> Run Attribution Pipeline
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="attribution">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="attribution">Attribution Result</TabsTrigger>
          <TabsTrigger value="causality">Causal Analysis</TabsTrigger>
          <TabsTrigger value="conflicts">Conflict Detection (Ch. 4.4)</TabsTrigger>
          <TabsTrigger value="reasoning">Reasoning Engine</TabsTrigger>
        </TabsList>

        {/* Attribution Result */}
        <TabsContent value="attribution" className="mt-4 space-y-4">
          {pipeline.attribution ? (
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{pipeline.attribution.attributed_actor}</CardTitle>
                      <p className="text-xs text-muted-foreground">LLM-Generated Attribution</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-mono font-semibold">{(pipeline.attribution.confidence * 100).toFixed(0)}%</p>
                    <p className="text-[10px] text-muted-foreground">confidence</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Attack Stages */}
                {pipeline.attribution.attack_stages?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-3">Attack Kill Chain</p>
                    <div className="relative pl-6 space-y-4">
                      <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                      {pipeline.attribution.attack_stages.map((stage, i) => (
                        <div key={i} className="relative flex items-start gap-3">
                          <div className="absolute left-[-17px] w-3 h-3 rounded-full bg-primary/30 border-2 border-primary mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{stage.stage}</span>
                              {stage.technique && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary font-mono">{stage.technique}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{stage.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence */}
                {pipeline.attribution.evidence_chain?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Evidence Chain</p>
                    <div className="space-y-1">
                      {pipeline.attribution.evidence_chain.map((ev, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-secondary/30">
                          <span className="text-muted-foreground font-mono w-8">w={ev.weight}</span>
                          <span>{ev.evidence}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alternative Actors */}
                {pipeline.attribution.alternative_actors && pipeline.attribution.alternative_actors.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-2">Alternative Attributions</p>
                    {pipeline.attribution.alternative_actors.map((alt, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-secondary/30">
                        <span className="font-mono">{alt.actor}</span>
                        <span className="text-muted-foreground">({(alt.confidence * 100).toFixed(0)}%)</span>
                        {alt.reason && <span className="text-muted-foreground">— {alt.reason}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Reasoning Trace */}
                {pipeline.attribution.reasoning_trace && (
                  <div className="bg-secondary/50 rounded-lg p-3 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
                    <p className="text-xs font-medium text-foreground mb-1">Reasoning Trace:</p>
                    {pipeline.attribution.reasoning_trace}
                  </div>
                )}

                <div className="pt-3 border-t border-border/30 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="font-mono">{pipeline.attribution.evidence_chain?.length || 0} evidence items</span>
                  <span>{pipeline.attribution.attack_stages?.length || 0} attack stages</span>
                  {pipeline.attribution.credibility_score && <span>Credibility: <span className="text-primary font-mono">{pipeline.attribution.credibility_score.toFixed(2)}</span></span>}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Run the attribution pipeline to see live results
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Causal Analysis */}
        <TabsContent value="causality" className="mt-4 space-y-4">
          {causalLinks.length > 0 || pipeline.attribution?.causal_chain?.length ? (
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" /> LLM-Extracted Causal Chain
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(pipeline.attribution?.causal_chain || causalLinks).map((link, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-mono">{link.temporal_order || i + 1}</span>
                    <span className="font-mono text-sm text-foreground">{link.cause}</span>
                    <Badge variant="outline" className={`text-[10px] ${causalTypeColors[link.causal_type] || ""}`}>{link.causal_type}</Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-sm text-foreground">{link.effect}</span>
                    <span className="ml-auto text-xs font-mono text-muted-foreground">{((link.confidence || 0) * 100).toFixed(0)}%</span>
                  </motion.div>
                ))}
                <div className="text-[11px] text-muted-foreground font-mono p-2 rounded bg-secondary/20">
                  Causal types: <span className="text-success">enables</span> | <span className="text-info">leads_to</span> | <span className="text-warning">triggers</span> | precedes
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Run the pipeline to see causal analysis results
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Conflict Detection */}
        <TabsContent value="conflicts" className="mt-4">
          {pipeline.conflicts ? (
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-primary" /> Live Conflict Detection (Ch. 4.4)
                  </CardTitle>
                  <div className="flex gap-2 text-xs">
                    <Badge variant="secondary" className="bg-success/20 text-success">{pipeline.conflicts.summary.passed} passed</Badge>
                    <Badge variant="secondary" className="bg-warning/20 text-warning">{pipeline.conflicts.summary.warnings} warnings</Badge>
                    <Badge variant="secondary" className="bg-destructive/20 text-destructive">{pipeline.conflicts.summary.failures} failures</Badge>
                    <Badge variant="secondary" className="bg-primary/20 text-primary">Score: {pipeline.conflicts.credibility_score}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {pipeline.conflicts.conflicts.map((rule, i) => {
                  const ri = ruleStatusIcons[rule.status] || ruleStatusIcons.pass;
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                      <ri.icon className={`w-4 h-4 shrink-0 ${ri.className}`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{rule.rule}</p>
                        <p className="text-xs text-muted-foreground">{rule.detail}</p>
                        {rule.affected_items && rule.affected_items.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {rule.affected_items.map((item, j) => (
                              <Badge key={j} variant="outline" className="text-[9px]">{item}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] font-mono">{rule.type}</Badge>
                    </motion.div>
                  );
                })}
                {pipeline.conflicts.llm_resolution && pipeline.conflicts.llm_resolution !== "LLM resolution unavailable" && (
                  <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-xs font-medium text-primary mb-1">LLM Conflict Resolution Recommendations:</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{pipeline.conflicts.llm_resolution}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Run the pipeline to see conflict detection results
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Reasoning Engine */}
        <TabsContent value="reasoning" className="mt-4 space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" /> Neuro-Symbolic Reasoning Engine (Ch. 4.2–4.3)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border/30">
                    <h4 className="text-xs font-medium mb-2 text-primary">Neural Component (LLM — Live)</h4>
                    <ul className="text-[11px] text-muted-foreground space-y-1 font-mono">
                      <li>• CoT prompting → NER (8-step), RE, Causality extraction</li>
                      <li>• Attack path reconstruction via threat-kg-query</li>
                      <li>• Confidence scoring via tool-calling structured output</li>
                      <li>• Cross-report evidence correlation</li>
                      <li>• LLM conflict resolution recommendations</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border/30">
                    <h4 className="text-xs font-medium mb-2 text-warning">Symbolic Component (Rules — Live)</h4>
                    <ul className="text-[11px] text-muted-foreground space-y-1 font-mono">
                      <li>• Temporal overlap conflict detection</li>
                      <li>• TTP consistency verification</li>
                      <li>• Infrastructure reuse analysis</li>
                      <li>• Source credibility weighting: S = Σ(w×conf×rel)/N</li>
                      <li>• Causal coherence & circular dependency check</li>
                      <li>• Attribution contradiction detection</li>
                      <li>• Entity deduplication</li>
                    </ul>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/20 border border-border/30">
                  <h4 className="text-xs font-medium mb-2">Live Pipeline Flow (4 Edge Functions)</h4>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground flex-wrap">
                    <span className="px-2 py-1 rounded bg-info/20 text-info">threat-preprocess</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-1 rounded bg-primary/20 text-primary">threat-extract (NER+RE+Causality)</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-1 rounded bg-warning/20 text-warning">threat-conflicts</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-1 rounded bg-success/20 text-success">threat-kg-query (Attribution)</span>
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                  <span className="text-primary">TEMPORAL KG:</span> G(t) = (V(t), E(t), τ)<br/>
                  <span className="text-accent">CREDIBILITY:</span> S = Σ(w_i × conf_i × reliability_i) / N<br/>
                  <span className="text-warning">BACKBONE:</span> google/gemini-3-flash-preview via ai.gateway.lovable.dev
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
