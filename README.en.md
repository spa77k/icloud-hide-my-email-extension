# iCloud+ Hide My Email Creator & Copier

[日本語](README.md) | [简体中文](README.zh-CN.md) | [한국어](README.ko.md)

A Chrome extension that creates an iCloud+ Hide My Email address labeled with the current site and copies it to the clipboard. It uses Manifest V3.

- It takes **two clicks** in the extension (toolbar icon → “Create and copy”). When creation succeeds, the popup copies the address automatically.
- Normal creation does not bring the iCloud tab to the front. It reuses an existing iCloud tab in the background, or opens an inactive tab if none exists.
- Double clicks and casual retries are blocked to avoid creating the same address twice.
- It never handles passwords or verification codes. You sign in yourself on Apple’s sign-in page.
- It does not send the created address to any external service. The address is kept only in the browser session.

## Requirements

1. Google Chrome 120 or later
2. An iCloud+ subscription (personal or Family Sharing)
3. Two-factor authentication for your Apple Account
4. The Chrome profile you normally use must be able to sign in to iCloud

Two-factor authentication is required. If iCloud+ is active but Hide My Email does not appear on iCloud.com, web-only access or another Apple restriction may apply.

## Install

This repository includes a ready-to-load `dist/` directory. No build is required.

To use the release zip from [GitHub Releases](https://github.com/spa77k/icloud-hide-my-email-extension/releases), extract it and select the extracted folder in step 4.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `dist` folder in this project.
5. Pin “iCloud+ Hide My Email Creator & Copier” from the extensions menu.

To rebuild from source:

```bash
npm install
npm run build
```

This updates `dist/`. Reload the extension from `chrome://extensions` to apply the changes.

## Usage

1. Open the site where you want to enter an email address.
2. Click the extension icon in the toolbar.
3. Check the label. The current tab’s host name (for example, `example.com`) is filled in automatically. Edit it if needed.
4. Click **Create and copy**. The current site and the popup stay in place.
5. The first run may require an Apple sign-in. Click **Open iCloud** in the popup, sign in on the iCloud tab that comes to the front, then return to the popup and click **Create and copy** again.
6. When the address is created, it appears in the popup and is copied to the clipboard automatically. If it was not copied, click **Copy**.

The iCloud tab remains open in the background. To inspect it, use **Check in iCloud** in the popup.

### If you close the popup

Closing the popup during creation does not cancel the job. Reopen the popup after it finishes to see the result and copy the address.

### Clicks and timing

- Extension-side actions: **two clicks** (icon, create button). If automatic copying succeeds, no copy action is needed.
- Creation time against a real iCloud+ account has not been measured. It depends on your connection and iCloud’s response.

## How it works

The extension does not use a public Apple API. It operates the official iCloud.com web interface.

1. Prepare an `icloud.com/icloudplus` tab in the background (reuse an existing tab, or open an inactive one).
2. Open Hide My Email.
3. Open the new-address form.
4. Enter the label.
5. Click **Create email address**.
6. Match the candidate address shown in the form with the confirmed result (a list item’s label heading plus address, or the Hide My Email field on the created-address detail screen). Read only the address created for this job, then copy it from the focused popup.

Candidates are read only from inside the creation dialog. Forwarding addresses, the account email, the existing list, memo fields, and hidden addresses are never treated as candidates or results. After confirmation, the extension only reports success when the retained candidate matches and either a list item has exactly the same label heading or the created-address detail screen shows the Hide My Email field. If it cannot identify a single candidate, the candidate changes at confirmation time, or no matching result can be confirmed, it stops as **Unconfirmed** and does not copy anything.

Clipboard access may be unavailable in a background tab, so copying happens in the popup. Candidate addresses shown before confirmation are never copied; only the confirmed address is copied.

The extension does not call private APIs directly. It does depend on the iCloud.com DOM and its internal screen transitions. Apple does not provide an official extension API for this flow, so UI changes can break it.

## Languages

The user-facing extension UI is available in:

- Japanese
- English
- Simplified Chinese
- Korean

The UI follows Chrome’s UI language automatically. The iCloud.com automation also covers the main Japanese, English, Simplified Chinese, and Korean wording confirmed in Apple’s official help. Full creation in a signed-in iCloud+ account has not been verified in any language, and the live Chinese and Korean iCloud.com screens have not been verified in a real browser. Label matching itself is language-independent: the entered label is compared with the iCloud heading using an exact match.

## Limitations and unverified items

- Public Apple documentation does not appear to include an endpoint for creating arbitrary Hide My Email addresses. This extension creates them through the web UI.
- An iCloud+ subscription and two-factor authentication are required. You must be signed in to iCloud.com with the same Apple Account.
- The supported iCloud host is `www.icloud.com`. If Apple moves the UI to another host (for example, beta), the extension will not work.
- The iCloud UI automation covers the main Japanese, English, Simplified Chinese, and Korean wording from Apple’s official help. The live Chinese and Korean iCloud.com screens have not been verified, and wording changes may still break the automation.
- Label length, allowed characters, and the number of addresses you can create are controlled by Apple. The extension does not enforce its own limits.
- Normal creation keeps the iCloud tab in the background. It comes to the front only when you click **Open iCloud**.
- Automatic copying happens only in the popup. It does not copy from the iCloud tab (a background document). If the popup is closed, reopen it after completion to see and copy the result.
- Job state is stored in `chrome.storage.session` in case the service worker stops. If creation is interrupted, the extension stops as **Unconfirmed** and does not retry automatically.
- If the result cannot be confirmed, the extension stops as **Unconfirmed** to avoid duplicates. Check the result in iCloud, tick the confirmation box, and resume.
- **Creation with a real, signed-in iCloud+ account has not been verified.** Testing is based on unit tests and a Chrome E2E run against a local mock iCloud screen. If you use this with a real account, also confirm the result in Apple’s official UI.
- This is not an Apple product and is not covered by Apple’s terms or support.
- This is an unofficial tool and is not affiliated with Apple.

## Permissions

| Permission | Purpose |
| --- | --- |
| `storage` | Store the job status and result temporarily in `chrome.storage.session` |
| `activeTab` | Read the current tab’s URL and title as a label suggestion only when the popup opens |
| `clipboardWrite` | Copy the created address to the clipboard |
| `https://www.icloud.com/*` | Operate the Hide My Email screens on iCloud.com |

The extension does not request `cookies`, `tabs`, `webRequest`, `scripting`, or `<all_urls>`. It does not disable browser protections.

## Privacy

- It does not read, store, or transmit passwords, verification codes, or cookies.
- The created address is placed only in the extension’s session storage and the clipboard. `chrome.storage.session` is cleared when the browser restarts.
- It does not communicate with external servers. Traffic stays between the iCloud.com page you opened and Apple.
- Extension logs do not contain addresses or credentials.
- To prevent duplicates, only the fact that the create button was pressed and the job state are kept in the session.

## Troubleshooting

**“Sign in to Apple” appears**<br>
Click **Open iCloud** in the popup, sign in on the iCloud tab, return to the popup, and create the address again.

**“Could not open the iCloud screen” appears**<br>
Check your Apple sign-in, network connection, and iCloud+ subscription. Use **Open iCloud** to inspect the screen.

**“Could not confirm the creation result” appears**<br>
Automatic retry is disabled to prevent duplicates. Open **Check in iCloud** and confirm that no extra address with the same label was created. If everything is fine, tick the box and click **Mark checked and resume**.

**“Could not find the iCloud+ screen” appears**<br>
Confirm that Hide My Email is available on iCloud.com. If it is not, check your iCloud+ subscription and web-only access settings.

**The address is not copied**<br>
Click **Copy** in the popup. You do not need to bring the iCloud tab to the front. If you closed the popup, reopen it to see the result.

## Build and test

```bash
npm install
npm run typecheck
npm test
npm run build
npm run test:e2e
```

- `npm run check`: runs type checking, unit tests, and the production build.
- `npm run test:e2e`: loads the extension into Chrome for Testing (or Chromium) and checks creation, copying, signed-out state, expired sessions, creation failure, and related flows against a local mock iCloud screen.
- To use a different Chrome binary for E2E, set `CHROME_PATH`.

```bash
CHROME_PATH="/path/to/Google Chrome for Testing" npm run test:e2e
```

`dist/` is generated by `npm run build`. This project does not publish a signed release package or a Chrome Web Store listing.

## Official resources

- [Create and edit Hide My Email addresses on iCloud.com](https://support.apple.com/en-us/guide/icloud/mm1a876f7aed/icloud)
- [Set up and use Hide My Email on all your devices](https://support.apple.com/guide/icloud/mm9d9012c9e8/icloud)
- [How to use Hide My Email with Sign in with Apple](https://support.apple.com/en-us/105078)
- [Manifest file format (Chrome for Developers)](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Chrome extension internationalization (Chrome for Developers)](https://developer.chrome.com/docs/extensions/reference/api/i18n)

## License

Released under the MIT License. See [LICENSE](LICENSE) for the full text.
