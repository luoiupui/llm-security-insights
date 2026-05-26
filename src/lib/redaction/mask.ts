/**
 * One-way masking renderer.
 * Replaces sensitive spans with typed placeholders. NOT reversible:
 * placeholder indices are scoped per-document and the mapping is not stored.
 */
import { SpanDecision } from "./guard";

export interface MaskResult {
  masked: string;
  legend: Array<{ placeholder: string; axis: string; rule_id: string }>;
  spans: Array<SpanDecision & { placeholderEmitted: string }>;
}

export function applyMask(text: string, spans: SpanDecision[]): MaskResult {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const counts = new Map<string, number>();
  const legend: MaskResult["legend"] = [];
  const out: string[] = [];
  let cursor = 0;
  const emitted: Array<SpanDecision & { placeholderEmitted: string }> = [];

  for (const s of sorted) {
    if (s.start < cursor) continue; // skip overlaps
    out.push(text.slice(cursor, s.start));
    const n = (counts.get(s.placeholder) ?? 0) + 1;
    counts.set(s.placeholder, n);
    const tag = `[${s.placeholder}-${n}]`;
    out.push(tag);
    legend.push({ placeholder: tag, axis: s.axis, rule_id: s.rule_id });
    emitted.push({ ...s, placeholderEmitted: tag });
    cursor = s.end;
  }
  out.push(text.slice(cursor));
  return { masked: out.join(""), legend, spans: emitted };
}

/** Render an HTML diff highlighting masked regions (used by Redaction Lab). */
export function renderDiffHTML(text: string, spans: SpanDecision[]): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts: string[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start < cursor) continue;
    parts.push(esc(text.slice(cursor, s.start)));
    parts.push(
      `<mark data-axis="${s.axis}" title="${s.rule_id} · ${s.action}">${esc(text.slice(s.start, s.end))}</mark>`,
    );
    cursor = s.end;
  }
  parts.push(esc(text.slice(cursor)));
  return parts.join("");
}
