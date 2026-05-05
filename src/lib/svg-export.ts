// Word-compatible, editable SVG export builder for the KG visualization.
// Produces structured, layered SVG (background / legend / edges / nodes / metadata)
// with hex colors only and explicit pixel dimensions so it renders inside
// Microsoft Word and remains editable in Inkscape / Illustrator / draw.io.

import { causalColor, type TimelineNode, type TimelineEdge } from "@/lib/timeline-layout";

/* ---------- color helpers ---------- */

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function normaliseColor(c: string): string {
  if (!c) return c;
  const m = c.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i);
  if (m) return hslToHex(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  return c;
}

/* Node-type color map (hex, mirror of nodeColorMap in KGConstruction) */
export const NODE_COLOR_HEX: Record<string, string> = {
  threat_actor: hslToHex(0, 72, 55),
  malware: hslToHex(25, 95, 53),
  ttp: hslToHex(160, 70, 45),
  vulnerability: hslToHex(38, 92, 50),
  software: hslToHex(200, 80, 55),
  infrastructure: hslToHex(215, 12, 55),
  campaign: hslToHex(280, 70, 60),
  indicator: hslToHex(190, 70, 50),
  identity: hslToHex(50, 70, 55),
};

/* ---------- types ---------- */

export interface ExportNode {
  id: string; x: number; y: number; type: string; size: number;
  confidence: number; synthesised?: boolean;
}
export interface ExportEdge {
  from: number; to: number; relation?: string; synthesised?: boolean;
}

export type Theme = "light" | "dark";

export interface ExportMeta {
  caseId?: string;
  preset?: string;
  temperature?: number;
  seed?: number;
  centre?: string;
  generatedAt?: string;
}

interface ThemeTokens {
  bg: string;
  fg: string;        // primary text
  fgMuted: string;   // axis/secondary text
  edge: string;
  edgeSynth: string;
  centreStroke: string;
  legendBg: string;
  legendBorder: string;
}

const THEMES: Record<Theme, ThemeTokens> = {
  light: {
    bg: "#ffffff",
    fg: "#1f2937",
    fgMuted: "#6b7280",
    edge: "#9ca3af",
    edgeSynth: hslToHex(280, 70, 55),
    centreStroke: hslToHex(38, 92, 45),
    legendBg: "#f9fafb",
    legendBorder: "#d1d5db",
  },
  dark: {
    bg: "#0b0f17",
    fg: hslToHex(215, 12, 80),
    fgMuted: hslToHex(215, 12, 55),
    edge: hslToHex(220, 14, 35),
    edgeSynth: hslToHex(280, 70, 60),
    centreStroke: hslToHex(48, 96, 60),
    legendBg: "#11161f",
    legendBorder: hslToHex(220, 14, 25),
  },
};

/* ---------- label de-overlap (greedy) ----------
 * Place each label above or below its node so labels don't crash
 * into another node's centre. Operates in 0..100 viewBox units.
 */
function placeLabel(
  node: ExportNode,
  others: ExportNode[],
): { y: number; anchor: "above" | "below" } {
  const r = node.size / 16;
  const below = node.y + r + 2.2;
  const above = node.y - r - 1.2;
  const conflicts = (yProbe: number) =>
    others.some((o) => o.id !== node.id && Math.abs(o.x - node.x) < 6 && Math.abs(o.y - yProbe) < 2);
  if (!conflicts(below)) return { y: below, anchor: "below" };
  if (!conflicts(above)) return { y: above, anchor: "above" };
  return { y: below, anchor: "below" };
}

