import { motion } from "framer-motion";
import { Network, Tag, ArrowRight, Layers, Cpu } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const entities = [
  { name: "APT-29", type: "Threat Actor", confidence: 0.96, relations: 47 },
  { name: "SUNBURST", type: "Malware", confidence: 0.94, relations: 32 },
  { name: "T1195.002", type: "TTP", confidence: 0.99, relations: 28 },
  { name: "CVE-2020-10148", type: "Vulnerability", confidence: 0.91, relations: 15 },
  { name: "SolarWinds Orion", type: "Software", confidence: 0.98, relations: 23 },
  { name: "TEARDROP", type: "Malware", confidence: 0.89, relations: 18 },
  { name: "T1071.001", type: "TTP", confidence: 0.97, relations: 21 },
  { name: "185.xxx.xxx.24", type: "Infrastructure", confidence: 0.85, relations: 9 },
];

const typeColors: Record<string, string> = {
  "Threat Actor": "bg-threat-critical/20 text-threat-critical",
  "Malware": "bg-threat-high/20 text-threat-high",
  "TTP": "bg-primary/20 text-primary",
  "Vulnerability": "bg-threat-medium/20 text-threat-medium",
  "Software": "bg-info/20 text-info",
  "Infrastructure": "bg-muted-foreground/20 text-muted-foreground",
};

const relations = [
  { source: "APT-29", relation: "uses", target: "SUNBURST", confidence: 0.94 },
  { source: "SUNBURST", relation: "exploits", target: "CVE-2020-10148", confidence: 0.91 },
  { source: "APT-29", relation: "employs", target: "T1195.002", confidence: 0.97 },
  { source: "SUNBURST", relation: "communicates_with", target: "185.xxx.xxx.24", confidence: 0.85 },
  { source: "APT-29", relation: "uses", target: "TEARDROP", confidence: 0.89 },
  { source: "TEARDROP", relation: "implements", target: "T1071.001", confidence: 0.97 },
];

const graphNodes = [
  { id: "APT-29", x: 50, y: 50, type: "Threat Actor", size: 28 },
  { id: "SUNBURST", x: 30, y: 30, type: "Malware", size: 22 },
  { id: "TEARDROP", x: 70, y: 25, type: "Malware", size: 18 },
  { id: "T1195.002", x: 20, y: 65, type: "TTP", size: 16 },
  { id: "T1071.001", x: 80, y: 55, type: "TTP", size: 16 },
  { id: "CVE-2020-10148", x: 40, y: 80, type: "Vulnerability", size: 14 },
  { id: "SolarWinds", x: 65, y: 75, type: "Software", size: 18 },
  { id: "185.x.x.24", x: 15, y: 45, type: "Infrastructure", size: 12 },
];

const graphEdges = [
  { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 3 },
  { from: 1, to: 5 }, { from: 1, to: 7 }, { from: 2, to: 4 },
  { from: 1, to: 6 }, { from: 5, to: 6 },
];

const nodeColorMap: Record<string, string> = {
  "Threat Actor": "hsl(0, 72%, 55%)",
  "Malware": "hsl(25, 95%, 53%)",
  "TTP": "hsl(160, 70%, 45%)",
  "Vulnerability": "hsl(38, 92%, 50%)",
  "Software": "hsl(200, 80%, 55%)",
  "Infrastructure": "hsl(215, 12%, 55%)",
};

export default function KGConstruction() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge Graph Construction</h1>
        <p className="text-sm text-muted-foreground mt-1">LLM-driven entity extraction & relation mapping (Ch. 3)</p>
      </div>

      {/* Graph Visualization */}
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" /> Knowledge Graph Topology
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative w-full h-[320px] bg-secondary/20 rounded-lg overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
              {graphEdges.map((edge, i) => {
                const from = graphNodes[edge.from];
                const to = graphNodes[edge.to];
                return (
                  <motion.line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke="hsl(220, 14%, 25%)" strokeWidth="0.3"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: i * 0.1, duration: 0.5 }}
                  />
                );
              })}
              {graphNodes.map((node, i) => (
                <motion.g key={node.id} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.08 }}>
                  <circle cx={node.x} cy={node.y} r={node.size / 10} fill={nodeColorMap[node.type]} opacity={0.15} />
                  <circle cx={node.x} cy={node.y} r={node.size / 16} fill={nodeColorMap[node.type]} />
                  <text x={node.x} y={node.y + node.size / 8 + 2} textAnchor="middle" fill="hsl(215, 12%, 55%)" fontSize="2.2" fontFamily="Inter">
                    {node.id}
                  </text>
                </motion.g>
              ))}
            </svg>
            {/* Legend */}
            <div className="absolute bottom-3 right-3 flex flex-wrap gap-2">
              {Object.entries(nodeColorMap).slice(0, 4).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  {type}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="entities">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="entities">Entities (NER)</TabsTrigger>
          <TabsTrigger value="relations">Relations (RE)</TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Entity</th>
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Type</th>
                      <th className="text-left p-3 text-xs text-muted-foreground font-medium">Confidence</th>
                      <th className="text-right p-3 text-xs text-muted-foreground font-medium">Relations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entities.map((entity, i) => (
                      <motion.tr key={entity.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                        className="border-b border-border/30 hover:bg-secondary/30 transition-colors">
                        <td className="p-3 font-mono text-sm">{entity.name}</td>
                        <td className="p-3"><Badge variant="secondary" className={typeColors[entity.type]}>{entity.type}</Badge></td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-secondary">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${entity.confidence * 100}%` }} />
                            </div>
                            <span className="text-xs font-mono text-muted-foreground">{(entity.confidence * 100).toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono text-muted-foreground">{entity.relations}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relations" className="mt-4">
          <Card className="border-border/50 bg-card/80">
            <CardContent className="p-4 space-y-3">
              {relations.map((rel, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                  <span className="font-mono text-sm text-foreground">{rel.source}</span>
                  <Badge variant="outline" className="text-xs border-primary/30 text-primary">{rel.relation}</Badge>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="font-mono text-sm text-foreground">{rel.target}</span>
                  <span className="ml-auto text-xs font-mono text-muted-foreground">{(rel.confidence * 100).toFixed(0)}%</span>
                </motion.div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
