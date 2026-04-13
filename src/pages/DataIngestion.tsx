import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, Globe, MessageSquare, CheckCircle, Clock, AlertCircle, RefreshCw, Layers, Code2, Cpu, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useThreatPipeline } from "@/hooks/use-threat-pipeline";

/* ── Static Data (Architecture Reference) ── */
const architectureLayers = [
  { layer: 1, name: "Data Acquisition Layer", desc: "Multi-source ingestion: PDF, blog, forum, STIX feeds. Cleaning, deduplication, IOC normalization.", status: "active", color: "bg-info" },
  { layer: 2, name: "LLM Extraction Layer", desc: "Cloud-based backbone LLM (Gemini) with CoT prompting for NER, RE, and causal extraction.", status: "active", color: "bg-primary" },
  { layer: 3, name: "Knowledge Graph Storage Layer", desc: "Temporal KG G(t) = (V(t), E(t), τ) with conflict detection and entity merging.", status: "active", color: "bg-success" },
  { layer: 4, name: "Inference Application Layer", desc: "Neuro-symbolic attribution reasoning: attack path reconstruction + credibility scoring.", status: "active", color: "bg-warning" },
];

const SAMPLE_REPORT = `In December 2020, FireEye discovered that SolarWinds Orion software updates had been trojanized by a sophisticated threat actor, later identified as APT-29 (Cozy Bear), a Russian state-sponsored group.

The attackers inserted the SUNBURST backdoor into SolarWinds Orion updates (versions 2019.4 through 2020.2.1), distributed to approximately 18,000 organizations. The malware used DNS-based command and control communication via the domain avsvmcloud[.]com (IP: 13.59.205.66).

After initial compromise via supply chain attack (MITRE ATT&CK T1195.002), the SUNBURST backdoor performed reconnaissance and deployed the TEARDROP dropper (T1059.001). TEARDROP then loaded Cobalt Strike beacons for lateral movement. The attackers used SAML token forgery (T1550.001) to access cloud resources and exfiltrated data via HTTPS (T1041).

Key vulnerability exploited: CVE-2020-10148 (SolarWinds Orion API authentication bypass). Additional tools observed: RAINDROP loader, GoldMax backdoor. C2 infrastructure included IPs: 185.225.69.24 and domains: freescanonline[.]com.`;

