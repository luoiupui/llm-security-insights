import { motion } from "framer-motion";
import { Shield, Network, Brain, AlertTriangle, Activity, Database, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";

const stats = [
  { label: "Entities Extracted", value: "12,847", icon: Database, change: "+342 today" },
  { label: "Relations Mapped", value: "34,291", icon: Network, change: "+1,205 today" },
  { label: "Attribution Chains", value: "89", icon: Brain, change: "+7 this week" },
  { label: "Active Threats", value: "23", icon: AlertTriangle, change: "3 critical" },
];

const timelineData = [
  { date: "Jan", entities: 2400, relations: 4200, attributions: 12 },
  { date: "Feb", entities: 3100, relations: 5800, attributions: 18 },
  { date: "Mar", entities: 4200, relations: 7600, attributions: 24 },
  { date: "Apr", entities: 5800, relations: 10200, attributions: 31 },
  { date: "May", entities: 7200, relations: 14800, attributions: 45 },
  { date: "Jun", entities: 9400, relations: 21000, attributions: 58 },
  { date: "Jul", entities: 12847, relations: 34291, attributions: 89 },
];

const threatCategories = [
  { name: "APT Groups", value: 35, color: "hsl(0, 72%, 55%)" },
  { name: "Malware", value: 28, color: "hsl(25, 95%, 53%)" },
  { name: "Vulnerabilities", value: 22, color: "hsl(38, 92%, 50%)" },
  { name: "TTPs", value: 15, color: "hsl(160, 70%, 45%)" },
];

const recentActivities = [
  { action: "New APT group identified", detail: "APT-41 variant detected in telemetry", time: "2m ago", severity: "critical" },
  { action: "KG updated", detail: "1,205 new relations from MITRE ATT&CK v14", time: "15m ago", severity: "info" },
  { action: "Attribution complete", detail: "SolarWinds-style supply chain pattern matched", time: "1h ago", severity: "high" },
  { action: "Data ingested", detail: "42 new threat reports from OSINT feeds", time: "2h ago", severity: "low" },
  { action: "Hallucination detected", detail: "RAG verification rejected 3 false entities", time: "3h ago", severity: "medium" },
];

const severityColors: Record<string, string> = {
  critical: "bg-threat-critical",
  high: "bg-threat-high",
  medium: "bg-threat-medium",
  low: "bg-threat-low",
  info: "bg-info",
};

export default function Overview() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Threat Intelligence Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">LLM-Enhanced Knowledge Graph & Attribution System</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-semibold font-mono mt-1">{stat.value}</p>
                    <p className="text-xs text-primary mt-1">{stat.change}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Knowledge Graph Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="entityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(160, 70%, 45%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(160, 70%, 45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="relGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis dataKey="date" tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 11 }} axisLine={false} />
                <YAxis tick={{ fill: "hsl(215, 12%, 55%)", fontSize: 11 }} axisLine={false} />
                <Tooltip contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="entities" stroke="hsl(160, 70%, 45%)" fill="url(#entityGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="relations" stroke="hsl(200, 80%, 55%)" fill="url(#relGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" /> Threat Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={threatCategories} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value">
                  {threatCategories.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
              {threatCategories.map((cat) => (
                <div key={cat.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full" style={{ background: cat.color }} />
                  <span className="text-muted-foreground">{cat.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivities.map((act, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${severityColors[act.severity]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{act.action}</p>
                  <p className="text-xs text-muted-foreground truncate">{act.detail}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 font-mono">{act.time}</span>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
