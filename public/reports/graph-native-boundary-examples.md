# Graph-Native CoT — Boundary Examples (Success / Boundary / Failure)

**Run date:** 2026-10-21 01:16 UTC · **Function:** `threat-extract` (mode `full`, domain `cti`) · **Backbone:** `google/gemini-3-flash-preview` (frozen, zero-shot) · **Repro preset:** deterministic, T=0, seed 42 · **RAG:** off · **Latency:** ~11 s per case.

Companion to `native_ToC.md`. Three live extractions illustrate where graph-native reasoning holds and where it breaks when handling complex, nested threat entities. Cases 1–2 are Gold-56 items derived from public sources (CISA KEV, Mandiant/Palo Alto Unit 42, FireEye/CISA); Case 3 is a crafted adversarial item written in public-reporting style.

## Example 1 — SUCCESS: kev-001 (CVE-2024-3400 / UPSTYLE, 2024)

**Nesting type:** linear chain (actor → CVE → product → malware → TTP → exfiltration).

- 7 entities, 7 relations, 3 causal links. All 5 gold entities found: CVE-2024-3400 (0.95), PAN-OS GlobalProtect (0.90), UPSTYLE Backdoor (0.90), Valid Accounts / T1078 (0.90), HTTPS Exfiltration (0.85).
- The unnamed actor was emitted as "Threat Actor Group (Unidentified)" (0.80) rather than a made-up name.
- Causal chain kept end-to-end: `CVE-2024-3400 → UPSTYLE → T1078 → HTTPS exfiltration`, with confidence dropping along the path (0.81 → 0.81 → 0.77), as the weakest-link rule specifies.
- Only deviation: predicate labels differ from gold ("targets" vs "affects", "delivers" vs "exploits"). That affects scoring, not structure.

## Example 2 — BOUNDARY: kev-005 (SUNBURST / APT29, 2020)

**Nesting type:** alias nesting (APT29 ≡ Cozy Bear) + supply-chain containment (DLL inserted *into* Orion updates).

- Worked: APT29 (0.95), CVE-2020-10148 (0.95), SUNBURST (0.95), both TTPs; correct `APT29 —exploits→ CVE` and `APT29 —uses→ SUNBURST`; causal chain with proper decay (0.85 → 0.77).
- **Alias collapsed:** "Cozy Bear" is missing and there is no `also_known_as` edge. Gold expects both nodes plus the alias edge (6/7 gold entities).
- **Containment inverted:** `SUNBURST —drops→ SolarWinds Orion Updates` reverses the real relation (the updates delivered SUNBURST). The nested containment malware ⊂ update ⊂ product was flattened and reversed.
- **Lesson:** chains are robust; identity and containment nesting is where topology starts to degrade.

## Example 3 — FAILURE MODE: hard001 (nested attribution dispute)

**Nesting type:** three vendor names (TEMP.Hex / APT-C-23 / Gaza Cybergang), "moderate confidence" overlap, disputed malware link, "possibly CVE-2017-0199", dual-use infrastructure.

- Worked: confidences follow the hedging in the text: Gaza Cybergang 0.6, Pierogi Backdoor 0.5, CVE-2017-0199 0.7. The model did not overcommit.
- **Fabricated causal edge:** `TEMP.Hex —enables→ Unspecified Office Vulnerability`. An actor cannot enable a vulnerability; the causal-fusion step forced a chain where the text has none.
- **Pseudo-entities:** "Criminal Spam Operations" and "State-aligned Espionage Identity" became `identity` nodes with `attributed-to` edges, turning an analytical *possibility* into graph structure.
- **No alias resolution:** the three track names stay separate nodes joined only by vague `related-to` edges.

## Summary

| Case | Nesting type | Entities vs gold | Topology | Causal chain | Verdict |
|---|---|---|---|---|---|
| kev-001 (UPSTYLE) | Linear chain | 5/5 | Matches gold | Correct, decaying conf. | **Success** |
| kev-005 (SUNBURST) | Alias + containment | 6/7 (alias lost) | 1 inverted edge | Correct structure | **Boundary** |
| hard001 (attribution dispute) | Nested attribution uncertainty | n/a (adversarial) | Pseudo-entities, 1 invalid causal edge | Forced chain | **Failure mode** |

## Conclusions and downstream guards

1. Graph-native CoT is robust for **linear and branching** narratives.
2. It degrades at **alias/containment nesting**, where it merges or inverts entities. Possible mitigations: an explicit alias-resolution sub-step and a containment predicate in the ontology.
3. Under **nested attribution uncertainty**, confidence grading still works, but causal fusion invents structure to fit its own schema. Downstream guards are needed for this:
   - **R6 contradictory attribution** and **R9 STIX conformance** (an actor→vulnerability `enables` edge violates the SRO domain/range).
   - **C3 mined rules** (HITL), e.g. "an `enables` edge from a threat-actor to a vulnerability is invalid".
   - **D-S ignorance mass** (`D-S application.md`): "unclear operator" should stay as mass on Θ instead of being forced into an edge.

## Reproduction

Call the `threat-extract` function with `{ text, mode: "full", domain: "cti", repro: { deterministic: true, temperature: 0, seed: 42 } }`, using the kev-001 / kev-005 texts from `src/lib/test-corpus.ts`. Outputs can vary slightly across model revisions, even with the deterministic preset.

## Appendix — Raw JSON outputs

### kev001

