/**
 * Self-Monitoring helpers — fetches the auto-generated /reports/* artifacts
 * and runs a client-side "scanner" that diffs the repo inventory against the
 * implementation log to suggest draft entries for new files.
 */
import { repoInventory } from "./github-sync";
import { implementationLog, type LogEntry } from "./implementation-log";

export interface ReportArtifact {
  name: string;
  bytes: number;
  sha256: string;
  mime: string;
  label: string;
  description: string;
}

const ARTIFACT_META: Record<string, { mime: string; label: string; description: string }> = {
  "technical-report.md": { mime: "text/markdown", label: "Technical Report (.md)", description: "Engineering deep-dive: architecture, edge functions, LLM call-sites" },
  "technical-report.docx": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Technical Report (.docx)", description: "Word version of the technical report" },
  "white-paper.md": { mime: "text/markdown", label: "White Paper (.md)", description: "Academic-style paper: problem, methodology, innovation, conclusion" },
  "white-paper.docx": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "White Paper (.docx)", description: "Word version of the white paper" },
  "repo-inventory.csv": { mime: "text/csv", label: "Repo Inventory (.csv)", description: "Every file with its layer, LLM role, and chapter mapping" },
  "repo-inventory.json": { mime: "application/json", label: "Repo Inventory (.json)", description: "Machine-readable repo inventory" },
  "llm-call-sites.csv": { mime: "text/csv", label: "LLM Call-Sites (.csv)", description: "Verified call-sites that hit the Lovable AI Gateway" },
  "llm-call-sites.json": { mime: "application/json", label: "LLM Call-Sites (.json)", description: "Machine-readable call-site list" },
  "implementation-log.csv": { mime: "text/csv", label: "Implementation Log (.csv)", description: "Versioned change log as a spreadsheet" },
  "implementation-log.json": { mime: "application/json", label: "Implementation Log (.json)", description: "Machine-readable implementation log" },
  "health-report.md": { mime: "text/markdown", label: "Health Report (.md)", description: "Sync status, drift detection, LLM gateway info" },
  "manifest.json": { mime: "application/json", label: "Manifest (.json)", description: "Generated-at timestamp + sha256 of every artifact" },
};

export interface Manifest {
  generatedAt: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
  stats: {
    logEntries: number;
    repoFiles: number;
    llmCallSites: number;
    undocumentedFiles: number;
    staleLogEntries: number;
    latestVersion: string;
    latestDate: string;
  };
}

export async function fetchManifest(): Promise<Manifest | null> {
  try {
    const res = await fetch("/reports/manifest.json", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function getArtifacts(manifest: Manifest): ReportArtifact[] {
  return manifest.files
    .filter((f) => ARTIFACT_META[f.name])
    .map((f) => ({ ...f, ...ARTIFACT_META[f.name] }));
}

export function downloadUrl(name: string): string {
  return `/reports/${name}`;
}

/** Client-side drift scan — compares repo inventory vs files referenced in the log. */
export function scanForDrift() {
  const filesInLog = new Set(implementationLog.flatMap((e) => e.filesModified));
  const filesInRepo = new Set(repoInventory.map((f) => f.path));
  const undocumented = [...filesInRepo].filter((p) => !filesInLog.has(p));
  const stale = [...filesInLog].filter((p) => !filesInRepo.has(p));
  return { undocumented, stale, filesInLog: filesInLog.size, filesInRepo: filesInRepo.size };
}

/** Suggest a draft log entry for currently undocumented files. */
export function suggestDraftEntry(): Partial<LogEntry> | null {
  const { undocumented } = scanForDrift();
  if (undocumented.length === 0) return null;
  const latest = implementationLog[implementationLog.length - 1];
  const [maj, min] = latest.version.split(".").map(Number);
  return {
    version: `${maj}.${min + 1}.0`,
    date: new Date().toISOString().slice(0, 10),
    title: "New files detected by scanner",
    category: "infrastructure",
    impact: "minor",
    changes: [`Scanner detected ${undocumented.length} undocumented file(s) — please describe the change.`],
    filesModified: undocumented,
  };
}

/** Format a draft entry as TypeScript source the user can paste into implementation-log.ts. */
export function formatEntryAsTS(entry: Partial<LogEntry>): string {
  return `  {
    version: "${entry.version ?? "x.y.z"}",
    date: "${entry.date ?? new Date().toISOString().slice(0, 10)}",
    title: ${JSON.stringify(entry.title ?? "")},
    category: ${JSON.stringify(entry.category ?? "infrastructure")},
    impact: ${JSON.stringify(entry.impact ?? "minor")},
    changes: ${JSON.stringify(entry.changes ?? [], null, 6).replace(/\n/g, "\n    ")},
    filesModified: ${JSON.stringify(entry.filesModified ?? [], null, 6).replace(/\n/g, "\n    ")},
  },`;
}
