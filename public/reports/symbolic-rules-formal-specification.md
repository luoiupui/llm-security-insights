# Formal Specification of the Ten Symbolic Validation Rules (R1–R10)

**Scope.** This document gives a complete, reproducible definition of the ten expert-baseline symbolic rules executed by the neuro-symbolic conflict detection engine (stage S5, `supabase/functions/threat-conflicts/index.ts`). Earlier reports named only a few of them; every definition below is taken directly from the running code, including exact thresholds.

R1–R7 are the original expert rules. R8–R10 are the graph-native rules added on top. Later extensions (R11–R13 multimodal fusion, R14–R16 hyperedge rules, and the adaptive layers C1–C4) are listed only in §5 for completeness and are **not** part of the ten.

---

## 1. Notation

An extracted candidate knowledge graph is

\[ G = (V, E, C, \rho) \]

- \(V\): set of entity nodes \(v\), each with `name(v)`, `type(v)`, and confidence \(c(v)\in[0,1]\).
- \(E\): set of directed relation edges \(e=(s,r,t)\) with source \(s\), relation label \(r\), target \(t\), and confidence \(c(e)\in[0,1]\).
- \(C\): ordered list of causal links \(\ell_i = (\text{cause}_i, \text{effect}_i, \tau_i, \kappa_i)\), where \(\tau_i\) is the temporal order and \(\kappa_i \in\) {enables, leads_to, triggers, precedes}.
- \(\rho\in[0,1]\): reliability of the source document (computed in S1 preprocessing).

Each rule \(R_k\) is a function \(R_k(G) \to (\text{status}, \text{affected\_items})\), where status \(\in\) {pass, warn, fail}. **warn** = a suspicious pattern that lowers credibility but is not provably wrong. **fail** = a logical contradiction.

---

## 2. Rule definitions

### R1 — Temporal Overlap Check
- **Target:** causal links \(C\).
- **Conflict condition:**
  - *warn* if two links share the same temporal order: \(\exists\, i\neq j: \tau_i = \tau_j\).
  - *fail* if adjacent links go backwards in time (reversed causality): \(\exists\, i: \tau_i > \tau_{i+1} \land \kappa_i \neq \text{precedes}\).
- **Rationale:** a kill chain must be a strict order. Repeated or inverted orders mean the LLM merged or misordered stages.

### R2 — TTP Consistency
- **Target:** edges \((a, r, t)\) where `type(a)` = threat_actor, `type(t)` = ttp, and \(r\in\) {uses, employs, implements}.
- **Conflict condition:** *warn* if one TTP is linked to more than one actor: \(\exists\, t: |\{a : (a,r,t)\in E\}| > 1\).
- **Rationale:** a shared technique makes attribution ambiguous. It may be legitimate (common tooling), so this is a warning, not a failure.

### R3 — Infrastructure Reuse
- **Target:** edges \((s, r, i)\) where `type(i)` = infrastructure and \(r\in\) {communicates_with, hosts, uses}.
- **Conflict condition:** *warn* if one infrastructure node has more than one distinct source: \(\exists\, i: |\{s : (s,r,i)\in E\}| > 1\).
- **Rationale:** shared C2 servers or domains point to either overlapping campaigns or a false merge of two actors.

### R4 — Credibility Assessment
- **Target:** source reliability \(\rho\) and node confidences \(c(v)\).
- **Conflict condition:**
  - *fail* if \(\rho < 0.5\).
  - otherwise *warn* if \(\exists\, v\in V: c(v) < 0.5\) (the affected items are those nodes).
- **Rationale:** knowledge from an unreliable source, or nodes the extractor itself is unsure of, should not reach attribution without being flagged.

### R5 — Causal Coherence
- **Target:** causal links \(C\).
- **Conflict condition:** *fail* if a two-node causal loop exists: \(\exists\, \ell_i, \ell_j: \text{cause}_i = \text{effect}_j \land \text{effect}_i = \text{cause}_j\).
- **Rationale:** "A causes B and B causes A" cannot be true in a time-ordered attack. (Longer cycles are covered by adaptive rule R14_cyclic_causality in layer C2.)

### R6 — Attribution Contradiction
- **Target:** edges with \(r\in\) {attributed_to, attributed-to}.
- **Conflict condition:** *fail* if one subject is attributed to more than one actor: \(\exists\, s: |\{t : (s,\text{attributed\_to},t)\in E\}| > 1\).
- **Rationale:** a campaign or malware sample has one responsible actor in a single report. Several are mutually exclusive claims.

### R7 — Entity Deduplication
- **Target:** node names \(V\).
- **Conflict condition:** define \(\text{norm}(x)\) = lowercase \(x\) with spaces, hyphens and underscores removed. *warn* if \(\exists\, v\neq w: \text{norm}(\text{name}(v)) = \text{norm}(\text{name}(w))\).
- **Rationale:** "APT-28", "apt28" and "APT 28" must be one node, or the graph splits evidence and inflates counts.

### R8 — Graph Connectivity *(graph-native)*
- **Target:** nodes \(V\) against edges \(E\).
- **Conflict condition:** *warn* if orphan nodes exist: \(\exists\, v\in V: v \notin \{s,t : (s,r,t)\in E\}\).
- **Rationale:** an entity with no relation carries no knowledge in the graph. Usually it means a relation was missed during extraction.

