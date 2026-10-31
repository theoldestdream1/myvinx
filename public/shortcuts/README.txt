Vinx iPhone shortcut creator templates

These files are UNSIGNED creator templates, not verified iPhone installers.
Compiled with Cherri 2.3.0; editable .cherri source is included.
Never embed your own capture key before sharing a shortcut. Each recipient must
enter their own key from Vinx > Settings > Siri & Back Tap at import/setup.

Apple publishing step (Mac with Shortcuts):
1. Download the three *-unsigned.shortcut files.
2. Sign each with Apple's command, for example:
   shortcuts sign --mode anyone --input tell-v-unsigned.shortcut --output "Tell V.shortcut"
3. Open the signed file in Shortcuts and inspect all actions and its Setup question.
4. On an iPhone, test Siri dictation, a screenshot, a URL, text and one photo.
   Allow microphone/network access as needed. Siri may require unlocking.
   Confirm the saved memory appears in Timeline; errors must not say "Saved".
5. Reset any personal key to YOUR_KEY before sharing. Share from Shortcuts,
   copy the iCloud link, and provide the three links to enable Vinx's installers.

The screenshot template uploads PNG as base64 JSON. Save to V branches by
input type; verify the Image branch on your device, since app-provided types
can differ. For unsupported input types use Vinx directly or the manual guide.
Internet access is required; files have the existing 10 MB image limit.
Apple signing and real-device execution have not been performed here.