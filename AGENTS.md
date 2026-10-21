# AGENTS.md

- Dirty-data entity filters (L1 identifier hygiene in kb-validate, L2 reliability drop in threat-conflicts) live in one pure shared module under `supabase/functions/_shared/` so edge functions and vitest use the same rules; why: the v1 study showed script-only filters drift from the live system.
- Edge functions that read reference tables (e.g. `kb_entries`) must page through results, not rely on one select; why: each Data API request returns at most 1,000 rows.