```json
{
    "source_type": "report",
    "source_reliability": 0.8,
    "timestamp": "2026-10-21T01:16:15.650Z",
    "extraction_method": "graph_native_cot",
    "domain": "cti",
    "rag_used": false,
    "repro": {
        "deterministic": true,
        "temperature": 0,
        "seed": 42
    },
    "ner": {
        "entities": [
            {
                "confidence": 0.8,
                "name": "Threat Actor Group (Unidentified)",
                "context": "Threat actors exploited...",
                "type": "threat_actor",
                "stix_type": "threat-actor"
            },
            {
                "mitre_id": "CVE-2024-3400",
                "confidence": 0.95,
                "stix_type": "vulnerability",
                "name": "CVE-2024-3400",
                "type": "vulnerability",
                "context": "CVE-2024-3400, a command injection vulnerability"
            },
            {
                "confidence": 0.9,
                "stix_type": "software",
                "type": "software",
                "name": "Palo Alto Networks PAN-OS GlobalProtect",
                "context": "Palo Alto Networks PAN-OS GlobalProtect"
            },
            {
                "confidence": 0.9,
                "name": "UPSTYLE Backdoor",
                "type": "malware",
                "stix_type": "malware",
                "context": "deploy the UPSTYLE backdoor"
            },
            {
                "type": "infrastructure",
                "name": "Perimeter Firewalls",
                "context": "perimeter firewalls",
                "stix_type": "infrastructure",
                "confidence": 0.85
            },
            {
                "type": "ttp",
                "context": "used valid accounts (T1078)",
                "confidence": 0.9,
                "name": "Valid Accounts (T1078)",
                "mitre_id": "T1078",
                "stix_type": "attack-pattern"
            },
            {
                "confidence": 0.85,
                "type": "ttp",
                "name": "HTTPS Exfiltration",
                "stix_type": "attack-pattern",
                "context": "exfiltrated configuration files over HTTPS"
            }
        ],
        "narrative_summary": "Analysis of CVE-2024-3400 exploitation leading to UPSTYLE backdoor deployment and subsequent lateral movement using valid accounts."
    },
    "re": {
        "relations": [
            {
                "confidence": 0.9,
                "relation": "uses",
                "evidence": "Threat actors exploited CVE-2024-3400",
                "target": "CVE-2024-3400",
                "edge_type": "relational",
                "source": "Threat Actor Group (Unidentified)"
            },
            {
                "source": "CVE-2024-3400",
                "target": "UPSTYLE Backdoor",
                "edge_type": "relational",
                "confidence": 0.9,
                "relation": "delivers",
                "evidence": "exploited CVE-2024-3400... to deploy the UPSTYLE backdoor"
            },
            {
                "source": "CVE-2024-3400",
                "target": "Palo Alto Networks PAN-OS GlobalProtect",
                "confidence": 0.9,
                "relation": "targets",
                "evidence": "vulnerability in Palo Alto Networks PAN-OS GlobalProtect",
                "edge_type": "relational"
            },
            {
                "target": "Perimeter Firewalls",
                "confidence": 0.85,
                "source": "UPSTYLE Backdoor",
                "evidence": "deploy the UPSTYLE backdoor on perimeter firewalls",
                "relation": "targets",
                "edge_type": "relational"
            },
            {
                "source": "Threat Actor Group (Unidentified)",
                "target": "Valid Accounts (T1078)",
                "edge_type": "relational",
                "confidence": 0.9,
                "evidence": "operators used valid accounts (T1078) for lateral movement",
                "relation": "uses"
            },
            {
                "target": "HTTPS Exfiltration",
                "relation": "uses",
                "evidence": "exfiltrated configuration files over HTTPS",
                "edge_type": "relational",
                "source": "Threat Actor Group (Unidentified)",
                "confidence": 0.85
            },
            {
                "target": "Perimeter Firewalls",
                "confidence": 0.7,
                "source": "Threat Actor Group (Unidentified)",
                "relation": "targets",
                "evidence": "deploy the UPSTYLE backdoor on perimeter firewalls",
                "derived_from": "(Threat Actor Group uses UPSTYLE) + (UPSTYLE targets Firewalls)",
                "edge_type": "inferred"
            }
        ]
    },
    "graph_native": {
        "nodes": [
            {
                "confidence": 0.8,
                "name": "Threat Actor Group (Unidentified)",
                "context": "Threat actors exploited...",
                "type": "threat_actor",
                "stix_type": "threat-actor"
            },
            {
                "mitre_id": "CVE-2024-3400",
                "confidence": 0.95,
                "stix_type": "vulnerability",
                "name": "CVE-2024-3400",
                "type": "vulnerability",
                "context": "CVE-2024-3400, a command injection vulnerability"
            },
            {
                "confidence": 0.9,
                "stix_type": "software",
                "type": "software",
                "name": "Palo Alto Networks PAN-OS GlobalProtect",
                "context": "Palo Alto Networks PAN-OS GlobalProtect"
            },
            {
                "confidence": 0.9,
                "name": "UPSTYLE Backdoor",
                "type": "malware",
                "stix_type": "malware",
                "context": "deploy the UPSTYLE backdoor"
            },
            {
                "type": "infrastructure",
                "name": "Perimeter Firewalls",
                "context": "perimeter firewalls",
                "stix_type": "infrastructure",
                "confidence": 0.85
            },
            {
                "type": "ttp",
                "context": "used valid accounts (T1078)",
                "confidence": 0.9,
                "name": "Valid Accounts (T1078)",
                "mitre_id": "T1078",
                "stix_type": "attack-pattern"
            },
            {
                "confidence": 0.85,
                "type": "ttp",
                "name": "HTTPS Exfiltration",
                "stix_type": "attack-pattern",
                "context": "exfiltrated configuration files over HTTPS"
            }
        ],
        "edges": [
            {
                "confidence": 0.9,
                "relation": "uses",
                "evidence": "Threat actors exploited CVE-2024-3400",
                "target": "CVE-2024-3400",
                "edge_type": "relational",
                "source": "Threat Actor Group (Unidentified)"
            },
            {
                "source": "CVE-2024-3400",
                "target": "UPSTYLE Backdoor",
                "edge_type": "relational",
                "confidence": 0.9,
                "relation": "delivers",
                "evidence": "exploited CVE-2024-3400... to deploy the UPSTYLE backdoor"
            },
            {
                "source": "CVE-2024-3400",
                "target": "Palo Alto Networks PAN-OS GlobalProtect",
                "confidence": 0.9,
                "relation": "targets",
                "evidence": "vulnerability in Palo Alto Networks PAN-OS GlobalProtect",
                "edge_type": "relational"
            },
            {
                "target": "Perimeter Firewalls",
                "confidence": 0.85,
                "source": "UPSTYLE Backdoor",
                "evidence": "deploy the UPSTYLE backdoor on perimeter firewalls",
                "relation": "targets",
                "edge_type": "relational"
            },
            {
                "source": "Threat Actor Group (Unidentified)",
                "target": "Valid Accounts (T1078)",
                "edge_type": "relational",
                "confidence": 0.9,
                "evidence": "operators used valid accounts (T1078) for lateral movement",
                "relation": "uses"
            },
            {
                "confidence": 0.8,
                "target": "Valid Accounts (T1078)",
                "relation": "enables",
                "source": "UPSTYLE Backdoor",
                "evidence": "After initial access, the operators used valid accounts... for lateral movement",
                "edge_type": "causal"
            },
            {
                "target": "HTTPS Exfiltration",
                "relation": "uses",
                "evidence": "exfiltrated configuration files over HTTPS",
                "edge_type": "relational",
                "source": "Threat Actor Group (Unidentified)",
                "confidence": 0.85
            },
            {
                "target": "Perimeter Firewalls",
                "confidence": 0.7,
                "source": "Threat Actor Group (Unidentified)",
                "relation": "targets",
                "evidence": "deploy the UPSTYLE backdoor on perimeter firewalls",
                "derived_from": "(Threat Actor Group uses UPSTYLE) + (UPSTYLE targets Firewalls)",
                "edge_type": "inferred"
            }
        ],
        "subgraphs": [
            {
                "type": "attack_chain",
                "node_ids": [
                    "Threat Actor Group (Unidentified)",
                    "CVE-2024-3400",
                    "UPSTYLE Backdoor"
                ],
                "name": "Initial Access Chain"
            },
            {
                "name": "Post-Exploitation Cluster",
                "type": "ttp_profile",
                "node_ids": [
                    "Valid Accounts (T1078)",
                    "HTTPS Exfiltration"
                ]
            }
        ],
        "graph_metadata": {
            "density": 0.166,
            "edge_count": 8,
            "narrative": "Analysis of CVE-2024-3400 exploitation leading to UPSTYLE backdoor deployment and subsequent lateral movement using valid accounts.",
            "node_count": 7,
            "stix_compliance": 1
        },
        "graph_warnings": [],
        "reasoning_trace": "Step 1: Seeded triples identifying the actor exploiting the CVE and deploying UPSTYLE. Step 2: Expanded nodes to include PAN-OS software and T1078 TTP. Step 3: Established relational edges for exploitation and deployment. Step 4: Ordered events from initial access (CVE) to persistence (UPSTYLE) to post-exploitation (T1078). Step 5: Fused temporal order into causal 'enables' relationship between backdoor access and lateral movement. Step 6: Validated STIX 2.1 compliance and evidence coverage. Step 7: Propagated confidence from source reliability (0.8) and specific technical mentions. Step 8: Serialized to final KG."
    },
    "causality": {
        "causal_links": [
            {
                "temporal_order": 1,
                "evidence": "Exploited CVE-2024-3400 to deploy the UPSTYLE backdoor",
                "cause": "CVE-2024-3400",
                "confidence": 0.8075,
                "causal_type": "leads_to",
                "mitre_tactic": "Execution",
                "effect": "UPSTYLE Backdoor"
            },
            {
                "cause": "UPSTYLE Backdoor",
                "temporal_order": 2,
                "mitre_tactic": "Lateral Movement",
                "confidence": 0.81,
                "evidence": "After initial access [via backdoor], the operators used valid accounts for lateral movement",
                "effect": "Valid Accounts (T1078)",
                "causal_type": "enables"
            },
            {
                "cause": "Valid Accounts (T1078)",
                "causal_type": "leads_to",
                "effect": "HTTPS Exfiltration",
                "mitre_tactic": "Exfiltration",
                "evidence": "Used valid accounts... and exfiltrated configuration files",
                "confidence": 0.765,
                "temporal_order": 3
            }
        ],
        "attack_timeline": [
            {
                "order": 1,
                "certainty": "narrative_order",
                "event": "Exploitation of CVE-2024-3400 on PAN-OS GlobalProtect"
            },
            {
                "order": 2,
                "certainty": "narrative_order",
                "event": "Deployment of UPSTYLE Backdoor on Perimeter Firewalls"
            },
            {
                "certainty": "inferred",
                "order": 3,
                "event": "Lateral Movement using Valid Accounts (T1078)"
            },
            {
                "event": "Exfiltration of configuration files over HTTPS",
                "certainty": "narrative_order",
                "order": 4
            }
        ],
        "kill_chain_mapping": [
            {
                "technique_name": "Exploit Public-Facing Application",
                "technique_id": "T1190",
                "tactic": "Initial Access",
                "events": [
                    "CVE-2024-3400"
                ]
            },
            {
                "technique_id": "T1505.003",
                "tactic": "Persistence",
                "technique_name": "Server Software Component: Web Shell",
                "events": [
                    "UPSTYLE Backdoor"
                ]
            },
            {
                "events": [
                    "Valid Accounts (T1078)"
                ],
                "technique_id": "T1078",
                "tactic": "Lateral Movement",
                "technique_name": "Valid Accounts"
            },
            {
                "tactic": "Exfiltration",
                "technique_name": "Exfiltration Over C2 Channel",
                "technique_id": "T1041",
                "events": [
                    "HTTPS Exfiltration"
                ]
            }
        ],
        "primary_attack_path": [
            "CVE-2024-3400",
            "UPSTYLE Backdoor",
            "Valid Accounts (T1078)",
            "HTTPS Exfiltration"
        ]
    }
}
```

