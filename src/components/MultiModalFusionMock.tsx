/**
 * MultiModalFusionMock — now driven by the Phase 4 matcher.
 *
 * Joins EXTERNAL_TTP_CLAIMS (narrative) ⨯ SAMPLE_FLOWS (CICIDS-style
 * behavioral) on MITRE technique id and displays a real CorroboratedFinding
 * with the dual-confidence storage rule honored:
 *   - conf_narrative & conf_behavioral are stored (independent bars)
 *   - fused_conf is recomputed at render time, never persisted
 *
 * Spec refs:
 *   - public/reports/cti-multimodal-fusion.md
 *   - public/reports/ontology-corroborated-finding-spec.md
 *   - public/reports/conflict-rules-multimodal-extension.md
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Activity, GitMerge, ShieldCheck, Clock, KeyRound, AlertTriangle } from "lucide-react";
import { matchCorroborations, type MatchedFinding } from "@/lib/fusion/matcher";
import { EXTERNAL_TTP_CLAIMS } from "@/lib/fusion/external-ttp-fixtures";
import { SAMPLE_FLOWS } from "@/lib/test-corpus/flow-samples";
import { fuse, type FusionMethod as FuseMethod } from "@/lib/fusion";

const STRINGS = {
  title: "Multi-Modal Fusion (CICIDS ⨯ External CTI)",
  subtitle:
    "Real matcher output: external narrative TTPs joined to CICIDS-style flow findings on MITRE id.",
  pickerLabel: "Corroboration",
  ext: { heading: "External TTP node", modality: "external_cti", confLabel: "conf_narrative" },
  flow: { heading: "Internal Flow-Pattern node", modality: "internal_telemetry", confLabel: "conf_behavioral" },
  edge: { heading: "corroborates edge", methodLabel: "Fusion method", windowLabel: "Evidence window", confLabel: "fused_conf (recomputed)" },
  guards: { heading: "Active guards on this output",
    provenance: "Provenance separation",
    decay: "R12 temporal decay applied",
    twoKey: "Two-key promotion",
    r11: "R11 unverified clamp",
  },
  caption:
    "Driven by src/lib/fusion/matcher.ts over EXTERNAL_TTP_CLAIMS ⨯ SAMPLE_FLOWS. fused_conf is recomputed per spec §1.2.",
  empty: "No corroborations above min_fused threshold for current method.",
};

type FusionMethod = FuseMethod;

function ConfBar({ label, value, tone }: { label: string; value: number; tone: "narrative" | "behavioral" | "fused" }) {
  const pct = Math.round(value * 100);
  const toneClass =
    tone === "narrative" ? "[&>div]:bg-threat-high"
    : tone === "behavioral" ? "[&>div]:bg-info"
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

  // Run the matcher once per method change. asOf is fixed for reproducibility.
  const findings = useMemo<MatchedFinding[]>(
    () => matchCorroborations(EXTERNAL_TTP_CLAIMS, SAMPLE_FLOWS, {
      method,
      asOf: new Date("2026-04-13T00:00:00Z"),
      min_fused: 0.4,
    }),
    [method],
  );

  const [pickIdx, setPickIdx] = useState(0);
  const current = findings[Math.min(pickIdx, findings.length - 1)];

  // For the "method" selector preview we re-fuse the current finding's stored
  // dual confidences — this is what spec §1.2 calls "recompute at read time".
  const fusedPreview = current ? fuse(method, current.conf_narrative, current.conf_behavioral) : 0;

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
        {/* Finding picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{STRINGS.pickerLabel}</span>
          <Select value={String(pickIdx)} onValueChange={(v) => setPickIdx(Number(v))}>
            <SelectTrigger className="h-7 w-auto min-w-[280px] font-mono text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {findings.map((f, i) => (
                <SelectItem key={f.id} value={String(i)}>
                  {f.actor} · {f.technique_id} · flow {f.flow_ref.slice(0, 8)} ({Math.round(f.fused_conf * 100)}%)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="font-mono text-[10px]">
            {findings.length} / {EXTERNAL_TTP_CLAIMS.length * SAMPLE_FLOWS.length} candidates kept
          </Badge>
        </div>

        {!current ? (
          <p className="text-xs italic text-muted-foreground">{STRINGS.empty}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {/* External TTP node */}
            <Card className="border-threat-high/30 bg-threat-high/5">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {STRINGS.ext.heading}
                  </CardTitle>
                  <Badge variant="outline" className="font-mono text-[10px]">{STRINGS.ext.modality}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="font-mono text-threat-high">{current.actor}</div>
                <div className="text-muted-foreground">{current.technique_id} — {current.ttp_name}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{current.source_url}</div>
                <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  freshness ×{current.freshness_factor.toFixed(2)} (was {Math.round(current.conf_narrative_raw * 100)}%)
                </div>
                <ConfBar label={STRINGS.ext.confLabel} value={current.conf_narrative} tone="narrative" />
                {current.unverified_external && (
                  <div className="flex items-center gap-1 text-[10px] text-threat-medium">
                    <AlertTriangle className="h-3 w-3" /> R11 clamp applied
                  </div>
                )}
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
                  <Badge variant="outline" className="font-mono text-[10px]">{STRINGS.flow.modality}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="font-mono text-info">flow:{current.flow_ref.slice(0, 8)}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {current.evidence_window?.start} → {current.evidence_window?.end}
                </div>
                <div className="text-muted-foreground">CICIDS sample · MITRE {current.technique_id}</div>
                <ConfBar label={STRINGS.flow.confLabel} value={current.conf_behavioral} tone="behavioral" />
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
                  <Badge variant="outline" className="font-mono text-[10px]">fused</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="space-y-1">
                  <div className="text-muted-foreground">{STRINGS.edge.methodLabel}</div>
                  <Select value={method} onValueChange={(v) => setMethod(v as FusionMethod)}>
                    <SelectTrigger className="h-7 font-mono text-[11px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="noisy_or">noisy_or</SelectItem>
                      <SelectItem value="min">min</SelectItem>
                      <SelectItem value="weighted">weighted (α=0.5)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ConfBar label={STRINGS.edge.confLabel} value={fusedPreview} tone="fused" />
                <div className="font-mono text-[10px] text-muted-foreground">
                  run_id: {current.provenance.run_id}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Guards footer */}
        <div className="rounded-md border border-border/50 bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            {STRINGS.guards.heading}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 font-mono text-[10px]"><KeyRound className="h-3 w-3" />{STRINGS.guards.provenance}</Badge>
            <Badge variant="secondary" className="gap-1 font-mono text-[10px]"><Clock className="h-3 w-3" />{STRINGS.guards.decay}</Badge>
            <Badge variant="secondary" className="gap-1 font-mono text-[10px]"><ShieldCheck className="h-3 w-3" />{STRINGS.guards.twoKey}</Badge>
            <Badge variant="secondary" className="gap-1 font-mono text-[10px]"><AlertTriangle className="h-3 w-3" />{STRINGS.guards.r11}</Badge>
          </div>
        </div>

        <p className="text-[11px] italic text-muted-foreground">{STRINGS.caption}</p>
      </CardContent>
    </Card>
  );
}

export default MultiModalFusionMock;
