import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Network, ArrowRight, Play, Loader2, Database, ShieldCheck, AlertTriangle,
  DownloadCloud, Sparkles, FileText, FlaskConical, Rss, Upload, Plug,
  LayoutDashboard, Crosshair, RefreshCw, GitBranch, Workflow, Gauge, Share2, Brain,
  ImageDown, Bot,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { buildForceSvg, buildTimelineSvg, buildLegacySnapshot, type ExportNode, type ExportEdge } from "@/lib/svg-export";
import { useThreatPipeline } from "@/hooks/use-threat-pipeline";
import { persistExtraction, type ThreatEntity, type ThreatRelation, type ReproConfig, DEFAULT_REPRO } from "@/lib/threat-pipeline";
import { supabase } from "@/integrations/supabase/client";
import { CorpusHealth } from "@/components/CorpusHealth";
import { sampleTestCases } from "@/lib/test-corpus";
import { ReproPanel, loadRepro, type ReproPreset } from "@/components/ReproPanel";
import { buildTimelineLayout, causalColor, CAUSAL_TYPES } from "@/lib/timeline-layout";
import { toast } from "sonner";
import { DomainBanner } from "@/components/DomainSwitch";
import { useDomain } from "@/contexts/DomainContext";
import { AgentLoopPanel } from "@/components/AgentLoopPanel";
import { MultiModalFusionMock } from "@/components/MultiModalFusionMock";
import { HypergraphPathwayPanel } from "@/components/HypergraphPathwayPanel";
import { RuleGovernancePanel } from "@/components/RuleGovernancePanel";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

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
  campaign: "hsl(280, 70%, 60%)",
  indicator: "hsl(190, 70%, 50%)",
  identity: "hsl(50, 70%, 55%)",
};

const SAMPLE = `APT-29 used SUNBURST backdoor in the SolarWinds Orion supply chain attack (T1195.002). SUNBURST exploited CVE-2020-10148 and communicated via avsvmcloud[.]com (185.225.69.24). TEARDROP dropper implemented T1071.001 for C2. APT-29 also used RAINDROP loader targeting Microsoft Exchange.`;

interface FeedRow { id: string; source_text: string; created_at: string; source_type: string | null }

interface ConsumerCard {
  name: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "active" | "reserved";
  to?: string;
}

const DOWNSTREAM_CONSUMERS: ConsumerCard[] = [
  { name: "Dashboard review", desc: "Human analyst inspection of nodes, edges and causal links.", icon: LayoutDashboard, status: "active", to: "/" },
  { name: "Attribution engine", desc: "Graph-aware actor attribution via threat-kg-query.", icon: Crosshair, status: "active", to: "/attribution" },
  { name: "GraphRAG warm-up", desc: "Persisted KG becomes step-2 retrieval context for the next pipeline run.", icon: RefreshCw, status: "active" },
  { name: "Conflict & credibility scoring", desc: "Neuro-symbolic rules consume entities, relations and edges.", icon: GitBranch, status: "active" },
  { name: "Automated response playbooks", desc: "Reserved — future SOAR hand-off (block IOC, isolate host).", icon: Workflow, status: "reserved" },
  { name: "Risk scoring & decision support", desc: "Reserved — analyst-assist for prioritisation and triage.", icon: Gauge, status: "reserved" },
  { name: "STIX 2.1 export to SIEM", desc: "Reserved — future bundle export endpoint for downstream tooling.", icon: Share2, status: "reserved" },
  { name: "ML feedback loop", desc: "Not implemented — would introduce a learned component and break the zero-shot posture.", icon: Brain, status: "reserved" },
];

