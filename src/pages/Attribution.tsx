import { motion } from "framer-motion";
import { Brain, GitBranch, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Cpu, ArrowRight, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/* ── Attribution chains with causal links (Ch. 4.1–4.3) ── */
const attributionChains = [
  {
    id: "ATTR-001",
    actor: "APT-29 (Cozy Bear)",
    confidence: 0.92,
    campaign: "SolarWinds Supply Chain",
    status: "confirmed",
    evidenceCount: 47,
    credibilityScore: 0.91,
    steps: [
      { label: "Initial Access", detail: "Supply chain compromise via SolarWinds Orion update", tactic: "T1195.002" },
      { label: "Execution", detail: "SUNBURST backdoor DLL sideloading", tactic: "T1574.002" },
      { label: "C2 Communication", detail: "DNS-based C2 via avsvmcloud[.]com", tactic: "T1071.004" },
      { label: "Lateral Movement", detail: "SAML token forgery for cloud access", tactic: "T1550.001" },
      { label: "Exfiltration", detail: "Data staged and exfiltrated via HTTPS", tactic: "T1041" },
    ],
    causalChain: [
      { cause: "Supply Chain Compromise", effect: "SUNBURST Deployment", type: "enables", order: 1, confidence: 0.96 },
      { cause: "SUNBURST Deployment", effect: "DNS C2 Channel", type: "triggers", order: 2, confidence: 0.94 },
      { cause: "DNS C2 Channel", effect: "TEARDROP Dropper", type: "leads_to", order: 3, confidence: 0.89 },
      { cause: "TEARDROP Dropper", effect: "SAML Token Forgery", type: "enables", order: 4, confidence: 0.87 },
      { cause: "SAML Token Forgery", effect: "Data Exfiltration", type: "leads_to", order: 5, confidence: 0.85 },
    ],
  },
  {
    id: "ATTR-002",
    actor: "APT-41 (Double Dragon)",
    confidence: 0.78,
    campaign: "Financial Sector Targeting",
    status: "investigating",
    evidenceCount: 23,
    credibilityScore: 0.72,
    steps: [
      { label: "Reconnaissance", detail: "Spear phishing with industry-specific lures", tactic: "T1598" },
      { label: "Initial Access", detail: "Exploitation of public-facing application", tactic: "T1190" },
      { label: "Persistence", detail: "Web shell deployment on Exchange servers", tactic: "T1505.003" },
    ],
    causalChain: [
      { cause: "Spear Phishing", effect: "Application Exploit", type: "enables", order: 1, confidence: 0.75 },
      { cause: "Application Exploit", effect: "Web Shell Deployment", type: "leads_to", order: 2, confidence: 0.70 },
    ],
  },
];

const causalTypeColors: Record<string, string> = {
  enables: "text-success border-success/30",
  leads_to: "text-info border-info/30",
  triggers: "text-warning border-warning/30",
  precedes: "text-muted-foreground border-border/30",
};

/* ── Conflict Detection Rules (Ch. 4.4) ── */
const conflictRules = [
  { rule: "Temporal Overlap Check", status: "pass", detail: "No conflicting timelines detected across attributed events", type: "temporal" },
  { rule: "TTP Consistency", status: "warn", detail: "T1071.004 shared across 3 actors — requires disambiguation", type: "behavioral" },
  { rule: "Infrastructure Reuse", status: "pass", detail: "Unique C2 infrastructure confirmed per actor", type: "infrastructure" },
  { rule: "Credibility Assessment", status: "fail", detail: "2 forum sources below reliability threshold (< 0.5)", type: "source" },
  { rule: "Causal Coherence", status: "pass", detail: "All causal chains are temporally ordered and logically consistent", type: "causal" },
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
        <h1 className="text-2xl font-semibold tracking-tight">Attribution & Causality Reasoning</h1>
        <p className="text-sm text-muted-foreground mt-1">Dynamic KG evolution, LLM-assisted logical reasoning & causal analysis (Ch. 4)</p>
      </div>

      <Tabs defaultValue="attribution">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="attribution">Attribution Chains</TabsTrigger>
          <TabsTrigger value="causality">Causal Analysis</TabsTrigger>
          <TabsTrigger value="conflicts">Conflict Detection (Ch. 4.4)</TabsTrigger>
          <TabsTrigger value="reasoning">Reasoning Engine</TabsTrigger>
        </TabsList>

        {/* Attribution Chains */}
        <TabsContent value="attribution" className="mt-4 space-y-4">
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
                      <span>Credibility: <span className="text-primary font-mono">{chain.credibilityScore.toFixed(2)}</span></span>
                      <span>{chain.causalChain.length} causal links</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </TabsContent>

        {/* Causal Analysis (Ch. 4 + causality implementation) */}
        <TabsContent value="causality" className="mt-4 space-y-4">
          {attributionChains.map((chain) => (
            <Card key={chain.id} className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-primary" /> Causal Chain: {chain.actor}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {chain.causalChain.map((link, i) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                    className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-mono">{link.order}</span>
                    <span className="font-mono text-sm text-foreground">{link.cause}</span>
                    <Badge variant="outline" className={`text-[10px] ${causalTypeColors[link.type]}`}>
                      {link.type}
                    </Badge>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono text-sm text-foreground">{link.effect}</span>
                    <span className="ml-auto text-xs font-mono text-muted-foreground">{(link.confidence * 100).toFixed(0)}%</span>
                  </motion.div>
                ))}
                <div className="text-[11px] text-muted-foreground font-mono p-2 rounded bg-secondary/20">
                  Causal types: <span className="text-success">enables</span> | <span className="text-info">leads_to</span> | <span className="text-warning">triggers</span> | precedes
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Conflict Detection (Ch. 4.4) */}
        <TabsContent value="conflicts" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" /> Conflict Detection & Credibility Assessment (Ch. 4.4)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {conflictRules.map((rule, i) => {
                const ri = ruleStatusIcons[rule.status];
                return (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                    <ri.icon className={`w-4 h-4 shrink-0 ${ri.className}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{rule.rule}</p>
                      <p className="text-xs text-muted-foreground">{rule.detail}</p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] font-mono">{rule.type}</Badge>
                    <Badge variant="secondary" className="text-xs capitalize">{rule.status}</Badge>
                  </motion.div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reasoning Engine (Ch. 4.2–4.3) */}
        <TabsContent value="reasoning" className="mt-4 space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="w-4 h-4 text-primary" /> Neuro-Symbolic Reasoning Engine (Ch. 4.2–4.3)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border/30">
                    <h4 className="text-xs font-medium mb-2 text-primary">Neural Component (LLM)</h4>
                    <ul className="text-[11px] text-muted-foreground space-y-1 font-mono">
                      <li>• CoT prompting for causal link extraction</li>
                      <li>• Attack path reconstruction from reports</li>
                      <li>• Confidence scoring via LLM calibration</li>
                      <li>• Cross-report evidence correlation</li>
                    </ul>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border/30">
                    <h4 className="text-xs font-medium mb-2 text-warning">Symbolic Component (Rules)</h4>
                    <ul className="text-[11px] text-muted-foreground space-y-1 font-mono">
                      <li>• Temporal overlap conflict detection</li>
                      <li>• TTP consistency verification</li>
                      <li>• Infrastructure reuse analysis</li>
                      <li>• Source credibility weighting</li>
                      <li>• Causal coherence validation</li>
                    </ul>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-secondary/20 border border-border/30">
                  <h4 className="text-xs font-medium mb-2">Attribution Pipeline Flow</h4>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground flex-wrap">
                    <span className="px-2 py-1 rounded bg-info/20 text-info">Evidence Gathering</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-1 rounded bg-primary/20 text-primary">Attack Path Reconstruction</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-1 rounded bg-warning/20 text-warning">Symbolic Rule Checks</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-1 rounded bg-success/20 text-success">LLM Reasoning Synthesis</span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="px-2 py-1 rounded bg-threat-critical/20 text-threat-critical">Credibility Score</span>
                  </div>
                </div>
                <div className="bg-secondary/50 rounded-lg p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                  <span className="text-primary">TEMPORAL KG DEFINITION:</span><br/>
                  G(t) = (V(t), E(t), τ) where:<br/>
                  &nbsp;&nbsp;V(t) = entity set at time t (threat actors, malware, CVEs, TTPs)<br/>
                  &nbsp;&nbsp;E(t) = edge set including <span className="text-success">causal edges</span> with temporal ordering<br/>
                  &nbsp;&nbsp;τ = temporal function mapping edges to timestamps<br/><br/>
                  <span className="text-accent">CREDIBILITY SCORE:</span><br/>
                  S = Σ(w_i × conf_i × reliability_i) / N<br/>
                  &nbsp;&nbsp;where w_i = source weight, conf_i = extraction confidence
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