export default function DataIngestion() {
  const [inputText, setInputText] = useState(SAMPLE_REPORT);
  const [sourceType, setSourceType] = useState("auto");
  const pipeline = useThreatPipeline();

  const handlePreprocess = () => pipeline.runPreprocess(inputText, sourceType);
  const handleExtract = async () => {
    const pre = pipeline.preprocessing || await pipeline.runPreprocess(inputText, sourceType);
    if (pre) await pipeline.runExtraction(pre.cleaned_text, "full", pre.source_type, pre.reliability_score);
  };
  const handleFullPipeline = () => pipeline.runFull(inputText, sourceType);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Ingestion & Architecture</h1>
          <p className="text-sm text-muted-foreground mt-1">4-Layer LLM Pipeline — Live Processing (Ch. 3.1–3.3)</p>
        </div>
        <div className="flex gap-2">
          {pipeline.isProcessing && (
            <Badge variant="secondary" className="bg-info/20 text-info gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> {pipeline.currentStep}
            </Badge>
          )}
        </div>
      </div>

      {/* 4-Layer Architecture */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> System Architecture (Ch. 3.1) — Live Edge Functions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {architectureLayers.map((layer, i) => (
              <motion.div key={layer.layer} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <div className="p-3 rounded-lg bg-secondary/40 border border-border/30 h-full">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-6 h-6 rounded-full ${layer.color} text-background text-xs flex items-center justify-center font-bold`}>{layer.layer}</span>
                    <span className="text-xs font-medium">{layer.name}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{layer.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-3 p-2 rounded bg-secondary/20 text-[11px] text-muted-foreground font-mono text-center">
            Backbone LLM: <span className="text-primary">Cloud-based</span> via Lovable AI Gateway → <span className="text-primary">google/gemini-3-flash-preview</span> | Temperature: 0.1
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="live-pipeline">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="live-pipeline">🔴 Live Pipeline</TabsTrigger>
          <TabsTrigger value="preprocessing">Preprocessing Results</TabsTrigger>
          <TabsTrigger value="extraction">LLM Extraction Results</TabsTrigger>
          <TabsTrigger value="prompts">CoT Prompts (Ch. 3.3)</TabsTrigger>
        </TabsList>

        {/* Live Pipeline Input */}
        <TabsContent value="live-pipeline" className="mt-4 space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Threat Intelligence Input</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Select value={sourceType} onValueChange={setSourceType}>
                  <SelectTrigger className="w-40 bg-secondary/50"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="pdf">PDF Report</SelectItem>
                    <SelectItem value="blog">Blog Post</SelectItem>
                    <SelectItem value="forum">Security Forum</SelectItem>
                    <SelectItem value="stix">STIX 2.1</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handlePreprocess} disabled={pipeline.isProcessing} variant="outline" className="gap-2">
                  <Upload className="w-4 h-4" /> Preprocess Only
                </Button>
                <Button onClick={handleExtract} disabled={pipeline.isProcessing} variant="outline" className="gap-2">
                  <Cpu className="w-4 h-4" /> Extract Only
                </Button>
                <Button onClick={handleFullPipeline} disabled={pipeline.isProcessing} className="gap-2">
                  <Play className="w-4 h-4" /> Run Full Pipeline
                </Button>
              </div>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste threat intelligence report, blog post, or STIX JSON here..."
                className="min-h-[200px] font-mono text-xs bg-secondary/30"
              />
              {pipeline.error && (
                <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 inline mr-2" />{pipeline.error}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Preprocessing Results */}
        <TabsContent value="preprocessing" className="mt-4 space-y-4">
          {pipeline.preprocessing ? (
            <>
              <Card className="border-border/50 bg-card/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Preprocessing Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="p-3 rounded bg-secondary/40">
                      <p className="text-[10px] text-muted-foreground">Source Type</p>
                      <p className="text-sm font-mono font-medium">{pipeline.preprocessing.source_type}</p>
                    </div>
                    <div className="p-3 rounded bg-secondary/40">
                      <p className="text-[10px] text-muted-foreground">Reliability</p>
                      <p className="text-sm font-mono font-medium">{pipeline.preprocessing.reliability_score}</p>
                    </div>
                    <div className="p-3 rounded bg-secondary/40">
                      <p className="text-[10px] text-muted-foreground">IOCs Found</p>
                      <p className="text-sm font-mono font-medium">{pipeline.preprocessing.iocs_found.length}</p>
                    </div>
                    <div className="p-3 rounded bg-secondary/40">
                      <p className="text-[10px] text-muted-foreground">Reduction</p>
                      <p className="text-sm font-mono font-medium">{String(pipeline.preprocessing.metadata.reduction_percent)}%</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Cleaning Steps Applied:</p>
                    <div className="flex flex-wrap gap-2">
                      {pipeline.preprocessing.cleaning_steps.map((step, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px] font-mono">{i + 1}. {step}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
              {pipeline.preprocessing.iocs_found.length > 0 && (
                <Card className="border-border/50 bg-card/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Extracted IOCs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left p-2 text-xs text-muted-foreground">Type</th>
                            <th className="text-left p-2 text-xs text-muted-foreground">Value</th>
                            <th className="text-left p-2 text-xs text-muted-foreground">Defanged</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pipeline.preprocessing.iocs_found.map((ioc, i) => (
                            <tr key={i} className="border-b border-border/30">
                              <td className="p-2"><Badge variant="outline" className="text-[10px]">{ioc.type}</Badge></td>
                              <td className="p-2 font-mono text-xs">{ioc.value}</td>
                              <td className="p-2 font-mono text-xs text-muted-foreground">{ioc.defanged}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Run the pipeline to see preprocessing results
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Extraction Results */}
        <TabsContent value="extraction" className="mt-4 space-y-4">
          {pipeline.extraction ? (
            <>
              {pipeline.extraction.ner?.entities && (
                <Card className="border-border/50 bg-card/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">NER: Extracted Entities ({pipeline.extraction.ner.entities.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pipeline.extraction.ner.narrative_summary && (
                      <p className="text-xs text-muted-foreground mb-3 italic">{pipeline.extraction.ner.narrative_summary}</p>
                    )}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/50">
                            <th className="text-left p-2 text-xs text-muted-foreground">Entity</th>
                            <th className="text-left p-2 text-xs text-muted-foreground">Type</th>
                            <th className="text-left p-2 text-xs text-muted-foreground">Confidence</th>
                            <th className="text-left p-2 text-xs text-muted-foreground">MITRE ID</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pipeline.extraction.ner.entities.map((entity, i) => (
                            <tr key={i} className="border-b border-border/30">
                              <td className="p-2 font-mono text-sm">{entity.name}</td>
                              <td className="p-2"><Badge variant="secondary" className="text-[10px]">{entity.type}</Badge></td>
                              <td className="p-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-12 h-1.5 rounded-full bg-secondary">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${entity.confidence * 100}%` }} />
                                  </div>
                                  <span className="text-xs font-mono">{(entity.confidence * 100).toFixed(0)}%</span>
                                </div>
                              </td>
                              <td className="p-2 font-mono text-xs text-muted-foreground">{entity.mitre_id || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
              {pipeline.extraction.re?.relations && (
                <Card className="border-border/50 bg-card/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">RE: Extracted Relations ({pipeline.extraction.re.relations.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pipeline.extraction.re.relations.map((rel, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded bg-secondary/30 text-sm">
                        <span className="font-mono">{rel.source}</span>
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{rel.relation}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono">{rel.target}</span>
                        <span className="ml-auto text-xs font-mono text-muted-foreground">{(rel.confidence * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
              {pipeline.extraction.causality?.causal_links && (
                <Card className="border-border/50 bg-card/80">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Causality: Causal Links ({pipeline.extraction.causality.causal_links.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pipeline.extraction.causality.causal_links.map((link, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded bg-secondary/30 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-mono">{link.temporal_order}</span>
                        <span className="font-mono">{link.cause}</span>
                        <Badge variant="outline" className={`text-[10px] ${
                          link.causal_type === "enables" ? "text-success border-success/30" :
                          link.causal_type === "leads_to" ? "text-info border-info/30" :
                          link.causal_type === "triggers" ? "text-warning border-warning/30" :
                          "text-muted-foreground"
                        }`}>{link.causal_type}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono">{link.effect}</span>
                        <span className="ml-auto text-xs font-mono text-muted-foreground">{(link.confidence * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Run the pipeline to see LLM extraction results
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* CoT Prompts */}
        <TabsContent value="prompts" className="mt-4 space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" /> NER Chain-of-Thought Prompt (Ch. 3.3)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-secondary/50 rounded-lg p-4 font-mono text-xs leading-relaxed text-muted-foreground space-y-2">
                <div><span className="text-primary">SYSTEM:</span> You are a cybersecurity threat intelligence analyst performing Named Entity Recognition (NER).</div>
                <div className="pl-4">
                  <span className="text-accent">CoT Step 1:</span> Read the entire text and identify the main threat narrative.<br/>
                  <span className="text-accent">CoT Step 2:</span> Identify all THREAT ACTORS (APT groups, nation-state actors).<br/>
                  <span className="text-accent">CoT Step 3:</span> Identify all MALWARE families, tools, and backdoors.<br/>
                  <span className="text-accent">CoT Step 4:</span> Identify all VULNERABILITIES (CVE IDs, zero-days).<br/>
                  <span className="text-accent">CoT Step 5:</span> Identify TTPs and map to MITRE ATT&CK IDs.<br/>
                  <span className="text-accent">CoT Step 6:</span> Identify INFRASTRUCTURE (IPs, domains, C2 servers).<br/>
                  <span className="text-accent">CoT Step 7:</span> Identify all SOFTWARE products.<br/>
                  <span className="text-accent">CoT Step 8:</span> Assess confidence (0.0-1.0) for each entity.
                </div>
                <div><span className="text-warning">CONSTRAINT:</span> Only extract explicitly stated information. Flag uncertain attributions with confidence {"<"} 0.7.</div>
                <div><span className="text-info">FORMAT:</span> Return structured JSON with STIX 2.1 schema mapping.</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" /> Causality CoT Prompt (Ch. 4)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-secondary/50 rounded-lg p-4 font-mono text-xs leading-relaxed text-muted-foreground space-y-2">
                <div><span className="text-primary">SYSTEM:</span> You are a cybersecurity analyst performing CAUSAL REASONING on attack chains.</div>
                <div className="pl-4">
                  <span className="text-accent">CoT Step 1:</span> Reconstruct the attack timeline from temporal information.<br/>
                  <span className="text-accent">CoT Step 2:</span> For each event pair, determine causal type: ENABLES, LEADS_TO, PRECEDES, TRIGGERS.<br/>
                  <span className="text-accent">CoT Step 3:</span> Assign temporal ordering (1, 2, 3...).<br/>
                  <span className="text-accent">CoT Step 4:</span> Assess causal confidence — strong vs. inferred.
                </div>
                <div><span className="text-warning">OUTPUT:</span> {`{causal_links: [{cause, effect, causal_type, temporal_order, confidence}]}`}</div>
              </div>
            </CardContent>
          </Card>

          <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Backbone LLM Configuration</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-muted-foreground">
              <div>Model: <span className="text-primary">google/gemini-3-flash-preview</span></div>
              <div>Mode: <span className="text-primary">Cloud-based (AI Gateway)</span></div>
              <div>Temperature: <span className="text-primary">0.1</span> (factual extraction)</div>
              <div>Prompting: <span className="text-primary">Chain-of-Thought (CoT)</span></div>
              <div>Anti-hallucination: <span className="text-primary">RAG + confidence thresholds</span></div>
              <div>Structured Output: <span className="text-primary">Tool calling (JSON schema)</span></div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
