<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The original Vinx upload is kept read-only in `vinx/` for reference; it is excluded from the build. Live code is in `src/` and `supabase/`.
- App screens live in `src/screens/` and are mounted by thin route files in `src/routes/` (all `ssr: false`, since they rely on browser APIs and the localStorage session).
- Screens keep react-router-style navigation through `src/lib/router-compat.tsx`, an adapter over TanStack Router; never install react-router-dom.
- Memory lifecycle uses an owner-scoped atomic database RPC with timestamp conflict checks; inherited Trash visibility protects derived insights, vectors, and reminders, including background writes.
- Permanent memory deletion queues attachment cleanup transactionally; owner-scoped retries run when Timeline opens so storage failures remain recoverable.
- Reminder recurrence advances atomically in a database trigger on first completion; all delivery channels share it, retaining an original wall-clock anchor and occurrence history to avoid snooze drift and duplicate successors.
- Backend logic stays in the existing Supabase edge functions under `supabase/functions/` (17 functions with their own auth); scheduled jobs authenticate with a vault-held secret checked by `verify_cron_secret`.
- Web push derives a stable P-256 signing pair from the encrypted app-only seed (or existing paired keys); only the public key is returned by the reminder configuration endpoint, avoiding frontend key drift.
- The device service worker handles messaging and Android share transport only; it removes legacy Vinx shell caches without caching HTML or assets, preventing stale sessions and pages.
- iOS shortcut downloads are explicitly unsigned creator templates with per-recipient import questions; installation buttons accept only genuine iCloud URLs, and success feedback requires a returned memory ID.