export default function KGConstruction() {
  const [inputText, setInputText] = useState(SAMPLE);
  const [activeSource, setActiveSource] = useState("paste");
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [feedRows, setFeedRows] = useState<FeedRow[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [n1kRows, setN1kRows] = useState<Array<{ id: string; title: string | null; source_feed: string; publisher: string | null; raw_text: string }>>([]);
  const [n1kLoading, setN1kLoading] = useState(false);
  const [n1kTotal, setN1kTotal] = useState<number | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [viewMode, setViewMode] = useState<"force" | "timeline">("force");
  const [centerPivot, setCenterPivot] = useState<"auto" | "campaign" | "actor" | "malware">("auto");
  const [includeSynthesized, setIncludeSynthesized] = useState(true);
  const initial = loadRepro();
  const [reproPreset, setReproPreset] = useState<ReproPreset>(initial.preset);
  const [repro, setRepro] = useState<ReproConfig>(initial.config);
  const pipeline = useThreatPipeline();
  const { domain } = useDomain();
  // Corpus is CTI-only in the current build; when the user switches to Clinical,
  // hide the CTI cases rather than mixing them with a clinical selector.
  const domainCases = domain === "cti" ? sampleTestCases : [];

  // Lazy-load the live feed when user opens the tab
  useEffect(() => {
    if (activeSource !== "feed" || feedRows.length > 0) return;
    setFeedLoading(true);
    supabase
      .from("threat_reports")
      .select("id,source_text,created_at,source_type")
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (error) toast.error(`Live feed load failed: ${error.message}`);
        else setFeedRows((data ?? []) as FeedRow[]);
        setFeedLoading(false);
      });
  }, [activeSource, feedRows.length]);

  // Lazy-load N1K bench_cases when user opens that tab
  useEffect(() => {
    if (activeSource !== "n1k" || n1kRows.length > 0) return;
    setN1kLoading(true);
    Promise.all([
      supabase.from("bench_cases").select("id,title,source_feed,publisher,raw_text").order("created_at", { ascending: false }).limit(50),
      supabase.from("bench_cases").select("*", { count: "exact", head: true }),
    ]).then(([rows, count]) => {
      if (rows.error) toast.error(`N1K load failed: ${rows.error.message}`);
      else setN1kRows((rows.data ?? []) as any);
      setN1kTotal(count.count ?? 0);
      setN1kLoading(false);
    });
  }, [activeSource, n1kRows.length]);

  const handleSelectCase = (id: string) => {
    setSelectedCaseId(id);
    const tc = sampleTestCases.find((c) => c.id === id);
    if (tc) {
      setInputText(tc.text);
      toast.success(`Loaded corpus case ${tc.id} — ${tc.source}`);
    }
  };

  const handleSelectFeedRow = (row: FeedRow) => {
    setInputText(row.source_text);
    toast.success(`Loaded live report ${row.id.slice(0, 8)}…`);
  };

  const handleExtract = async () => {
    const pre = await pipeline.runPreprocess(inputText);
    if (!pre) return;
    const rag = await pipeline.runRetrieval(pre.cleaned_text, repro.topK, repro.frozenSnapshotAt);
    const ext = await pipeline.runExtraction(
      pre.cleaned_text, "full", pre.source_type, pre.reliability_score,
      rag?.context_block ?? "", repro,
    );
    if (!ext) return;
    await pipeline.runKBValidation(
      ext.ner?.entities || [],
      ext.re?.relations || [],
      ext.causality?.causal_links || [],
      pre.cleaned_text,
    );
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
      const { data, error } = await supabase.functions.invoke("kb-ingest", { body: { sources: ["mitre", "kev"] } });
      if (error) throw error;
      toast.success(`KB updated → ${data?.kb_size ?? "?"} canonical IDs (mitre=${data?.results?.mitre ?? 0}, kev=${data?.results?.kev ?? 0})`);
    } catch (e) {
      toast.error(`KB ingest failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setIngesting(false); }
  };

  const handleBootstrapCorpus = async () => {
    setBootstrapping(true);
    try {
      const { data, error } = await supabase.functions.invoke("cisa-advisories-ingest", {
        body: { limit: 10, skip_existing: true },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error || "ingest failed");
      toast.success(
        `Bootstrap queued (${data?.limit ?? 10} advisories). Running in background — Layer B+C will warm in ~1-2 min.`,
        { duration: 8000 },
      );
    } catch (e) {
      toast.error(`Bootstrap failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setBootstrapping(false); }
  };

  const baseEntities: ThreatEntity[] = pipeline.extraction?.ner?.entities || [];
  const baseRelations: ThreatRelation[] = pipeline.extraction?.re?.relations || [];
  const synth = pipeline.kbValidation?.synthesized;

  const entities: ThreatEntity[] = useMemo(() => {
    if (!includeSynthesized || !synth) return baseEntities;
    if (baseEntities.some((e) => e.name === synth.entity.name)) return baseEntities;
    return [...baseEntities, synth.entity];
  }, [baseEntities, synth, includeSynthesized]);
  const relations: ThreatRelation[] = useMemo(() => {
    if (!includeSynthesized || !synth) return baseRelations;
    return [...baseRelations, ...synth.relations];
  }, [baseRelations, synth, includeSynthesized]);

  // Resolve effective pivot node based on centerPivot selector
  const pivotEntity: ThreatEntity | null = useMemo(() => {
    if (entities.length === 0) return null;
    const wantedTypes: Record<string, string[]> = {
      campaign: ["campaign"],
      actor: ["threat_actor"],
      malware: ["malware"],
    };
    if (centerPivot === "auto") {
      // degree-centrality: highest-edge node
      const deg = new Map<string, number>();
      for (const r of relations) {
        deg.set(r.source, (deg.get(r.source) || 0) + 1);
        deg.set(r.target, (deg.get(r.target) || 0) + 1);
      }
      let best: ThreatEntity | null = null;
      let bestDeg = -1;
      for (const e of entities) {
        const d = deg.get(e.name) || 0;
        if (d > bestDeg) { best = e; bestDeg = d; }
      }
      return best;
    }
    const types = wantedTypes[centerPivot] || [];
    return entities.find((e) => types.includes(String(e.type))) || null;
  }, [entities, relations, centerPivot]);

  const graphData = useMemo(() => {
    if (entities.length === 0) return { nodes: [], edges: [] };
    // Concentric layout when a pivot is identified; else original ring
    if (pivotEntity) {
      const others = entities.filter((e) => e.name !== pivotEntity.name);
      const ringByType: Record<string, number> = {
        campaign: 18, threat_actor: 22, malware: 28, ttp: 34, vulnerability: 34,
        infrastructure: 40, software: 40, indicator: 40, identity: 40,
      };
      const buckets = new Map<number, ThreatEntity[]>();
      for (const e of others) {
        const r = ringByType[String(e.type)] ?? 36;
        if (!buckets.has(r)) buckets.set(r, []);
        buckets.get(r)!.push(e);
      }
      const nodes: { id: string; x: number; y: number; type: string; size: number; confidence: number; synthesised?: boolean }[] = [];
      nodes.push({
        id: pivotEntity.name, x: 50, y: 50, type: String(pivotEntity.type),
        size: 32, confidence: pivotEntity.confidence,
        synthesised: (pivotEntity as any).synthesised === true,
      });
      for (const [radius, list] of buckets.entries()) {
        list.forEach((e, i) => {
          const angle = (2 * Math.PI * i) / list.length;
          nodes.push({
            id: e.name,
            x: 50 + radius * Math.cos(angle),
            y: 50 + radius * Math.sin(angle),
            type: String(e.type),
            size: e.type === "threat_actor" ? 26 : e.type === "malware" ? 22 : 16,
            confidence: e.confidence,
            synthesised: (e as any).synthesised === true,
          });
        });
      }
      const edges = relations.map((r) => ({
        from: nodes.findIndex((n) => n.id === r.source),
        to: nodes.findIndex((n) => n.id === r.target),
        relation: r.relation,
        synthesised: (r as any).synthesised === true,
      })).filter((e) => e.from >= 0 && e.to >= 0);
      return { nodes, edges };
    }
    // Fallback: original equal-angle ring
    const nodes = entities.map((e, i) => {
      const angle = (2 * Math.PI * i) / entities.length;
      const radius = 35;
      return {
        id: e.name,
        x: 50 + radius * Math.cos(angle),
        y: 50 + radius * Math.sin(angle),
        type: String(e.type),
        size: e.type === "threat_actor" ? 28 : e.type === "malware" ? 22 : 16,
        confidence: e.confidence,
        synthesised: (e as any).synthesised === true,
      };
    });
    const edges = relations.map((r) => ({
      from: nodes.findIndex((n) => n.id === r.source),
      to: nodes.findIndex((n) => n.id === r.target),
      relation: r.relation,
      synthesised: (r as any).synthesised === true,
    })).filter((e) => e.from >= 0 && e.to >= 0);
    return { nodes, edges };
  }, [entities, relations, pivotEntity]);

  const timelineData = useMemo(
    () => buildTimelineLayout(pipeline.extraction ?? null),
    [pipeline.extraction]
  );
  const hasTemporal = timelineData.nodes.length > 0;

  const persisted = pipeline.persistence?.persisted ?? false;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    setDownloading(true);
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      // Force a solid background for the PNG
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", "100");
      bg.setAttribute("height", "100");
      bg.setAttribute("fill", "#0b0f17");
      clone.insertBefore(bg, clone.firstChild);
      const xml = new XMLSerializer().serializeToString(clone);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      const dataUrl = `data:image/svg+xml;base64,${svg64}`;

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("svg load failed"));
        img.src = dataUrl;
      });

      const scale = 4; // upscale for crisp PNG
      const canvas = document.createElement("canvas");
      canvas.width = 1024 * (scale / 4);
      canvas.height = 1024 * (scale / 4);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas context unavailable");
      ctx.fillStyle = "#0b0f17";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-graph-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Knowledge Graph exported as PNG");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export PNG");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadMermaid = () => {
    try {
      const sanitizeId = (s: string) =>
        "n_" + s.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
      const escapeLabel = (s: string) => s.replace(/"/g, "'").slice(0, 60);
      const typeShape: Record<string, [string, string]> = {
        threat_actor: ["((", "))"],
        campaign: ["{{", "}}"],
        malware: ["[", "]"],
        vulnerability: ["[/", "/]"],
        ttp: ["[\\", "\\]"],
        infrastructure: ["[(", ")]"],
        software: ["[", "]"],
        indicator: [">", "]"],
        identity: ["([", "])"],
      };
      const lines: string[] = [];
      lines.push("%% ThreatGraph Knowledge Graph (Mermaid) — 2 graphs in one file");
      lines.push(`%% Generated: ${new Date().toISOString()}`);
      lines.push(`%% Pivot: ${pivotEntity?.name ?? "auto"}  |  Nodes: ${entities.length}  Edges: ${relations.length}`);
      lines.push("%% Graph 1/2: Static KG (entities + relations + synthesised campaign)");
      lines.push("graph LR");
      const idMap = new Map<string, string>();
      entities.forEach((e, i) => {
        let id = sanitizeId(e.name) || `n${i}`;
        while ([...idMap.values()].includes(id)) id += "_" + i;
        idMap.set(e.name, id);
        const [open, close] = typeShape[e.type] ?? ["[", "]"];
        const tag = e.mitre_id ? ` ${e.mitre_id}` : "";
        const synth = (e as any).synthesised ? " *" : "";
        lines.push(`  ${id}${open}"${escapeLabel(e.name)}${tag}${synth}"${close}:::${e.type}`);
      });
      relations.forEach((r) => {
        const s = idMap.get(r.source);
        const t = idMap.get(r.target);
        if (!s || !t) return;
        const arrow = (r as any).synthesised ? "-.->" : "-->";
        lines.push(`  ${s} ${arrow}|"${escapeLabel(r.relation)}"| ${t}`);
      });
      lines.push("");
      lines.push("  classDef threat_actor fill:#dc2626,stroke:#7f1d1d,color:#fff;");
      lines.push("  classDef campaign fill:#a855f7,stroke:#581c87,color:#fff;");
      lines.push("  classDef malware fill:#ea580c,stroke:#7c2d12,color:#fff;");
      lines.push("  classDef vulnerability fill:#eab308,stroke:#713f12,color:#000;");
      lines.push("  classDef ttp fill:#0ea5e9,stroke:#0c4a6e,color:#fff;");
      lines.push("  classDef infrastructure fill:#10b981,stroke:#064e3b,color:#fff;");
      lines.push("  classDef software fill:#6366f1,stroke:#312e81,color:#fff;");
      lines.push("  classDef indicator fill:#94a3b8,stroke:#334155,color:#000;");
      lines.push("  classDef identity fill:#f472b6,stroke:#831843,color:#fff;");

      // ── Second graph: Timeline / Causal layer (neuro-symbolic justification) ──
      const causal = pipeline.extraction?.causality?.causal_links || [];
      const timeline = pipeline.extraction?.causality?.attack_timeline || [];
      const killChain = pipeline.extraction?.causality?.kill_chain_mapping || [];
      if (causal.length > 0 || timeline.length > 0 || killChain.length > 0) {
        lines.push("");
        lines.push("%% ───────────────────────────────────────────────");
        lines.push("%% Graph 2/2: Temporal & Causal layer");
        lines.push("%% Sourced from extraction.causality (enables / leads_to / triggers / precedes)");
        lines.push("%% Justifies the neuro-symbolic reasoning layer (path-weighted attribution)");
        lines.push("%% ───────────────────────────────────────────────");
        lines.push("graph TD");

        const evIdMap = new Map<string, string>();
        const evId = (label: string) => {
          if (evIdMap.has(label)) return evIdMap.get(label)!;
          const id = "ev_" + (evIdMap.size + 1) + "_" + label.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
          evIdMap.set(label, id);
          return id;
        };

        // Kill-chain tactic subgraphs (if available)
        if (killChain.length > 0) {
          killChain.forEach((kc, ki) => {
            const sgId = "tactic_" + ki + "_" + (kc.tactic || "unknown").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 20);
            const tech = kc.technique_id ? ` ${kc.technique_id}` : "";
            lines.push(`  subgraph ${sgId}["${escapeLabel(kc.tactic || "tactic")}${tech}"]`);
            (kc.events || []).forEach((ev) => {
              lines.push(`    ${evId(ev)}["${escapeLabel(ev)}"]`);
            });
            lines.push("  end");
          });
        }

        // Ordered attack_timeline → dotted "precedes" arrows
        if (timeline.length > 0) {
          const sorted = [...timeline].sort((a, b) => (a.order || 0) - (b.order || 0));
          sorted.forEach((step) => {
            const ts = step.timestamp_mentioned ? ` [${step.timestamp_mentioned}]` : "";
            const cert = step.certainty ? ` (${step.certainty})` : "";
            lines.push(`  ${evId(step.event)}["#${step.order}: ${escapeLabel(step.event)}${ts}${cert}"]:::tlEvent`);
          });
          for (let i = 0; i < sorted.length - 1; i++) {
            lines.push(`  ${evId(sorted[i].event)} -.->|precedes| ${evId(sorted[i + 1].event)}`);
          }
        }

        // Causal links — distinct arrows per causal_type
        const arrowFor = (t: string) => {
          if (t === "enables") return "==>";
          if (t === "triggers") return "==>";
          return "-->"; // leads_to / precedes / default
        };
        causal.forEach((c, i) => {
          const sId = evId(c.cause);
          const tId = evId(c.effect);
          const tactic = c.mitre_tactic ? ` @${c.mitre_tactic}` : "";
          const conf = typeof c.confidence === "number" ? ` ${(c.confidence * 100).toFixed(0)}%` : "";
          const label = `${c.causal_type}${tactic}${conf}`;
          lines.push(`  ${sId} ${arrowFor(c.causal_type)}|"${escapeLabel(label)}"| ${tId}`);
          if (c.evidence) lines.push(`  %% [c${i}] ${c.causal_type}: ${c.evidence.slice(0, 120)}`);
        });

        // If no kill-chain and no timeline, ensure causal cause/effect nodes exist
        if (killChain.length === 0 && timeline.length === 0) {
          [...evIdMap.entries()].forEach(([label, id]) => {
            lines.push(`  ${id}["${escapeLabel(label)}"]:::tlEvent`);
          });
        }

        lines.push("");
        lines.push("  classDef tlEvent fill:#1e293b,stroke:#0ea5e9,color:#e2e8f0;");
        lines.push("  linkStyle default stroke:#f59e0b,stroke-width:1.5px;");
      } else {
        lines.push("");
        lines.push("%% Timeline/causal graph omitted: extraction.causality is empty for this case.");
      }

      const blob = new Blob([lines.join("\n")], { type: "text/vnd.mermaid;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knowledge-graph-${Date.now()}.mmd`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Knowledge Graph exported as Mermaid (.mmd)");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export Mermaid");
    }
  };

  const triggerDownload = (xml: string, suffix: string) => {
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `knowledge-graph-${suffix}-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportMeta = useMemo(() => ({
    caseId: selectedCaseId || undefined,
    preset: reproPreset,
    temperature: repro.temperature,
    seed: repro.seed,
    generatedAt: new Date().toISOString(),
  }), [selectedCaseId, reproPreset, repro]);

  const handleDownloadSvg = (variant: "light" | "dark" | "legacy") => {
    try {
      if (variant === "legacy") {
        const svg = svgRef.current;
        if (!svg) return;
        triggerDownload(buildLegacySnapshot(svg, "dark"), "snapshot");
        toast.success("KG exported (legacy snapshot)");
        return;
      }
      const theme = variant;
      let xml: string;
      if (viewMode === "timeline") {
        xml = buildTimelineSvg(timelineData.nodes, timelineData.edges, theme, exportMeta);
      } else {
        const exportNodes: ExportNode[] = graphData.nodes;
        const exportEdges: ExportEdge[] = graphData.edges;
        xml = buildForceSvg(exportNodes, exportEdges, pivotEntity?.name, theme, {
          ...exportMeta,
          centre: pivotEntity?.name,
        });
      }
      triggerDownload(xml, `${viewMode}-${variant}`);
      toast.success(`KG exported (${variant === "light" ? "Word/Print" : "Dark"} · editable)`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to export SVG");
    }
  };



  return (
    <div className="space-y-6">
      <DomainBanner />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge Graph Construction</h1>
          <p className="text-sm text-muted-foreground mt-1">Live LLM-driven entity extraction & relation mapping (Ch. 3)</p>
          <a
            href="/reports/zero-shot-attestation.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded border border-success/40 text-success text-[10px] font-mono hover:bg-success/10"
          >
            Zero-shot · frozen model · no fine-tuning
          </a>
        </div>
        {pipeline.isProcessing && (
          <Badge variant="secondary" className="bg-info/20 text-info gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {pipeline.currentStep}
          </Badge>
        )}
      </div>

      {/* ── Pathway navigator ─────────────────────────────────────── */}
      <Card className="border-border/50 bg-card/60">
        <CardContent className="p-3 flex flex-wrap gap-2 items-center text-xs">
          <span className="text-muted-foreground mr-1">Jump to pathway:</span>
          <a href="#pathway-a" className="px-2 py-1 rounded border border-purple-500/40 text-purple-300 hover:bg-purple-500/10">
            Pathway A · Agent loop <Badge variant="outline" className="ml-1 border-warning/40 text-warning">Beta</Badge>
          </a>
          <a href="#pathway-b" className="px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10">
            Pathway B · Deterministic 7-stage <Badge variant="outline" className="ml-1 border-success/40 text-success">Default</Badge>
          </a>
          <a href="#pathway-c" className="px-2 py-1 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10">
            Pathway C · Hypergraph <Badge variant="outline" className="ml-1 border-warning/40 text-warning">Beta</Badge>
          </a>
          <a href="#pathway-fusion" className="px-2 py-1 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10">
            Multi-Modal Fusion <Badge variant="outline" className="ml-1 border-muted-foreground/40 text-muted-foreground">Spec / Mock</Badge>
          </a>
          <a href="#rule-governance" className="px-2 py-1 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10">
            Rule Governance <Badge variant="outline" className="ml-1 border-muted-foreground/40 text-muted-foreground">C1–C4</Badge>
          </a>

        </CardContent>
      </Card>

      {/* ── Pathway A: Experimental agent loop ─────────────────────── */}
      <section id="pathway-a" className="scroll-mt-20 space-y-3">
        <div className="flex items-center gap-2 border-l-4 border-purple-500 pl-3 py-1">
          <Bot className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold tracking-tight">Pathway A — Agent Loop (AI-SDK, LLM chooses order)</h2>
          <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Beta · not benchmarked</Badge>
        </div>
        <AgentLoopPanel />
      </section>

      {/* ── Pathway B: Deterministic 7-stage pipeline (default) ───── */}
      <section id="pathway-b" className="scroll-mt-20 space-y-3">
        <div className="flex items-center gap-2 border-l-4 border-primary pl-3 py-1">
          <Workflow className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">
            Pathway B — Deterministic 7-stage pipeline (default · KG-Bench scored)
          </h2>
          <span className="text-[11px] text-muted-foreground">preprocess → RAG → extract → KB-validate → conflicts → KG-query → persist</span>
        </div>
        <ReproPanel
          value={repro}
          preset={reproPreset}
          onChange={(p, c) => { setReproPreset(p); setRepro(c); }}
        />


      {/* ── Multi-source input picker ─────────────────────────────── */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">KG Input Source → Knowledge Graph</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={activeSource} onValueChange={setActiveSource}>
            <TabsList className="bg-secondary/50 flex-wrap h-auto">
              <TabsTrigger value="paste" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Paste text</TabsTrigger>
              <TabsTrigger value="corpus" className="gap-1.5"><FlaskConical className="w-3.5 h-3.5" />Curated corpus (n={domainCases.length}, gold)</TabsTrigger>
              <TabsTrigger value="goldaug" className="gap-1.5"><Layers className="w-3.5 h-3.5" />GoldAug-CTI v1 (n={augStats.variants}, derived)</TabsTrigger>
              <TabsTrigger value="n1k" className="gap-1.5"><Database className="w-3.5 h-3.5" />N1K batch (bench_cases)</TabsTrigger>

              <TabsTrigger value="feed" className="gap-1.5"><Rss className="w-3.5 h-3.5" />Live feed</TabsTrigger>
              <TabsTrigger value="upload" disabled className="gap-1.5 opacity-60"><Upload className="w-3.5 h-3.5" />Upload file</TabsTrigger>
              <TabsTrigger value="api" disabled className="gap-1.5 opacity-60"><Plug className="w-3.5 h-3.5" />External API</TabsTrigger>
            </TabsList>

            <TabsContent value="paste" className="mt-3">
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste threat intelligence text..."
                className="min-h-[100px] font-mono text-xs bg-secondary/30"
              />
            </TabsContent>

            <TabsContent value="corpus" className="mt-3 space-y-2">
              {domainCases.length === 0 ? (
                <div className="p-3 rounded bg-warning/10 border border-warning/30 text-xs text-warning">
                  The hand-curated test corpus is <strong>CTI-only</strong> in the current build (n={sampleTestCases.length}).
                  Switch the domain to <strong>CTI</strong> in the header to load cases, or use <strong>Paste text</strong> in Clinical mode.
                </div>
              ) : (
                <>
                  <Select value={selectedCaseId} onValueChange={handleSelectCase}>
                    <SelectTrigger className="bg-secondary/30">
                      <SelectValue placeholder={`Select 1 of ${domainCases.length} hand-curated ${domain.toUpperCase()} cases…`} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {domainCases.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          <span className="font-mono">{c.id}</span> — {c.source.slice(0, 60)}{c.source.length > 60 ? "…" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="min-h-[80px] font-mono text-xs bg-secondary/30"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    CTI-only corpus (N={domainCases.length}, pass-1 expansion; target N=150). Selecting a case loads its real-world text into the pipeline.
                  </p>
                </>
              )}
            </TabsContent>

            <TabsContent value="goldaug" className="mt-3 space-y-2">
              <div className="p-2 rounded bg-warning/10 border border-warning/30 text-[11px] text-warning">
                <strong>GoldAug-CTI v1</strong> — {augStats.variants} variants derived from the {augStats.seeds} gold seeds
                (alias swaps, defanged IOCs, boilerplate distractors, sentence rotation, prompt injection, temporal defects).
                Kept <strong>separate</strong> from Gold-56: useful for stress-loading KG construction and robustness checks,
                but it adds <strong>no independent labels</strong> (n stays {augStats.independentLabels}).
              </div>
              <Select value={selectedAugId} onValueChange={handleSelectAug}>
                <SelectTrigger className="bg-secondary/30">
                  <SelectValue placeholder={`Select 1 of ${augStats.variants} derived variants…`} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {augmentedVariants.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      <span className="font-mono">{v.id}</span> — {TRANSFORM_LABEL[v.transform]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-[80px] font-mono text-xs bg-secondary/30"
              />
              <p className="text-[11px] text-muted-foreground">
                Full browser and JSON export: <Link to="/experiments" className="underline">Experiments → GoldAug (robustness)</Link>.
              </p>
            </TabsContent>



            <TabsContent value="n1k" className="mt-3 space-y-2">
              <div className="p-2 rounded bg-info/10 border border-info/30 text-[11px] text-info-foreground/90">
                <strong>N1K batch corpus</strong> — bulk-ingested documents from CISA KEV, MITRE ATT&amp;CK Groups, JPCERT/CC, CNCERT, vendor PSIRTs with mandatory attribution.
                Separate from the {domainCases.length}-case gold-labelled curated corpus above.
                For full 1,000-case fan-out runs, use <Link to="/experiments" className="underline">Experiments → Corpus Ingest</Link>.
                This tab is for <em>single-case inspection</em>: load one row into the pipeline below.
              </div>
              {n1kLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3"><Loader2 className="w-3 h-3 animate-spin" />Loading bench_cases…</div>
              ) : n1kTotal === 0 ? (
                <div className="p-3 rounded bg-warning/10 border border-warning/30 text-xs text-warning">
                  <strong>bench_cases is empty.</strong> Go to <Link to="/experiments" className="underline font-mono">Experiments → Corpus Ingest</Link> and click <em>Ingest CISA KEV</em> or <em>Ingest MITRE Groups</em> to populate it.
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-muted-foreground">
                    Showing latest {n1kRows.length} of <strong className="text-foreground">{n1kTotal}</strong> ingested cases.
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-auto">
                    {n1kRows.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { setInputText(r.raw_text); toast.success(`Loaded ${r.source_feed} case`); }}
                        className="w-full text-left p-2 rounded bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-[11px]">
                          <Badge variant="outline" className="text-[10px] font-mono">{r.source_feed}</Badge>
                          <span className="text-muted-foreground">{r.publisher ?? "—"}</span>
                        </div>
                        <div className="text-xs text-foreground/80 line-clamp-2 mt-1 font-mono">{(r.title ?? r.raw_text).slice(0, 200)}…</div>
                      </button>
                    ))}
                  </div>
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="min-h-[80px] font-mono text-xs bg-secondary/30"
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="feed" className="mt-3 space-y-2">
              {feedLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground p-3"><Loader2 className="w-3 h-3 animate-spin" />Loading recent reports…</div>
              ) : feedRows.length === 0 ? (
                <div className="p-3 rounded bg-secondary/30 text-xs text-muted-foreground">
                  No live reports yet. Use <strong className="text-foreground">Bootstrap GraphRAG Corpus</strong> below to ingest recent CISA advisories.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {feedRows.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => handleSelectFeedRow(r)}
                      className="w-full text-left p-2 rounded bg-secondary/30 hover:bg-secondary/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 text-[11px]">
                        <Badge variant="outline" className="text-[10px] font-mono">{r.id.slice(0, 8)}</Badge>
                        <span className="text-muted-foreground">{r.source_type ?? "report"}</span>
                        <span className="text-muted-foreground ml-auto">{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-foreground/80 line-clamp-2 mt-1 font-mono">{r.source_text.slice(0, 200)}…</div>
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-[80px] font-mono text-xs bg-secondary/30"
              />
            </TabsContent>
          </Tabs>

          <div className="p-3 rounded border border-primary/30 bg-primary/5 text-[11px] space-y-1.5">
            <div className="font-semibold text-foreground text-xs flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5" />Two-corpus model — which path do you want?</div>
            <div><strong>Single case (this panel):</strong> pick from <em>Curated corpus (n={domainCases.length}, gold)</em>, <em>N1K batch</em>, <em>Live feed</em>, or paste text →
              <span className="font-mono"> Extract, Validate &amp; Persist to KG</span> →
              <span className="font-mono"> Refresh KB</span> (only after MITRE/KEV updates) →
              <span className="font-mono"> Bootstrap GraphRAG Corpus</span> (once, after ~20+ cases persisted). Per-document, gold-scored via KG-Bench.</div>
            <div><strong>N≥1,000 batch:</strong> not this panel — go to <Link to="/experiments" className="underline">Experiments → Corpus Ingest</Link>: (1) ingest sources → <code>bench_cases</code>, (2) Schedule → <code>bench_runs</code>, (3) Run workers, (4) Aggregate. This is the fan-out path that exercises Pathway B/C at scale.</div>
          </div>

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
            Sources: <strong>Paste</strong>, <strong>Curated corpus (n={domainCases.length}, gold)</strong>, <strong>N1K batch</strong>, <strong>Live feed</strong> are active. <strong>Upload file</strong> and <strong>External API</strong> (OTX / MISP / VirusTotal) tabs are reserved for future ingestion channels — the pipeline stays the same regardless of source.
          </p>
        </CardContent>
      </Card>

      <CorpusHealth pollIntervalMs={bootstrapping ? 3000 : 8000} />

      {/* Layer B+C */}
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
              <Badge variant="secondary" className="bg-info/15 text-info">{pipeline.rag.similar_reports.length} similar prior reports</Badge>
              <Badge variant="secondary" className="bg-primary/15 text-primary">{pipeline.rag.subgraph.entities.length} prior entities</Badge>
              <Badge variant="secondary" className="bg-primary/15 text-primary">{pipeline.rag.subgraph.relations.length} prior relations</Badge>
              <Badge variant="outline" className="text-[10px]">embedding: {pipeline.rag.embedding_used ? "text-embedding-004" : "none"}</Badge>
            </div>
            {pipeline.rag.context_block ? (
              <pre className="p-2 rounded bg-secondary/40 max-h-40 overflow-auto font-mono text-[10px] whitespace-pre-wrap">{pipeline.rag.context_block}</pre>
            ) : (
              <p className="text-muted-foreground">No prior history matched — extraction runs ungrounded for this event (cold-start).</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Layer A */}
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
                {pipeline.kbValidation.summary.ok}/{pipeline.kbValidation.summary.total_checks} verified ({(pipeline.kbValidation.accuracy * 100).toFixed(0)}%)
              </Badge>
              {pipeline.kbValidation.summary.hallucinated > 0 && (
                <Badge variant="secondary" className="bg-threat-critical/15 text-threat-critical gap-1">
                  <AlertTriangle className="w-3 h-3" />{pipeline.kbValidation.summary.hallucinated} hallucinated
                </Badge>
              )}
              {pipeline.kbValidation.summary.malformed > 0 && (
                <Badge variant="secondary" className="bg-threat-high/15 text-threat-high">{pipeline.kbValidation.summary.malformed} malformed</Badge>
              )}
              <Badge variant="outline" className="text-[10px]">KB size: {pipeline.kbValidation.kb_size}</Badge>
            </div>
            {pipeline.kbValidation.findings.filter((f) => f.kind !== "ok").slice(0, 6).map((f, i) => (
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
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Network className="w-4 h-4 text-primary" /> LLM-Generated Knowledge Graph
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
                  <button
                    onClick={() => setViewMode("force")}
                    className={`px-2.5 py-1 text-[11px] ${viewMode === "force" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary/40"}`}
                  >Force-directed</button>
                  <button
                    onClick={() => hasTemporal && setViewMode("timeline")}
                    disabled={!hasTemporal}
                    className={`px-2.5 py-1 text-[11px] ${viewMode === "timeline" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary/40"} disabled:opacity-40 disabled:cursor-not-allowed`}
                    title={hasTemporal ? "Show temporal causal layout" : "No temporal/causal links extracted"}
                  >Timeline</button>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={graphData.nodes.length === 0} className="h-8 gap-1.5">
                      <ImageDown className="w-3.5 h-3.5" />
                      <span className="text-xs">Download SVG</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-72">
                    <DropdownMenuLabel className="text-[10px] text-muted-foreground">Editable, structured (groups + legend + metadata)</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => handleDownloadSvg("light")}>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">SVG — Word / Print (white)</span>
                        <span className="text-[10px] text-muted-foreground">Recommended for Office documents</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadSvg("dark")}>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">SVG — Dark (presentation)</span>
                        <span className="text-[10px] text-muted-foreground">Matches on-screen theme</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleDownloadSvg("legacy")}>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">SVG — Flat snapshot (legacy)</span>
                        <span className="text-[10px] text-muted-foreground">Sanitised live DOM clone</span>
                      </div>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadMermaid}
                  disabled={graphData.nodes.length === 0}
                  className="h-8 gap-1.5"
                  title="Export as Mermaid graph script (.mmd)"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="text-xs">Download Mermaid</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPng}
                  disabled={downloading || graphData.nodes.length === 0}
                  className="h-8 gap-1.5"
                >
                  {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageDown className="w-3.5 h-3.5" />}
                  <span className="text-xs">Download PNG</span>
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="outline" className="text-[10px] font-mono">
                {reproPreset} · T={repro.temperature} · seed={repro.seed} · k={repro.topK} · {repro.frozenSnapshotAt ? `frozen@${new Date(repro.frozenSnapshotAt).toISOString().slice(0,16)}` : "live"}
              </Badge>
              {viewMode === "force" && (
                <>
                  <span className="text-[10px] text-muted-foreground ml-1">Center pivot:</span>
                  <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
                    {(["auto", "campaign", "actor", "malware"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setCenterPivot(p)}
                        className={`px-2 py-0.5 text-[10px] font-mono ${centerPivot === p ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary/40"}`}
                        title={p === "auto" ? "Degree-centrality (current default)" : `Pin highest-confidence ${p} node at the centre`}
                      >{p}</button>
                    ))}
                  </div>
                  {pivotEntity && (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      centre: {pivotEntity.name} ({String(pivotEntity.type)})
                    </Badge>
                  )}
                  {synth && (
                    <button
                      onClick={() => setIncludeSynthesized((v) => !v)}
                      className={`text-[10px] px-2 py-0.5 rounded border ${includeSynthesized ? "border-primary/40 text-primary bg-primary/10" : "border-border/60 text-muted-foreground"}`}
                      title="Toggle the synthesised campaign SDO emitted by Layer A (kb-validate)"
                    >
                      {includeSynthesized ? "✓" : "○"} synth campaign: {synth.entity.name}
                    </button>
                  )}
                </>
              )}
              {viewMode === "timeline" && (
                <Badge variant="outline" className="text-[10px]">
                  {timelineData.nodes.length} events · {timelineData.edges.length} causal edges
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
              Layout-only override. Neuro-symbolic credibility & attribution outputs are unaffected — only the SVG centring rule changes. "Auto" = degree centrality (typically the actor); "campaign" = STIX-style campaign-pivot; synthesised campaign nodes (dashed) are added by Layer A when the LLM omits an explicit campaign SDO.
            </p>
          </CardHeader>
          <CardContent>
            <div className="relative w-full h-[360px] bg-secondary/20 rounded-lg overflow-hidden">
              <svg ref={svgRef} className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                <defs>
                  {CAUSAL_TYPES.map((t) => (
                    <marker
                      key={t}
                      id={`arrow-${t}`}
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="4"
                      markerHeight="4"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={causalColor(t)} />
                    </marker>
                  ))}
                </defs>

                {viewMode === "force" && (
                  <>
                    {graphData.edges.map((edge, i) => {
                      const from = graphData.nodes[edge.from];
                      const to = graphData.nodes[edge.to];
                      if (!from || !to) return null;
                      return (
                        <motion.line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                          stroke={edge.synthesised ? "hsl(280, 70%, 60%)" : "hsl(220, 14%, 25%)"}
                          strokeWidth="0.3"
                          strokeDasharray={edge.synthesised ? "0.8 0.6" : undefined}
                          opacity={edge.synthesised ? 0.7 : 1}
                          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: i * 0.1, duration: 0.5 }} />
                      );
                    })}
                    {graphData.nodes.map((node, i) => {
                      const isCentre = pivotEntity?.name === node.id;
                      return (
                        <motion.g key={node.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.08 }}>
                          <circle cx={node.x} cy={node.y} r={node.size / 10} fill={nodeColorMap[node.type] || "#888"} opacity={0.15} />
                          <circle cx={node.x} cy={node.y} r={node.size / 16} fill={nodeColorMap[node.type] || "#888"}
                            stroke={node.synthesised ? "hsl(280, 70%, 70%)" : isCentre ? "hsl(48, 96%, 60%)" : "none"}
                            strokeWidth={node.synthesised || isCentre ? 0.4 : 0}
                            strokeDasharray={node.synthesised ? "0.6 0.4" : undefined} />
                          <text x={node.x} y={node.y + node.size / 8 + 2} textAnchor="middle"
                            fill={isCentre ? "hsl(48, 96%, 70%)" : "hsl(215, 12%, 55%)"} fontSize="2" fontFamily="monospace">
                            {node.id.length > 15 ? node.id.slice(0, 12) + "…" : node.id}
                          </text>
                        </motion.g>
                      );
                    })}
                  </>
                )}

                {viewMode === "timeline" && (
                  <>
                    {/* Time axis */}
                    <line x1="6" y1="92" x2="94" y2="92" stroke="hsl(220, 14%, 25%)" strokeWidth="0.2" />
                    {timelineData.nodes.map((n, i) => (
                      <g key={`tick-${i}`}>
                        <line x1={n.x} y1="91" x2={n.x} y2="93" stroke="hsl(220, 14%, 35%)" strokeWidth="0.15" />
                        <text x={n.x} y="96" textAnchor="middle" fill="hsl(215, 12%, 55%)" fontSize="1.6" fontFamily="monospace">
                          t{i + 1}{n.timestamp ? ` ${n.timestamp.slice(0, 10)}` : ""}
                        </text>
                      </g>
                    ))}
                    {/* Causal edges */}
                    {timelineData.edges.map((e, i) => {
                      const from = timelineData.nodes[e.fromIdx];
                      const to = timelineData.nodes[e.toIdx];
                      if (!from || !to) return null;
                      const midY = Math.min(from.y, to.y) - 4;
                      const path = `M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${midY} ${to.x} ${to.y}`;
                      return (
                        <motion.g key={`edge-${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}>
                          <path d={path} stroke={causalColor(e.causal_type)} strokeWidth="0.35" fill="none"
                            opacity={0.55 + 0.45 * (e.confidence || 0.5)}
                            markerEnd={`url(#arrow-${e.causal_type})`} />
                          <text x={(from.x + to.x) / 2} y={midY - 0.6} textAnchor="middle"
                            fill={causalColor(e.causal_type)} fontSize="1.6" fontFamily="monospace">
                            {e.causal_type}
                          </text>
                        </motion.g>
                      );
                    })}
                    {/* Event nodes */}
                    {timelineData.nodes.map((n, i) => (
                      <motion.g key={n.id + i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.08 }}>
                        <circle cx={n.x} cy={n.y} r="2.4" fill={nodeColorMap[n.type] || "#888"} opacity={0.18} />
                        <circle cx={n.x} cy={n.y} r="1.4" fill={nodeColorMap[n.type] || "#888"} />
                        <text x={n.x} y={n.y - 2.4} textAnchor="middle" fill="hsl(215, 12%, 70%)" fontSize="1.8" fontFamily="monospace">
                          {n.id.length > 14 ? n.id.slice(0, 12) + "…" : n.id}
                        </text>
                      </motion.g>
                    ))}
                    {/* Lane labels */}
                    {[
                      ["threat_actor", 18], ["campaign", 28], ["malware", 40], ["vulnerability", 52],
                      ["ttp", 64], ["infrastructure", 76],
                    ].map(([label, y]) => (
                      <text key={label as string} x="2" y={(y as number) + 0.6} fill="hsl(215, 12%, 45%)" fontSize="1.4" fontFamily="monospace">
                        {label}
                      </text>
                    ))}
                  </>
                )}
              </svg>
              <div className="absolute bottom-3 right-3 flex flex-wrap gap-2">
                {viewMode === "force"
                  ? Object.entries(nodeColorMap).map(([type, color]) => (
                      <div key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <div className="w-2 h-2 rounded-full" style={{ background: color }} />{type}
                      </div>
                    ))
                  : CAUSAL_TYPES.map((t) => (
                      <div key={t} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <div className="w-2 h-2 rounded-full" style={{ background: causalColor(t) }} />{t}
                      </div>
                    ))}
              </div>
              {!hasTemporal && viewMode === "force" && (
                <div className="absolute top-3 left-3 text-[10px] text-muted-foreground bg-background/60 px-2 py-1 rounded">
                  No temporal/causal links extracted — Timeline view disabled.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Downstream Consumers panel ─────────────────────────── */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Share2 className="w-4 h-4 text-primary" /> KG Downstream — Where this graph flows next
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!persisted && (
            <div className="p-2 rounded bg-secondary/30 text-[11px] text-muted-foreground">
              Persist a KG above to activate downstream consumers. Reserved slots are visible below as a roadmap toward more intelligent decision-making.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DOWNSTREAM_CONSUMERS.map((c) => {
              const Icon = c.icon;
              const isActive = c.status === "active" && persisted;
              const body = (
                <div className={`p-3 rounded-lg border transition-colors ${
                  isActive
                    ? "border-primary/30 bg-primary/5 hover:bg-primary/10"
                    : "border-border/40 bg-secondary/20 opacity-70"
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-xs font-medium text-foreground">{c.name}</span>
                    <Badge
                      variant="outline"
                      className={`ml-auto text-[10px] ${
                        c.status === "active"
                          ? persisted ? "border-threat-low/40 text-threat-low" : "border-muted-foreground/30 text-muted-foreground"
                          : "border-info/30 text-info"
                      }`}
                    >
                      {c.status === "active" ? (persisted ? "Active" : "Idle") : "Planned"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{c.desc}</p>
                </div>
              );
              return c.to && isActive
                ? <Link key={c.name} to={c.to}>{body}</Link>
                : <div key={c.name}>{body}</div>;
            })}
          </div>
        </CardContent>
      </Card>

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
      </section>

      {/* ── Pathway C: Hypergraph n-ary extraction ─────────────────── */}
      <section id="pathway-c" className="scroll-mt-20">
        <Collapsible className="mt-6" defaultOpen>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border-l-4 border-amber-500 border-y border-r border-border/50 bg-card/60 px-4 py-2 text-sm hover:bg-card/80">
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-amber-400" />
              <span className="font-semibold">Pathway C — Hypergraph (n-ary)</span>
              <span className="text-[11px] text-muted-foreground">live A/B vs Pathway B</span>
              <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Beta</Badge>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [&[data-state=open]]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <HypergraphPathwayPanel />
          </CollapsibleContent>
        </Collapsible>
      </section>

      {/* ── Hybrid rule governance: expert baseline + adaptive C1–C4 ── */}
      <section id="rule-governance" className="scroll-mt-20 space-y-3">
        <div className="flex items-center gap-2 border-l-4 border-emerald-500 pl-3 py-1">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold tracking-tight">
            Hybrid Rule Governance — expert baseline + adaptive layers C1–C4
          </h2>
          <Badge variant="outline" className="text-[10px]">replayable</Badge>
        </div>
        <RuleGovernancePanel />
      </section>


      {/* ── Additional: Multi-Modal Fusion (mock) ─────────────────── */}
      <section id="pathway-fusion" className="scroll-mt-20">
        <Collapsible className="mt-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border-l-4 border-cyan-500 border-y border-r border-border/50 bg-card/60 px-4 py-2 text-sm hover:bg-card/80">
            <span className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-cyan-400" />
              <span className="font-semibold">Multi-Modal Fusion</span>
              <span className="text-[11px] text-muted-foreground">External CTI ⊕ Internal CICIDS</span>
              <Badge variant="outline" className="text-[10px] border-muted-foreground/40 text-muted-foreground">Spec · mock only</Badge>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [&[data-state=open]]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <MultiModalFusionMock />
          </CollapsibleContent>
        </Collapsible>
      </section>

    </div>
  );
}

