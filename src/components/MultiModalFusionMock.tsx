/**
 * MultiModalFusionMock — presentation-only mock for the CorroboratedFinding contract.
 *
 * Illustrates the multi-modal fusion of an external (narrative) CTI TTP node and an
 * internal (statistical) CICIDS-style FlowPattern node, joined by a typed `corroborates`
 * edge with its own confidence.
 *
 * Spec sources:
 *   - public/reports/cti-multimodal-fusion.md
 *   - public/reports/ontology-corroborated-finding-spec.md
 *   - public/reports/conflict-rules-multimodal-extension.md
 *
 * Not wired to live data. Static mock state, no network calls.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Activity, GitMerge, ShieldCheck, Clock, KeyRound } from "lucide-react";

// ── i18n-ready string table (collected at top for future extraction) ──────────
const STRINGS = {
  title: "Multi-Modal Fusion (mock)",
  subtitle:
    "Illustrates the CorroboratedFinding contract: external narrative ⊕ internal telemetry.",
  ext: {
    heading: "External TTP node",
    modality: "external_cti",
    actor: "APT-29",
    ttp: "T1071.001 — Application Layer Protocol: Web",
    source: "vendor-report.example.com/2026-apt29",
    observedAt: "2026-04-12T08:14:00Z",
    confLabel: "conf_narrative",
  },
  flow: {
    heading: "Internal Flow-Pattern node",
    modality: "internal_telemetry",
    host: "host:pseudo-7f3c",
    ja3: "JA3 e7d705a3286e19ea42f587b344ee6865",
    interarrival: "Inter-arrival 60.4 s ± 1.8 s",
    anomaly: "Anomaly score 0.74 (p99 baseline)",
    confLabel: "conf_behavioral",
  },
  edge: {
    heading: "corroborates edge",
    methodLabel: "Fusion method",
    windowLabel: "Evidence window",
    window: "2026-04-12T00:00Z → 2026-04-12T12:00Z",
    confLabel: "fused_conf",
  },
  guards: {
    heading: "Active guards on this mock",
    provenance: "Provenance separation",
    decay: "Temporal decay",
    twoKey: "Two-key promotion",
  },
  caption:
    "Mock — illustrates the contract defined in ontology-corroborated-finding-spec.md. Not wired to live data.",
};

type FusionMethod = "noisy_or" | "min" | "weighted";

const MOCK = {
  confNarr: 0.91,
  confBehav: 0.74,
};

function fuse(method: FusionMethod, n: number, b: number): number {
  switch (method) {
    case "noisy_or":
      return 1 - (1 - n) * (1 - b);
    case "min":
      return Math.min(n, b);
    case "weighted":
      return 0.5 * n + 0.5 * b;
  }
}

function ConfBar({ label, value, tone }: { label: string; value: number; tone: "narrative" | "behavioral" | "fused" }) {
  const pct = Math.round(value * 100);
  // Map tones to existing threat-palette tokens (no hardcoded hex).
  const toneClass =
    tone === "narrative"
      ? "[&>div]:bg-threat-high"
      : tone === "behavioral"
      ? "[&>div]:bg-info"
      : "[&>div]:bg-primary";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} className={`h-2 ${toneClass}`} />
    </div>
  );
}

export function MultiModalFusionMock() {
  const [method, setMethod] = useState<FusionMethod>("noisy_or");
  const fused = useMemo(() => fuse(method, MOCK.confNarr, MOCK.confBehav), [method]);

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitMerge className="h-4 w-4 text-primary" />
          {STRINGS.title}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{STRINGS.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {/* External TTP node */}
          <Card className="border-threat-high/30 bg-threat-high/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {STRINGS.ext.heading}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {STRINGS.ext.modality}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="font-mono text-threat-high">{STRINGS.ext.actor}</div>
              <div className="text-muted-foreground">{STRINGS.ext.ttp}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {STRINGS.ext.source}
              </div>
              <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {STRINGS.ext.observedAt}
              </div>
              <ConfBar label={STRINGS.ext.confLabel} value={MOCK.confNarr} tone="narrative" />
            </CardContent>
          </Card>

          {/* Internal Flow-Pattern node */}
          <Card className="border-info/30 bg-info/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Activity className="h-3.5 w-3.5" />
                  {STRINGS.flow.heading}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {STRINGS.flow.modality}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="font-mono text-info">{STRINGS.flow.host}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {STRINGS.flow.ja3}
              </div>
              <div className="text-muted-foreground">{STRINGS.flow.interarrival}</div>
              <div className="text-muted-foreground">{STRINGS.flow.anomaly}</div>
              <ConfBar label={STRINGS.flow.confLabel} value={MOCK.confBehav} tone="behavioral" />
            </CardContent>
          </Card>

          {/* corroborates edge */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <GitMerge className="h-3.5 w-3.5" />
                  {STRINGS.edge.heading}
                </CardTitle>
                <Badge variant="outline" className="font-mono text-[10px]">
                  fused
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="space-y-1">
                <div className="text-muted-foreground">{STRINGS.edge.methodLabel}</div>
                <Select value={method} onValueChange={(v) => setMethod(v as FusionMethod)}>
                  <SelectTrigger className="h-7 font-mono text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="noisy_or">noisy_or</SelectItem>
                    <SelectItem value="min">min</SelectItem>
                    <SelectItem value="weighted">weighted (α=0.5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-0.5">
                <div className="text-muted-foreground">{STRINGS.edge.windowLabel}</div>
                <div className="font-mono text-[11px]">{STRINGS.edge.window}</div>
              </div>
              <ConfBar label={STRINGS.edge.confLabel} value={fused} tone="fused" />
            </CardContent>
          </Card>
        </div>

        {/* Guards footer */}
        <div className="rounded-md border border-border/50 bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {STRINGS.guards.heading}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
              <KeyRound className="h-3 w-3" />
              {STRINGS.guards.provenance}
            </Badge>
            <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
              <Clock className="h-3 w-3" />
              {STRINGS.guards.decay}
            </Badge>
            <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
              <ShieldCheck className="h-3 w-3" />
              {STRINGS.guards.twoKey}
            </Badge>
          </div>
        </div>

        <p className="text-[11px] italic text-muted-foreground">{STRINGS.caption}</p>
      </CardContent>
    </Card>
  );
}

export default MultiModalFusionMock;
