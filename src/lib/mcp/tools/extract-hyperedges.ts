import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { invokeEdge } from "./preprocess-text";

export default defineTool({
  name: "extract_hyperedges",
  title: "Extract hyperedges (Pathway C, CTI only)",
  description:
    "Run the hyperedge-native extractor (Pathway C) on a CTI passage. Preserves n-ary events (kill-chains, campaigns, fusion findings) as first-class hyperedges plus a derived triple projection. Preferred when ≥3 participants share a single event. Read-only.",
  inputSchema: {
    text: z.string().min(10).describe("CTI passage to extract from."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ text }) => {
    const data = await invokeEdge("threat-extract-hyper", {
      text,
      source_type: "report",
      source_reliability: 0.8,
      rag_context: "",
      deterministic: true,
      temperature: 0,
      seed: 42,
      domain: "cti",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});
