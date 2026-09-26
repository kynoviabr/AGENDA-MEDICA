# Pre-baseline migration archive

This directory preserves the complete database history that preceded the clean Aura baseline dated 2026-08-20.

- Reference checkpoint: `aura-pre-baseline-cleanup-2026-08-20` (`5a41ca4`).
- Cleanup report commit: `e083a11`.
- Archived files: 85 total — 82 SQL migrations and three historical `.txt` duplicates.
- The transitional cleanup `20260820152853_aura_baseline_cleanup_transition.sql` is archived here intentionally.

Files in this directory are evidence and must **not** be applied to new Aura environments. `supabase db reset` reads only `supabase/migrations/`, whose first migration is the clean baseline. To inspect earlier design decisions, use Git history, the checkpoint tag and the audit/cleanup documents; never move an archived migration back into the active chain to repair a missing baseline object.

After a shared environment is created from the clean baseline, the baseline is immutable. Every new database change must be a forward-only `timestamp_feature.sql` migration created with the Supabase CLI.
