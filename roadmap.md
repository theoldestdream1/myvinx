# Roadmap

## Shared video understanding
- [ ] Route TikTok, YouTube/Shorts and Instagram/Reels through public metadata and available caption extractors; preserve immediate saving.
- [ ] Index recovered evidence for recall; expose unavailable/metadata-only states rather than implying the video was watched.
- [ ] Test parser, redirects, blocked destinations, fallbacks and caption limits; deploy and re-read the two reported TikTok memories.
- [ ] Verify capture → processing → recall live; signed-in browser and physical share checks require external-account access.

## App polish
- [ ] Reminder activation, test alerts and preferences exposed directly in Reminders; handler/failure tests pass. Real delivery and signed-in preference readback blocked by external authentication and physical devices.
- [x] Mobile and desktop destinations unified, including Pricing; all nine mobile links checked in browser and navigation tests.
- [ ] V visibility/captions/replay wired and idle work paused during scrolling/typing; automated visibility checks pass. Signed-in controls and low-end device performance remain unverified.
- [x] Dark/light/system appearance and crystal surfaces added; persistence tests and mobile/desktop browser checks pass with no horizontal overflow or runtime errors.
- [ ] Skippable, replayable, user-scoped six-stop V tour added; automatic start, navigation, finish, skip and replay tests pass. Real signed-in onboarding blocked by external authentication.
- [x] Regression suite: 73 tests passed; public mobile/desktop browser flow and route metadata checked. No claim of complete signed-in or physical-device verification.

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
