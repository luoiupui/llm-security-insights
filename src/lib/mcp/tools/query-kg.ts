import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { invokeEdge } from "./preprocess-text";

export default defineTool({
  name: "query_threat_kg",
  title: "Query ThreatGraph KG (attribution / attack path)",
  description:
    "Attribute a threat actor or reconstruct an attack path from an extracted graph. Supply entities/relations/causal_links from `extract_threats` (or an equivalent shape). Read-only.",
  inputSchema: {
    query: z
      .string()
      .default("Identify the threat actor and reconstruct the attack chain")
      .describe("Natural-language question, e.g. 'which actor is behind this campaign?'."),
    mode: z.enum(["attribute", "attack_path"]).default("attribute"),
    entities: z.array(z.record(z.unknown())).default([]).describe("Entities from extract_threats.ner.entities."),
    relations: z.array(z.record(z.unknown())).default([]).describe("Relations from extract_threats.re.relations."),
    causal_links: z.array(z.record(z.unknown())).default([]).describe("Causal links from extract_threats.causality.causal_links."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, mode, entities, relations, causal_links }) => {
    const data = await invokeEdge("threat-kg-query", {
      query,
      mode,
      entities,
      relations,
      causal_links,
      domain: "cti",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});
