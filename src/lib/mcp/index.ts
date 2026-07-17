import { defineMcp } from "@lovable.dev/mcp-js";
import preprocessTextTool from "./tools/preprocess-text";
import extractThreatsTool from "./tools/extract-threats";
import extractHyperedgesTool from "./tools/extract-hyperedges";
import queryKgTool from "./tools/query-kg";
import listRecentReportsTool from "./tools/list-recent-reports";

export default defineMcp({
  name: "threatgraph-mcp",
  title: "ThreatGraph MCP",
  version: "0.1.0",
  instructions:
    "Tools for the ThreatGraph research platform (CTI only). Use `preprocess_text` to clean/defang a passage and detect IOCs; `extract_threats` for the deterministic Graph-Native pipeline (Pathway B); `extract_hyperedges` for the n-ary hyperedge extractor (Pathway C, prefer when ≥3 actors/artefacts share one event); `query_threat_kg` for attribution or attack-path reconstruction against an extracted graph; `list_recent_reports` for what has already been ingested. All tools are read-only and do not persist to the KG. This is a public research endpoint — no user data.",
  tools: [
    preprocessTextTool,
    extractThreatsTool,
    extractHyperedgesTool,
    queryKgTool,
    listRecentReportsTool,
  ],
});
