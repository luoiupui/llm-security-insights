
# AI Security & Privacy Posture Layer (Simulation)

Goal: turn the dashboard into a credible prototype of an end-to-end secure AI system, covering both **today's agent harness** (Pathways A + B, edge functions, KG storage) and the **future Privacy-Preserving Computation (PPC) + Federated Learning (FL)** track for clinical data. All controls run in simulation — no real PHI, no real federated cluster — but each one is wired to the existing pipeline so the research story is honest.

Nothing here changes business logic of extraction / KG / KG-Bench. It is a presentation + safety overlay that sits *around* the existing pipeline, plus one new "Privacy & FL Lab" page.

---

## 1. Threat model surface (new panel: "AI System Threat Model")

A single page that enumerates threats per layer of the existing architecture and shows which mitigations are **active**, **simulated**, or **planned**. Drawn from OWASP LLM Top-10, MITRE ATLAS, and NIST AI RMF — mapped onto *this* project's components.

| Layer (existing) | Threats covered | Control state |
|---|---|---|
| Data Acquisition (`threat-preprocess`, `kb-ingest`, `cisa-advisories-ingest`) | Poisoned feeds, prompt-injection in ingested text, PII/PHI leak | Active (source-type sanitization, PHI scrub) + new: injection-pattern scanner |
| LLM Extraction (`threat-extract`, `kb-validate`, `threat-conflicts`) | Prompt injection, jailbreak, hallucinated entities, schema drift | Active (Zod schema validation, conflict arbitration) + new: prompt-firewall pre-check, output-allow-list |
| Agent Loop — Pathway A (`threat-agent`) | Tool abuse, runaway steps, unsafe `persist`, exfiltration via tool args | Active (`stopWhen(stepCountIs(50))`, `needsApproval` on `persist`) + new: per-tool allow-list per domain, redaction of tool arguments in trace |
| KG Storage (Supabase tables) | Privilege escalation, RLS bypass, exposed RPC | Active (recent hardening: SECURITY INVOKER + EXECUTE revoke) + new: RLS coverage badge in panel |
| UI / Reports | XSS in rendered threat text, secret leakage in reports | New: render-time sanitizer + secret-pattern detector for downloads |

Implementation = one read-only React page that consumes a static `src/lib/security/posture.ts` registry, plus three small live probes (RLS check via `read_query`, edge-function reachability, model-gateway latency).

---

## 2. Runtime guards added around the existing pipeline (simulation, but real code)

These are real middleware functions; they're "simulation" only in that they're tuned for the synthetic corpus, not a production SOC.

- `src/lib/security/prompt-firewall.ts` — regex + heuristic check applied before every `threat-extract` / `threat-agent` call. Flags `ignore previous`, `system:` overrides, embedded tool-call syntax, base64 blobs > N bytes, zero-width chars. Outcome attached to `monitoring_events` with `category = "security"`.
- `src/lib/security/output-guard.ts` — post-LLM validator that rejects entities/relations whose `entity_type` is outside the active ontology (CTI or Clinical). Already half-done by Zod; this adds an explicit deny-log.
- `supabase/functions/threat-agent/index.ts` — add per-domain tool allow-list (clinical mode cannot call `persist` without approval *and* without PHI-scrub confirmation), and redact tool-call args longer than 500 chars in the streamed trace.
- `src/lib/security/audit.ts` — every security decision logged through existing `monitoring_events` so the SelfMonitoringPanel already shows it; new filter chip "Security".

---

## 3. "Privacy & FL Lab" page (new, clinical-mode oriented)

A dedicated page (`src/pages/PrivacyFLLab.tsx`) only meaningfully active when **Clinical** domain is selected. Pure simulation, but each tab is implemented end-to-end on synthetic notes so the research story holds.

Tabs:

1. **De-identification pipeline** — extends the existing PHI safety-net in `threat-preprocess` with a visible Safe Harbor checklist (18 HIPAA identifiers), per-note scrub diff, and a residual-risk score.
2. **Differential Privacy budget** — local Laplace/Gaussian noise simulator over aggregate counts produced by KG queries (entity frequencies, ATT&CK-equivalent tactic counts in clinical ontology). User picks ε, sees utility-vs-privacy curve. Implemented in browser with a tiny TS DP helper.
3. **Federated Learning simulator** — N synthetic "hospital" shards (split the existing clinical corpus K-ways), runs `FedAvg` for a toy logistic-regression head on top of frozen Gemini embeddings already in `threat_reports.embedding`. Shows per-round loss, divergence between shards, and the gap vs centralized baseline. All client-side.
4. **Secure aggregation (mock)** — visualize masked-sum protocol over the FL round weights: per-client masks, pairwise cancellation, server sees only the sum. Animated, deterministic — explicitly labeled "Protocol illustration, not cryptographically secure".
5. **Membership-inference probe** — run a shadow-model attack on the toy FL classifier to estimate leakage; show how the chosen ε in tab 2 reduces it.

Each tab writes a structured event so KG-Bench can later add a "Privacy" task family if desired.

---

## 4. How current hardening already feeds the FL/PPC future

Make this explicit in a short section of the white paper (`public/reports/white-paper.md`) and in the new page header:

- **Edge-function-only DB writes + SECURITY INVOKER RPCs** = the same trust boundary FL needs (the "server" in FL is the only party allowed to aggregate; clients never write raw data). Today's revoke-from-anon hardening is literally the FL aggregator pattern.
- **Domain switch (CTI ↔ Clinical) with ontology-bound output guard** = sandbox boundary needed before sending anything to a clinical FL client.
- **`needsApproval` on `persist` + audit log via `monitoring_events`** = the audit trail required for any IRB-style review of FL rounds.
- **Deterministic Pathway B (KG-Bench scored) vs experimental Pathway A** = same split FL needs between reproducible production rounds and exploratory ones.

So the security work is not a detour: every control added here is reused when the project later swaps the simulator for a real FL client.

---

## 5. Memory + docs

- New `mem://features/security-posture` — what's enforced, what's simulated.
- New `mem://features/privacy-fl-lab` — the 5 tabs and their synthetic-only status.
- Update `mem://index.md` Memories list.
- White paper: new §8 "Security posture and forward path to privacy-preserving FL on clinical data".

---

## Files touched (estimate)

Created:
- `src/pages/PrivacyFLLab.tsx`, `src/pages/AISystemThreatModel.tsx`
- `src/components/security/{PostureMatrix,RLSBadge,SecurityEventsFilter}.tsx`
- `src/components/privacy/{DeidPipeline,DPBudget,FLSimulator,SecureAggViz,MIAProbe}.tsx`
- `src/lib/security/{posture,prompt-firewall,output-guard,audit}.ts`
- `src/lib/privacy/{dp,fl-fedavg,secure-agg,mia}.ts`
- 2 memory files

Edited:
- `supabase/functions/threat-agent/index.ts` (tool allow-list + arg redaction)
- `supabase/functions/threat-extract/index.ts` (firewall hook)
- `src/components/AppSidebar.tsx` (two nav entries: Threat Model, Privacy & FL Lab)
- `src/App.tsx` (routes)
- `public/reports/white-paper.md`, `mem://index.md`

0 DB migrations, 0 new secrets, 0 real PHI, 0 real federation. All clearly labeled "Simulation" in the UI, consistent with the existing Clinical Mode banner.

---

Want me to scope this to just **(A) the Threat Model + runtime guards** first, just **(B) the Privacy & FL Lab** first, or build **(C) both** in one pass?
