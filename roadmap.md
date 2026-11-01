# Roadmap

## iPhone fast sharing and loading check
- [x] Build link-only unsigned creator template and manual iPhone recipe; served download parsed successfully, four action/confirmation tests and all 105 app tests pass; preview build OK.
- [ ] Sign/publish the shortcut with Apple and verify real share → native notification → Timeline readback on iPhone; blocked by Apple tooling/device and external-account access. No speed guarantee.
- [ ] Resolve reported blank editor preview; local, published and custom-domain pages load, mobile app navigation/reload verified without runtime errors. Live editor inspection timed out, then viewers disconnected; no reproducible app failure or confirmed fix.

## Fast sharing
- [x] Streamline link/text saving and confirmation without waiting for AI; initial capture uses one database request, session/cache reads overlap, and automatic close is attempted 350 ms after confirmation. Retry, Undo and signed-out handoff covered.
- [x] Test save/error/offline/close paths: 105 regression tests pass; browser confirms signed-out handoff retains the payload with no runtime errors; preview build OK.
- [ ] Measure physical Android launch-to-return timing and signed-in live saving; blocked by device/account access. Under-three-second target and automatic return are not guaranteed on slow networks or browsers that refuse closing. Audio transcription and image uploads still add latency.

## Shared video understanding
- [x] Route TikTok, YouTube/Shorts and Instagram/Reels through public metadata and available caption extractors; preserve immediate saving. Real TikTok and YouTube metadata verified; platform blocks remain possible.
- [x] Index recovered evidence for recall; expose unavailable/metadata-only states rather than implying the video was watched. Timeline includes Re-read link; interaction/readback test passes.
- [x] Test parser, redirects, blocked destinations, fallbacks and caption limits; 95 app tests and 3 Deno auth tests pass, preview build OK. Both reported TikToks reprocessed in deployed functions and V recalled exact captions/creators with citations; unauthenticated processing rejected.
- [ ] Verify fresh physical share → processing → recall through signed-in UI; blocked by external-account session access. Existing real shares → deployed processing → actual recall verified using authenticated internal-job calls, not a browser session.
- [ ] Full audiovisual video understanding is not implemented: metadata is not dialogue or scene analysis. Requires an accessible media/transcription source; private or blocked Instagram/TikTok content cannot be promised with anonymous HTTP readers. YouTube captions supported when exposed; live caption and Instagram availability remain unverified.
- [ ] DNS preflight and redirect checks reject private destinations, but fetch does not pin DNS addresses; DNS rebinding protection needs runtime-supported pinning or an isolated fetch service.

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
