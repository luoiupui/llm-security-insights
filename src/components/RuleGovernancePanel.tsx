/**
 * RuleGovernancePanel (Hybrid rule governance, G4/G6)
 * --------------------------------------------------------------------
 * One surface for the hybrid rulebase that produces the KG:
 *  - Layer status: expert baseline R1–R13 + adaptive C1/C2/C3/C4
 *  - Active rule-set fingerprint (the replay key stamped on every run)
 *  - C3 human-in-the-loop review queue for LLM-mined rule candidates
 *  - Replay ledger (kg_rule_replays)
 *
 * Nothing here auto-activates a rule: an accepted candidate is marked
 * `accepted` and compiled into the rule kernel on the next build.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldCheck, Sparkles, Check, X, History, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useDomain } from "@/contexts/DomainContext";

interface Candidate {
  id: string;
  rule_key: string;
  taxonomy: string;
  rationale: string;
  llm_confidence: number | null;
  status: string;
  when_pattern: unknown;
  then_violation: unknown;
  created_at: string;
}

interface RuleSet {
  version: string;
  kernel_version: string;
  created_at: string;
  rules: unknown;
}

interface Replay {
  id: string;
  source_label: string;
  replay_rule_set_version: string;
  original_violation_count: number;
  replay_violation_count: number;
  matched: boolean;
  created_at: string;
}

const LAYERS = [
  { id: "Baseline", rules: "R1–R13", provenance: "expert", desc: "Hand-authored symbolic rules — reproducible lower bound" },
  { id: "C1", rules: "R8–R12", provenance: "adaptive", desc: "Temporal drift: verb monotonicity, timestamp order, drift window, alias flip, timeline change" },
  { id: "C2", rules: "R13–R15", provenance: "adaptive", desc: "Kill-chain: stage jumper/inversion, causal cycle, orphan impact" },
  { id: "C3", rules: "mined", provenance: "mined", desc: "LLM proposes → human accepts → compiled into the kernel" },
  { id: "C4", rules: "R16", provenance: "adaptive", desc: "Novel-edge-pattern anomaly against the historical KG — warn only" },
];

export function RuleGovernancePanel() {
  const { domain } = useDomain();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [replays, setReplays] = useState<Replay[]>([]);
  const [mining, setMining] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r, p] = await Promise.all([
      supabase.from("kg_conflict_rule_candidates").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("kg_rule_sets").select("version,kernel_version,created_at,rules").order("created_at", { ascending: false }).limit(5),
      supabase.from("kg_rule_replays").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    setCandidates((c.data ?? []) as unknown as Candidate[]);
    setRuleSets((r.data ?? []) as unknown as RuleSet[]);
    setReplays((p.data ?? []) as unknown as Replay[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const mine = async () => {
    setMining(true);
    try {
      const { data, error } = await supabase.functions.invoke("threat-conflicts-mine", {
        body: { domain, limit: 40 },
      });
      if (error) throw error;
      toast.success(`C3 mining proposed ${data?.proposed ?? 0} candidate rule(s)`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rule mining failed");
    } finally {
      setMining(false);
    }
  };

  const decide = async (id: string, status: "accepted" | "rejected") => {
    const { error } = await supabase
      .from("kg_conflict_rule_candidates")
      .update({ status, reviewer_note: `${status} in Rule Governance panel`, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(
      status === "accepted"
        ? "Accepted — compiled into the rule kernel on the next build"
        : "Rejected — will not affect the KG",
    );
    await load();
  };

  const proposed = candidates.filter((c) => c.status === "proposed");
  const decided = candidates.filter((c) => c.status !== "proposed");
  const active = ruleSets[0];

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-mono text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Hybrid Rule Governance
          <Badge variant="outline" className="ml-2 font-mono text-[10px]">expert baseline + C1–C4</Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Expert rules and auto-generated adaptive rules jointly produce the KG. Every run is stamped with the
          rule-set fingerprint below so its violations can be replayed exactly.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Active rule set */}
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-mono">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Active rule set
            </div>
            {active ? (
              <div className="flex items-center gap-2 font-mono text-xs">
                <Badge variant="secondary">{active.kernel_version}</Badge>
                <Badge variant="outline">{active.version}</Badge>
                <span className="text-muted-foreground">
                  {Array.isArray(active.rules) ? active.rules.length : 0} rules
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                No snapshot yet — run the conflicts stage once to register one.
              </span>
            )}
          </div>
        </div>

        {/* Layer status */}
        <div className="space-y-2">
          {LAYERS.map((l) => (
            <div key={l.id} className="flex items-start gap-3 rounded-md border border-border/60 p-2.5">
              <Badge
                variant={l.provenance === "expert" ? "default" : l.provenance === "mined" ? "outline" : "secondary"}
                className="mt-0.5 font-mono text-[10px]"
              >
                {l.id}
              </Badge>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs">{l.rules} · <span className="text-muted-foreground">{l.provenance}</span></div>
                <div className="text-xs text-muted-foreground">{l.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* C3 review queue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-sm">C3 review queue ({proposed.length} pending)</div>
            <Button size="sm" onClick={mine} disabled={mining}>
              {mining ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
              Mine new rules
            </Button>
          </div>

          {loading && <div className="text-xs text-muted-foreground">Loading…</div>}

          {!loading && proposed.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No pending candidates. Run mining to have the model propose deterministic rules from recent pipeline evidence.
            </div>
          )}

          {proposed.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{c.rule_key}</span>
                <Badge variant="outline" className="font-mono text-[10px]">{c.taxonomy}</Badge>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  conf {(Number(c.llm_confidence ?? 0) * 100).toFixed(0)}%
                </Badge>
              </div>
              <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed">
                {JSON.stringify({ when: c.when_pattern, then: c.then_violation }, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground">{c.rationale}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="default" onClick={() => decide(c.id, "accepted")}>
                  <Check className="mr-1.5 h-3.5 w-3.5" /> Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(c.id, "rejected")}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                </Button>
              </div>
            </div>
          ))}

          {decided.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Reviewed: {decided.filter((d) => d.status === "accepted").length} accepted ·{" "}
              {decided.filter((d) => d.status === "rejected").length} rejected
            </div>
          )}
        </div>

        {/* Replay ledger */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-sm">
            <History className="h-3.5 w-3.5 text-primary" /> Replay ledger
          </div>
          {replays.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No replays recorded yet. Replays re-run the deterministic layers against an archived rule-set snapshot and
              record whether the violation set still matches.
            </div>
          ) : (
            <div className="space-y-1">
              {replays.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border border-border/60 px-2 py-1.5 font-mono text-[11px]">
                  <span className="truncate">{r.source_label}</span>
                  <span className="text-muted-foreground">{r.replay_rule_set_version}</span>
                  <span>{r.original_violation_count} → {r.replay_violation_count}</span>
                  <Badge variant={r.matched ? "secondary" : "destructive"} className="text-[10px]">
                    {r.matched ? "match" : "drift"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
