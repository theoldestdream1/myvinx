# Roadmap

## Milestone 3
- [ ] Memory lifecycle: implemented edit notes/insights, Trash, restore, permanent deletion; automated checks run, real signed-in flow blocked by externally managed authentication
- [ ] Recurring reminders and flexible snooze
- [ ] Link reading and summaries
- [ ] Timeline filters and tag management
- [ ] Decide location-trigger approach

Completion gate: run relevant tests, regressions, and real signed-in flows; keep unverified work open.

- [x] Move Vinx onto this project (screens, database, storage, server functions, schedule)
- [ ] Bring over existing users and memories — waiting on export from the old backend
- [ ] Add service keys (phone notifications, Telegram, email) — waiting on user
- [ ] Port the web and server test suites
- [ ] Signed-in end-to-end check (capture → ask → reminder)
