import { motion } from "framer-motion";
import { Shield, ExternalLink, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const threats = [
  { id: "CVE-2024-3400", severity: "critical", title: "Palo Alto PAN-OS Command Injection", source: "NVD", time: "1h ago", score: 10.0 },
  { id: "CVE-2024-21762", severity: "critical", title: "Fortinet FortiOS Out-of-Bound Write", source: "CISA KEV", time: "3h ago", score: 9.8 },
  { id: "CVE-2024-1709", severity: "high", title: "ConnectWise ScreenConnect Auth Bypass", source: "OSINT", time: "5h ago", score: 9.1 },
  { id: "CVE-2024-27198", severity: "high", title: "JetBrains TeamCity Auth Bypass", source: "NVD", time: "8h ago", score: 8.8 },
  { id: "CVE-2024-20353", severity: "medium", title: "Cisco ASA WebVPN DoS", source: "Cisco PSIRT", time: "12h ago", score: 7.5 },
];

const severityBadge: Record<string, string> = {
  critical: "bg-threat-critical/20 text-threat-critical",
  high: "bg-threat-high/20 text-threat-high",
  medium: "bg-threat-medium/20 text-threat-medium",
};

export default function ThreatFeed() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Threat Feed</h1>
        <p className="text-sm text-muted-foreground mt-1">Live vulnerability and threat intelligence stream</p>
      </div>
      <div className="space-y-3">
        {threats.map((t, i) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Card className="border-border/50 bg-card/80 hover:border-primary/30 transition-colors">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary/50 flex items-center justify-center font-mono text-sm font-bold text-foreground">
                  {t.score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-primary">{t.id}</span>
                    <Badge variant="secondary" className={severityBadge[t.severity]}>{t.severity}</Badge>
                  </div>
                  <p className="text-sm mt-0.5">{t.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{t.source}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.time}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
