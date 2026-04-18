import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Network, Tag, ArrowRight, Play, Loader2, Database, ShieldCheck, AlertTriangle, DownloadCloud, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useThreatPipeline } from "@/hooks/use-threat-pipeline";
import { persistExtraction, type ThreatEntity, type ThreatRelation } from "@/lib/threat-pipeline";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  threat_actor: "bg-threat-critical/20 text-threat-critical",
  malware: "bg-threat-high/20 text-threat-high",
  ttp: "bg-primary/20 text-primary",
  vulnerability: "bg-threat-medium/20 text-threat-medium",
  software: "bg-info/20 text-info",
  infrastructure: "bg-muted-foreground/20 text-muted-foreground",
};

const nodeColorMap: Record<string, string> = {
  threat_actor: "hsl(0, 72%, 55%)",
  malware: "hsl(25, 95%, 53%)",
  ttp: "hsl(160, 70%, 45%)",
  vulnerability: "hsl(38, 92%, 50%)",
  software: "hsl(200, 80%, 55%)",
  infrastructure: "hsl(215, 12%, 55%)",
};

const SAMPLE = `APT-29 used SUNBURST backdoor in the SolarWinds Orion supply chain attack (T1195.002). SUNBURST exploited CVE-2020-10148 and communicated via avsvmcloud[.]com (185.225.69.24). TEARDROP dropper implemented T1071.001 for C2. APT-29 also used RAINDROP loader targeting Microsoft Exchange.`;

