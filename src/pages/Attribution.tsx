import { motion } from "framer-motion";
import { Brain, GitBranch, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const attributionChains = [
  {
    id: "ATTR-001",
    actor: "APT-29 (Cozy Bear)",
    confidence: 0.92,
    campaign: "SolarWinds Supply Chain",
    status: "confirmed",
    evidenceCount: 47,
    steps: [
      { label: "Initial Access", detail: "Supply chain compromise via SolarWinds Orion update", tactic: "T1195.002" },
      { label: "Execution", detail: "SUNBURST backdoor DLL sideloading", tactic: "T1574.002" },
      { label: "C2 Communication", detail: "DNS-based C2 via avsvmcloud[.]com", tactic: "T1071.004" },
      { label: "Lateral Movement", detail: "SAML token forgery for cloud access", tactic: "T1550.001" },
      { label: "Exfiltration", detail: "Data staged and exfiltrated via HTTPS", tactic: "T1041" },
    ],
  },
  {
    id: "ATTR-002",
    actor: "APT-41 (Double Dragon)",
    confidence: 0.78,
    campaign: "Financial Sector Targeting",
    status: "investigating",
    evidenceCount: 23,
    steps: [
      { label: "Reconnaissance", detail: "Spear phishing with industry-specific lures", tactic: "T1598" },
      { label: "Initial Access", detail: "Exploitation of public-facing application", tactic: "T1190" },
      { label: "Persistence", detail: "Web shell deployment on Exchange servers", tactic: "T1505.003" },
    ],
  },
  {
    id: "ATTR-003",
    actor: "Lazarus Group",
    confidence: 0.65,
    campaign: "Cryptocurrency Exchange",
    status: "unconfirmed",
    evidenceCount: 11,
    steps: [
      { label: "Social Engineering", detail: "Fake job offers via LinkedIn", tactic: "T1566.003" },
      { label: "Execution", detail: "Trojanized trading application", tactic: "T1204.002" },
    ],
  },
];

const conflictRules = [
  { rule: "Temporal Overlap Check", status: "pass", detail: "No conflicting timelines detected" },
  { rule: "TTP Consistency", status: "warn", detail: "T1071.004 shared across 3 actors" },
  { rule: "Infrastructure Reuse", status: "pass", detail: "Unique C2 infrastructure confirmed" },
  { rule: "Credibility Score", status: "fail", detail: "2 sources below reliability threshold" },
];

const statusIcons: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  confirmed: { icon: CheckCircle2, className: "text-success" },
  investigating: { icon: AlertTriangle, className: "text-warning" },
  unconfirmed: { icon: XCircle, className: "text-muted-foreground" },
};

const ruleStatusIcons: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  pass: { icon: CheckCircle2, className: "text-success" },
  warn: { icon: AlertTriangle, className: "text-warning" },
  fail: { icon: XCircle, className: "text-destructive" },
};

export default function Attribution() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Attribution Reasoning</h1>
        <p className="text-sm text-muted-foreground mt-1">Dynamic KG evolution & LLM-assisted logical reasoning (Ch. 4)</p>
      </div>

      {/* Attribution Chains */}
      <div className="space-y-4">
        {attributionChains.map((chain, ci) => {
          const stIcon = statusIcons[chain.status];
          return (
            <motion.div key={chain.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: ci * 0.12 }}>
              <Card className="border-border/50 bg-card/80">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Brain className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{chain.actor}</CardTitle>
                        <p className="text-xs text-muted-foreground">{chain.campaign} · {chain.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-mono font-semibold">{(chain.confidence * 100).toFixed(0)}%</p>
                        <p className="text-[10px] text-muted-foreground">confidence</p>
                      </div>
                      <stIcon.icon className={`w-5 h-5 ${stIcon.className}`} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Attack Path */}
                  <div className="relative pl-6 space-y-4">
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
                    {chain.steps.map((step, i) => (
                      <div key={i} className="relative flex items-start gap-3">
                        <div className="absolute left-[-17px] w-3 h-3 rounded-full bg-primary/30 border-2 border-primary mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{step.label}</span>
                            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary font-mono">{step.tactic}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/30 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="font-mono">{chain.evidenceCount} evidence items</span>
                    <span>{chain.steps.length} attack stages</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Conflict Detection (Ch. 4.4) */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" /> Conflict Detection & Credibility (Ch. 4.4)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {conflictRules.map((rule, i) => {
            const ri = ruleStatusIcons[rule.status];
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <ri.icon className={`w-4 h-4 shrink-0 ${ri.className}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{rule.rule}</p>
                  <p className="text-xs text-muted-foreground">{rule.detail}</p>
                </div>
                <Badge variant="secondary" className="text-xs capitalize">{rule.status}</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
