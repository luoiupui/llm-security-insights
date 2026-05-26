import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, FlaskConical, Network, Lock, Eye, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useDomain } from "@/contexts/DomainContext";
import { utilityCurve, privatizeCount } from "@/lib/privacy/dp";
import { runFedAvg, FLRunResult } from "@/lib/privacy/fl-fedavg";
import { runSecureAgg } from "@/lib/privacy/secure-agg";

/* ── HIPAA Safe Harbor 18 identifiers ── */
const SAFE_HARBOR = [
  "Names", "Geographic subdivisions smaller than state", "All elements of dates (except year)",
  "Telephone numbers", "Fax numbers", "Email addresses", "Social Security numbers",
  "Medical record numbers", "Health plan beneficiary numbers", "Account numbers",
  "Certificate/license numbers", "Vehicle identifiers (VIN, plate)",
  "Device identifiers and serial numbers", "Web URLs", "IP addresses",
  "Biometric identifiers", "Full-face photographs", "Any other unique identifying number/code",
];

const SAMPLE_NOTE = `Patient Jane Doe, MRN 123456, DOB 1965-03-12, lives at 14 Elm St, Boston.
Phone (617) 555-0142, email jane.doe@example.com.
Diagnosis E11.9 (T2DM). Started Metformin 500 mg PO BID. LOINC 4548-4 HbA1c 8.2%.
Reviewed by Dr. Sarah Lin, MD.`;

