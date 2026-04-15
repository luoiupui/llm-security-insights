import { motion } from "framer-motion";
import { FileText, GitBranch, Tag, Clock, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { implementationLog, type LogEntry } from "@/lib/implementation-log";
import { useState } from "react";

const categoryColors: Record<LogEntry["category"], string> = {
  architecture: "bg-primary/20 text-primary",
  llm: "bg-chart-1/20 text-chart-1",
  causality: "bg-chart-2/20 text-chart-2",
  conflict: "bg-destructive/20 text-destructive",
  ui: "bg-chart-4/20 text-chart-4",
  pipeline: "bg-chart-3/20 text-chart-3",
  infrastructure: "bg-muted-foreground/20 text-muted-foreground",
};

const impactColors: Record<LogEntry["impact"], string> = {
  major: "bg-destructive/20 text-destructive border-destructive/30",
  minor: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  patch: "bg-muted text-muted-foreground border-border",
};

const categories = ["all", "architecture", "llm", "causality", "conflict", "pipeline", "ui", "infrastructure"] as const;

export default function ImplementationLog() {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filtered = activeCategory === "all"
    ? implementationLog
    : implementationLog.filter((e) => e.category === activeCategory);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight font-mono">
              Implementation Log
            </h1>
            <p className="text-sm text-muted-foreground">
              Version history &amp; change tracking — synced to GitHub
            </p>
          </div>
        </div>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Versions", value: implementationLog.length, icon: Tag },
          { label: "Major Changes", value: implementationLog.filter((e) => e.impact === "major").length, icon: GitBranch },
          { label: "Files Modified", value: new Set(implementationLog.flatMap((e) => e.filesModified)).size, icon: FileText },
          { label: "Latest", value: implementationLog[implementationLog.length - 1]?.version ?? "—", icon: Clock },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className="w-4 h-4 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-mono font-bold text-foreground">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Category filter */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="bg-muted/50 flex-wrap h-auto">
          {categories.map((c) => (
            <TabsTrigger key={c} value={c} className="text-xs capitalize">
              {c}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Timeline */}
      <div className="space-y-3">
        {filtered.map((entry, idx) => {
          const expanded = expandedIdx === idx;
          return (
            <motion.div
              key={entry.version}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
            >
              <Card
                className="bg-card/50 border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setExpandedIdx(expanded ? null : idx)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {expanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <Badge variant="outline" className="font-mono text-xs shrink-0">
                        v{entry.version}
                      </Badge>
                      <CardTitle className="text-sm font-medium truncate">
                        {entry.title}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={`text-[10px] ${categoryColors[entry.category]}`}>
                        {entry.category}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] ${impactColors[entry.impact]}`}>
                        {entry.impact}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">{entry.date}</span>
                    </div>
                  </div>
                </CardHeader>

                {expanded && (
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Changes</p>
                      <ul className="space-y-1">
                        {entry.changes.map((c, ci) => (
                          <li key={ci} className="text-xs text-foreground/80 flex gap-2">
                            <span className="text-primary mt-0.5">•</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Files Modified</p>
                      <div className="flex flex-wrap gap-1">
                        {entry.filesModified.map((f) => (
                          <Badge key={f} variant="outline" className="text-[10px] font-mono bg-muted/30">
                            {f}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
