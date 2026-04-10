import { motion } from "framer-motion";
import { FlaskConical, BarChart3, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, LineChart, Line } from "recharts";

const performanceData = [
  { model: "Ours (LLM+KG)", precision: 94.2, recall: 91.8, f1: 93.0 },
  { model: "BERT-NER", precision: 87.5, recall: 83.2, f1: 85.3 },
  { model: "Rule-Based", precision: 91.0, recall: 72.4, f1: 80.7 },
  { model: "SpaCy-NER", precision: 82.3, recall: 79.1, f1: 80.7 },
  { model: "GPT-4 Zero-Shot", precision: 89.1, recall: 86.7, f1: 87.9 },
];

const ablationData = [
  { component: "Full System", f1: 93.0 },
  { component: "w/o RAG", f1: 87.4 },
  { component: "w/o Prompt Opt.", f1: 89.1 },
  { component: "w/o Conflict Det.", f1: 90.2 },
  { component: "w/o KG Feedback", f1: 88.6 },
];

const radarData = [
  { metric: "Entity NER", ours: 94, bert: 87, rule: 91 },
  { metric: "Relation RE", ours: 91, bert: 82, rule: 72 },
  { metric: "Attribution", ours: 89, bert: 68, rule: 65 },
  { metric: "Hallucination Ctrl", ours: 96, bert: 78, rule: 92 },
  { metric: "Throughput", ours: 85, bert: 92, rule: 98 },
  { metric: "Generalization", ours: 93, bert: 75, rule: 45 },
];

const sensitivityData = [
  { window: "2K", f1: 78.3, latency: 120 },
  { window: "4K", f1: 85.1, latency: 180 },
  { window: "8K", f1: 90.4, latency: 310 },
  { window: "16K", f1: 92.8, latency: 520 },
  { window: "32K", f1: 93.0, latency: 890 },
  { window: "64K", f1: 93.1, latency: 1540 },
];

const hallucinationResults = [
  { test: "Entity accuracy w/ RAG", result: "96.2%", baseline: "81.4%", improvement: "+14.8%" },
  { test: "False relation rate", result: "2.1%", baseline: "12.7%", improvement: "-10.6%" },
  { test: "Misleading intel filtered", result: "94.8%", baseline: "67.3%", improvement: "+27.5%" },
  { test: "Confidence calibration", result: "0.94", baseline: "0.71", improvement: "+0.23" },
];

const chartStyle = { background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: 8, fontSize: 11 };

export default function Experiments() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Experiments & Results</h1>
        <p className="text-sm text-muted-foreground mt-1">Performance evaluation, ablation studies, and hallucination control (Ch. 5)</p>
      </div>

      <Tabs defaultValue="performance">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="ablation">Ablation</TabsTrigger>
          <TabsTrigger value="sensitivity">Sensitivity</TabsTrigger>
          <TabsTrigger value="hallucination">Hallucination</TabsTrigger>
        </TabsList>

        {/* Overall Performance */}
        <TabsContent value="performance" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">P / R / F1 Comparison (Ch. 5.4.1)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={performanceData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                    <XAxis type="number" domain={[60, 100]} tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 11 }} />
                    <YAxis dataKey="model" type="category" tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 10 }} width={100} />
                    <Tooltip contentStyle={chartStyle} />
                    <Bar dataKey="precision" fill="hsl(160, 70%, 45%)" name="Precision" radius={[0, 2, 2, 0]} barSize={8} />
                    <Bar dataKey="recall" fill="hsl(200, 80%, 55%)" name="Recall" radius={[0, 2, 2, 0]} barSize={8} />
                    <Bar dataKey="f1" fill="hsl(38, 92%, 50%)" name="F1" radius={[0, 2, 2, 0]} barSize={8} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/80">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Multi-Dimension Radar</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(220, 14%, 18%)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                    <Radar name="Ours" dataKey="ours" stroke="hsl(160, 70%, 45%)" fill="hsl(160, 70%, 45%)" fillOpacity={0.2} />
                    <Radar name="BERT" dataKey="bert" stroke="hsl(200, 80%, 55%)" fill="hsl(200, 80%, 55%)" fillOpacity={0.1} />
                    <Radar name="Rule" dataKey="rule" stroke="hsl(38, 92%, 50%)" fill="hsl(38, 92%, 50%)" fillOpacity={0.1} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "hsl(215, 12%, 55%)" }} />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Ablation */}
        <TabsContent value="ablation" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Ablation Study — Module Impact (Ch. 5.4.2)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ablationData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                  <XAxis dataKey="component" tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 10 }} />
                  <YAxis domain={[80, 95]} tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 11 }} />
                  <Tooltip contentStyle={chartStyle} />
                  <Bar dataKey="f1" name="F1 Score" radius={[4, 4, 0, 0]} barSize={40}>
                    {ablationData.map((entry, i) => (
                      <motion.rect key={i} fill={i === 0 ? "hsl(160, 70%, 45%)" : "hsl(200, 80%, 55%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sensitivity */}
        <TabsContent value="sensitivity" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Context Window Sensitivity (Ch. 5.4.3)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={sensitivityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                  <XAxis dataKey="window" tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 11 }} label={{ value: "Context Window", position: "bottom", fill: "hsl(215, 12%, 55%)", fontSize: 11 }} />
                  <YAxis yAxisId="left" domain={[70, 100]} tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 11 }} />
                  <Tooltip contentStyle={chartStyle} />
                  <Line yAxisId="left" type="monotone" dataKey="f1" stroke="hsl(160, 70%, 45%)" strokeWidth={2} name="F1 Score" dot={{ fill: "hsl(160, 70%, 45%)" }} />
                  <Line yAxisId="right" type="monotone" dataKey="latency" stroke="hsl(0, 72%, 55%)" strokeWidth={2} name="Latency (ms)" dot={{ fill: "hsl(0, 72%, 55%)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hallucination Control */}
        <TabsContent value="hallucination" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" /> Hallucination Control & Security (Ch. 5.5)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Test</th>
                      <th className="text-center p-3 text-xs text-muted-foreground font-medium">Baseline</th>
                      <th className="text-center p-3 text-xs text-muted-foreground font-medium">Our System</th>
                      <th className="text-center p-3 text-xs text-muted-foreground font-medium">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hallucinationResults.map((row, i) => (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }}
                        className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                        <td className="p-3">{row.test}</td>
                        <td className="p-3 text-center font-mono text-muted-foreground">{row.baseline}</td>
                        <td className="p-3 text-center font-mono text-primary font-semibold">{row.result}</td>
                        <td className="p-3 text-center font-mono text-success">{row.improvement}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
