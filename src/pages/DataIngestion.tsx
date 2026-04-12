import { motion } from "framer-motion";
import { Upload, FileText, Globe, MessageSquare, CheckCircle, Clock, AlertCircle, RefreshCw, Layers, Code2, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ── Data Sources (Ch. 3.2: Multi-Source & Multi-Modal Data Fusion) ── */
const dataSources = [
  { name: "MITRE ATT&CK", type: "Knowledge Base (STIX 2.1)", status: "synced", records: "14,200", lastSync: "2h ago", icon: Globe, reliability: 0.95 },
  { name: "OSINT Feeds", type: "Threat Reports (PDF/HTML)", status: "syncing", records: "8,340", lastSync: "Active", icon: RefreshCw, reliability: 0.85 },
  { name: "PDF Reports", type: "Documents (FireEye, Mandiant)", status: "synced", records: "2,150", lastSync: "4h ago", icon: FileText, reliability: 0.85 },
  { name: "Security Forums", type: "Unstructured (High Noise)", status: "pending", records: "1,890", lastSync: "12h ago", icon: MessageSquare, reliability: 0.50 },
];

/* ── 4-Layer Architecture (Ch. 3.1) ── */
const architectureLayers = [
  { layer: 1, name: "Data Acquisition Layer", desc: "Multi-source ingestion: PDF, blog, forum, STIX feeds. Cleaning, deduplication, IOC normalization.", status: "active", color: "bg-info" },
  { layer: 2, name: "LLM Extraction Layer", desc: "Cloud-based backbone LLM (Gemini/GPT) with CoT prompting for NER, RE, and causal extraction.", status: "active", color: "bg-primary" },
  { layer: 3, name: "Knowledge Graph Storage Layer", desc: "Temporal KG G(t) = (V(t), E(t), τ) with conflict detection and entity merging.", status: "active", color: "bg-success" },
  { layer: 4, name: "Inference Application Layer", desc: "Neuro-symbolic attribution reasoning: attack path reconstruction + credibility scoring.", status: "active", color: "bg-warning" },
];

/* ── Pipeline stages ── */
const pipelineStages = [
  { name: "Data Collection & Cleaning", progress: 100, items: "42 sources", detail: "PDF cleaning, HTML stripping, IOC normalization" },
  { name: "LLM Entity Extraction (NER)", progress: 87, items: "38 processed", detail: "CoT prompting → threat_actor, malware, CVE, TTP" },
  { name: "Relation Extraction (RE)", progress: 64, items: "27 analyzed", detail: "CoT prompting → uses, exploits, targets, attributed_to" },
  { name: "Causal Link Extraction", progress: 52, items: "22 analyzed", detail: "Temporal ordering → enables, leads_to, triggers" },
  { name: "KG Integration & Conflict Resolution", progress: 45, items: "19 merged", detail: "Entity merging, credibility weighting, deduplication" },
];

/* ── Preprocessing steps (Ch. 3.2) ── */
const preprocessingSteps = [
  { source: "PDF Reports", steps: ["Page break removal", "Header/footer stripping", "Table extraction", "IOC defanging (IP→IP[.]x)", "Hash normalization (→lowercase)"], reliability: "High (0.85)" },
  { source: "Blog Posts", steps: ["HTML tag stripping", "Script/style removal", "Navigation cleanup", "Whitespace normalization", "IOC extraction"], reliability: "Medium (0.70)" },
  { source: "Security Forums", steps: ["Quote removal", "Signature stripping", "Noise filtering", "IOC normalization", "Reliability downweighting"], reliability: "Low (0.50)" },
  { source: "STIX 2.1 Feeds", steps: ["Schema validation", "Object type mapping", "Relationship parsing", "Timestamp alignment", "Direct KG import"], reliability: "Very High (0.95)" },
];

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle }> = {
  synced: { color: "bg-success/20 text-success", icon: CheckCircle },
  syncing: { color: "bg-info/20 text-info", icon: RefreshCw },
  pending: { color: "bg-warning/20 text-warning", icon: Clock },
  error: { color: "bg-destructive/20 text-destructive", icon: AlertCircle },
};

