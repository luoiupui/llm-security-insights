# Project Memory

> Mirror of `mem://index.md`. Source of truth is the Lovable agent's memory store.

## Core
ThreatGraph system: LLM-enhanced threat intelligence knowledge graph.
Two domains via header switch: CTI (default) and Clinical (research simulation only).
Same pipeline; only ontology, prompt vocabulary, and validators swap by domain.
Dark cybersecurity UI using JetBrains Mono and Inter fonts.
Backbone LLM: google/gemini-3-flash-preview via Lovable AI Gateway.
Backend: Supabase Edge Functions via Lovable Cloud for real-time processing.
Strictly aligned with Chapters 2-5 of the user's research outline.

## Memories
- [Visual Identity](./style/visual-identity.md) — Custom colors for threat levels and dark aesthetic
- [Threat Intelligence](./features/threat-intelligence.md) — Data fusion pipeline, SVG knowledge graph, MITRE ATT&CK mapping
- [Outline Alignment](./constraints/outline-alignment.md) — Dashboard modules map to Chapters 2-5 of research outline
- [Thesis Generation](./features/thesis-generation.md) — Automated academic thesis generation (.docx) for Chapters 3-5
- [Threat Reasoning](./architecture/threat-reasoning.md) — Neuro-symbolic engine, conflict detection, credibility scoring formula
- [System Layers](./architecture/system-layers.md) — Data Acquisition, LLM Extraction, KG Storage, Inference Application
- [LLM Strategy](./architecture/llm-strategy.md) — 8-step CoT prompts via gemini-3-flash-preview
- [Causality Reasoning](./features/causality-reasoning.md) — Temporal causal link analysis (enables, leads_to, triggers)
- [Backend Services](./architecture/backend-services.md) — Supabase Edge Functions (threat-preprocess, extract, conflicts, kg-query)
- [KG-Bench](./features/kg-bench.md) — LLM-KG-Bench 3.0 adapted to score the pipeline (7 categories, CTI+Clinical, JA/ZH multilingual)
- [Agent Harness](./architecture/agent-harness.md) — Dual pathways: deterministic pipeline (B, KG-Bench scored) + AI-SDK agent loop (A, experimental)
- [Security Posture](./features/security-posture.md) — AI Threat Model page, posture registry, prompt-firewall guard
- [Privacy & FL Lab](./features/privacy-fl-lab.md) — Simulation-only PPC/FL track: de-id, DP, FedAvg, secure agg, MIA
- [Clinical Feature Ingest](./features/clinical-feature-ingest.md) — T2 heart-sound feature-vector contract (JSON Schema + FHIR mapping), spec only

> Note: `mem://features/clinical-mode` is referenced in the live index but no body exists in the memory store yet; omitted here. Ask the agent to author it if needed.