### R9 — Ontological Compliance (STIX 2.1) *(graph-native)*
- **Target:** node types and edge labels.
- **Allowed node types (SDO set \(\mathcal{T}\)):** threat_actor, malware, vulnerability, ttp, infrastructure, software, campaign, indicator, identity, attack-pattern, tool, observed-data, flow_pattern, corroborated_finding.
- **Allowed edge labels (SRO set \(\mathcal{R}\)):** uses, targets, attributed-to/attributed_to, communicates-with/communicates_with, exploits, delivers, drops, indicates, mitigates, derived-from, related-to, hosts, implements, employs, enables, leads_to, triggers, precedes, corroborates, contradicts, matches_ioc.
- **Conflict condition:** *warn* if \(\exists\, v: \text{type}(v)\notin\mathcal{T} \land \text{stix\_type}(v)\notin\mathcal{T}\), or \(\exists\, e: r(e)\notin\mathcal{R}\).
- **Rationale:** keeps the LLM's open vocabulary inside the STIX 2.1 ontology so the graph stays interoperable and queryable.

### R10 — Confidence Propagation *(graph-native)*
- **Target:** each edge together with its two endpoint nodes.
- **Conflict condition:** *warn* if \(\exists\, e=(s,r,t): c(e) > 0.8 \land (c(s) < 0.4 \lor c(t) < 0.4)\). A missing endpoint counts as confidence 0.
- **Rationale:** a relation cannot be more certain than the entities it connects. A confident edge between doubtful nodes is a sign of hallucination.

---

## 3. Summary table

| ID | Name | Target | Conflict condition (short) | Thresholds | Severity |
|---|---|---|---|---|---|
| R1 | Temporal Overlap | causal links | duplicate order; or \(\tau_i>\tau_{i+1}\), type ≠ precedes | — | warn / fail |
| R2 | TTP Consistency | actor→TTP edges | one TTP used by >1 actor | >1 | warn |
| R3 | Infrastructure Reuse | →infrastructure edges | one infra node has >1 source | >1 | warn |
| R4 | Credibility | \(\rho\), node conf | \(\rho<0.5\); or any \(c(v)<0.5\) | 0.5 / 0.5 | fail / warn |
| R5 | Causal Coherence | causal links | A→B and B→A | — | fail |
| R6 | Attribution Contradiction | attributed_to edges | one subject → >1 actor | >1 | fail |
| R7 | Entity Deduplication | node names | equal normalised names | — | warn |
| R8 | Graph Connectivity | nodes vs edges | orphan node | — | warn |
| R9 | Ontological Compliance | types / labels | type ∉ STIX SDO or label ∉ SRO | fixed sets | warn |
| R10 | Confidence Propagation | edge + endpoints | \(c(e)>0.8\) and an endpoint \(<0.4\) | 0.8 / 0.4 | warn |

---

## 4. How rule results are used

1. **Execution order:** R1 → R10 run on every extraction, in order. Each one is deterministic, uses no LLM, and gives the same result for the same input graph.
2. **Base credibility:** \( S = 0.4\,\bar c_V + 0.3\,\bar c_E + 0.3\,\rho \) (a weighted form of \(S=\sum w_i\,\text{conf}_i\,\text{reliability}_i/N\)), rounded to 2 decimals.
3. **Penalty:** violations reduce \(S\) through the provenance-weighted penalty in `_shared/rules/registry.ts`: each failure costs \(0.12\times w\) and each warning \(0.05\times w\). Expert rules have \(w=1.0\), adaptive rules 0.7, mined rules 0.4. The total penalty is capped at 0.6.
4. **LLM resolution:** if any rule returns warn or fail, the non-passing results are sent to the frozen LLM, which suggests graph-level fixes (merge nodes, redirect edges, adjust confidence). The LLM only advises. It never overrides a rule's verdict.

## 5. Rules beyond the ten (for reference)

| Family | IDs | Where defined |
|---|---|---|
| Multimodal fusion | R11 unverified external, R12 stale IoC, R13 cross-modal disagreement | `threat-conflicts/index.ts`, `conflict-rules-multimodal-extension.md` |
| Hyperedge (Pathway C) | R14 joint validity, R15 qualifier consistency, R16 provenance overlap | `hyperedge-rules.ts` |
| Adaptive C1 / C2 | R8_causal_monotonicity … R15_orphan_impact | `_shared/rules/temporal.ts`, `killchain.ts` |
| C3 mined / C4 anomaly | mined IDs, R16_novel_edge_pattern | `mined.generated.ts`, `anomaly.ts` |

**Naming note:** the adaptive C1/C2 rules reuse the numbers R8–R15 but always carry a suffixed ID (e.g. `R9_timestamp_order`). Bare R8–R10 in this document always refer to the expert graph-native rules above.

## 6. Reproduction

- Source of truth: functions `checkTemporalOverlap`, `checkTTPConsistency`, `checkInfrastructureReuse`, `checkCredibility`, `checkCausalCoherence`, `checkAttributionContradiction`, `checkEntityDuplication`, `checkGraphConnectivity`, `checkOntologicalCompliance`, `checkConfidencePropagation` in `supabase/functions/threat-conflicts/index.ts`.
- Each run stores `rule_kernel_version` and `rule_set_version`, so any KG output can be re-checked against the exact rule set that produced it (see `hybrid-rule-governance-clarification.md`).
