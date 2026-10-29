# Vinx browser extension (Chrome, Edge, Brave, Arc)

Save the page, a selection, a link, an image or a screenshot to V in one click.

## Install (developer mode, until it is published to the Chrome Web Store)
1. Open `chrome://extensions`, switch on **Developer mode**, choose **Load unpacked**, and pick this `extension/` folder.
2. In Vinx go to **Settings → Quick capture**: copy the capture URL and create a device key.
3. Click the extension's icon → **Settings** and paste both. Press **Send a test**.

## Use
- Click the icon: add a note, **Save this page**, **Screenshot** (the visible part of the tab) or **Save note only**.
- **Ctrl/Cmd+Shift+M** opens the box. **Ctrl/Cmd+Shift+S** saves the current page (and any selected text) without opening it.
- Right-click a selection, link, image or the page → **Save … to V**.
- Offline? Items are kept in the browser and retried every few minutes (same id, so no duplicates).

Passwords, card numbers and one-time codes are filtered out by the server before anything is stored.

## Publish
Add 16/48/128px icons in `icons/`, zip this folder, and upload it at https://chrome.google.com/webstore/devconsole.
