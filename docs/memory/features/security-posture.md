---
mem_path: mem://features/security-posture
name: Security Posture
description: AI Threat Model page maps OWASP LLM Top-10, MITRE ATLAS, NIST AI RMF onto the existing layers. Prompt-firewall heuristic guards extract/agent calls. DB hardened via SECURITY INVOKER + EXECUTE revoke (edge-functions-only writes).
type: feature
exported_at: 2026-05-26
---
- Page: `src/pages/AISystemThreatModel.tsx` (route `/threat-model`, sidebar entry "AI Threat Model").
- Registry: `src/lib/security/posture.ts` — per-layer threats with state `active | simulated | planned`.
- Guard: `src/lib/security/prompt-firewall.ts` `scanPrompt(text)` → verdict `clean|suspicious|blocked`, score 0..1; rules: ignore-previous, role-override, tool-syntax-injection, developer-mode, exfil-keyword, base64-blob, zero-width, prompt-leak.
- DB hardening already applied via migration: `match_threat_reports` + `fetch_subgraph` are SECURITY INVOKER, EXECUTE revoked from anon/authenticated/public; only edge functions (service role) call them.
- Planned (not yet wired): firewall pre-check inside `threat-extract` edge function, tool-arg redaction in `threat-agent`.
