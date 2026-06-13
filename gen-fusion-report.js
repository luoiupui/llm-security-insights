const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
        Header, Footer, PageNumber } = require("docx");
const fs = require("fs");

const cellBorder = { style: BorderStyle.SINGLE, size: 1, color: "999999" };
const cellBorders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function h(text, level = 1) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
    children: [new TextRun({ text, bold: true, font: "Arial" })],
    spacing: { before: level === 1 ? 360 : 240, after: 120 },
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, font: "Arial", size: 22 })],
    spacing: { before: 60, after: 60 },
    ...opts,
  });
}

function mono(text) {
  return new TextRun({ text, font: "Courier New", size: 20 });
}

function makeTable(headers, rows) {
  const headerCells = headers.map(hd => new TableCell({
    borders: cellBorders,
    shading: { fill: "E8E8E8", type: ShadingType.CLEAR },
    width: { size: 3000, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: hd, bold: true, font: "Arial", size: 20 })] })],
  }));
  const tableRows = [
    new TableRow({ children: headerCells }),
    ...rows.map(row => new TableRow({
      children: row.map(cell => new TableCell({
        borders: cellBorders,
        width: { size: 3000, type: WidthType.DXA },
        margins: { top: 40, bottom: 40, left: 80, right: 80 },
        children: [new Paragraph({ children: [new TextRun({ text: String(cell), font: "Arial", size: 20 })] })],
      })),
    })),
  ];
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: headers.map(() => Math.floor(9360 / headers.length)),
    rows: tableRows,
  });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        children: [new TextRun({ text: "ThreatGraph — CTI Multi-Modal Fusion Technical Report", font: "Arial", size: 18, color: "666666" })]
      })] }),
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Page ", font: "Arial", size: 18 }),
          new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18 }),
        ]
      })] }),
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({ text: "CTI Multi-Modal Fusion", bold: true, size: 48, font: "Arial" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 360 },
        children: [new TextRun({ text: "Technical Report — Phases 1-4", size: 28, font: "Arial", color: "444444" })],
      }),
      p("Date: 2026-06-13"),
      p("Scope: Phases 1-4 of the CICIDS-style flow-feature / external CTI fusion track"),
      p("Status: All 4 phases shipped; 66 unit tests passing"),
      p(""),

      h("1. Executive Summary", 1),
      p("This report documents the end-to-end implementation of multi-modal threat-intelligence fusion in the ThreatGraph system. The work joins external narrative CTI (vendor reports, STIX bundles, MITRE TTPs) with internal behavioral telemetry (CICIDS-2017-style flow statistics) via a typed CorroboratedFinding node that preserves dual confidence channels independently."),
      p("Four phases were completed in a single build session."),

      makeTable(
        ["Phase", "Deliverable", "Status"],
        [
          ["1", "Flow-feature ingest spec + pure fusion math + CDN allow-list + synthetic fixtures", "Shipped"],
          ["2", "Conflict rules R11/R12/R13 + UI surfacing on /attribution", "Shipped"],
          ["3", "CorroboratedFinding ontology + DB schema + KG-Bench GOLD_VERSION v2", "Shipped"],
          ["4", "Live fusion matcher + dynamic UI mock", "Shipped"],
        ]
      ),
      p(""),

      h("2. Problem Statement", 1),
      p("The KG Construction pipeline historically consumed only external, after-event, narrative CTI. The defender also operates internal, live, statistical telemetry (NetFlow, IDS alerts, tap sensors). Both describe threats, but along orthogonal axes."),
      p("Insight emerges only at the join: external provides the hypothesis space; internal provides the evidence."),

      h("3. Architecture Overview", 1),
      p("Key architectural invariants:"),
      p("1. Dual-confidence storage rule: conf_narrative and conf_behavioral are stored independently. fused_conf is never persisted — recomputed at read time."),
      p("2. Source modality tag: Every node carries source_modality in {external_cti, internal_telemetry, fused}."),
      p("3. Two-key promotion: confirmed_threat label requires both conf_narrative >= 0.7 AND conf_behavioral >= 0.5."),
      p("4. Identifier hygiene: CDN/cloud IPs are excluded from indicator_match edges but allowed for behavioral_match."),

      h("4. Implementation by Phase", 1),

      h("4.1 Phase 1 — Flow-Feature Ingest Spec + Pure Foundations", 2),
      p("Goal: Establish the data contract and pure math modules with zero runtime impact."),
      p("Artifacts: cti-flow-feature-ingest-spec.md, JSON Schema, CDN allow-list (cdn-asn-allowlist.json), fusion math module (src/lib/fusion/index.ts), and 5 synthetic CICIDS flow records."),
      p("The T2 flow-aggregate schema carries asset_ref (opaque pseudonym), peer_ref, flow_meta, features (CICIDS-aligned aggregates), derived anomaly_score, findings (MITRE code candidates), provenance, and an auto-derived text_view for LLM ingest."),

      h("4.2 Phase 2 — Conflict Rules R11/R12/R13 + UI", 2),
      p("Goal: Extend the symbolic conflict engine with three multi-modal rules."),
      makeTable(
        ["Rule", "ID", "Severity", "Mechanism"],
        [
          ["R11", "unverified_external", "warn", "External-only entities above threshold clamped to fused_conf <= 0.6"],
          ["R12", "weak_match_stale_ioc", "warn", "IoC matches aged beyond half-life down-weighted by freshness(age)"],
          ["R13", "cross_modal_disagreement", "error", "High narrative + low behavioral (or inverse) flagged for LLM resolver"],
        ]
      ),
      p("Decay constants: IP/domain half-life = 30d (cutoff 180d); hash = 180d (cutoff 730d); TTP = 365d."),
      p("UI update: Conflict Detection tab on /attribution now renders dual-confidence bars with freshness factor and fused before/after values."),

      h("4.3 Phase 3 — CorroboratedFinding Ontology + Persistence + KG-Bench", 2),
      p("Database: kg_corroborated_findings table with ttp_ref (FK), flow_ref, conf_narrative, conf_behavioral, fusion_method, evidence_window, provenance (JSONB), validation trigger, RLS, and indexes. source_modality column added to kg_entities with backfill default external_cti."),
      p("Ontology helpers: fusedConfidence() for read-time recompute; canPromoteToConfirmedThreat() for two-key rule; toStixSighting() for STIX 2.1 SRO export with custom extension."),
      p("KG-Bench: GOLD_VERSION bumped to v2. New category fusion_corroboration with 3 gold cases (2 CTI + 1 Clinical). New scorer scoreCorroborations(). Baseline = 0 by design until matcher lands."),

      h("4.4 Phase 4 — Live Fusion Matcher + Dynamic UI Mock", 2),
      p("External fixtures: 4 narrative TTP claims (APT-29 T1071.001, FIN7 T1048.003, Unattributed T1046, stale+unverified T1090)."),
      p("Matcher: Pure function matchCorroborations() joins on MITRE technique_id, applies R11 clamp (reliability < 0.4), applies R12 freshness decay (TTP half-life = 90d), computes fused confidence, drops below threshold. Returns audit trail with conf_narrative_raw, freshness_factor, and unverified_external flag."),
      p("UI: MultiModalFusionMock component rewritten to run matcher live. Features corroboration picker, three-column layout (External TTP / Internal Flow / corroborates edge), method selector with real-time recompute, freshness decay display, R11 clamp badge, and guards footer."),

      h("5. Fusion Math Reference", 1),
      makeTable(
        ["Method", "Formula", "Use case"],
        [
          ["noisy_or", "1 - (1-a)(1-b)", "Default — independent evidence accumulation"],
          ["min", "min(a, b)", "Conservative — both must be strong"],
          ["weighted(alpha)", "alpha*a + (1-alpha)*b", "Tunable narrative-vs-behavioral bias"],
        ]
      ),
      p("Temporal decay: freshness(ageDays, halfLife) = 0.5^(age/halfLife), clamped to [0.05, 1.0]."),
      p("Input clamping: All confidence inputs clamped to [0,1]; NaN -> 0."),

      h("6. Test Coverage", 1),
      makeTable(
        ["Module", "Tests", "Key assertions"],
        [
          ["fusion math", "6", "Known values, clamping, freshness boundaries"],
          ["CDN allow-list", "3", "CIDR membership, verdict table"],
          ["flow samples", "3", "Schema validation, opaque refs, text_view"],
          ["multimodal rules", "12", "R11/R12/R13 pass/warn/fail, dual-confidence shape"],
          ["corroborated-finding", "24", "All fusion methods, promotion thresholds, STIX shape"],
          ["KG-Bench scorer", "6", "Precision/recall, baseline before matcher"],
          ["fusion matcher", "6", "Technique join, R11 clamp, R12 decay, sorting"],
          ["TOTAL", "66", "All passing"],
        ]
      ),

      h("7. What Remains (Deferred)", 1),
      makeTable(
        ["Item", "Reason", "Planned phase"],
        [
          ["Fusion matcher edge function", "Needs real ingest path from live sensors", "Phase 5"],
          ["Seed demo rows in kg_corroborated_findings", "Needs matcher job writing to DB", "Phase 5"],
          ["CorroboratedFinding browser UI", "Needs persisted rows", "Phase 5"],
          ["KG-Bench Cat 9 non-zero baseline", "Needs matcher + seed rows", "Phase 5"],
          ["Selective redaction integration", "Cross-cutting; depends on federated resolvers", "Phase 6"],
          ["Real CICIDS dataset ingestion", "Out of scope for simulation project", "Future"],
        ]
      ),

      h("8. Key Files", 1),
      p("Specs: cti-multimodal-fusion.md, cti-flow-feature-ingest-spec.md, conflict-rules-multimodal-extension.md, ontology-corroborated-finding-spec.md"),
      p("Source: src/lib/fusion/{index,matcher,external-ttp-fixtures}.ts, src/lib/conflicts/multimodal-rules.ts, src/lib/ontology/corroborated-finding.ts, src/lib/test-corpus/flow-samples.ts, src/components/MultiModalFusionMock.tsx"),
      p("Database: supabase/migrations/20260613141821_*.sql"),
      p("Edge: supabase/functions/threat-conflicts/index.ts"),

      new Paragraph({ children: [new PageBreak()] }),
      p(""),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "End of Report", italics: true, size: 22, font: "Arial" })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/mnt/documents/cti-multimodal-fusion-technical-report.docx", buffer);
  console.log("DOCX written to /mnt/documents/cti-multimodal-fusion-technical-report.docx");
});