### kev005

```json
{
    "source_type": "report",
    "source_reliability": 0.8,
    "timestamp": "2026-10-21T01:16:26.565Z",
    "extraction_method": "graph_native_cot",
    "domain": "cti",
    "rag_used": false,
    "repro": {
        "deterministic": true,
        "temperature": 0,
        "seed": 42
    },
    "ner": {
        "entities": [
            {
                "name": "APT29",
                "stix_type": "threat-actor",
                "type": "threat_actor",
                "context": "APT29 (Cozy Bear)",
                "confidence": 0.95
            },
            {
                "confidence": 0.95,
                "name": "CVE-2020-10148",
                "context": "CVE-2020-10148, a SolarWinds Orion authentication bypass",
                "type": "vulnerability",
                "mitre_id": "CVE-2020-10148",
                "stix_type": "vulnerability"
            },
            {
                "stix_type": "malware",
                "confidence": 0.95,
                "context": "SUNBURST trojanised DLL",
                "type": "malware",
                "name": "SUNBURST"
            },
            {
                "stix_type": "infrastructure",
                "confidence": 0.9,
                "context": "supply-chain updates",
                "type": "infrastructure",
                "name": "SolarWinds Orion Updates"
            },
            {
                "context": "Application Layer Protocol (T1071)",
                "name": "Application Layer Protocol",
                "mitre_id": "T1071",
                "confidence": 0.9,
                "stix_type": "attack-pattern",
                "type": "ttp"
            },
            {
                "name": "Valid Accounts",
                "context": "valid accounts (T1078)",
                "stix_type": "attack-pattern",
                "confidence": 0.9,
                "type": "ttp",
                "mitre_id": "T1078"
            },
            {
                "context": "downstream movement",
                "name": "Downstream Movement",
                "type": "ttp",
                "confidence": 0.8,
                "stix_type": "attack-pattern"
            }
        ],
        "narrative_summary": "APT29 exploited a SolarWinds vulnerability to deploy SUNBURST, subsequently using specific TTPs for C2 and lateral movement."
    },
    "re": {
        "relations": [
            {
                "relation": "exploits",
                "target": "CVE-2020-10148",
                "confidence": 0.95,
                "edge_type": "relational",
                "source": "APT29",
                "evidence": "APT29 (Cozy Bear) abused CVE-2020-10148"
            },
            {
                "source": "APT29",
                "relation": "uses",
                "confidence": 0.95,
                "edge_type": "relational",
                "evidence": "APT29 (Cozy Bear) abused CVE-2020-10148... to insert the SUNBURST trojanised DLL",
                "target": "SUNBURST"
            },
            {
                "confidence": 0.9,
                "evidence": "insert the SUNBURST trojanised DLL into supply-chain updates",
                "source": "SUNBURST",
                "edge_type": "relational",
                "target": "SolarWinds Orion Updates",
                "relation": "drops"
            },
            {
                "evidence": "implant established C2 over Application Layer Protocol (T1071)",
                "source": "SUNBURST",
                "relation": "uses",
                "edge_type": "relational",
                "confidence": 0.9,
                "target": "T1071"
            },
            {
                "relation": "uses",
                "confidence": 0.85,
                "edge_type": "relational",
                "source": "APT29",
                "evidence": "used valid accounts (T1078) for downstream movement",
                "target": "T1078"
            }
        ]
    },
    "graph_native": {
        "nodes": [
            {
                "name": "APT29",
                "stix_type": "threat-actor",
                "type": "threat_actor",
                "context": "APT29 (Cozy Bear)",
                "confidence": 0.95
            },
            {
                "confidence": 0.95,
                "name": "CVE-2020-10148",
                "context": "CVE-2020-10148, a SolarWinds Orion authentication bypass",
                "type": "vulnerability",
                "mitre_id": "CVE-2020-10148",
                "stix_type": "vulnerability"
            },
            {
                "stix_type": "malware",
                "confidence": 0.95,
                "context": "SUNBURST trojanised DLL",
                "type": "malware",
                "name": "SUNBURST"
            },
            {
                "stix_type": "infrastructure",
                "confidence": 0.9,
                "context": "supply-chain updates",
                "type": "infrastructure",
                "name": "SolarWinds Orion Updates"
            },
            {
                "context": "Application Layer Protocol (T1071)",
                "name": "Application Layer Protocol",
                "mitre_id": "T1071",
                "confidence": 0.9,
                "stix_type": "attack-pattern",
                "type": "ttp"
            },
            {
                "name": "Valid Accounts",
                "context": "valid accounts (T1078)",
                "stix_type": "attack-pattern",
                "confidence": 0.9,
                "type": "ttp",
                "mitre_id": "T1078"
            },
            {
                "context": "downstream movement",
                "name": "Downstream Movement",
                "type": "ttp",
                "confidence": 0.8,
                "stix_type": "attack-pattern"
            }
        ],
        "edges": [
            {
                "relation": "exploits",
                "target": "CVE-2020-10148",
                "confidence": 0.95,
                "edge_type": "relational",
                "source": "APT29",
                "evidence": "APT29 (Cozy Bear) abused CVE-2020-10148"
            },
            {
                "source": "APT29",
                "relation": "uses",
                "confidence": 0.95,
                "edge_type": "relational",
                "evidence": "APT29 (Cozy Bear) abused CVE-2020-10148... to insert the SUNBURST trojanised DLL",
                "target": "SUNBURST"
            },
            {
                "confidence": 0.9,
                "evidence": "insert the SUNBURST trojanised DLL into supply-chain updates",
                "source": "SUNBURST",
                "edge_type": "relational",
                "target": "SolarWinds Orion Updates",
                "relation": "drops"
            },
            {
                "evidence": "implant established C2 over Application Layer Protocol (T1071)",
                "source": "SUNBURST",
                "relation": "uses",
                "edge_type": "relational",
                "confidence": 0.9,
                "target": "T1071"
            },
            {
                "relation": "uses",
                "confidence": 0.85,
                "edge_type": "relational",
                "source": "APT29",
                "evidence": "used valid accounts (T1078) for downstream movement",
                "target": "T1078"
            },
            {
                "target": "SUNBURST",
                "edge_type": "causal",
                "evidence": "abused CVE-2020-10148... to insert the SUNBURST trojanised DLL",
                "source": "CVE-2020-10148",
                "relation": "enables",
                "confidence": 0.8
            },
            {
                "confidence": 0.75,
                "relation": "leads_to",
                "target": "Downstream Movement",
                "edge_type": "causal",
                "evidence": "used valid accounts (T1078) for downstream movement",
                "source": "T1078"
            },
            {
                "edge_type": "temporal",
                "target": "SUNBURST",
                "evidence": "abused CVE-2020-10148... to insert the SUNBURST trojanised DLL",
                "relation": "precedes",
                "confidence": 0.9,
                "source": "CVE-2020-10148"
            }
        ],
        "subgraphs": [
            {
                "type": "attack_chain",
                "node_ids": [
                    "APT29",
                    "CVE-2020-10148",
                    "SUNBURST",
                    "SolarWinds Orion Updates"
                ],
                "name": "SUNBURST Deployment Chain"
            },
            {
                "name": "Post-Exploitation TTPs",
                "type": "ttp_profile",
                "node_ids": [
                    "SUNBURST",
                    "T1071",
                    "T1078",
                    "Downstream Movement"
                ]
            }
        ],
        "graph_metadata": {
            "density": 0.16,
            "narrative": "APT29 exploited a SolarWinds vulnerability to deploy SUNBURST, subsequently using specific TTPs for C2 and lateral movement.",
            "edge_count": 8,
            "node_count": 7,
            "stix_compliance": 1
        },
        "graph_warnings": [],
        "reasoning_trace": "Step 1: Seeded triples (APT29, exploits, CVE-2020-10148) and (APT29, uses, SUNBURST). Step 2: Expanded nodes to include T1071, T1078, and SolarWinds Updates based on STIX SDOs. Step 3: Inferred relational edges for C2 and lateral movement. Step 4: Established temporal order where vulnerability exploitation precedes malware insertion. Step 5: Fused temporal and relational data to identify 'enables' and 'leads_to' causal links. Step 6: Validated graph for STIX compliance and evidence coverage. Step 7: Propagated confidence from source (0.8) and textual clarity. Step 8: Serialized to final KG."
    },
    "causality": {
        "causal_links": [
            {
                "causal_type": "enables",
                "evidence": "abused CVE-2020-10148... to insert the SUNBURST trojanised DLL",
                "cause": "CVE-2020-10148",
                "effect": "SUNBURST",
                "mitre_tactic": "Initial Access",
                "temporal_order": 1,
                "confidence": 0.855
            },
            {
                "cause": "SUNBURST",
                "evidence": "insert the SUNBURST trojanised DLL into supply-chain updates",
                "causal_type": "leads_to",
                "effect": "SolarWinds Orion Updates",
                "confidence": 0.8075,
                "mitre_tactic": "Resource Development",
                "temporal_order": 2
            },
            {
                "evidence": "implant established C2 over Application Layer Protocol (T1071)",
                "mitre_tactic": "Command and Control",
                "cause": "SUNBURST",
                "confidence": 0.81,
                "temporal_order": 3,
                "effect": "Application Layer Protocol (T1071)",
                "causal_type": "enables"
            },
            {
                "temporal_order": 4,
                "causal_type": "enables",
                "effect": "Valid Accounts (T1078)",
                "evidence": "C2 infrastructure used to facilitate credential usage",
                "cause": "Application Layer Protocol (T1071)",
                "mitre_tactic": "Credential Access",
                "confidence": 0.81
            },
            {
                "evidence": "used valid accounts (T1078) for downstream movement",
                "temporal_order": 5,
                "confidence": 0.765,
                "mitre_tactic": "Lateral Movement",
                "cause": "Valid Accounts (T1078)",
                "effect": "Downstream Movement",
                "causal_type": "leads_to"
            }
        ],
        "attack_timeline": [
            {
                "certainty": "narrative_order",
                "event": "APT29 exploits CVE-2020-10148 authentication bypass",
                "order": 1
            },
            {
                "certainty": "narrative_order",
                "order": 2,
                "event": "Insertion of SUNBURST trojanised DLL into SolarWinds Orion Updates"
            },
            {
                "certainty": "narrative_order",
                "event": "SUNBURST establishes C2 via Application Layer Protocol (T1071)",
                "order": 3
            },
            {
                "certainty": "narrative_order",
                "event": "APT29 uses Valid Accounts (T1078) for downstream movement",
                "order": 4
            }
        ],
        "kill_chain_mapping": [
            {
                "events": [
                    "CVE-2020-10148"
                ],
                "technique_id": "T1190",
                "technique_name": "Exploit Public-Facing Application",
                "tactic": "Initial Access"
            },
            {
                "technique_id": "T1587.002",
                "technique_name": "Develop Capabilities: Malware",
                "events": [
                    "SolarWinds Orion Updates"
                ],
                "tactic": "Resource Development"
            },
            {
                "tactic": "Command and Control",
                "events": [
                    "Application Layer Protocol (T1071)"
                ],
                "technique_name": "Application Layer Protocol",
                "technique_id": "T1071"
            },
            {
                "tactic": "Lateral Movement",
                "technique_id": "T1078",
                "events": [
                    "Valid Accounts (T1078)",
                    "Downstream Movement"
                ],
                "technique_name": "Valid Accounts"
            }
        ],
        "primary_attack_path": [
            "CVE-2020-10148",
            "SUNBURST",
            "Application Layer Protocol (T1071)",
            "Valid Accounts (T1078)",
            "Downstream Movement"
        ]
    }
}
```

