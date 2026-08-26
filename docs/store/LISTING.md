# Trove — Chrome Web Store listing

Everything below maps to a field in the Developer Dashboard. Paste as-is.

---

## Store listing → Product details

### Item name
```
Trove — file library for Claude
```
31 / 75 characters.

> **Review risk worth knowing:** using "Claude" in the item name is nominative
> (it describes what the extension works with), which is normally fine, but
> impersonation flags are the most common cause of a first-submission
> rejection. If you'd rather not risk a round trip, use `Trove — keep the files
> your AI chat writes` and mention Claude only in the description. The
> disclaimer at the bottom of the description is not optional either way.

### Short description
```
Every file Claude writes, kept in a local library. Grouped by conversation, rendered in one click, still linked to the chat.
```
124 / 132 characters.

### Detailed description
```
Trove keeps every file Claude writes in a conversation and stores it in a browsable library inside your browser.

Right now those files only live in the conversation. Reading one means clicking its card. Keeping one means downloading it — and losing the link back to where it came from. Trove fixes both.


WHAT IT DOES

Catches files automatically
Open a Claude conversation and Trove picks up files as they're written. No clicking through cards, no re-downloading, nothing to remember.

Groups them by conversation
You remember a file by what you were working on, not by what it's called. The library is organised the way you already think about it, and it's searchable by filename, extension or conversation.

Renders them in place
HTML, SVG, images and text open as pages, not as downloads. The path the file came from stays attached, so you can always get back to the conversation that produced it.

Lets you edit your copy
Fix a value, tweak a heading, save. The edit lives in your browser and never travels back to the conversation.

Tells you when the source moves on
If Claude writes the same file again later, the row turns amber. One click pulls the newer version down — and it warns you first if that would overwrite an edit you made.

Deletes cleanly
Remove a single file, or everything from one conversation, in one action.


PRIVACY

Everything stays on your machine. Trove has no account, no server and no sync. Nothing is ever uploaded. The extension reads the conversation page in order to spot files as they appear, but the only things it saves are the file contents, the filename, and the title of the conversation the file belongs to.


WHAT IT DOESN'T DO

Being straight about the edges, so nothing surprises you:

• No version history. Updating a file overwrites your local copy.
• No screenshot capture.
• Doesn't capture files you upload into a conversation — only files Claude writes.
• Doesn't capture inline artifacts that never become real files.
• Files that reference other files render on their own, without their siblings.
• No sync, sharing or cloud storage. The library lives in this browser profile.


Trove is an independent project by UrsaCode. It is not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC.
```
2,290 / 16,000 characters.

### Category
`Developer Tools`
(Second choice: `Workflow & Planning`. Not `Productivity` — too broad, worse discovery.)

### Language
`English (United States)`

---

## Store listing → Graphic assets

| Dashboard field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128 (96×96 art + 16px transparent padding, per Google's spec) |
| Screenshot 1 | `screenshot-1-library.png` | 1280×800 |
| Screenshot 2 | `screenshot-3-capture.png` | 1280×800 |
| Screenshot 3 | `screenshot-2-reader.png` | 1280×800 |
| Screenshot 4 | `screenshot-5-repull.png` | 1280×800 |
| Screenshot 5 | `screenshot-4-editor.png` | 1280×800 |
| Small promo tile | `promo-tile-440x280.png` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560 |

**Screenshot order is deliberate.** The first two carry the install decision:
what you get (a library), then why it's effortless (it catches files by
itself). Rendering, the amber re-pull signal, and editing follow. Most people
never scroll past three.

`icon-16.png`, `icon-32.png` and `icon-48.png` are for the manifest, not the
dashboard — they're drawn on a heavier grid so the mark survives the toolbar.

---

## Privacy tab → Single purpose

```
Trove has one purpose: to save the files that Claude generates in a claude.ai conversation into a local library in the user's browser, and to let the user view, edit, update and delete those saved files.
```

## Privacy tab → Permission justifications

**`storage`**
```
Stores the captured files and their metadata (filename, size, source conversation) in the user's browser. This local library is the entire function of the extension — there is no server component.
```

**`unlimitedStorage`**
```
Captured files include images and rendered HTML pages that routinely run to several megabytes. Without this permission the library hits the default quota after a handful of files and capture silently fails.
```

**Host permission — `https://claude.ai/*`**
```
The content script runs only on claude.ai conversation pages. It detects when a file has been generated in the conversation and reads that file's contents so it can be saved to the local library, along with the conversation title used to group it. No other site is accessed and no data is sent anywhere.
```

**Remote code**
```
No. All code ships inside the extension package. No remote scripts are loaded, no eval, and no code is fetched at runtime.
```

## Privacy tab → Data usage

Nothing is transmitted off the device, so no data-collection categories need
to be declared. Certify all three statements:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

> Re-check this the moment you add crash reporting, analytics, or any remote
> feature. A wrong answer here is a policy violation, not a paperwork error.

---

## Account tab → Test instructions for reviewers

Reviewers reject what they can't test. Give them this:

```
No account or login is required for the extension itself. A Claude account (free tier is enough) is needed to produce a test file.

1. Install the extension and open https://claude.ai in the same browser.
2. Start a conversation and ask Claude to create a file, e.g.
   "Write a small HTML page about the water cycle and save it as a file."
3. When the file appears in the conversation, click the Trove toolbar icon.
   The file is listed in the popup with its size and capture time.
4. Click "Open library" to open the options page. The file appears under the
   conversation it came from.
5. Click the file to render it. Use Edit to change the text and save; use
   Re-pull to fetch the current version from the conversation; use Delete to
   remove the local copy.

All data is stored with chrome.storage.local. Nothing is transmitted off the
device — you can verify this with an empty network tab throughout.
```

---

## Manifest icon block

```json
{
  "manifest_version": 3,
  "name": "Trove — file library for Claude",
  "version": "1.0.0",
  "description": "Every file Claude writes, kept in a local library. Grouped by conversation, rendered in one click, still linked to the chat.",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "action": {
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png"
    },
    "default_title": "Trove",
    "default_popup": "popup.html"
  },
  "options_page": "library.html",
  "permissions": ["storage", "unlimitedStorage"],
  "host_permissions": ["https://claude.ai/*"],
  "content_scripts": [
    {
      "matches": ["https://claude.ai/*"],
      "js": ["content/capture.js"],
      "run_at": "document_idle"
    }
  ]
}
```

The `description` field is capped at 132 characters and is what shows in the
extensions manager — keeping it identical to the store short description means
one string to maintain.

---

## Before you hit submit

- The screenshots show a UI that has to exist. Ship the build first; a listing
  whose screenshots don't match the product is a rejection, and a slow one.
- `unlimitedStorage` broadens the permission warning users see at install.
  If real captures stay small, drop it — fewer permissions convert better.
- Add a support URL. The store shows a support tab whether or not you fill it
  in, and an empty one reads as abandoned.
- Verify a domain in Search Console before submitting if you want the publisher
  badge under the listing title. It has to be done in advance.