/* ---------- escape helpers ---------- */
const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/* ---------- legend block ---------- */
function renderLegend(t: ThemeTokens, theme: Theme, meta: ExportMeta): string {
  const items = [
    { label: "threat actor", color: NODE_COLOR_HEX.threat_actor },
    { label: "campaign", color: NODE_COLOR_HEX.campaign },
    { label: "malware", color: NODE_COLOR_HEX.malware },
    { label: "vulnerability", color: NODE_COLOR_HEX.vulnerability },
    { label: "TTP", color: NODE_COLOR_HEX.ttp },
    { label: "infrastructure", color: NODE_COLOR_HEX.infrastructure },
  ];
  const rowH = 2.6;
  const x = 1.5, y = 1.5, w = 22, h = 4 + items.length * rowH + 6;
  const lines: string[] = [];
  lines.push(`<g id="legend" font-family="Inter, Arial, sans-serif">`);
  lines.push(`  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6" fill="${t.legendBg}" stroke="${t.legendBorder}" stroke-width="0.15"/>`);
  lines.push(`  <text x="${x + 1}" y="${y + 2.6}" font-size="1.7" font-weight="700" fill="${t.fg}">Knowledge Graph — Legend</text>`);
  items.forEach((it, i) => {
    const cy = y + 4.4 + i * rowH;
    lines.push(`  <circle cx="${x + 1.6}" cy="${cy}" r="0.9" fill="${it.color}"/>`);
    lines.push(`  <text x="${x + 3.2}" y="${cy + 0.6}" font-size="1.5" fill="${t.fg}">${esc(it.label)}</text>`);
  });
  // edge styles
  const eyBase = y + 4.4 + items.length * rowH + 0.8;
  lines.push(`  <line x1="${x + 1}" y1="${eyBase}" x2="${x + 4}" y2="${eyBase}" stroke="${t.edge}" stroke-width="0.3"/>`);
  lines.push(`  <text x="${x + 4.6}" y="${eyBase + 0.5}" font-size="1.3" fill="${t.fgMuted}">relation</text>`);
  lines.push(`  <line x1="${x + 12}" y1="${eyBase}" x2="${x + 15}" y2="${eyBase}" stroke="${t.edgeSynth}" stroke-width="0.3" stroke-dasharray="0.8 0.6"/>`);
  lines.push(`  <text x="${x + 15.6}" y="${eyBase + 0.5}" font-size="1.3" fill="${t.fgMuted}">synthesised</text>`);
  // centre marker
  if (meta.centre) {
    lines.push(`  <text x="${x + 1}" y="${eyBase + 2.4}" font-size="1.3" fill="${t.fg}">centre: ${esc(meta.centre)}</text>`);
  }
  lines.push(`</g>`);
  return lines.join("\n");
}

/* ---------- metadata footer ---------- */
function renderMeta(t: ThemeTokens, meta: ExportMeta, viewH: number): string {
  const parts: string[] = [];
  if (meta.caseId) parts.push(`case=${meta.caseId}`);
  if (meta.preset) parts.push(`preset=${meta.preset}`);
  if (typeof meta.temperature === "number") parts.push(`T=${meta.temperature}`);
  if (typeof meta.seed === "number") parts.push(`seed=${meta.seed}`);
  parts.push(meta.generatedAt || new Date().toISOString());
  return `<g id="metadata"><text x="1.5" y="${viewH - 1.2}" font-size="1.2" font-family="ui-monospace, JetBrains Mono, monospace" fill="${t.fgMuted}">${esc(parts.join(" · "))}</text></g>`;
}

/* ============================================================
 * Force-directed export
 * ============================================================ */