### hard001

```json
{
    "source_type": "report",
    "source_reliability": 0.8,
    "timestamp": "2026-10-21T01:16:37.425Z",
    "extraction_method": "graph_native_cot",
    "domain": "cti",
    "rag_used": false,
    "repro": {
        "deterministic": true,
        "temperature": 0,
        "seed": 42
    },
    "ner": {
        "entities": [
            {
                "type": "threat_actor",
                "context": "tracked by one vendor as TEMP.Hex",
                "name": "TEMP.Hex",
                "stix_type": "threat-actor",
                "confidence": 0.9
            },
            {
                "stix_type": "threat-actor",
                "type": "threat_actor",
                "name": "APT-C-23",
                "context": "separately by another vendor as part of the group it calls APT-C-23",
                "confidence": 0.9
            },
            {
                "name": "Gaza Cybergang",
                "type": "threat_actor",
                "confidence": 0.6,
                "context": "overlap with the Gaza Cybergang umbrella",
                "stix_type": "threat-actor"
            },
            {
                "confidence": 0.9,
                "name": "Pierogi-linked Loader",
                "stix_type": "malware",
                "type": "malware",
                "context": "deploying a loader that some researchers link to the Pierogi backdoor family"
            },
            {
                "stix_type": "malware",
                "context": "Pierogi backdoor family, though others argue the code overlap is insufficient",
                "confidence": 0.5,
                "type": "malware",
                "name": "Pierogi Backdoor"
            },
            {
                "type": "vulnerability",
                "name": "Unspecified Office Vulnerability",
                "context": "unspecified Office vulnerability",
                "confidence": 0.85,
                "stix_type": "vulnerability"
            },
            {
                "context": "possibly CVE-2017-0199",
                "confidence": 0.7,
                "type": "vulnerability",
                "stix_type": "vulnerability",
                "name": "CVE-2017-0199",
                "mitre_id": "CVE-2017-0199"
            },
            {
                "confidence": 0.9,
                "name": "Shared Infrastructure",
                "type": "infrastructure",
                "context": "beaconed to infrastructure previously associated with both criminal spam operations and state-aligned espionage",
                "stix_type": "infrastructure"
            },
            {
                "name": "Criminal Spam Operations",
                "stix_type": "identity",
                "confidence": 0.8,
                "type": "identity",
                "context": "criminal spam operations"
            },
            {
                "context": "state-aligned espionage",
                "type": "identity",
                "name": "State-aligned Espionage Identity",
                "confidence": 0.8,
                "stix_type": "identity"
            }
        ],
        "narrative_summary": "The graph depicts a complex attribution landscape where TEMP.Hex/APT-C-23 (potentially Gaza Cybergang) utilizes a Pierogi-linked loader. The loader exploits Office vulnerabilities to communicate with infrastructure shared between criminal and state-aligned actors, creating attribution ambiguity."
    },
    "re": {
        "relations": [
            {
                "evidence": "tracked by one vendor as TEMP.Hex, and separately by another vendor as part of the group it calls APT-C-23",
                "edge_type": "relational",
                "source": "TEMP.Hex",
                "confidence": 0.9,
                "relation": "related-to",
                "target": "APT-C-23"
            },
            {
                "relation": "related-to",
                "edge_type": "relational",
                "confidence": 0.6,
                "source": "APT-C-23",
                "evidence": "third firm assesses with only moderate confidence to overlap with the Gaza Cybergang umbrella",
                "target": "Gaza Cybergang"
            },
            {
                "edge_type": "relational",
                "source": "TEMP.Hex",
                "evidence": "observed deploying a loader",
                "relation": "uses",
                "confidence": 0.9,
                "target": "Pierogi-linked Loader"
            },
            {
                "relation": "related-to",
                "target": "Pierogi Backdoor",
                "confidence": 0.5,
                "edge_type": "relational",
                "source": "Pierogi-linked Loader",
                "evidence": "some researchers link to the Pierogi backdoor family, though others argue the code overlap is insufficient"
            },
            {
                "evidence": "loader was delivered via documents exploiting an unspecified Office vulnerability",
                "target": "Unspecified Office Vulnerability",
                "confidence": 0.85,
                "edge_type": "relational",
                "source": "Pierogi-linked Loader",
                "relation": "exploits"
            },
            {
                "relation": "related-to",
                "confidence": 0.7,
                "derived_from": "exploits -> possibly CVE-2017-0199",
                "source": "Unspecified Office Vulnerability",
                "target": "CVE-2017-0199",
                "edge_type": "inferred"
            },
            {
                "relation": "communicates-with",
                "target": "Shared Infrastructure",
                "confidence": 0.9,
                "edge_type": "relational",
                "evidence": "beaconed to infrastructure previously associated with both criminal spam operations and state-aligned espionage",
                "source": "Pierogi-linked Loader"
            },
            {
                "relation": "attributed-to",
                "confidence": 0.8,
                "source": "Shared Infrastructure",
                "edge_type": "relational",
                "target": "Criminal Spam Operations",
                "evidence": "infrastructure previously associated with both criminal spam operations"
            },
            {
                "target": "State-aligned Espionage Identity",
                "confidence": 0.8,
                "relation": "attributed-to",
                "edge_type": "relational",
                "evidence": "infrastructure previously associated with... state-aligned espionage",
                "source": "Shared Infrastructure"
            }
        ]
    },
    "graph_native": {
        "nodes": [
            {
                "type": "threat_actor",
                "context": "tracked by one vendor as TEMP.Hex",
                "name": "TEMP.Hex",
                "stix_type": "threat-actor",
                "confidence": 0.9
            },
            {
                "stix_type": "threat-actor",
                "type": "threat_actor",
                "name": "APT-C-23",
                "context": "separately by another vendor as part of the group it calls APT-C-23",
                "confidence": 0.9
            },
            {
                "name": "Gaza Cybergang",
                "type": "threat_actor",
                "confidence": 0.6,
                "context": "overlap with the Gaza Cybergang umbrella",
                "stix_type": "threat-actor"
            },
            {
                "confidence": 0.9,
                "name": "Pierogi-linked Loader",
                "stix_type": "malware",
                "type": "malware",
                "context": "deploying a loader that some researchers link to the Pierogi backdoor family"
            },
            {
                "stix_type": "malware",
                "context": "Pierogi backdoor family, though others argue the code overlap is insufficient",
                "confidence": 0.5,
                "type": "malware",
                "name": "Pierogi Backdoor"
            },
            {
                "type": "vulnerability",
                "name": "Unspecified Office Vulnerability",
                "context": "unspecified Office vulnerability",
                "confidence": 0.85,
                "stix_type": "vulnerability"
            },
            {
                "context": "possibly CVE-2017-0199",
                "confidence": 0.7,
                "type": "vulnerability",
                "stix_type": "vulnerability",
                "name": "CVE-2017-0199",
                "mitre_id": "CVE-2017-0199"
            },
            {
                "confidence": 0.9,
                "name": "Shared Infrastructure",
                "type": "infrastructure",
                "context": "beaconed to infrastructure previously associated with both criminal spam operations and state-aligned espionage",
                "stix_type": "infrastructure"
            },
            {
                "name": "Criminal Spam Operations",
                "stix_type": "identity",
                "confidence": 0.8,
                "type": "identity",
                "context": "criminal spam operations"
            },
            {
                "context": "state-aligned espionage",
                "type": "identity",
                "name": "State-aligned Espionage Identity",
                "confidence": 0.8,
                "stix_type": "identity"
            }
        ],
        "edges": [
            {
                "evidence": "tracked by one vendor as TEMP.Hex, and separately by another vendor as part of the group it calls APT-C-23",
                "edge_type": "relational",
                "source": "TEMP.Hex",
                "confidence": 0.9,
                "relation": "related-to",
                "target": "APT-C-23"
            },
            {
                "relation": "related-to",
                "edge_type": "relational",
                "confidence": 0.6,
                "source": "APT-C-23",
                "evidence": "third firm assesses with only moderate confidence to overlap with the Gaza Cybergang umbrella",
                "target": "Gaza Cybergang"
            },
            {
                "edge_type": "relational",
                "source": "TEMP.Hex",
                "evidence": "observed deploying a loader",
                "relation": "uses",
                "confidence": 0.9,
                "target": "Pierogi-linked Loader"
            },
            {
                "relation": "related-to",
                "target": "Pierogi Backdoor",
                "confidence": 0.5,
                "edge_type": "relational",
                "source": "Pierogi-linked Loader",
                "evidence": "some researchers link to the Pierogi backdoor family, though others argue the code overlap is insufficient"
            },
            {
                "evidence": "loader was delivered via documents exploiting an unspecified Office vulnerability",
                "target": "Unspecified Office Vulnerability",
                "confidence": 0.85,
                "edge_type": "relational",
                "source": "Pierogi-linked Loader",
                "relation": "exploits"
            },
            {
                "relation": "related-to",
                "confidence": 0.7,
                "derived_from": "exploits -> possibly CVE-2017-0199",
                "source": "Unspecified Office Vulnerability",
                "target": "CVE-2017-0199",
                "edge_type": "inferred"
            },
            {
                "relation": "communicates-with",
                "target": "Shared Infrastructure",
                "confidence": 0.9,
                "edge_type": "relational",
                "evidence": "beaconed to infrastructure previously associated with both criminal spam operations and state-aligned espionage",
                "source": "Pierogi-linked Loader"
            },
            {
                "relation": "attributed-to",
                "confidence": 0.8,
                "source": "Shared Infrastructure",
                "edge_type": "relational",
                "target": "Criminal Spam Operations",
                "evidence": "infrastructure previously associated with both criminal spam operations"
            },
            {
                "target": "State-aligned Espionage Identity",
                "confidence": 0.8,
                "relation": "attributed-to",
                "edge_type": "relational",
                "evidence": "infrastructure previously associated with... state-aligned espionage",
                "source": "Shared Infrastructure"
            },
            {
                "edge_type": "causal",
                "target": "Shared Infrastructure",
                "evidence": "loader was delivered via documents exploiting... and beaconed to infrastructure",
                "confidence": 0.8,
                "source": "Unspecified Office Vulnerability",
                "relation": "leads_to"
            }
        ],
        "subgraphs": [
            {
                "node_ids": [
                    "TEMP.Hex",
                    "APT-C-23",
                    "Gaza Cybergang"
                ],
                "name": "Attribution Cluster",
                "type": "campaign_cluster"
            },
            {
                "type": "attack_chain",
                "name": "Infection Chain",
                "node_ids": [
                    "Pierogi-linked Loader",
                    "Unspecified Office Vulnerability",
                    "CVE-2017-0199",
                    "Shared Infrastructure"
                ]
            }
        ],
        "graph_metadata": {
            "node_count": 10,
            "narrative": "The graph depicts a complex attribution landscape where TEMP.Hex/APT-C-23 (potentially Gaza Cybergang) utilizes a Pierogi-linked loader. The loader exploits Office vulnerabilities to communicate with infrastructure shared between criminal and state-aligned actors, creating attribution ambiguity.",
            "edge_count": 10,
            "stix_compliance": 1,
            "density": 0.11
        },
        "graph_warnings": [],
        "reasoning_trace": "Step 1: Seeded triples connecting TEMP.Hex, APT-C-23, and the Pierogi-linked loader. Step 2: Expanded nodes to include Gaza Cybergang (identity/actor), CVE-2017-0199 (vulnerability), and infrastructure. Step 3: Established relational edges for delivery and beaconing. Step 4: Inferred temporal sequence from delivery (exploit) to beaconing (C2). Step 5: Fused temporal and relational data into causal 'leads_to' edge for the exploit-to-C2 transition. Step 6: Validated STIX types and evidence spans. Step 7: Propagated confidence, noting lower confidence for Gaza Cybergang and Pierogi family links due to textual caveats. Step 8: Serialized to JSON."
    },
    "causality": {
        "causal_links": [
            {
                "cause": "Unspecified Office Vulnerability",
                "evidence": "loader was delivered via documents exploiting an unspecified Office vulnerability",
                "confidence": 0.765,
                "mitre_tactic": "Initial Access",
                "effect": "Pierogi-linked Loader",
                "causal_type": "enables",
                "temporal_order": 2
            },
            {
                "evidence": "beaconed to infrastructure previously associated with both criminal spam operations and state-aligned espionage",
                "effect": "Shared Infrastructure",
                "cause": "Pierogi-linked Loader",
                "causal_type": "leads_to",
                "mitre_tactic": "Command and Control",
                "temporal_order": 3,
                "confidence": 0.765
            },
            {
                "confidence": 0.81,
                "evidence": "observed deploying a loader... delivered via documents exploiting...",
                "cause": "TEMP.Hex",
                "effect": "Unspecified Office Vulnerability",
                "temporal_order": 1,
                "causal_type": "enables",
                "mitre_tactic": "Resource Development"
            }
        ],
        "attack_timeline": [
            {
                "event": "TEMP.Hex prepares malicious documents exploiting Office vulnerabilities.",
                "order": 1,
                "certainty": "narrative_order"
            },
            {
                "event": "Exploitation of Unspecified Office Vulnerability (possibly CVE-2017-0199).",
                "order": 2,
                "certainty": "explicit_timestamp"
            },
            {
                "event": "Pierogi-linked Loader is deployed/executed on the target system.",
                "order": 3,
                "certainty": "narrative_order"
            },
            {
                "certainty": "narrative_order",
                "order": 4,
                "event": "Pierogi-linked Loader establishes communication with Shared Infrastructure."
            }
        ],
        "kill_chain_mapping": [
            {
                "tactic": "Resource Development",
                "technique_name": "Develop Capabilities",
                "events": [
                    "TEMP.Hex"
                ]
            },
            {
                "tactic": "Initial Access",
                "technique_id": "T1566.001",
                "events": [
                    "Unspecified Office Vulnerability",
                    "CVE-2017-0199"
                ],
                "technique_name": "Phishing: Spearphishing Attachment"
            },
            {
                "technique_id": "T1203",
                "technique_name": "Exploitation for Client Execution",
                "tactic": "Execution",
                "events": [
                    "Pierogi-linked Loader"
                ]
            },
            {
                "technique_id": "T1071.001",
                "technique_name": "Application Layer Protocol: Web Protocols",
                "events": [
                    "Shared Infrastructure"
                ],
                "tactic": "Command and Control"
            }
        ],
        "primary_attack_path": [
            "TEMP.Hex",
            "Unspecified Office Vulnerability",
            "Pierogi-linked Loader",
            "Shared Infrastructure"
        ]
    }
}
```
