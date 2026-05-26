// Client-side prompt-injection heuristic firewall.
// Runs before any text is dispatched to threat-extract / threat-agent.
// Logged to monitoring_events with category="security" via supabase insert if desired.

export type FirewallVerdict = "clean" | "suspicious" | "blocked";

export interface FirewallFinding {
  rule: string;
  severity: "low" | "medium" | "high";
  excerpt: string;
}

export interface FirewallResult {
  verdict: FirewallVerdict;
  score: number; // 0..1, higher = more suspicious
  findings: FirewallFinding[];
}

const RULES: Array<{ id: string; severity: FirewallFinding["severity"]; re: RegExp }> = [
  { id: "ignore-previous", severity: "high", re: /ignore (?:the )?(?:above|previous|prior)\s+(?:instructions|prompt|rules)/i },
  { id: "role-override", severity: "high", re: /^(?:system|assistant)\s*:/im },
  { id: "tool-syntax-injection", severity: "high", re: /<\/?\s*(?:tool_call|function_call|tool_response)\s*>/i },
  { id: "developer-mode", severity: "medium", re: /\b(?:developer mode|jailbreak|DAN|do anything now)\b/i },
  { id: "exfil-keyword", severity: "medium", re: /\b(?:exfiltrate|send to|POST to)\b.{0,40}https?:\/\//i },
  { id: "base64-blob", severity: "low", re: /[A-Za-z0-9+/]{220,}={0,2}/ },
  { id: "zero-width", severity: "medium", re: /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/ },
  { id: "prompt-leak", severity: "medium", re: /\b(?:reveal|print|repeat) (?:your )?(?:system )?prompt\b/i },
];

export function scanPrompt(text: string): FirewallResult {
  const findings: FirewallFinding[] = [];
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) {
      findings.push({
        rule: r.id,
        severity: r.severity,
        excerpt: m[0].slice(0, 80),
      });
    }
  }
  const score = Math.min(
    1,
    findings.reduce((s, f) => s + (f.severity === "high" ? 0.5 : f.severity === "medium" ? 0.25 : 0.1), 0),
  );
  const verdict: FirewallVerdict =
    score >= 0.5 ? "blocked" : score >= 0.2 ? "suspicious" : "clean";
  return { verdict, score, findings };
}
