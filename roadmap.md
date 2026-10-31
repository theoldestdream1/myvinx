# Roadmap

## App polish
- [ ] Expose reminder activation, test alerts and preferences directly in Reminders.
- [ ] Match mobile and desktop destinations, including Pricing.
- [ ] Wire V visibility/captions and replay controls; reduce idle work during scrolling/typing.
- [ ] Add dark/light/system appearance and crystal-aligned surfaces.
- [ ] Add a skippable, replayable V-led new-user tour.
- [ ] Run regression tests and public browser checks; signed-in/device checks require external authentication and real devices.

## Launch accessibility
- [ ] Web push: stable signing configured and live public configuration verified; subscription, encryption, Done/Snooze and failure checks pass. Blocked on publishing frontend changes, signed-in registration and real-device delivery (external auth provides no session).
- [ ] iPhone capture: three unsigned creator templates served, setup questions and request format inspected, connection-test button implemented. Blocked on Apple signing/iCloud links and iPhone execution; manual setup remains available.

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
