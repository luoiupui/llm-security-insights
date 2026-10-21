---
mem_path: mem://architecture/threat-reasoning
name: Threat Reasoning Engine
description: Neuro-symbolic engine, conflict detection, credibility scoring formula
type: feature
exported_at: 2026-05-26
---
- Threat attribution and reasoning use a neuro-symbolic engine with temporal Knowledge Graphs.
- Conflict detection: Managed by 10 expert symbolic rules (R1-R10, formally specified in public/reports/symbolic-rules-formal-specification.md) and an LLM-based resolution engine.
- Credibility scoring formula: S = Σ(wi × confi × reliabilityi) / N
