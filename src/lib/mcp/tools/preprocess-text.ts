import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

async function invokeEdge(name: string, body: unknown) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!;
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export { invokeEdge };

export default defineTool({
  name: "preprocess_text",
  title: "Preprocess CTI text",
  description:
    "Clean and defang a CTI passage (URLs, hashes, IPs). Returns cleaned text, detected IOCs, source-type guess and a reliability score. Read-only.",
  inputSchema: {
    text: z.string().min(10).describe("Raw CTI passage (report, advisory, blog, etc.)."),
    source_type: z
      .string()
      .optional()
      .describe("Optional source-type hint (e.g. 'blog', 'advisory', 'report'). Defaults to auto."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ text, source_type }) => {
    const data = await invokeEdge("threat-preprocess", {
      text,
      source_type: source_type ?? "auto",
      domain: "cti",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});