export function buildForceSvg(
  nodes: ExportNode[],
  edges: ExportEdge[],
  pivotName: string | undefined,
  theme: Theme,
  meta: ExportMeta,
): string {
  const t = THEMES[theme];
  const viewW = 100, viewH = 100;
  const pxW = 1600, pxH = 1600;

  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="xMidYMid meet">`);
  out.push(`<title>ThreatGraph — Knowledge Graph (force-directed)</title>`);
  out.push(`<desc>Generated ${new Date().toISOString()}. Editable in Inkscape, Illustrator, draw.io. Word-compatible.</desc>`);

  // background
  out.push(`<g id="background"><rect width="${viewW}" height="${viewH}" fill="${t.bg}"/></g>`);

  // legend
  out.push(renderLegend(t, theme, { ...meta, centre: pivotName }));

  // edges
  out.push(`<g id="edges" fill="none">`);
  edges.forEach((e, i) => {
    const a = nodes[e.from], b = nodes[e.to];
    if (!a || !b) return;
    const stroke = e.synthesised ? t.edgeSynth : t.edge;
    const dash = e.synthesised ? ` stroke-dasharray="0.8 0.6"` : "";
    const gid = `edge-${safeId(a.id)}-${safeId(b.id)}-${i}`;
    out.push(`  <g id="${gid}" data-from="${esc(a.id)}" data-to="${esc(b.id)}" data-kind="${e.synthesised ? "synth" : "relation"}">`);
    out.push(`    <line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" stroke="${stroke}" stroke-width="0.3"${dash} opacity="${e.synthesised ? 0.7 : 1}"/>`);
    if (e.relation) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      out.push(`    <text x="${mx.toFixed(2)}" y="${my.toFixed(2)}" text-anchor="middle" font-size="1.4" font-family="ui-monospace, JetBrains Mono, monospace" fill="${t.fgMuted}">${esc(e.relation)}</text>`);
    }
    out.push(`  </g>`);
  });
  out.push(`</g>`);

  // nodes
  out.push(`<g id="nodes" font-family="ui-monospace, JetBrains Mono, monospace">`);
  nodes.forEach((n) => {
    const isCentre = pivotName === n.id;
    const fill = NODE_COLOR_HEX[n.type] || "#888888";
    const stroke = n.synthesised ? t.edgeSynth : isCentre ? t.centreStroke : "none";
    const sw = n.synthesised || isCentre ? 0.4 : 0;
    const dash = n.synthesised ? ` stroke-dasharray="0.6 0.4"` : "";
    const lbl = placeLabel(n, nodes);
    const labelText = n.id.length > 15 ? n.id.slice(0, 14) + "…" : n.id;
    const labelFill = isCentre ? t.centreStroke : t.fg;
    out.push(`  <g id="node-${safeId(n.id)}" data-type="${esc(n.type)}" data-confidence="${n.confidence.toFixed(3)}"${n.synthesised ? ` data-synthesised="true"` : ""}>`);
    out.push(`    <circle class="halo" cx="${n.x.toFixed(2)}" cy="${n.y.toFixed(2)}" r="${(n.size / 10).toFixed(2)}" fill="${fill}" opacity="0.18"/>`);
    out.push(`    <circle class="core" cx="${n.x.toFixed(2)}" cy="${n.y.toFixed(2)}" r="${(n.size / 16).toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash}/>`);
    out.push(`    <text class="label" x="${n.x.toFixed(2)}" y="${lbl.y.toFixed(2)}" text-anchor="middle" font-size="2" font-weight="${isCentre ? 700 : 400}" fill="${labelFill}">${esc(labelText)}</text>`);
    out.push(`  </g>`);
  });
  out.push(`</g>`);

  out.push(renderMeta(t, meta, viewH));
  out.push(`</svg>`);
  return out.join("\n");
}

/* ============================================================
 * Timeline export (causal layer)
 * ============================================================ */
