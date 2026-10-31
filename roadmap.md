# Roadmap

## Launch accessibility
- [ ] Web push: configure stable signing keys, test subscription lifecycle and worker actions; physical-device delivery and signed-in registration must be verified
- [ ] iPhone capture: prepare three shortcut templates and installation access; Apple-signed/iCloud installation requires an Apple device and real-device validation

## Milestone 3
- [ ] Memory lifecycle: implemented edit notes/insights, Trash, restore, permanent deletion; automated checks run, real signed-in flow blocked by externally managed authentication
- [ ] Recurring reminders and flexible snooze: built; 39 app tests pass plus rollback-only database checks for recurrence, custom intervals, month-end, DST, missed dates, snooze, duplicate completion, one-offs, and Trash; signed-in end-to-end and real notification delivery remain unverified because external authentication supplies no test session
- [x] Link reading and summaries (built; awaiting signed-in live capture test)
- [ ] Timeline filters and tag management
- [ ] Decide location-trigger approach

Completion gate: run relevant tests, regressions, and real signed-in flows; keep unverified work open.

- [x] Move Vinx onto this project (screens, database, storage, server functions, schedule)
- [ ] Bring over existing users and memories — waiting on export from the old backend
- [ ] Add service keys (phone notifications, Telegram, email) — waiting on user
- [ ] Port the web and server test suites
- [ ] Signed-in end-to-end check (capture → ask → reminder)
