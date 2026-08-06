import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layers, AlertTriangle, Download } from "lucide-react";
import {
  AUG_DATASET,
  augStats,
  augmentedVariants,
  transformCounts,
  TRANSFORM_LABEL,
  type AugTransformId,
} from "@/lib/augmentation";
import { toast } from "sonner";

/**
 * GoldAug-CTI v1 browser — the derived robustness corpus.
 * Deliberately kept visually distinct from the Gold-56 panels so the two are
 * never confused in a screenshot or a paper figure.
 */
export function AugmentedCorpusPanel() {
  const [filter, setFilter] = useState<AugTransformId | "all">("all");

  const rows = useMemo(
    () => (filter === "all" ? augmentedVariants : augmentedVariants.filter((v) => v.transform === filter)),
    [filter],
  );

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ dataset: AUG_DATASET, stats: augStats, variants: augmentedVariants }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "goldaug-cti-v1.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${augmentedVariants.length} variants`);
  };

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              {AUG_DATASET.title}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-1 font-mono">
              {AUG_DATASET.id} · derived from {AUG_DATASET.seedCorpus}
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportJson}>
            <Download className="w-3.5 h-3.5" /> Export JSON
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="p-2.5 rounded border border-warning/40 bg-warning/10 text-[11px] text-warning flex gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Derived, not independent.</strong> {augStats.variants} variants descend from{" "}
            {augStats.seeds} hand-labelled seeds, so the number of independent labels is still{" "}
            <strong>n={augStats.independentLabels}</strong>. Report these results as a{" "}
            <em>robustness</em> table; statistics must resample seeds (cluster bootstrap), never variants.
            {" "}{AUG_DATASET.forbidden}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {[
            { label: "Seeds (gold)", value: augStats.seeds },
            { label: "Variants", value: augStats.variants },
            { label: "Total items", value: augStats.total },
            { label: "Label-preserving", value: augStats.labelPreserving },
            { label: "Defect-injected", value: augStats.defectInjected },
          ].map((s) => (
            <div key={s.label} className="p-2 rounded bg-secondary/30 border border-border/40">
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
              <p className="text-sm font-mono font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="font-mono text-[10px]">A1 surface-form · {augStats.families.A1}</Badge>
          <Badge variant="outline" className="font-mono text-[10px]">A2 structural · {augStats.families.A2}</Badge>
          <Badge variant="outline" className="font-mono text-[10px]">A3 adversarial · {augStats.families.A3}</Badge>
          <Badge variant="outline" className="font-mono text-[10px]">
            variants/seed {augStats.minVariantsPerSeed}–{augStats.maxVariantsPerSeed}
          </Badge>
        </div>

        <div className="space-y-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as AugTransformId | "all")}>
            <SelectTrigger className="bg-secondary/30 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All transforms ({augStats.variants})</SelectItem>
              {(Object.keys(transformCounts) as AugTransformId[]).map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {TRANSFORM_LABEL[t]} ({transformCounts[t]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="max-h-80 overflow-y-auto rounded border border-border/40 divide-y divide-border/40">
            {rows.slice(0, 120).map((v) => (
              <div key={v.id} className="p-2 text-[11px] space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-primary">{v.id}</span>
                  <Badge variant="outline" className="text-[9px] font-mono">{v.family}</Badge>
                  <span className="text-muted-foreground">{TRANSFORM_LABEL[v.transform]}</span>
                  {!v.labelPreserving && (
                    <Badge variant="outline" className="text-[9px] font-mono border-destructive/50 text-destructive">
                      defect · {v.expects}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground/90 font-mono leading-relaxed line-clamp-2">{v.text}</p>
                <p className="text-[10px] text-muted-foreground/70">{v.probe}</p>
              </div>
            ))}
            {rows.length > 120 && (
              <p className="p-2 text-[10px] text-muted-foreground">
                Showing first 120 of {rows.length} — export the JSON for the full set.
              </p>
            )}
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/80">
          Role: {AUG_DATASET.role}. Rationale and reporting rules:{" "}
          <a href="/reports/corpus-augmentation-feasibility.md" target="_blank" rel="noreferrer" className="underline">
            corpus-augmentation-feasibility.md
          </a>
        </p>
      </CardContent>
    </Card>
  );
}

export default AugmentedCorpusPanel;
