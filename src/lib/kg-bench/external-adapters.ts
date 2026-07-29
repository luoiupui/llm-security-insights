/**
 * External-benchmark adapters — convert public CTI datasets (DNRTI, CASIE,
 * or a generic JSON schema) into KG-Bench `BenchCase[]`.
 *
 * IMPORTANT: no dataset is committed to this repo. The operator points the
 * loader at a local path (dev-server static file, uploaded JSON, or same-
 * origin URL) at run time; parsed cases live only in browser memory.
 *
 * Supported input shapes
 * ─────────────────────
 * 1. `generic`  — pre-normalised:
 *      [{ id, text, entities:[…], triples:[{s,p,o},…] }, …]
 * 2. `dnrti`    — DNRTI-style BIO tagging:
 *      [{ id, tokens:[…], tags:[…] }, …]   (entity spans only, no triples)
 * 3. `casie`    — CASIE-style event frames:
 *      [{ id, text, events:[{ trigger, type, arguments:[{role, text}] }] }, …]
 *      → converted to (trigger, role, arg) triples.
 */

import type { BenchCase } from "./corpus";
import type { Triple } from "./scorers";

export type ExternalFormat = "generic" | "dnrti" | "casie";

export interface AdapterResult {
  cases: BenchCase[];
  sourceLabel: string;
  warnings: string[];
}

/* ────────── generic ────────── */
function parseGeneric(rows: any[], sourceLabel: string): AdapterResult {
  const warnings: string[] = [];
  const cases: BenchCase[] = rows.map((r, i) => ({
    id: `ext-${sourceLabel}-${r.id ?? i}`,
    category: "fact_extraction",
    name: r.name ?? `${sourceLabel} #${r.id ?? i}`,
    text: String(r.text ?? ""),
    goldEntities: Array.isArray(r.entities) ? r.entities.map(String) : [],
    goldTriples: Array.isArray(r.triples) ? r.triples.map((t: any) => ({
      s: String(t.s ?? t.subject ?? ""),
      p: String(t.p ?? t.predicate ?? ""),
      o: String(t.o ?? t.object ?? ""),
    })) : [],
    language: r.language,
  }));
  const empty = cases.filter(c => !c.text || (c.goldEntities.length === 0 && c.goldTriples.length === 0)).length;
  if (empty) warnings.push(`${empty} rows have no text or no gold labels`);
  return { cases, sourceLabel, warnings };
}

/* ────────── DNRTI ────────── */
/** Collapse BIO tags → entity strings. Entity-only, no triples. */
function parseDNRTI(rows: any[], sourceLabel: string): AdapterResult {
  const warnings: string[] = [];
  const cases: BenchCase[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const tokens: string[] = r.tokens || [];
    const tags: string[] = r.tags || r.ner_tags || [];
    if (tokens.length !== tags.length) {
      warnings.push(`row ${i}: token/tag length mismatch — skipped`);
      continue;
    }
    const entities: string[] = [];
    let buf: string[] = [];
    let curType = "";
    const flush = () => { if (buf.length) { entities.push(buf.join(" ")); buf = []; } };
    for (let k = 0; k < tokens.length; k++) {
      const tag = tags[k] || "O";
      if (tag === "O") { flush(); curType = ""; continue; }
      const [bi, ty] = tag.split("-");
      if (bi === "B" || ty !== curType) { flush(); curType = ty; buf = [tokens[k]]; }
      else buf.push(tokens[k]);
    }
    flush();
    cases.push({
      id: `ext-dnrti-${r.id ?? i}`,
      category: "fact_extraction",
      name: `DNRTI #${r.id ?? i}`,
      text: tokens.join(" "),
      goldEntities: entities,
      goldTriples: [],
    });
  }
  return { cases, sourceLabel, warnings };
}

/* ────────── CASIE ────────── */
/** Convert event args into (trigger, role, arg) triples. */
function parseCASIE(rows: any[], sourceLabel: string): AdapterResult {
  const warnings: string[] = [];
  const cases: BenchCase[] = rows.map((r, i) => {
    const triples: Triple[] = [];
    const entities = new Set<string>();
    for (const ev of (r.events || [])) {
      const trigger = String(ev.trigger?.text ?? ev.trigger ?? ev.type ?? "event");
      entities.add(trigger);
      for (const a of (ev.arguments || ev.args || [])) {
        const arg = String(a.text ?? a.value ?? "");
        const role = String(a.role ?? a.type ?? "arg");
        if (arg) { triples.push({ s: trigger, p: role, o: arg }); entities.add(arg); }
      }
    }
    return {
      id: `ext-casie-${r.id ?? i}`,
      category: "fact_extraction" as const,
      name: `CASIE #${r.id ?? i}`,
      text: String(r.text ?? ""),
      goldEntities: Array.from(entities),
      goldTriples: triples,
    };
  });
  const empty = cases.filter(c => c.goldTriples.length === 0).length;
  if (empty) warnings.push(`${empty} CASIE rows produced no triples`);
  return { cases, sourceLabel, warnings };
}

/* ────────── entry point ────────── */
export function parseExternal(
  format: ExternalFormat,
  raw: unknown,
  sourceLabel: string,
): AdapterResult {
  const rows = Array.isArray(raw) ? raw : ((raw as any)?.data ?? (raw as any)?.rows ?? []);
  if (!Array.isArray(rows)) throw new Error("expected JSON array or { data: [...] }");
  switch (format) {
    case "generic": return parseGeneric(rows, sourceLabel);
    case "dnrti":   return parseDNRTI(rows, sourceLabel);
    case "casie":   return parseCASIE(rows, sourceLabel);
  }
}

export async function loadFromUrl(url: string, format: ExternalFormat): Promise<AdapterResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const raw = await res.json();
  return parseExternal(format, raw, url.split("/").pop() ?? "url");
}

export async function loadFromFile(file: File, format: ExternalFormat): Promise<AdapterResult> {
  const text = await file.text();
  return parseExternal(format, JSON.parse(text), file.name);
}