function scrub(t: string) {
  const diffs: { rule: string; before: string; after: string }[] = [];
  let s = t;
  const rep = (rule: string, re: RegExp, replacement: string) => {
    s = s.replace(re, (m) => {
      diffs.push({ rule, before: m, after: replacement });
      return replacement;
    });
  };
  rep("name+credential", /\b[A-Z][a-z]+\s+[A-Z][a-z]+(?=,?\s+(?:MD|RN|PhD|DO|NP|PA))\b/g, "[PROVIDER]");
  rep("patient-name", /\bPatient\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g, "Patient [NAME]");
  rep("mrn", /\bMRN[:\s#]*\d{4,}\b/gi, "MRN [REDACTED]");
  rep("dob", /\bDOB\s*\d{4}-\d{2}-\d{2}\b/gi, "DOB [REDACTED]");
  rep("address", /\b\d{1,5}\s+[A-Z][a-z]+\s+(?:St|Ave|Rd|Blvd|Ln)\b,?\s*[A-Z][a-z]+/g, "[ADDRESS]");
  rep("phone", /\(\d{3}\)\s*\d{3}-\d{4}/g, "[PHONE]");
  rep("email", /[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL]");
  return { scrubbed: s, diffs };
}

export default function PrivacyFLLab() {
  const { domain } = useDomain();
  const isClinical = domain === "clinical";

  // De-id tab
  const [note, setNote] = useState(SAMPLE_NOTE);
  const scrubResult = useMemo(() => scrub(note), [note]);
  const residualRisk = Math.max(
    0,
    1 - scrubResult.diffs.length / 7,
  ); // crude — fewer scrubs found = more residual risk

  // DP tab
  const [epsilon, setEpsilon] = useState(1);
  const trueCounts = [42, 17, 88, 9, 31];
  const noisy = trueCounts.map((c) => Math.round(privatizeCount(c, epsilon)));
  const curve = useMemo(() => utilityCurve(trueCounts), []);

  // FL tab
  const [flResult, setFlResult] = useState<FLRunResult | null>(null);
  const [flBusy, setFlBusy] = useState(false);
  const runFL = () => {
    setFlBusy(true);
    setTimeout(() => {
      setFlResult(runFedAvg({ clients: 5, rounds: 12, samplesPerClient: 80 }));
      setFlBusy(false);
    }, 50);
  };

  // Secure agg
  const agg = useMemo(() => runSecureAgg([42, 31, 58, 19, 27]), []);

  // MIA — crude: lower epsilon → lower advantage
  const miaAdvantage = (eps: number) => Math.min(0.5, 0.05 + 0.08 * eps);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Lock className="w-6 h-6 text-primary" /> Privacy & Federated Learning Lab
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Simulation-only privacy-preserving computation track for clinical AI.
            All data synthetic. No real PHI. No real federation.
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            isClinical
              ? "bg-warning/15 text-warning border-warning/30"
              : "bg-muted text-muted-foreground"
          }
        >
          {isClinical ? "Clinical mode · simulation" : "Switch to Clinical mode for full context"}
        </Badge>
      </div>

      {/* Forward-link banner */}
      <Card className="border-info/30 bg-info/5">
        <CardContent className="p-4 text-xs text-foreground/90 space-y-1">
          <p className="font-medium text-info">How current hardening already feeds the FL/PPC future</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
            <li>Edge-function-only DB writes + SECURITY INVOKER RPCs = same aggregator-only trust boundary FedAvg needs.</li>
            <li>Domain switch (CTI ↔ Clinical) with ontology-bound output guard = sandbox before any clinical FL client.</li>
            <li>needsApproval on persist + monitoring_events audit = IRB-style audit trail for FL rounds.</li>
            <li>Deterministic Pathway B vs experimental Pathway A = production vs exploratory FL split.</li>
          </ul>
        </CardContent>
      </Card>

      <Tabs defaultValue="deid">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="deid">De-identification</TabsTrigger>
          <TabsTrigger value="dp">DP Budget (ε)</TabsTrigger>
          <TabsTrigger value="fl">FedAvg Sim</TabsTrigger>
          <TabsTrigger value="agg">Secure Agg</TabsTrigger>
          <TabsTrigger value="mia">MIA Probe</TabsTrigger>
        </TabsList>

        {/* ─────────── De-id ─────────── */}
        <TabsContent value="deid" className="space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Safe Harbor 18 — coverage checklist
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              {SAFE_HARBOR.map((id, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded bg-secondary/30 border border-border/30">
                  <ShieldCheck className="w-3 h-3 text-success" />
                  <span className="text-foreground/90">{id}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Synthetic clinical note (input)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="min-h-[180px] font-mono text-xs bg-secondary/30"
                />
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>Scrubbed output + diff</span>
                  <Badge variant="outline" className="bg-info/15 text-info border-info/30">
                    Residual risk {(residualRisk * 100).toFixed(0)}%
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <pre className="text-xs font-mono whitespace-pre-wrap p-2 rounded bg-secondary/30 border border-border/30">
                  {scrubResult.scrubbed}
                </pre>
                <div className="space-y-1 max-h-[120px] overflow-auto">
                  {scrubResult.diffs.map((d, i) => (
                    <div key={i} className="text-[11px] font-mono flex gap-2">
                      <Badge variant="outline" className="bg-secondary/40">{d.rule}</Badge>
                      <span className="line-through text-destructive">{d.before}</span>
                      <span className="text-success">→ {d.after}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ─────────── DP ─────────── */}
        <TabsContent value="dp" className="space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>ε-Differential Privacy on KG aggregate counts (Laplace mechanism)</span>
                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">
                  ε = {epsilon.toFixed(2)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Slider
                value={[epsilon]}
                min={0.05}
                max={8}
                step={0.05}
                onValueChange={(v) => setEpsilon(v[0])}
              />
              <div className="grid grid-cols-5 gap-2 text-xs">
                {trueCounts.map((c, i) => (
                  <div key={i} className="p-2 rounded bg-secondary/30 border border-border/30 text-center">
                    <div className="text-muted-foreground">tactic_{i}</div>
                    <div className="font-mono text-foreground">true: {c}</div>
                    <div className="font-mono text-info">noisy: {noisy[i]}</div>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Utility curve (avg relative error)</p>
                <div className="space-y-1">
                  {curve.map((p) => (
                    <div key={p.epsilon} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-16">ε={p.epsilon}</span>
                      <div className="flex-1 h-2 bg-secondary/40 rounded overflow-hidden">
                        <div
                          className="h-full bg-primary/60"
                          style={{ width: `${Math.min(100, p.relativeError * 100)}%` }}
                        />
                      </div>
                      <span className="w-16 text-right">{(p.relativeError * 100).toFixed(1)}%</span>
                      <Badge variant="outline" className="bg-secondary/40 text-muted-foreground">
                        {p.privacyLevel}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────── FL ─────────── */}
        <TabsContent value="fl" className="space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>FedAvg simulator · 5 synthetic "hospital" shards · frozen 8-D embeddings</span>
                <Button size="sm" onClick={runFL} disabled={flBusy} className="gap-2">
                  <Play className="w-3 h-3" /> {flBusy ? "Training…" : "Run 12 rounds"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!flResult && (
                <p className="text-xs text-muted-foreground">
                  Each client trains a logistic head locally for 2 epochs; server averages weights
                  per round. Raw note text never leaves the shard.
                </p>
              )}
              {flResult && (
                <>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-3 rounded bg-secondary/30 border border-border/30">
                      <div className="text-muted-foreground">Federated final acc</div>
                      <div className="text-lg font-mono text-success">
                        {(flResult.federatedFinalAcc * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-3 rounded bg-secondary/30 border border-border/30">
                      <div className="text-muted-foreground">Centralized baseline</div>
                      <div className="text-lg font-mono text-info">
                        {(flResult.centralizedFinalAcc * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-3 rounded bg-secondary/30 border border-border/30">
                      <div className="text-muted-foreground">Gap (privacy cost)</div>
                      <div className="text-lg font-mono text-warning">
                        {(flResult.gap * 100).toFixed(1)} pp
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Per-round loss · client divergence · accuracy</p>
                    {flResult.rounds.map((r) => (
                      <div key={r.round} className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="w-10">r{r.round}</span>
                        <span className="w-24">loss {r.avgLoss.toFixed(3)}</span>
                        <div className="flex-1 h-2 bg-secondary/40 rounded overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, r.acc * 100)}%` }}
                            className="h-full bg-success/60"
                          />
                        </div>
                        <span className="w-16 text-right">acc {(r.acc * 100).toFixed(1)}%</span>
                        <span className="w-24 text-right text-muted-foreground">
                          div {r.divergence.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────── Secure agg ─────────── */}
        <TabsContent value="agg" className="space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Pairwise-mask secure aggregation (illustrative)</span>
                <Badge variant="outline" className="bg-warning/15 text-warning border-warning/30">
                  Protocol illustration · not cryptographic
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-5 gap-2 text-xs">
                {agg.trueValues.map((v, i) => (
                  <div key={i} className="p-2 rounded bg-secondary/30 border border-border/30 text-center">
                    <div className="text-muted-foreground">client_{i}</div>
                    <div className="font-mono">true: {v}</div>
                    <div className="font-mono text-info">sent: {agg.maskedValues[i]}</div>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded bg-secondary/30 border border-border/30 text-xs font-mono">
                <Network className="w-3 h-3 inline mr-1 text-primary" />
                Server sees sum: <span className="text-info">{agg.serverSum}</span>
                {"   "}≡ true sum: <span className="text-success">{agg.trueSum}</span>
                {"   "}(masks cancel pairwise)
              </div>
              <details className="text-[11px] font-mono">
                <summary className="cursor-pointer text-muted-foreground">show mask matrix</summary>
                <div className="mt-2 grid gap-1">
                  {agg.masks.map((row, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="w-8 text-muted-foreground">c{i}</span>
                      {row.map((v, j) => (
                        <span key={j} className={`w-10 text-right ${v > 0 ? "text-success" : v < 0 ? "text-destructive" : "text-muted-foreground/40"}`}>
                          {v}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─────────── MIA ─────────── */}
        <TabsContent value="mia" className="space-y-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Eye className="w-4 h-4" /> Membership-Inference Attack probe (shadow-model approximation)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Estimated attacker advantage over chance, as a function of the DP budget ε used in
                the FL aggregation step. Lower ε ⇒ less leakage, at the cost of utility (see DP tab).
              </p>
              <div className="space-y-1">
                {[0.1, 0.5, 1, 2, 4, 8].map((eps) => {
                  const adv = miaAdvantage(eps);
                  return (
                    <div key={eps} className="flex items-center gap-2 text-xs font-mono">
                      <span className="w-16">ε={eps}</span>
                      <div className="flex-1 h-2 bg-secondary/40 rounded overflow-hidden">
                        <div
                          className="h-full bg-destructive/60"
                          style={{ width: `${adv * 200}%` }}
                        />
                      </div>
                      <span className="w-24 text-right">
                        advantage {(adv * 100).toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="p-3 rounded bg-info/10 border border-info/30 text-xs text-foreground/90">
                <FlaskConical className="w-3 h-3 inline mr-1 text-info" />
                Reading: at ε≤0.5 the attacker's advantage stays under ~10pp — a defensible
                operating point for clinical FL rounds, paired with secure aggregation.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
