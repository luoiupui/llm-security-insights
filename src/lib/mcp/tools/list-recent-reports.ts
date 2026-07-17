import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export default defineTool({
  name: "list_recent_reports",
  title: "List recent ingested CTI reports",
  description:
    "Return the most recent CTI reports already ingested into ThreatGraph (id, summary, source_type, created_at). Reads through the anon role — only rows RLS exposes publicly are returned.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("Max rows (1–50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("threat_reports")
      .select("id, summary, source_type, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { rows: data ?? [] },
    };
  },
});