export default function KGConstruction() {
  const [inputText, setInputText] = useState(SAMPLE);
  const [ingesting, setIngesting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const pipeline = useThreatPipeline();

  const handleExtract = async () => {
    const pre = await pipeline.runPreprocess(inputText);
    if (!pre) return;
    // Layer B+C: Vector RAG + GraphRAG retrieval
    const rag = await pipeline.runRetrieval(pre.cleaned_text, 3);
    // Layer 2: extraction grounded with retrieved context
    const ext = await pipeline.runExtraction(
      pre.cleaned_text, "full", pre.source_type, pre.reliability_score,
      rag?.context_block ?? "",
    );
    if (!ext) return;
    // Layer A: deterministic KB grounding (MITRE/CVE/STIX)
    await pipeline.runKBValidation(
      ext.ner?.entities || [],
      ext.re?.relations || [],
      ext.causality?.causal_links || [],
    );
    // Layer C cold-start fix: persist extraction so GraphRAG warms up
    try {
      const persisted = await persistExtraction(pre.cleaned_text, pre.source_type, ext);
      toast.success(`GraphRAG warmed: persisted to KG (report ${persisted.report_id.slice(0, 8)}…)`);
    } catch (e) {
      toast.error(`KG persistence failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  const handleIngestKB = async () => {
    setIngesting(true);
    toast.info("Ingesting MITRE ATT&CK + CISA KEV — this may take 20–40s…");
    try {
      const { data, error } = await supabase.functions.invoke("kb-ingest", {
        body: { sources: ["mitre", "kev"] },
      });
      if (error) throw error;
      toast.success(`KB updated → ${data?.kb_size ?? "?"} canonical IDs (mitre=${data?.results?.mitre ?? 0}, kev=${data?.results?.kev ?? 0})`);
    } catch (e) {
      toast.error(`KB ingest failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setIngesting(false);
    }
  };

  const handleBootstrapCorpus = async () => {
    setBootstrapping(true);
    toast.info("Bootstrapping GraphRAG corpus from CISA KEV — ~2-4 min for 25 advisories…");
    try {
      const { data, error } = await supabase.functions.invoke("cisa-advisories-ingest", {
        body: { limit: 25, skip_existing: true },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "ingest failed");
      toast.success(
        `Bootstrap done → ${data?.succeeded ?? 0} advisories ingested. ` +
        `Corpus: ${data?.corpus?.reports ?? 0} reports / ${data?.corpus?.entities ?? 0} entities. ` +
        `Layer B+C is now warm.`,
      );
    } catch (e) {
      toast.error(`Bootstrap failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBootstrapping(false);
    }
  };

  const entities: ThreatEntity[] = pipeline.extraction?.ner?.entities || [];
  const relations: ThreatRelation[] = pipeline.extraction?.re?.relations || [];

  // Generate graph layout from extracted entities
  const graphData = useMemo(() => {
    if (entities.length === 0) return { nodes: [], edges: [] };

    const nodes = entities.map((e, i) => {
      const angle = (2 * Math.PI * i) / entities.length;
      const radius = 35;
      return {
        id: e.name,
        x: 50 + radius * Math.cos(angle),
        y: 50 + radius * Math.sin(angle),
        type: e.type,
        size: e.type === "threat_actor" ? 28 : e.type === "malware" ? 22 : 16,
        confidence: e.confidence,
      };
    });

    const edges = relations.map((r) => ({
      from: nodes.findIndex((n) => n.id === r.source),
      to: nodes.findIndex((n) => n.id === r.target),
      relation: r.relation,
    })).filter((e) => e.from >= 0 && e.to >= 0);

    return { nodes, edges };
  }, [entities, relations]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge Graph Construction</h1>
          <p className="text-sm text-muted-foreground mt-1">Live LLM-driven entity extraction & relation mapping (Ch. 3)</p>
        </div>
        {pipeline.isProcessing && (
          <Badge variant="secondary" className="bg-info/20 text-info gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {pipeline.currentStep}
          </Badge>
        )}
      </div>

      {/* Input */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Threat Text → Knowledge Graph</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={inputText} onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste threat intelligence text..."
            className="min-h-[80px] font-mono text-xs bg-secondary/30" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleExtract} disabled={pipeline.isProcessing} className="gap-2">
              <Play className="w-4 h-4" /> Extract, Validate & Persist to KG
            </Button>
            <Button onClick={handleIngestKB} disabled={ingesting} variant="outline" className="gap-2">
              {ingesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
              Refresh KB (MITRE ATT&amp;CK + CISA KEV)
            </Button>
            <Button onClick={handleBootstrapCorpus} disabled={bootstrapping} variant="outline" className="gap-2">
              {bootstrapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Bootstrap GraphRAG Corpus (CISA advisories)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            <strong>Extract</strong> runs Layers B+C (RAG/GraphRAG) → LLM extraction → Layer A (KB grounding) → persists to KG.
            <strong> Refresh KB</strong> updates Layer A ground truth (~700 MITRE + ~1100 CVEs in <code className="font-mono">kb_entries</code>).
            <strong> Bootstrap</strong> seeds Layer B+C corpus by running 25 recent CISA advisories through the full pipeline (solves cold-start). Layer A is never touched by Bootstrap.
          </p>
        </CardContent>
      </Card>

      {/* Layer B+C: RAG context retrieved before extraction */}
      {pipeline.rag && (
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="w-4 h-4 text-info" />
              Layer B + C — Retrieved Context (Vector RAG + GraphRAG)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-info/15 text-info">
                {pipeline.rag.similar_reports.length} similar prior reports
              </Badge>
              <Badge variant="secondary" className="bg-primary/15 text-primary">
                {pipeline.rag.subgraph.entities.length} prior entities
              </Badge>
              <Badge variant="secondary" className="bg-primary/15 text-primary">
                {pipeline.rag.subgraph.relations.length} prior relations
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                embedding: {pipeline.rag.embedding_used ? "text-embedding-004" : "none"}
              </Badge>
            </div>
            {pipeline.rag.context_block ? (
              <pre className="p-2 rounded bg-secondary/40 max-h-40 overflow-auto font-mono text-[10px] whitespace-pre-wrap">
                {pipeline.rag.context_block}
              </pre>
            ) : (
              <p className="text-muted-foreground">No prior history matched — extraction runs ungrounded for this event (cold-start).</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Layer A: KB grounding result */}
      {pipeline.kbValidation && (
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-threat-low" />
              Layer A — Authoritative KB Grounding (MITRE / CVE / STIX)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-threat-low/15 text-threat-low">
                {pipeline.kbValidation.summary.ok}/{pipeline.kbValidation.summary.total_checks} verified
                ({(pipeline.kbValidation.accuracy * 100).toFixed(0)}%)
              </Badge>
              {pipeline.kbValidation.summary.hallucinated > 0 && (
                <Badge variant="secondary" className="bg-threat-critical/15 text-threat-critical gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {pipeline.kbValidation.summary.hallucinated} hallucinated
                </Badge>
              )}
              {pipeline.kbValidation.summary.malformed > 0 && (
                <Badge variant="secondary" className="bg-threat-high/15 text-threat-high">
                  {pipeline.kbValidation.summary.malformed} malformed
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">KB size: {pipeline.kbValidation.kb_size}</Badge>
            </div>
            {pipeline.kbValidation.findings.filter(f => f.kind !== "ok").slice(0, 6).map((f, i) => (
              <div key={i} className="p-2 rounded bg-secondary/30 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-threat-high mt-0.5 shrink-0" />
                <div className="flex-1">
                  <span className="font-mono">{f.raw_value}</span>
                  <span className="text-muted-foreground"> — {f.kind} ({f.id_type})</span>
                  {f.suggestion && <span className="text-muted-foreground"> · suggest: <span className="font-mono">{f.suggestion}</span></span>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {graphData.nodes.length > 0 && (
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Network className="w-4 h-4 text-primary" /> LLM-Generated Knowledge Graph
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full h-[320px] bg-secondary/20 rounded-lg overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                {graphData.edges.map((edge, i) => {
                  const from = graphData.nodes[edge.from];
                  const to = graphData.nodes[edge.to];
                  if (!from || !to) return null;
                  return (
                    <motion.line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="hsl(220, 14%, 25%)" strokeWidth="0.3"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: i * 0.1, duration: 0.5 }} />
                  );
                })}
                {graphData.nodes.map((node, i) => (
                  <motion.g key={node.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.08 }}>
                    <circle cx={node.x} cy={node.y} r={node.size / 10} fill={nodeColorMap[node.type] || "#888"} opacity={0.15} />
                    <circle cx={node.x} cy={node.y} r={node.size / 16} fill={nodeColorMap[node.type] || "#888"} />
                    <text x={node.x} y={node.y + node.size / 8 + 2} textAnchor="middle" fill="hsl(215, 12%, 55%)" fontSize="2" fontFamily="monospace">
                      {node.id.length > 15 ? node.id.slice(0, 12) + "…" : node.id}
                    </text>
                  </motion.g>
                ))}
              </svg>
              <div className="absolute bottom-3 right-3 flex flex-wrap gap-2">
                {Object.entries(nodeColorMap).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    {type}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="entities">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="entities">Entities (NER) {entities.length > 0 && `(${entities.length})`}</TabsTrigger>
          <TabsTrigger value="relations">Relations (RE) {relations.length > 0 && `(${relations.length})`}</TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="mt-4">
          {entities.length > 0 ? (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">Entity</th>
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">Type</th>
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">Confidence</th>
                        <th className="text-left p-3 text-xs text-muted-foreground font-medium">MITRE ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entities.map((entity, i) => (
                        <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                          className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                          <td className="p-3 font-mono text-sm">{entity.name}</td>
                          <td className="p-3"><Badge variant="secondary" className={typeColors[entity.type] || ""}>{entity.type}</Badge></td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-secondary">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${entity.confidence * 100}%` }} />
                              </div>
                              <span className="text-xs font-mono text-muted-foreground">{(entity.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-xs text-muted-foreground">{entity.mitre_id || "-"}</td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Run "Extract & Build KG" to see LLM-extracted entities
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="relations" className="mt-4">
          {relations.length > 0 ? (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-4 space-y-3">
                {relations.map((rel, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                    <span className="font-mono text-sm text-foreground">{rel.source}</span>
                    <Badge variant="outline" className="text-xs border-primary/30 text-primary">{rel.relation}</Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-sm text-foreground">{rel.target}</span>
                    <span className="ml-auto text-xs font-mono text-muted-foreground">{(rel.confidence * 100).toFixed(0)}%</span>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50 bg-card/80">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">
                Run "Extract & Build KG" to see LLM-extracted relations
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
