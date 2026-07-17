import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { invokeEdge } from "./preprocess-text";

export default defineTool({
  name: "extract_threats",
  title: "Extract CTI knowledge graph (Pathway B)",
  description:
    "Run the deterministic Graph-Native extraction pipeline (Pathway B) on a CTI passage. Returns entities, relations, causal links and STIX-aligned graph metadata. Read-only — does not persist to the KG.",
  inputSchema: {
    text: z.string().min(10).describe("CTI passage to extract from."),
    mode: z
      .enum(["full", "ner", "re", "causality"])
      .optional()
      .describe("Extraction mode. Default 'full'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
  handler: async ({ text, mode }) => {
    const data = await invokeEdge("threat-extract", {
      text,
      mode: mode ?? "full",
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