export default function DataIngestion() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Data Ingestion & Architecture</h1>
          <p className="text-sm text-muted-foreground mt-1">4-Layer System Architecture & Multi-Source Data Fusion (Ch. 3.1–3.2)</p>
        </div>
        <Button className="gap-2">
          <Upload className="w-4 h-4" /> Import Data
        </Button>
      </div>

      {/* 4-Layer Architecture (Ch. 3.1) */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" /> System Architecture (Ch. 3.1)
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
            Backbone LLM: <span className="text-primary">Cloud-based</span> via Lovable AI Gateway → Google Gemini / OpenAI GPT-5
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sources">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="sources">Data Sources</TabsTrigger>
          <TabsTrigger value="preprocessing">Preprocessing (Ch. 3.2)</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="prompts">Prompt Engineering (Ch. 3.3)</TabsTrigger>
        </TabsList>

        {/* Data Sources */}
        <TabsContent value="sources" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dataSources.map((source, i) => {
              const cfg = statusConfig[source.status];
              return (
                <motion.div key={source.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                  <Card className="border-border/50 bg-card/80 hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <source.icon className="w-5 h-5 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium">{source.name}</h3>
                            <p className="text-xs text-muted-foreground">{source.type}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className={cfg.color}>
                          <cfg.icon className="w-3 h-3 mr-1" />
                          {source.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground font-mono">
                        <span>{source.records} records</span>
                        <span>Reliability: {source.reliability}</span>
                        <span>Last: {source.lastSync}</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* Multi-Source Preprocessing (Ch. 3.2) */}
        <TabsContent value="preprocessing" className="mt-4">
          <div className="space-y-4">
            {preprocessingSteps.map((src, i) => (
              <motion.div key={src.source} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <Card className="border-border/50 bg-card/80">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium">{src.source}</h3>
                      <Badge variant="outline" className="text-xs font-mono">{src.reliability}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {src.steps.map((step, j) => (
                        <span key={j} className="px-2 py-1 rounded bg-secondary/50 text-[11px] text-muted-foreground font-mono">
                          {j + 1}. {step}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Pipeline Progress */}
        <TabsContent value="pipeline" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Processing Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {pipelineStages.map((stage, i) => (
                <div key={stage.name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-mono">{i + 1}</span>
                      <div>
                        <span>{stage.name}</span>
                        <p className="text-[10px] text-muted-foreground">{stage.detail}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">{stage.items} · {stage.progress}%</span>
                  </div>
                  <Progress value={stage.progress} className="h-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Prompt Engineering (Ch. 3.3) - CoT Prompts */}
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
                <div><span className="text-warning">CONSTRAINT:</span> Only extract explicitly stated information. Flag uncertain attributions with confidence {"<"} 0.7. Do NOT hallucinate connections.</div>
                <div><span className="text-info">FORMAT:</span> Return structured JSON with STIX 2.1 schema mapping.</div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" /> Causality CoT Prompt (Ch. 4 Integration)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-secondary/50 rounded-lg p-4 font-mono text-xs leading-relaxed text-muted-foreground space-y-2">
                <div><span className="text-primary">SYSTEM:</span> You are a cybersecurity analyst performing CAUSAL REASONING on attack chains.</div>
                <div className="pl-4">
                  <span className="text-accent">CoT Step 1:</span> Reconstruct the attack timeline from temporal information.<br/>
                  <span className="text-accent">CoT Step 2:</span> For each event pair, determine causal type:<br/>
                  <span className="text-muted-foreground pl-4">→ ENABLES (initial access enables lateral movement)</span><br/>
                  <span className="text-muted-foreground pl-4">→ LEADS_TO (exploitation leads to code execution)</span><br/>
                  <span className="text-muted-foreground pl-4">→ PRECEDES (in kill chain ordering)</span><br/>
                  <span className="text-muted-foreground pl-4">→ TRIGGERS (beacon triggers C2 communication)</span><br/>
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
              <div>Mode: <span className="text-primary">Cloud-based (API Gateway)</span></div>
              <div>Temperature: <span className="text-primary">0.1</span> (factual extraction)</div>
              <div>Prompting: <span className="text-primary">Chain-of-Thought (CoT)</span></div>
              <div>Anti-hallucination: <span className="text-primary">RAG + confidence thresholds</span></div>
              <div>Gateway: <span className="text-primary">ai.gateway.lovable.dev</span></div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
