import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  FlaskConical, Play, Layers, Sparkles, GitCompare, Boxes, AlertTriangle, Database,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  buildDataset, datasetStats, train, METHOD_LABEL, REAL_WORLD_SCALE,
  type MethodId, type TrainResult,
} from "@/lib/finetune/sim";

const METHODS: MethodId[] = ["sft", "lora", "qlora", "dpo", "distill"];

const METHOD_NOTE: Record<MethodId, string> = {
  sft: "Updates every parameter of the head. Highest capacity, highest overfitting risk on a 56-label corpus.",
  lora: "Base weights frozen; a rank-r product B·A is added. Trainable parameter count scales with r, not with model size.",
  qlora: "Same adapter as LoRA, but the frozen base is fake-quantised to n bits — the memory saving is on the frozen side.",
  dpo: "No reward model: optimises a log-odds margin between a chosen and a rejected response, anchored by the gold label.",
  distill: "A full-capacity teacher is trained first, then a capacity-bottlenecked student fits the teacher's temperature-softened outputs.",
};

export default function FineTuneLab() {
  const [includeAug, setIncludeAug] = useState(true);
  const [holdout, setHoldout] = useState(0.25);
  const [seed, setSeed] = useState(42);
  const [epochs, setEpochs] = useState(30);
  const [lr, setLr] = useState(0.35);
  const [rank, setRank] = useState(4);
  const [bits, setBits] = useState(4);
  const [beta, setBeta] = useState(0.2);
  const [temperature, setTemperature] = useState(2);
  const [results, setResults] = useState<Record<string, TrainResult>>({});
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => buildDataset({ includeAugmented: includeAug, holdoutFraction: holdout, seed }),
    [includeAug, holdout, seed],
  );
  const stats = useMemo(() => datasetStats(rows), [rows]);

  const run = (method: MethodId) => {
    setBusy(true);
    setTimeout(() => {
      const r = train({ method, rows, epochs, lr, rank, bits, beta, temperature, seed });
      setResults((p) => ({ ...p, [method]: r }));
      setBusy(false);
    }, 10);
  };

  const runAll = () => {
    setBusy(true);
    setTimeout(() => {
      const out: Record<string, TrainResult> = {};
      for (const m of METHODS) out[m] = train({ method: m, rows, epochs, lr, rank, bits, beta, temperature, seed });
      setResults(out);
      setBusy(false);
    }, 10);
  };

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center gap-3">
          <FlaskConical className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold font-mono">Fine-Tuning Simulation Lab</h1>
          <Badge variant="outline" className="border-warning/60 text-warning">SIMULATION ONLY</Badge>
          <Badge variant="outline">CTI pipeline unaffected</Badge>
        </div>
        <p className="mt-2 max-w-4xl text-sm text-muted-foreground">
          Illustrates the LoRA / QLoRA / SFT / DPO / distillation workflow end-to-end. Real SGD runs
          here, but on a <span className="text-foreground">tiny linear head over a deterministic hash
          featurizer</span> — not on the CTI backbone. The hosted backbone has no weight access, so no
          real fine-tuning of it is possible from this application.
        </p>
      </motion.div>

      <Card className="border-warning/40 bg-warning/5">
        <CardContent className="flex gap-3 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium">Zero-shot posture is preserved.</p>
            <p className="text-muted-foreground">
              Nothing in this lab writes to prompts, edge functions, the KG, or the extractor. Gold-56
              is read here only to construct a didactic task; extraction remains zero-shot on a frozen
              hosted model. See <code>/reports/fine-tuning-feasibility-and-simulation.md</code> and the
              carve-out in <code>/reports/zero-shot-attestation.md</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data"><Database className="mr-1.5 h-4 w-4" />Dataset prep</TabsTrigger>
          <TabsTrigger value="train"><Layers className="mr-1.5 h-4 w-4" />Adaptation runs</TabsTrigger>
          <TabsTrigger value="compare"><GitCompare className="mr-1.5 h-4 w-4" />Comparison</TabsTrigger>
          <TabsTrigger value="scale"><Boxes className="mr-1.5 h-4 w-4" />Real-world scaling</TabsTrigger>
        </TabsList>

        {/* ── Dataset prep ── */}
        <TabsContent value="data" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Step 1 — dataset construction</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3">
                <Switch id="aug" checked={includeAug} onCheckedChange={setIncludeAug} />
                <Label htmlFor="aug" className="text-sm">
                  Include GoldAug-CTI v1 derived variants (adds rows, adds no independent labels)
                </Label>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Holdout fraction (split by seed cluster) — {pct(holdout)}</Label>
                  <Slider value={[holdout]} min={0.1} max={0.5} step={0.05} onValueChange={([v]) => setHoldout(v)} className="mt-2" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Seed — {seed}</Label>
                  <Slider value={[seed]} min={1} max={99} step={1} onValueChange={([v]) => setSeed(v)} className="mt-2" />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Rows", stats.total],
                  ["Train", stats.train],
                  ["Holdout", stats.holdout],
                  ["Derived", stats.derived],
                  ["Independent labels", stats.independentLabels],
                  ["Positive rate", pct(stats.positiveRate)],
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-md border border-border bg-card/60 p-3">
                    <div className="text-xs text-muted-foreground">{k}</div>
                    <div className="font-mono text-lg">{v}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Splitting is done on the <span className="text-foreground">Gold-56 seed cluster</span>, never on
                rows: an augmented variant can never land on the opposite side of its seed. This is the same
                leakage guard used by the robustness sweep.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Training ── */}
        <TabsContent value="train" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Step 2 — hyper-parameters</CardTitle></CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label className="text-xs text-muted-foreground">Epochs — {epochs}</Label>
                <Slider value={[epochs]} min={5} max={80} step={5} onValueChange={([v]) => setEpochs(v)} className="mt-2" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Learning rate — {lr.toFixed(2)}</Label>
                <Slider value={[lr]} min={0.05} max={1} step={0.05} onValueChange={([v]) => setLr(v)} className="mt-2" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">LoRA rank r — {rank}</Label>
                <Slider value={[rank]} min={1} max={12} step={1} onValueChange={([v]) => setRank(v)} className="mt-2" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">QLoRA base precision — {bits}-bit</Label>
                <Slider value={[bits]} min={2} max={8} step={1} onValueChange={([v]) => setBits(v)} className="mt-2" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">DPO β — {beta.toFixed(2)}</Label>
                <Slider value={[beta]} min={0.05} max={1} step={0.05} onValueChange={([v]) => setBeta(v)} className="mt-2" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Distillation temperature — {temperature.toFixed(1)}</Label>
                <Slider value={[temperature]} min={1} max={6} step={0.5} onValueChange={([v]) => setTemperature(v)} className="mt-2" />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <Button key={m} size="sm" variant="outline" disabled={busy} onClick={() => run(m)}>
                <Play className="mr-1.5 h-3.5 w-3.5" />{METHOD_LABEL[m]}
              </Button>
            ))}
            <Button size="sm" disabled={busy} onClick={runAll}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />Run all five
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {METHODS.filter((m) => results[m]).map((m) => {
              const r = results[m];
              return (
                <Card key={m}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{METHOD_LABEL[m]}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {r.trainableParams} trainable
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-xs text-muted-foreground">{METHOD_NOTE[m]}</p>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={r.curve} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="step" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="trainLoss" stroke="hsl(var(--primary))" dot={false} name="train loss" />
                          <Line type="monotone" dataKey="holdoutLoss" stroke="hsl(var(--destructive))" dot={false} name="holdout loss" />
                          <Line type="monotone" dataKey="holdoutF1" stroke="hsl(var(--success, var(--primary)))" dot={false} name="holdout F1" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div><div className="text-muted-foreground">Base F1</div><div className="font-mono">{r.baselineF1.toFixed(3)}</div></div>
                      <div><div className="text-muted-foreground">Final F1</div><div className="font-mono">{r.finalF1.toFixed(3)}</div></div>
                      <div><div className="text-muted-foreground">Δ</div><div className="font-mono">{r.delta >= 0 ? "+" : ""}{r.delta.toFixed(3)}</div></div>
                      <div><div className="text-muted-foreground">Wall time</div><div className="font-mono">{r.seconds.toFixed(2)}s</div></div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!Object.keys(results).length && (
              <Card className="lg:col-span-2">
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  No runs yet — pick a method above.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Comparison ── */}
        <TabsContent value="compare" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Step 3 — method comparison (this run)</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(results).length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Trainable params</TableHead>
                      <TableHead className="text-right">Base precision</TableHead>
                      <TableHead className="text-right">Memory (bytes)</TableHead>
                      <TableHead className="text-right">Holdout F1</TableHead>
                      <TableHead className="text-right">Δ vs frozen base</TableHead>
                      <TableHead className="text-right">Accuracy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {METHODS.filter((m) => results[m]).map((m) => {
                      const r = results[m];
                      return (
                        <TableRow key={m}>
                          <TableCell className="font-medium">{METHOD_LABEL[m]}</TableCell>
                          <TableCell className="text-right font-mono">{r.trainableParams}</TableCell>
                          <TableCell className="text-right font-mono">{r.bytesPerParam * 8}-bit</TableCell>
                          <TableCell className="text-right font-mono">{r.memoryBytes}</TableCell>
                          <TableCell className="text-right font-mono">{r.finalF1.toFixed(3)}</TableCell>
                          <TableCell className={`text-right font-mono ${r.delta >= 0 ? "text-success" : "text-destructive"}`}>
                            {r.delta >= 0 ? "+" : ""}{r.delta.toFixed(3)}
                          </TableCell>
                          <TableCell className="text-right font-mono">{pct(r.finalAcc)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">Run at least one method to populate the comparison.</p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Absolute numbers here describe the toy head, not the CTI extractor. What transfers is the
                <span className="text-foreground"> shape</span> of the trade-off: parameter budget vs. memory vs.
                holdout gain, and how quickly a 56-cluster corpus starts overfitting.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Scaling ── */}
        <TabsContent value="scale" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">What the same recipe costs on a real 7B open-weight backbone</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead>Trainable</TableHead>
                    <TableHead>VRAM</TableHead>
                    <TableHead>Compute</TableHead>
                    <TableHead>Data needed</TableHead>
                    <TableHead>Verdict for ThreatGraph today</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {METHODS.map((m) => {
                    const s = REAL_WORLD_SCALE[m];
                    return (
                      <TableRow key={m}>
                        <TableCell className="font-medium">{METHOD_LABEL[m]}</TableCell>
                        <TableCell className="font-mono text-xs">{s.trainable}</TableCell>
                        <TableCell className="font-mono text-xs">{s.vram}</TableCell>
                        <TableCell className="font-mono text-xs">{s.hours}</TableCell>
                        <TableCell className="text-xs">{s.dataNeeded}</TableCell>
                        <TableCell className="text-xs">{s.verdict}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="mt-4 text-xs text-muted-foreground">
                Gating condition: real adaptation becomes defensible once the independent gold corpus reaches
                roughly 1,000 signed cases. Until then the zero-shot + symbolic-governance posture dominates on
                both cost and reproducibility.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
