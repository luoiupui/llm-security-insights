import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FlaskConical, Lock, Unlock, RotateCcw } from "lucide-react";
import { DEFAULT_REPRO, type ReproConfig } from "@/lib/threat-pipeline";

const STORAGE_KEY = "tg.repro.config";

export type ReproPreset = "deterministic" | "exploratory" | "custom";

export function loadRepro(): { preset: ReproPreset; config: ReproConfig } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { preset: parsed.preset ?? "deterministic", config: { ...DEFAULT_REPRO, ...parsed.config } };
    }
  } catch { /* noop */ }
  return { preset: "deterministic", config: DEFAULT_REPRO };
}

const PRESET_CONFIGS: Record<Exclude<ReproPreset, "custom">, ReproConfig> = {
  deterministic: { deterministic: true, temperature: 0, seed: 42, topK: 3, frozenSnapshotAt: null },
  exploratory:   { deterministic: false, temperature: 0.7, seed: Math.floor(Math.random() * 1e6), topK: 5, frozenSnapshotAt: null },
};

interface Props {
  value: ReproConfig;
  preset: ReproPreset;
  onChange: (preset: ReproPreset, config: ReproConfig) => void;
}

export function ReproPanel({ value, preset, onChange }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset, config: value }));
  }, [preset, value]);

  const setPreset = (p: ReproPreset) => {
    if (p === "custom") onChange("custom", value);
    else onChange(p, { ...PRESET_CONFIGS[p] });
  };

  const update = (patch: Partial<ReproConfig>) => onChange("custom", { ...value, ...patch });

  const snapshotLabel = value.frozenSnapshotAt
    ? new Date(value.frozenSnapshotAt).toLocaleString()
    : "live (growing corpus)";

  return (
    <Card className="border-border/50 bg-card/80">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" /> Reproducibility &amp; Comparison Mode
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">
              {preset} · T={value.temperature} · seed={value.seed} · k={value.topK} · {value.frozenSnapshotAt ? "frozen" : "live"}
            </Badge>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen((v) => !v)}>
              {open ? "Hide" : "Configure"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["deterministic", "exploratory", "custom"] as ReproPreset[]).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={preset === p ? "default" : "outline"}
                onClick={() => setPreset(p)}
                className="h-8 text-xs capitalize"
              >
                {p}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPreset("deterministic")}
              className="h-8 text-xs gap-1.5"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Temperature</Label>
                <span className="text-xs font-mono text-muted-foreground">{value.temperature.toFixed(2)}</span>
              </div>
              <Slider
                value={[value.temperature]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([t]) => update({ temperature: t, deterministic: t === 0 ? value.deterministic : false })}
              />
              <div className="flex items-center gap-2">
                <Switch
                  checked={value.deterministic}
                  onCheckedChange={(c) => update({ deterministic: c, temperature: c ? 0 : value.temperature })}
                  id="det-switch"
                />
                <Label htmlFor="det-switch" className="text-[11px] text-muted-foreground">
                  Force deterministic (T=0, fixed seed)
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Seed</Label>
              <Input
                type="number"
                value={value.seed}
                onChange={(e) => update({ seed: parseInt(e.target.value || "0", 10) })}
                className="h-8 text-xs font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs w-full"
                onClick={() => update({ seed: Math.floor(Math.random() * 1e6) })}
              >
                Randomize seed
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">RAG top-K</Label>
                <span className="text-xs font-mono text-muted-foreground">k = {value.topK}</span>
              </div>
              <Slider
                value={[value.topK]}
                min={1}
                max={10}
                step={1}
                onValueChange={([k]) => update({ topK: k })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5">
                  {value.frozenSnapshotAt ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  Freeze GraphRAG corpus snapshot
                </Label>
                <Switch
                  checked={!!value.frozenSnapshotAt}
                  onCheckedChange={(c) =>
                    update({ frozenSnapshotAt: c ? new Date().toISOString() : null })
                  }
                />
              </div>
              <p className="text-[11px] text-muted-foreground font-mono truncate">{snapshotLabel}</p>
              {value.frozenSnapshotAt && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs w-full"
                  onClick={() => update({ frozenSnapshotAt: new Date().toISOString() })}
                >
                  Re-snapshot to now
                </Button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            <strong>Deterministic</strong> pins T=0 and a fixed seed in <code>threat-extract</code>, freezing the LLM path
            for reproducible thesis comparisons. <strong>Exploratory</strong> increases temperature and top-K to surface
            alternative edges. The frozen snapshot caps the GraphRAG retrieval corpus at a fixed timestamp so newly
            persisted reports cannot influence subsequent runs.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
