# Export memory to version-controlled files

Lovable memory (`mem://...`) lives in Lovable's internal store and is not in the Git repo. To put it under GitHub version control, serialize each memory entry to a real markdown file under `docs/memory/`.

## Target layout

```text
docs/memory/
  README.md                       # what this folder is, sync convention
  index.md                        # mirror of mem://index.md
  style/
    visual-identity.md
  features/
    threat-intelligence.md
    thesis-generation.md
    causality-reasoning.md
    clinical-mode.md
    kg-bench.md
    security-posture.md           # NEW hardening doc
    privacy-fl-lab.md             # NEW DP/FL doc
  architecture/
    threat-reasoning.md
    system-layers.md
    llm-strategy.md
    backend-services.md
    agent-harness.md
  constraints/
    outline-alignment.md
```

Each file = exact serialized body of the matching `mem://` entry, with frontmatter:

```md
---
mem_path: mem://features/security-posture
name: Security Posture
type: feature
exported_at: 2026-05-26
---
<body copied verbatim from mem://...>
```

## Steps

1. Create `docs/memory/` with the tree above.
2. For each memory referenced in `mem://index.md`, read it and write the corresponding `.md` file with frontmatter + body.
3. Write `docs/memory/index.md` mirroring `mem://index.md` but rewriting links from `mem://features/security-posture` → `./features/security-posture.md`.
4. Write `docs/memory/README.md` explaining:
   - These files are the GitHub-visible mirror of Lovable project memory.
   - Source of truth = `mem://...` (edited by the Lovable agent).
   - Mirror is refreshed on request ("re-export memory") — not automatic.
   - When editing in GitHub directly, ask the agent to re-import so `mem://` stays in sync.
5. Also link the two new docs already on disk so they are discoverable from `docs/memory/README.md`:
   - `public/reports/white-paper.md` (§8 hardening)
   - `/mnt/documents/security_privacy_roadmap.mmd` — note: this path is the sandbox artifact store, not the repo. Plan copies it to `docs/roadmap/security_privacy_roadmap.mmd` so it ships in Git.

## Out of scope

- No automatic two-way sync between `mem://` and `docs/memory/`. Re-export is a manual command.
- No code changes; docs only.
