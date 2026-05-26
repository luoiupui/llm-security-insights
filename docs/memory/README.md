# Project Memory (GitHub mirror)

This folder is the GitHub-visible mirror of the Lovable agent's project memory (`mem://...`).

- **Source of truth**: `mem://...` entries, edited by the Lovable agent at runtime.
- **This mirror**: serialized snapshot for version control, review, and diffing on GitHub.
- **Refresh**: manual. Ask the agent to "re-export memory" after meaningful changes.
- **Editing here directly**: ask the agent to re-import so `mem://` stays in sync.

## Layout

- `index.md` — mirror of `mem://index.md` (Core rules + references).
- `style/`, `features/`, `architecture/`, `constraints/` — one file per memory entry.

Each file carries frontmatter with its `mem_path`, `name`, `type`, and `exported_at` date.

## Related version-controlled docs

- `../../public/reports/white-paper.md` — White paper, §8 covers the security hardening and forward path to privacy-preserving FL on clinical data.
- `../roadmap/security_privacy_roadmap.mmd` — Mermaid roadmap: Now → Short → Mid → Long term, with documented swap-points (simulated component → real library) so the project ships as ports, not throwaway prototypes.
