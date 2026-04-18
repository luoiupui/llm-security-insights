/**
 * ReportDownloads
 * --------------------------------------------------------------------
 * Two header buttons for the /experiments page:
 *   1. "Download Report (PDF)"   → direct link to the academic PDF
 *   2. "Download All (ZIP)"      → fetches every file listed in
 *      /reports/manifest.json and bundles them into a single ZIP
 *      named  threatgraph-reports-YYYY-MM-DD.zip
 *
 * No backend needed — everything is served from /public/reports.
 */
import { useState } from "react";
import JSZip from "jszip";
import { FileDown, Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const PDF_PATH = "/reports/experiments-academic-report.pdf";
const MANIFEST_PATH = "/reports/manifest.json";

interface ManifestFile {
  name: string;
  bytes: number;
  sha256: string;
}
interface Manifest {
  generatedAt: string;
  files: ManifestFile[];
}

export function ReportDownloads() {
  const { toast } = useToast();
  const [zipping, setZipping] = useState(false);

  const handleZip = async () => {
    setZipping(true);
    try {
      const manifestRes = await fetch(MANIFEST_PATH);
      if (!manifestRes.ok) throw new Error(`manifest.json HTTP ${manifestRes.status}`);
      const manifest: Manifest = await manifestRes.json();

      // Always include the academic report explicitly even if manifest is stale
      const fileNames = new Set<string>(manifest.files.map((f) => f.name));
      fileNames.add("experiments-academic-report.pdf");
      fileNames.add("experiments-academic-report.md");
      fileNames.add("manifest.json");

      const zip = new JSZip();
      const folder = zip.folder("threatgraph-reports")!;

      // Fetch all files in parallel, skip any that 404
      const results = await Promise.allSettled(
        Array.from(fileNames).map(async (name) => {
          const r = await fetch(`/reports/${name}`);
          if (!r.ok) throw new Error(`${name} HTTP ${r.status}`);
          const blob = await r.blob();
          folder.file(name, blob);
          return name;
        }),
      );

      const ok = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;

      // Add a README inside the zip so reviewers know what they're looking at
      folder.file(
        "README.txt",
        `ThreatGraph — Generated Reports Bundle
Generated: ${manifest.generatedAt}
Files included: ${ok}${failed ? ` (skipped ${failed} unavailable)` : ""}

Contents:
- experiments-academic-report.pdf  Primary academic write-up (8 sections)
- experiments-academic-report.md   Markdown source of the academic report
- technical-report.md / .docx      System architecture & version history
- white-paper.md / .docx           Formal methodology white paper
- health-report.md                 Self-monitoring drift detection
- repo-inventory.csv / .json       Every file with its LLM role + chapter
- llm-call-sites.csv / .json       All verified LLM call-sites
- implementation-log.csv / .json   Versioned change history
- manifest.json                    File list with sizes + sha256

Live dashboard: /experiments
`,
      );

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `threatgraph-reports-${date}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Reports bundled",
        description: `Downloaded ${ok} files${failed ? ` (${failed} skipped)` : ""} as zip.`,
      });
    } catch (err) {
      toast({
        title: "Bundle failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline" className="font-mono">
        <a href={PDF_PATH} download target="_blank" rel="noopener noreferrer">
          <FileDown className="h-4 w-4 mr-2" />
          Download Report (PDF)
        </a>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="font-mono"
        onClick={handleZip}
        disabled={zipping}
      >
        {zipping ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Archive className="h-4 w-4 mr-2" />
        )}
        {zipping ? "Bundling…" : "Download All (ZIP)"}
      </Button>
    </div>
  );
}
