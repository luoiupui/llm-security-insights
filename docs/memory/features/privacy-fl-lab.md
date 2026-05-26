---
mem_path: mem://features/privacy-fl-lab
name: Privacy & FL Lab
description: Simulation-only privacy-preserving computation + federated learning track for clinical data. Five tabs (De-identification, DP budget, FedAvg, Secure aggregation, MIA probe). No real PHI, no real federation.
type: feature
exported_at: 2026-05-26
---
- Page: `src/pages/PrivacyFLLab.tsx` (route `/privacy-fl-lab`, sidebar entry "Privacy & FL Lab").
- Meaningful only when Clinical domain is selected (banner reminds user).
- Libs: `src/lib/privacy/dp.ts` (Laplace mechanism, utility curve), `fl-fedavg.ts` (FedAvg over synthetic 8-D embeddings, N hospital shards), `secure-agg.ts` (pairwise-mask sum protocol, illustrative only).
- Tabs status: De-id (Safe Harbor checklist + scrub diff + residual-risk), DP (ε slider, utility/ε curve, privatized counts), FL (per-round loss + shard divergence vs centralized), Secure-agg (mask cancellation viz, explicitly "not cryptographically secure"), MIA (shadow-model probe — planned, hook present).
- Every run can write a `monitoring_events` row with `category="privacy"` so the SelfMonitoringPanel surfaces it.
- Forward path: same trust boundary (edge-function-only writes + SECURITY INVOKER RPC) maps directly onto the FL aggregator pattern when the simulator is swapped for a real FL client.
