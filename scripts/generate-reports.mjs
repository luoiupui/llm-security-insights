/**
 * Self-Monitoring Artifact Generator
 * --------------------------------------------------------------------
 * Reads implementation-log.ts + github-sync.ts from src/lib and emits:
 *   public/reports/technical-report.md      (+ .docx)
 *   public/reports/white-paper.md           (+ .docx)
 *   public/reports/repo-inventory.csv       (+ .json)
 *   public/reports/llm-call-sites.csv       (+ .json)
 *   public/reports/implementation-log.csv   (+ .json)
 *   public/reports/health-report.md
 *   public/reports/manifest.json            (file list + sizes + sha)
 *
 * Run: node scripts/generate-reports.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
} from "docx";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = join(ROOT, "public", "reports");
mkdirSync(OUT, { recursive: true });

// ─── Load TS source as text and extract the data arrays via regex eval ───
// (avoids needing tsx; the data files are pure JSON-ish exports)
function loadModule(relPath) {
  const src = readFileSync(join(ROOT, relPath), "utf8");
  return src;
}

function extractArrayLiteral(src, name) {
  const re = new RegExp(`export const ${name}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\];)`, "m");
  const m = src.match(re);
  if (!m) throw new Error(`Could not find ${name} in source`);
  // Strip trailing semicolon
  return m[1].replace(/;\s*$/, "");
}

// Evaluate a TS-stripped array literal in a sandboxed Function
function evalArray(literal) {
  // Strip TS-only `as const`, type assertions, and remove trailing commas in objects
  const cleaned = literal
    .replace(/\sas\s+const/g, "")
    .replace(/:\s*\w+(\[\])?/g, ""); // crude: remove type annotations like `: string[]` (none here)
  // eslint-disable-next-line no-new-func
  return new Function(`return ${cleaned}`)();
}

const logSrc = loadModule("src/lib/implementation-log.ts");
const ghSrc = loadModule("src/lib/github-sync.ts");

const implementationLog = evalArray(extractArrayLiteral(logSrc, "implementationLog"));
const repoInventory = evalArray(extractArrayLiteral(ghSrc, "repoInventory"));
const LLM_CALL_SITES = evalArray(extractArrayLiteral(ghSrc, "LLM_CALL_SITES"));

console.log(`Loaded ${implementationLog.length} log entries, ${repoInventory.length} files, ${LLM_CALL_SITES.length} call-sites.`);

// ─── CSV helpers ─────────────────────────────────────────────────────────
function toCSV(rows, columns) {
  const esc = (v) => {
    if (v == null) return "";
    const s = Array.isArray(v) ? v.join(" | ") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

writeFileSync(join(OUT, "implementation-log.json"), JSON.stringify(implementationLog, null, 2));
writeFileSync(join(OUT, "implementation-log.csv"),
  toCSV(implementationLog.map(e => ({ ...e, changes: e.changes, filesModified: e.filesModified })),
        ["version", "date", "title", "category", "impact", "changes", "filesModified"]));

writeFileSync(join(OUT, "repo-inventory.json"), JSON.stringify(repoInventory, null, 2));
writeFileSync(join(OUT, "repo-inventory.csv"),
  toCSV(repoInventory.map(f => ({ ...f, llmWork: f.llmWork ?? [] })),
        ["path", "layer", "llmRole", "chapter", "purpose", "llmWork"]));

writeFileSync(join(OUT, "llm-call-sites.json"), JSON.stringify(LLM_CALL_SITES, null, 2));
writeFileSync(join(OUT, "llm-call-sites.csv"),
  toCSV(LLM_CALL_SITES, ["file", "functionName", "purpose", "model"]));

// ─── Markdown reports ────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

const techReport = `# Technical Report — LLM-Enhanced Knowledge Graph & Attribution System

**Generated:** ${today}
**Backbone Model:** google/gemini-3-flash-preview (via Lovable AI Gateway)
**Backend:** Supabase Edge Functions (Lovable Cloud)
**Versions tracked:** ${implementationLog.length}

---

## 1. System Architecture (4 Layers)

1. **Data Acquisition** — multi-source ingestion (PDF, STIX, blog, forum, OSINT)
2. **LLM Extraction** — graph-native CoT (KG triples constructed *inside* LLM reasoning, not post-hoc)
3. **KG Storage** — STIX 2.1 ontology, transitive inference with confidence decay (×0.85/hop)
4. **Inference Application** — neuro-symbolic conflict detection, causal DAG, attribution

## 2. Innovation vs. OpenCTI / Standard LLM-KG Pipelines

| Aspect | OpenCTI / Standard | This System |
|---|---|---|
| KG construction | Post-hoc parsing of LLM text | Triples emitted **during** LLM reasoning |
| Causality | Separate engine over finished KG | Embedded in LLM CoT (cause→effect triples + temporal order) |
| Conflict detection | Manual rules | 10 symbolic rules + LLM-assisted resolution |
| Attribution | Entity matching | Graph-path weight Π(conf_edge) |
| Hallucination control | Post-filter | In-prompt STIX 2.1 enforcement + confidence scoring |

## 3. Verified LLM Call-Sites (${LLM_CALL_SITES.length})

${LLM_CALL_SITES.map(s => `- \`${s.file}\` → **${s.functionName}** — ${s.purpose}`).join("\n")}

## 4. Edge Functions

${repoInventory.filter(f => f.layer === "edge-function").map(f =>
  `### \`${f.path}\`\n- **LLM role:** ${f.llmRole}\n- **Chapter:** ${f.chapter ?? "—"}\n- **Purpose:** ${f.purpose}\n${(f.llmWork ?? []).map(w => `  - ${w}`).join("\n")}`
).join("\n\n")}

## 5. Two-Stage Experiment Framework (Chapter 5)

- **Stage 1:** MITRE ATT&CK + CAPEC (~1,000 samples) — core CTI ontology
- **Stage 2:** + NVD/CVE + STIX/TAXII (~3,050 samples) — scale & diversity
- **Baselines:** BERT-NER (SecureBERT), Rule-based extraction
- **Metrics:** Precision / Recall / F1 per task (NER, RE, Causality, Attribution, Hallucination)

## 6. Repository Inventory (${repoInventory.length} files)

| Path | Layer | LLM Role | Chapter |
|---|---|---|---|
${repoInventory.map(f => `| \`${f.path}\` | ${f.layer} | ${f.llmRole} | ${f.chapter ?? "—"} |`).join("\n")}

## 7. Version History

${implementationLog.map(e => `### v${e.version} — ${e.title} (${e.date}, ${e.impact})\n${e.changes.map(c => `- ${c}`).join("\n")}`).join("\n\n")}
`;

const whitePaper = `# White Paper: A Graph-Native, LLM-Enhanced Cyber Threat Intelligence System

**Date:** ${today}
**Authors:** ThreatGraph Research

## Abstract

We present an LLM-Enhanced Knowledge Graph and Attribution System for Cyber Threat Intelligence (CTI) that departs from
post-hoc parsing pipelines (e.g. OpenCTI) by **embedding knowledge-graph construction inside the LLM reasoning layer
itself**. Using \`google/gemini-3-flash-preview\` as the backbone via the Lovable AI Gateway, the system performs
graph-native Chain-of-Thought extraction in which (Subject, Predicate, Object) triples are produced as first-class
reasoning steps under enforced STIX 2.1 ontology. Causal links (\`enables\`, \`leads_to\`, \`triggers\`, \`precedes\`) are
emitted in the same pass, with temporal ordering. A neuro-symbolic engine then applies ten symbolic validation rules
and computes a credibility score \`S = Σ(wᵢ × confᵢ × reliabilityᵢ) / N\`. Attribution is performed via graph-path
analysis (\`weight = Π(conf_edge)\`). The system is evaluated against BERT-NER and rule-based baselines on a two-stage
benchmark (MITRE ATT&CK + CAPEC; then + NVD/CVE + STIX/TAXII).

## 1. Problem Statement

Existing LLM-driven CTI tools treat the LLM as a *text producer* whose output must be parsed into a graph. This loses
provenance, fails STIX compliance silently, and prevents causal reasoning from being grounded in the same reasoning
trace. The result is hallucinated edges, missing temporal order, and brittle attribution.

## 2. Methodology

### 2.1 Graph-Native CoT (Chapter 3)
8-step prompt; Steps 1–2 produce typed entities, 3–4 produce relations with edge typing, 5–6 attach confidence
weighted by source reliability, 7–8 emit graph metadata and a narrative summary.

### 2.2 Embedded Causality (Chapter 4)
Causal triples emitted in the same LLM call; post-hoc DAG cycle detection ensures acyclicity. MITRE ATT&CK kill-chain
tactic alignment is computed per causal link.

### 2.3 Neuro-Symbolic Conflict Resolution (Chapter 4)
Ten symbolic rules (entity confidence, endpoint validation, source reliability, temporal consistency, DAG cycles,
confidence-propagation anomalies, orphan detection, STIX compliance, low/high confidence asymmetry, contradictions).
Ambiguous violations are routed to the LLM for resolution.

### 2.4 Graph-Aware Attribution (Chapter 4)
Hub / authority / bridge node identification; alternative-actor ranking with path-weight scoring; reasoning trace
output for explainability.

## 3. Experimental Design (Chapter 5)

Two-stage evaluation with growing dataset diversity to measure **scale degradation**:
- Stage 1 (1,000 samples): MITRE ATT&CK + CAPEC.
- Stage 2 (3,050 samples): + NVD/CVE + STIX/TAXII.

Baselines: BERT-NER (SecureBERT) and rule-based regex extraction.
Live runner: \`supabase/functions/experiment-runner\` invokes the LLM and computes precision/recall/F1 against gold.

## 4. Self-Monitoring Mechanism

Every change is recorded in a versioned Implementation Log (currently ${implementationLog.length} entries) synchronized
to GitHub. A repository inventory enumerates ${repoInventory.length} files with their LLM role and research-chapter
mapping. ${LLM_CALL_SITES.length} verified LLM call-sites are catalogued, and a live probe button on the dashboard
measures gateway round-trip latency. This Technical Report, this White Paper, and CSV/JSON inventory tables are
auto-regenerated by \`scripts/generate-reports.mjs\` so documentation never drifts from code.

## 5. Conclusion

By moving graph construction *into* the LLM reasoning layer, this system achieves what post-hoc OpenCTI pipelines
cannot: STIX-compliant triples with embedded causality and provenance, validated by neuro-symbolic rules, and
attributed via graph-path weights — all reproducibly logged and self-documenting.
`;

writeFileSync(join(OUT, "technical-report.md"), techReport);
writeFileSync(join(OUT, "white-paper.md"), whitePaper);

// ─── Health Report ───────────────────────────────────────────────────────
const latestLog = implementationLog[implementationLog.length - 1];
const filesInLog = new Set(implementationLog.flatMap(e => e.filesModified));
const filesInRepo = new Set(repoInventory.map(f => f.path));
const undocumented = [...filesInRepo].filter(p => !filesInLog.has(p));
const stale = [...filesInLog].filter(p => !filesInRepo.has(p));

const health = `# Self-Monitoring Health Report

**Generated:** ${today}

## Sync status
- Latest log version: **v${latestLog.version}** (${latestLog.date})
- Total log entries: **${implementationLog.length}**
- Repo files inventoried: **${filesInRepo.size}**
- Files referenced in log: **${filesInLog.size}**
- Verified LLM call-sites: **${LLM_CALL_SITES.length}**

## Drift detection
- Files in repo NOT mentioned in any log entry: **${undocumented.length}**
${undocumented.slice(0, 20).map(p => `  - \`${p}\``).join("\n") || "  - (none)"}
- Files in log no longer in repo inventory: **${stale.length}**
${stale.slice(0, 20).map(p => `  - \`${p}\``).join("\n") || "  - (none)"}

## LLM Gateway
- Backbone: \`google/gemini-3-flash-preview\`
- Verified call-sites: ${LLM_CALL_SITES.length}
- Live probe available on the GitHub Sync page (button: "Run verification")
`;
writeFileSync(join(OUT, "health-report.md"), health);

// ─── DOCX generation ─────────────────────────────────────────────────────
function makePara(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    ...opts,
    children: [new TextRun({ text, font: "Arial", size: 22, ...(opts.run ?? {}) })],
  });
}
function makeHeading(text, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: "Arial", bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : 26 })],
  });
}

async function writeDocx(filename, title, sections) {
  const doc = new Document({
    creator: "ThreatGraph Self-Monitor",
    title,
    styles: {
      default: { document: { run: { font: "Arial", size: 22 } } },
    },
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: [
        makeHeading(title, HeadingLevel.HEADING_1),
        makePara(`Generated: ${today}`, { run: { italics: true, color: "666666" } }),
        new Paragraph({ children: [new PageBreak()] }),
        ...sections,
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(join(OUT, filename), buf);
}

function mdToDocxBlocks(md) {
  const blocks = [];
  for (const line of md.split("\n")) {
    if (/^# /.test(line)) blocks.push(makeHeading(line.replace(/^# /, ""), HeadingLevel.HEADING_1));
    else if (/^## /.test(line)) blocks.push(makeHeading(line.replace(/^## /, ""), HeadingLevel.HEADING_2));
    else if (/^### /.test(line)) blocks.push(makeHeading(line.replace(/^### /, ""), HeadingLevel.HEADING_3));
    else if (/^[-*] /.test(line)) blocks.push(makePara("• " + line.replace(/^[-*] /, ""), { indent: { left: 360 } }));
    else if (/^\|/.test(line)) blocks.push(makePara(line, { run: { font: "Consolas", size: 18 } }));
    else if (line.trim() === "") blocks.push(makePara(""));
    else blocks.push(makePara(line));
  }
  return blocks;
}

await writeDocx("technical-report.docx", "Technical Report — LLM-Enhanced KG & Attribution System", mdToDocxBlocks(techReport));
await writeDocx("white-paper.docx", "White Paper — Graph-Native LLM-Enhanced CTI", mdToDocxBlocks(whitePaper));

// ─── Manifest ────────────────────────────────────────────────────────────
const files = readdirSync(OUT).filter(f => f !== "manifest.json");
const manifest = {
  generatedAt: new Date().toISOString(),
  files: files.map(f => {
    const full = join(OUT, f);
    const buf = readFileSync(full);
    return {
      name: f,
      bytes: statSync(full).size,
      sha256: createHash("sha256").update(buf).digest("hex").slice(0, 16),
    };
  }),
  stats: {
    logEntries: implementationLog.length,
    repoFiles: repoInventory.length,
    llmCallSites: LLM_CALL_SITES.length,
    undocumentedFiles: undocumented.length,
    staleLogEntries: stale.length,
    latestVersion: latestLog.version,
    latestDate: latestLog.date,
  },
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`✓ Generated ${files.length + 1} artifact files in public/reports/`);
console.log(manifest.stats);
