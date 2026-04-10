import { motion } from "framer-motion";
import { Upload, FileText, Globe, MessageSquare, CheckCircle, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const dataSources = [
  { name: "MITRE ATT&CK", type: "Knowledge Base", status: "synced", records: "14,200", lastSync: "2h ago", icon: Globe },
  { name: "OSINT Feeds", type: "Threat Reports", status: "syncing", records: "8,340", lastSync: "Active", icon: RefreshCw },
  { name: "PDF Reports", type: "Documents", status: "synced", records: "2,150", lastSync: "4h ago", icon: FileText },
  { name: "Security Forums", type: "Unstructured", status: "pending", records: "1,890", lastSync: "12h ago", icon: MessageSquare },
];

const pipelineStages = [
  { name: "Data Collection", progress: 100, items: "42 sources" },
  { name: "Cleaning & Alignment", progress: 87, items: "38 processed" },
  { name: "LLM Entity Extraction", progress: 64, items: "27 analyzed" },
  { name: "Graph Integration", progress: 45, items: "19 merged" },
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
          <h1 className="text-2xl font-semibold tracking-tight">Data Ingestion</h1>
          <p className="text-sm text-muted-foreground mt-1">Multi-source & multi-modal data fusion pipeline (Ch. 3.2)</p>
        </div>
        <Button className="gap-2">
          <Upload className="w-4 h-4" /> Import Data
        </Button>
      </div>

      {/* Data Sources */}
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
                    <span>Last: {source.lastSync}</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Pipeline Progress */}
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
                  <span>{stage.name}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{stage.items} · {stage.progress}%</span>
              </div>
              <Progress value={stage.progress} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Prompt Engineering Preview */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Prompt Engineering (Ch. 3.3)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-secondary/50 rounded-lg p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            <span className="text-primary">SYSTEM:</span> You are a cybersecurity threat intelligence analyst. Extract entities (threat actors, malware, TTPs, CVEs, infrastructure) and their relationships from the following report.<br /><br />
            <span className="text-accent">FORMAT:</span> Return structured JSON with entities and relations following the STIX 2.1 schema. Map TTPs to MITRE ATT&CK technique IDs where applicable.<br /><br />
            <span className="text-warning">CONSTRAINT:</span> Only extract information explicitly stated in the text. Flag uncertain attributions with confidence scores. Do not hallucinate connections.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