export function buildTimelineSvg(
  nodes: TimelineNode[],
  edges: TimelineEdge[],
  theme: Theme,
  meta: ExportMeta,
): string {
  const t = THEMES[theme];
  const viewW = 100, viewH = 100;
  const pxW = 1600, pxH = 1200;
  const out: string[] = [];
  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${viewW} ${viewH}" preserveAspectRatio="xMidYMid meet">`);
  out.push(`<title>ThreatGraph — Temporal & Causal Layer</title>`);
  out.push(`<desc>Generated ${new Date().toISOString()}. Editable in Inkscape, Illustrator, draw.io. Word-compatible.</desc>`);

  // arrowhead markers (per causal type)
  out.push(`<defs>`);
  ["enables", "leads_to", "triggers", "precedes"].forEach((c) => {
    out.push(`  <marker id="arrow-${c}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${normaliseColor(causalColor(c))}"/></marker>`);
  });
  out.push(`</defs>`);

  out.push(`<g id="background"><rect width="${viewW}" height="${viewH}" fill="${t.bg}"/></g>`);
  out.push(renderLegend(t, theme, meta));

  // lane labels
  const lanes: [string, number][] = [
    ["threat_actor", 18], ["campaign", 28], ["malware", 40], ["vulnerability", 52],
    ["ttp", 64], ["infrastructure", 76],
  ];
  out.push(`<g id="lanes" font-family="ui-monospace, JetBrains Mono, monospace">`);
  lanes.forEach(([label, y]) => {
    out.push(`  <text x="2" y="${y + 0.6}" font-size="1.4" fill="${t.fgMuted}">${esc(label)}</text>`);
  });
  out.push(`</g>`);

  // axis
  out.push(`<g id="axis"><line x1="6" y1="92" x2="94" y2="92" stroke="${t.edge}" stroke-width="0.2"/>`);
  nodes.forEach((n, i) => {
    out.push(`  <line x1="${n.x.toFixed(2)}" y1="91" x2="${n.x.toFixed(2)}" y2="93" stroke="${t.fgMuted}" stroke-width="0.15"/>`);
    out.push(`  <text x="${n.x.toFixed(2)}" y="96" text-anchor="middle" font-size="1.6" font-family="ui-monospace, JetBrains Mono, monospace" fill="${t.fgMuted}">t${i + 1}${n.timestamp ? " " + esc(n.timestamp.slice(0, 10)) : ""}</text>`);
  });
  out.push(`</g>`);

  // causal edges
  out.push(`<g id="edges" fill="none">`);
  edges.forEach((e, i) => {
    const a = nodes[e.fromIdx], b = nodes[e.toIdx];
    if (!a || !b) return;
    const c = normaliseColor(causalColor(e.causal_type));
    const midY = Math.min(a.y, b.y) - 4;
    const path = `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} Q ${((a.x + b.x) / 2).toFixed(2)} ${midY.toFixed(2)} ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
    const op = (0.55 + 0.45 * (e.confidence || 0.5)).toFixed(2);
    out.push(`  <g id="cedge-${i}" data-causal="${esc(e.causal_type)}" data-confidence="${e.confidence.toFixed(3)}">`);
    out.push(`    <path d="${path}" stroke="${c}" stroke-width="0.35" opacity="${op}" marker-end="url(#arrow-${e.causal_type})"/>`);
    out.push(`    <text x="${((a.x + b.x) / 2).toFixed(2)}" y="${(midY - 0.6).toFixed(2)}" text-anchor="middle" font-size="1.6" font-family="ui-monospace, JetBrains Mono, monospace" fill="${c}">${esc(e.causal_type)}</text>`);
    out.push(`  </g>`);
  });
  out.push(`</g>`);

  // event nodes
  out.push(`<g id="nodes" font-family="ui-monospace, JetBrains Mono, monospace">`);
  nodes.forEach((n, i) => {
    const fill = NODE_COLOR_HEX[n.type] || "#888888";
    out.push(`  <g id="event-${safeId(n.id)}-${i}" data-type="${esc(n.type)}" data-order="${n.order}">`);
    out.push(`    <circle class="halo" cx="${n.x.toFixed(2)}" cy="${n.y.toFixed(2)}" r="2.4" fill="${fill}" opacity="0.18"/>`);
    out.push(`    <circle class="core" cx="${n.x.toFixed(2)}" cy="${n.y.toFixed(2)}" r="1.4" fill="${fill}"/>`);
    const label = n.id.length > 14 ? n.id.slice(0, 12) + "…" : n.id;
    out.push(`    <text class="label" x="${n.x.toFixed(2)}" y="${(n.y - 2.4).toFixed(2)}" text-anchor="middle" font-size="1.8" fill="${t.fg}">${esc(label)}</text>`);
    out.push(`  </g>`);
  });
  out.push(`</g>`);

  out.push(renderMeta(t, meta, viewH));
  out.push(`</svg>`);
  return out.join("\n");
}

/* ============================================================
 * Legacy "flat snapshot" — sanitised clone of the live SVG.
 * Strips framer-motion residue and rewrites hsl() → hex.
 * ============================================================ */
export function buildLegacySnapshot(svg: SVGSVGElement, theme: Theme = "dark"): string {
  const t = THEMES[theme];
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", "1600");
  clone.setAttribute("height", "1600");
  clone.setAttribute("viewBox", clone.getAttribute("viewBox") || "0 0 100 100");

  // strip framer-motion residue
  clone.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("style");
    const tr = el.getAttribute("transform");
    if (tr && /(matrix\(0|scale\(0)/.test(tr)) el.removeAttribute("transform");
  });
  clone.querySelectorAll("g").forEach((g) => g.setAttribute("opacity", "1"));

  // background
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100");
  bg.setAttribute("height", "100");
  bg.setAttribute("fill", t.bg);
  clone.insertBefore(bg, clone.firstChild);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n` + new XMLSerializer().serializeToString(clone);
  // rewrite hsl(...) to hex globally
  xml = xml.replace(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/gi,
    (_m, h, s, l) => hslToHex(parseFloat(h), parseFloat(s), parseFloat(l)));
  return xml;
}
