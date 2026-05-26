---
mem_path: mem://features/security-posture
name: Security Posture
description: AI Threat Model page maps OWASP LLM Top-10, MITRE ATLAS, NIST AI RMF onto the existing layers. Server-side prompt-firewall in threat-extract + per-domain tool allow-list & PHI redaction in threat-agent. UI security/privacy events written to monitoring_events.
type: feature
exported_at: 2026-05-26
---
- Page: `src/pages/AISystemThreatModel.tsx` (route `/threat-model`, sidebar entry "AI Threat Model").
- Registry: `src/lib/security/posture.ts` — per-layer threats with state `active | simulated | planned`.
- Guard: `src/lib/security/prompt-firewall.ts` `scanPrompt(text)` → verdict `clean|suspicious|blocked`, score 0..1.
- **DB hardening**: `match_threat_reports` + `fetch_subgraph` are SECURITY INVOKER, EXECUTE revoked from anon/authenticated/public; only edge functions (service role) call them.
- **Now wired (server-side, real trust boundary)**:
  - `threat-extract` runs `serverScanPrompt()` (mirror of UI rules); verdict `blocked` → HTTP 422; any non-clean verdict logged to `monitoring_events` (event_type `prompt_firewall_hit`, category `security`).
  - `threat-agent` applies `TOOL_ALLOWLIST` per domain (Clinical drops `attribute` and `retrieve`); denials logged as `agent_tool_denied`. In Clinical mode, all tool args pass through `redactPhi()` (MRN/DOB/email/phone/SSN) before execution.
  - UI: `AISystemThreatModel` debounce-logs every non-clean probe as `prompt_firewall_probe`; `PrivacyFLLab` logs FedAvg runs as `privacy_lab_run` (category `privacy`).
- INSERT policy `monitoring_events_public_insert` restricts public inserts to categories `security|privacy|acceptance|experiment|pipeline`.
