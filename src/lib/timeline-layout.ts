import type { ExtractionResult, ThreatEntity, CausalLink } from "@/lib/threat-pipeline";

export interface TimelineNode {
  id: string;
  x: number;
  y: number;
  type: string;
  order: number;
  timestamp?: string;
  certainty?: string;
  event?: string;
}

export interface TimelineEdge {
  fromIdx: number;
  toIdx: number;
  causal_type: string;
  confidence: number;
}

const LANES: Record<string, number> = {
  threat_actor: 18,
  campaign: 28,
  malware: 40,
  vulnerability: 52,
  ttp: 64,
  infrastructure: 76,
  software: 76,
  identity: 84,
  indicator: 84,
};

const CAUSAL_COLOR: Record<string, string> = {
  enables: "hsl(200, 80%, 55%)",
  leads_to: "hsl(38, 92%, 50%)",
  triggers: "hsl(0, 72%, 55%)",
  precedes: "hsl(215, 12%, 55%)",
};

export function causalColor(t: string) {
  return CAUSAL_COLOR[t] || CAUSAL_COLOR.precedes;
}

/**
 * Map an event string to the most likely entity name in the graph
 * by longest substring match.
 */
function matchEntity(event: string, entities: ThreatEntity[]): ThreatEntity | undefined {
  let best: ThreatEntity | undefined;
  let bestLen = 0;
  const lower = event.toLowerCase();
  for (const e of entities) {
    if (lower.includes(e.name.toLowerCase()) && e.name.length > bestLen) {
      best = e;
      bestLen = e.name.length;
    }
  }
  return best;
}

export function buildTimelineLayout(extraction: ExtractionResult | null) {
  if (!extraction) return { nodes: [] as TimelineNode[], edges: [] as TimelineEdge[] };
  const entities = extraction.ner?.entities || [];
  const causal: CausalLink[] = extraction.causality?.causal_links || [];
  const timeline = extraction.causality?.attack_timeline || [];

  // Collect ordered events: prefer attack_timeline; fallback = causal links
  const events: { order: number; label: string; entity?: ThreatEntity; timestamp?: string; certainty?: string }[] = [];
  if (timeline.length > 0) {
    for (const t of timeline) {
      events.push({
        order: t.order,
        label: t.event,
        entity: matchEntity(t.event, entities),
        timestamp: t.timestamp_mentioned,
        certainty: t.certainty,
      });
    }
  } else {
    // Derive ordered events from causal links
    const seen = new Set<string>();
    for (const c of causal) {
      if (!seen.has(c.cause)) {
        seen.add(c.cause);
        events.push({ order: c.temporal_order, label: c.cause, entity: matchEntity(c.cause, entities) });
      }
      if (!seen.has(c.effect)) {
        seen.add(c.effect);
        events.push({ order: c.temporal_order + 1, label: c.effect, entity: matchEntity(c.effect, entities) });
      }
    }
  }

  // Sort by temporal order
  events.sort((a, b) => a.order - b.order);

  const total = Math.max(events.length, 1);
  const nodes: TimelineNode[] = events.map((e, i) => {
    const x = 8 + (i / Math.max(total - 1, 1)) * 84;
    const lane = e.entity?.type ? LANES[e.entity.type] ?? 70 : 70;
    return {
      id: e.entity?.name || e.label.slice(0, 24),
      x,
      y: lane,
      type: e.entity?.type || "ttp",
      order: e.order,
      timestamp: e.timestamp,
      certainty: e.certainty,
      event: e.label,
    };
  });

  const indexFor = (label: string) => {
    const lower = label.toLowerCase();
    let bestIdx = -1;
    let bestLen = 0;
    nodes.forEach((n, i) => {
      const ev = (n.event || "").toLowerCase();
      if (ev.includes(lower) || lower.includes(ev) || lower.includes(n.id.toLowerCase())) {
        if ((n.event?.length || 0) >= bestLen) {
          bestIdx = i;
          bestLen = n.event?.length || 0;
        }
      }
    });
    return bestIdx;
  };

  const edges: TimelineEdge[] = causal
    .map((c) => ({
      fromIdx: indexFor(c.cause),
      toIdx: indexFor(c.effect),
      causal_type: c.causal_type,
      confidence: c.confidence,
    }))
    .filter((e) => e.fromIdx >= 0 && e.toIdx >= 0 && e.fromIdx !== e.toIdx);

  return { nodes, edges };
}

export const CAUSAL_TYPES = ["enables", "leads_to", "triggers", "precedes"] as const;
