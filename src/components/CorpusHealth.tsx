import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Database, Network, GitBranch, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Counts {
  kb_entries: number;
  threat_reports: number;
  kg_entities: number;
  kg_relations: number;
  kg_causal_links: number;
}

const ZERO: Counts = {
  kb_entries: 0,
  threat_reports: 0,
  kg_entities: 0,
  kg_relations: 0,
  kg_causal_links: 0,
};

interface CorpusHealthProps {
  /** Poll interval in ms. Set lower (e.g. 3000) while bootstrap is running. */
  pollIntervalMs?: number;
}

export function CorpusHealth({ pollIntervalMs = 8000 }: CorpusHealthProps) {
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchCounts = async () => {
      const tables: (keyof Counts)[] = [
        "kb_entries",
        "threat_reports",
        "kg_entities",
        "kg_relations",
        "kg_causal_links",
      ];
      const results = await Promise.all(
        tables.map((t) =>
          supabase.from(t).select("*", { count: "exact", head: true }),
        ),
      );
      if (cancelled) return;
      const next: Counts = { ...ZERO };
      tables.forEach((t, i) => {
        next[t] = results[i].count ?? 0;
      });
      setCounts(next);
      setUpdatedAt(new Date());
      setLoading(false);
    };

    fetchCounts();
    const id = window.setInterval(fetchCounts, pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pollIntervalMs]);

  const corpusTotal = counts.threat_reports + counts.kg_entities + counts.kg_relations;
  const isWarm = counts.threat_reports >= 5;
  const isCold = counts.threat_reports < 2;

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Database className="w-4 h-4 text-info" />
            Corpus Health — Layer A vs Layer B+C
          </span>
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground font-normal">
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            {updatedAt && `updated ${updatedAt.toLocaleTimeString()}`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Layer A (authoritative ground truth) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="w-3 h-3 text-threat-low" />
              Layer A — Authoritative KB (read-only ground truth)
            </span>
            <Badge variant="secondary" className="bg-threat-low/15 text-threat-low font-mono">
              {counts.kb_entries.toLocaleString()} entries
            </Badge>
          </div>
        </div>

        <div className="border-t border-border/50" />

        {/* Layer B+C (learned corpus, grows from extractions) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Database className="w-3 h-3 text-info" />
              Layer B — Threat reports (RAG corpus)
            </span>
            <Badge
              variant="secondary"
              className={
                isCold
                  ? "bg-threat-critical/15 text-threat-critical font-mono"
                  : isWarm
                    ? "bg-threat-low/15 text-threat-low font-mono"
                    : "bg-threat-medium/15 text-threat-medium font-mono"
              }
            >
              {counts.threat_reports.toLocaleString()}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Network className="w-3 h-3 text-primary" />
              Layer C — KG entities
            </span>
            <Badge variant="secondary" className="bg-primary/15 text-primary font-mono">
              {counts.kg_entities.toLocaleString()}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="w-3 h-3 text-primary" />
              Layer C — KG relations
            </span>
            <Badge variant="secondary" className="bg-primary/15 text-primary font-mono">
              {counts.kg_relations.toLocaleString()}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="w-3 h-3 text-primary" />
              Layer C — Causal links
            </span>
            <Badge variant="secondary" className="bg-primary/15 text-primary font-mono">
              {counts.kg_causal_links.toLocaleString()}
            </Badge>
          </div>
        </div>

        {/* Status summary */}
        <div className="pt-1 text-[10px] text-muted-foreground border-t border-border/50">
          {isCold && (
            <span className="text-threat-critical">
              ⚠ Cold-start: Layer B+C will return empty. Click "Bootstrap GraphRAG Corpus" or run Extract a few times.
            </span>
          )}
          {!isCold && !isWarm && (
            <span className="text-threat-medium">
              ◐ Warming up ({counts.threat_reports}/5 reports). Bootstrap in progress or extract more events.
            </span>
          )}
          {isWarm && (
            <span className="text-threat-low">
              ✓ Corpus warm: {corpusTotal.toLocaleString()} graph items available for retrieval.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
