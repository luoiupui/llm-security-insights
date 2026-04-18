import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, FileText, Activity, AlertTriangle, RefreshCw, Plus, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  fetchManifest, getArtifacts, downloadUrl, scanForDrift, suggestDraftEntry, formatEntryAsTS,
  type Manifest, type ReportArtifact,
} from "@/lib/self-monitoring";
import type { LogEntry } from "@/lib/implementation-log";

const CATEGORIES: LogEntry["category"][] = ["architecture", "llm", "causality", "conflict", "ui", "pipeline", "infrastructure"];
const IMPACTS: LogEntry["impact"][] = ["major", "minor", "patch"];

export function SelfMonitoringPanel({ compact = false }: { compact?: boolean }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [artifacts, setArtifacts] = useState<ReportArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [drift, setDrift] = useState(scanForDrift());
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form state
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<LogEntry["category"]>("infrastructure");
  const [impact, setImpact] = useState<LogEntry["impact"]>("minor");
  const [changes, setChanges] = useState("");
  const [files, setFiles] = useState("");

  const load = async () => {
    setLoading(true);
    const m = await fetchManifest();
    setManifest(m);
    setArtifacts(m ? getArtifacts(m) : []);
    setDrift(scanForDrift());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runScanner = () => {
    const draft = suggestDraftEntry();
    if (!draft) {
      toast.success("No drift detected — log is in sync with repo");
      return;
    }
    setVersion(draft.version ?? "");
    setTitle(draft.title ?? "");
    setCategory(draft.category ?? "infrastructure");
    setImpact(draft.impact ?? "minor");
    setChanges((draft.changes ?? []).join("\n"));
    setFiles((draft.filesModified ?? []).join("\n"));
    setShowForm(true);
    toast.info(`Drafted entry for ${draft.filesModified?.length ?? 0} undocumented file(s)`);
  };

  const copyDraft = async () => {
    const ts = formatEntryAsTS({
      version, title, category, impact,
      changes: changes.split("\n").filter(Boolean),
      filesModified: files.split("\n").filter(Boolean),
    });
    await navigator.clipboard.writeText(ts);
    setCopied(true);
    toast.success("Entry copied — paste into src/lib/implementation-log.ts");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Self-Monitoring Artifacts</CardTitle>
              {manifest && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  v{manifest.stats.latestVersion} · {manifest.stats.logEntries} entries
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={runScanner} className="h-7 text-xs">
                <RefreshCw className="w-3 h-3 mr-1" /> Scan repo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add entry
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 space-y-3">
          {/* Drift indicators */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="bg-muted/30 rounded p-2">
              <p className="text-muted-foreground">Files in repo</p>
              <p className="font-mono font-bold text-foreground">{drift.filesInRepo}</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-muted-foreground">Files in log</p>
              <p className="font-mono font-bold text-foreground">{drift.filesInLog}</p>
            </div>
            <div className={`rounded p-2 ${drift.undocumented.length ? "bg-destructive/10" : "bg-muted/30"}`}>
              <p className="text-muted-foreground flex items-center gap-1">
                {drift.undocumented.length > 0 && <AlertTriangle className="w-3 h-3 text-destructive" />}
                Undocumented
              </p>
              <p className="font-mono font-bold text-foreground">{drift.undocumented.length}</p>
            </div>
            <div className="bg-muted/30 rounded p-2">
              <p className="text-muted-foreground">Stale refs</p>
              <p className="font-mono font-bold text-foreground">{drift.stale.length}</p>
            </div>
          </div>

          {/* Add-entry form */}
          {showForm && (
            <div className="space-y-2 border border-border/50 rounded-lg p-3 bg-muted/20">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Version</Label>
                  <Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2.2.0" className="h-7 text-xs font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short title" className="h-7 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as LogEntry["category"])}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Impact</Label>
                  <Select value={impact} onValueChange={(v) => setImpact(v as LogEntry["impact"])}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMPACTS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Changes (one per line)</Label>
                <Textarea value={changes} onChange={(e) => setChanges(e.target.value)} className="text-xs font-mono min-h-[60px]" />
              </div>
              <div>
                <Label className="text-xs">Files modified (one per line)</Label>
                <Textarea value={files} onChange={(e) => setFiles(e.target.value)} className="text-xs font-mono min-h-[60px]" />
              </div>
              <div className="flex justify-between items-center gap-2">
                <p className="text-[10px] text-muted-foreground">
                  Copies a TS entry — paste into <code>src/lib/implementation-log.ts</code>, then ask Lovable to regenerate reports.
                </p>
                <Button size="sm" onClick={copyDraft} className="h-7 text-xs shrink-0">
                  {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  Copy entry
                </Button>
              </div>
            </div>
          )}

          {/* Artifact downloads */}
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading manifest…</p>
          ) : !manifest ? (
            <div className="text-xs text-muted-foreground bg-muted/20 rounded p-3">
              No manifest found at <code>/reports/manifest.json</code>. Run{" "}
              <code className="text-primary">node scripts/generate-reports.mjs</code> to generate artifacts.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  {artifacts.length} artifacts · generated {new Date(manifest.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className={`grid ${compact ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"} gap-2`}>
                {artifacts.map((a) => (
                  <a
                    key={a.name}
                    href={downloadUrl(a.name)}
                    download={a.name}
                    className="group flex items-start gap-2 p-2 rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-primary/30 transition-colors"
                  >
                    <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate group-hover:text-primary">{a.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{a.description}</p>
                      <p className="text-[10px] text-muted-foreground/70 font-mono">
                        {(a.bytes / 1024).toFixed(1)} KB · {a.sha256.slice(0, 8)}
                      </p>
                    </div>
                    <Download className="w-3 h-3 text-muted-foreground group-hover:text-primary shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
