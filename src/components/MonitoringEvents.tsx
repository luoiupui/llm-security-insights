/**
 * MonitoringEvents — shared timestamped event stream from monitoring_events table.
 * Embedded on Threat Feed, Implementation Log, and GitHub Sync pages so every new
 * KB validation, RAG retrieval, KG persistence, and baseline run is visible
 * with a precise timestamp.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface MonEvent {
  id: string;
  event_type: string;
  category: string;
  title: string;
  detail: string | null;
  metadata: any;
  created_at: string;
}

const TYPE_COLORS: Record<string, string> = {
  kb_validation: "bg-primary/20 text-primary",
  rag_retrieval: "bg-info/20 text-info",
  graphrag_retrieval: "bg-info/20 text-info",
  kg_persisted: "bg-threat-medium/20 text-threat-medium",
  baseline_run: "bg-threat-high/20 text-threat-high",
  pipeline_run: "bg-muted-foreground/20 text-muted-foreground",
};

export function MonitoringEvents({ limit = 15, title = "Live Monitoring Events" }: { limit?: number; title?: string }) {
  const [events, setEvents] = useState<MonEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("monitoring_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    setEvents(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [limit]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { hour12: false });
  };

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" /> {title}
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="h-7 gap-1">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[420px] overflow-y-auto">
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No events yet. Run the pipeline (Data Ingestion / KG Construction) or an experiment to populate this stream.
          </p>
        ) : (
          events.map((e, i) => (
            <motion.div key={e.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
              className="border border-border/30 rounded-md p-2.5 bg-secondary/20 hover:border-primary/30 transition-colors">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className={`text-[10px] ${TYPE_COLORS[e.event_type] ?? "bg-muted"}`}>
                  {e.event_type}
                </Badge>
                <span className="text-xs font-medium text-foreground flex-1 min-w-0 truncate">{e.title}</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" /> {fmt(e.created_at)}
                </span>
              </div>
              {e.detail && <p className="text-[11px] text-muted-foreground mt-1 ml-1">{e.detail}</p>}
            </motion.div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
