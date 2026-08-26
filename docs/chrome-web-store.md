# Publishing Trove on the Chrome Web Store

## Status

**Version 1.0.0 submitted, awaiting review.**

| | |
|---|---|
| Item ID | `mikpichonjdjbnhjafkjiofacepfpffc` |
| Listing | https://chromewebstore.google.com/detail/mikpichonjdjbnhjafkjiofacepfpffc |
| Dashboard | https://chrome.google.com/webstore/devconsole |
| Release | https://github.com/UrsaCode/trove/releases/tag/v1.0.0 |
| Uploaded archive | `trove-1.0.0.zip`, sha256 `f01d8756…c9d113` |

The listing URL returns nothing until the item is approved. The item ID is
permanent: every future version has to be uploaded to *this* item, from the same
developer account, or it becomes a second extension that existing users never
receive.

### When it is approved

- Swap the "awaiting review" lines in `README.md` and `docs/index.html` for the
  live link, then re-run `node tools/check-site.mjs`.
- Add the listing to the repository's About panel on GitHub.
- Edit the v1.0.0 release notes to point at the listing instead of the archive.

The v1.0.0 tag and release already exist, and the archive attached to it is
byte-identical to the one uploaded to the store — same build, same checksum. A
later version means a new tag, a new release, and a **higher** manifest version
uploaded to the same item.

### If it is rejected

Read the reason before changing anything. If it is the host permission, the
narrower `activeTab` design is described under **Read this before you submit**
below, and swapping to it is a small change. Rejections are appealed or
resubmitted against the same item ID, so nothing here needs recreating.

---

Everything the listing asks for, with the answers written out. Copy from here
rather than improvising at the form — the data-use answers in particular are a
declaration, and getting them wrong is a policy problem rather than a typo.

## Before you start

- A Chrome Web Store developer account: **one-off US$5**, paid once per account,
  at [the developer dashboard](https://chrome.google.com/webstore/devconsole).
- Publisher contact email **verified** in the dashboard. Listings are rejected
  without it.
- Optional but worth it: verify `ursacode.com` as a publisher domain, so the
  listing shows the domain rather than a bare Gmail address.

## Packaging

One command:

```bash
npm run package
```

That builds and writes `trove-<version>.zip` in the repository root — the file
you upload. It refuses to produce an archive that could not be installed: the
manifest has to parse, `manifest.json` has to sit at the archive **root** rather
than inside a `dist/` folder, and every icon and sandbox page the manifest names
has to actually be in the package.

The current archive is **`trove-1.0.0.zip`** — 25 files, 304 KB zipped.

Every upload after this needs a **higher** `version` in `src/manifest.json`.
Chrome compares numerically, left to right, so 1.0.1 and 1.1.0 both work and
1.0 does not go backwards to 1.0.0.

Verified in the built archive, so these are answers rather than assumptions:

- Every path the manifest references resolves, and every stylesheet, script and
  font each HTML page pulls in is present.
- No `eval`, no `new Function`, no `importScripts`, and no host contacted other
  than `claude.ai`.

## Listing fields

**Name** — `Trove`

If that name is taken, `Trove — file keeper for Claude` still fits the 75-char
limit. Do not lead with "Claude": a name that starts with another company's
product reads as official and is a common rejection.

**Short description** (132 characters max, 108 used)

```
Keep the files Claude writes in a conversation. Browse, read, edit and re-pull
them. Nothing leaves your browser.
```

**Category** — Developer Tools

**Language** — English

**Detailed description**

```
Files Claude writes live only inside the conversation that produced them. To
read one you click its card. To keep one you download it — and it becomes a
loose file with no memory of where it came from, and no way to know when Claude
has changed it since.

Trove keeps those files on your machine, grouped by the conversation that made
them, and keeps the link back.

WHAT IT DOES

• Keep — a button on every file card in a conversation, and a panel that takes
  the whole conversation at once, with per-file progress.
• Browse — conversations on a rail, files in a table. One column tells you which
  of your copies have fallen behind.
• Read — any file opens full width on its own page. Nothing the extension owns
  is ever drawn over the document.
• Edit — a real editor with syntax highlighting. Edits stay local; they never
  travel back to the conversation.
• Re-pull — when Claude changes a file, Trove says so. One click takes the
  current version. If you had edited your copy, it asks first.
• Screenshot — save a picture of a rendered file, full page or visible area.
• Optional auto-capture, off by default.

PRIVACY

Trove has no server, no account and no analytics. It makes no network requests
except to claude.ai, using the session you already have, to list and download
files from the conversation you are looking at. Everything it keeps lives in the
extension's own storage on your machine. The only thing that ever leaves your
browser is a file you explicitly export.

OPEN SOURCE

MIT licensed, source at https://github.com/UrsaCode/trove

Trove is an independent project. It is not affiliated with, endorsed by, or
sponsored by Anthropic.
```

That last paragraph is not optional. An extension built around another
company's product needs to disprove affiliation, and reviewers look for it.

## Single purpose

The store requires one narrow purpose, stated plainly:

```
Trove saves the files a Claude conversation generates to the user's own browser
storage, and lets the user browse, read, edit and re-download them.
```

## Permission justifications

Paste these into the matching boxes. Each one names the feature that stops
working without it — a justification that only restates the permission gets
sent back.

| Field | Justification |
|---|---|
| `storage` | Stores the user's own settings, such as whether files are captured automatically and which view the reader opens on. |
| `unlimitedStorage` | Captured files include full HTML pages and images. The default quota caps the library at a few megabytes, which a single conversation can exceed. |
| `tabs` | Finds the claude.ai tab that can service a request, and opens the reader page. Tab URLs are read only to identify which conversation is open; no browsing history is collected. |
| Host permission `https://claude.ai/*` | The only host the extension contacts. Needed to list the files a conversation produced and download their contents, using the user's existing session. |
| Optional `<all_urls>` | Requested only when the user takes a screenshot, and never at install. Chrome's tab-capture API accepts either this or `activeTab`, and `activeTab` is not available on a page the extension opened itself. Nothing is captured except the extension's own reader page, and the image never leaves the machine. |

### Read this before you submit

**The optional `<all_urls>` is the one thing likely to draw a review
objection.** "Request narrow permissions" is explicit store policy, and
`<all_urls>` is the widest host permission there is — the fact that it is
optional helps, but does not make the question go away.

There is a narrower design available. Chrome grants `activeTab` when the user
runs a **keyboard command** or clicks the extension's **toolbar icon**, and
`activeTab` is enough for tab capture. Moving the screenshot trigger to a
registered command would replace `<all_urls>` with `activeTab`, which almost
never attracts comment. The cost is that a screenshot starts from a keyboard
shortcut rather than a button on the page.

Three ways forward, in the order I would try them:

1. **Switch to a keyboard command and `activeTab`.** Narrowest, and keeps the
   feature. Say the word and I will implement it.
2. **Submit as-is** with the justification above. It may pass; if it does not,
   the reviewer will say so and you can fall back to (1).
3. **Ship the first version without screenshots.** Fastest approval, and the
   feature can arrive in 0.3.0.

## Privacy practices

**Single purpose** — as above.

**Data collected** — none of the categories apply. Trove transmits nothing off
the device. It reads file contents from claude.ai and writes them to local
storage, and the store's definition of collection is transmission away from the
user's machine.

Tick nothing in: personally identifiable information, health, financial,
authentication, personal communications, location, web history, user activity,
website content.

**Certifications** — all three are true and can be affirmed:

- Not being sold or transferred to third parties outside approved use cases
- Not being used or transferred for purposes unrelated to the single purpose
- Not being used or transferred to determine creditworthiness or for lending

**Privacy policy URL** — `https://ursacode.github.io/trove/privacy.html`
(published from `docs/privacy.html` in this repo).

**Remote code** — No. Everything executes from the package: CodeMirror and both
fonts are bundled, and there is no `eval`, no remote script, and no CDN.

One nuance worth understanding rather than being surprised by: captured files
are rendered inside a manifest-sandboxed page, which does execute HTML and
script that came from outside the package. That is *content being displayed*,
not the extension loading remote code, and the sandbox exists precisely so that
content cannot reach the extension. If a reviewer raises it, that is the answer.

## Assets

All of these are in `docs/store/`, and every dimension has been checked against
what the store accepts:

| Asset | Required | Actual | |
|---|---|---|---|
| `icon-128.png` | 128×128 | 128×128 | ok |
| `icon-48.png` | 48×48 | 48×48 | ok |
| `icon-32.png` | 32×32 | 32×32 | ok |
| `icon-16.png` | 16×16 | 16×16 | ok |
| `screenshot-1-library.png` | 1280×800 | 1280×800 | ok |
| `screenshot-2-reader.png` | 1280×800 | 1280×800 | ok |
| `screenshot-3-capture.png` | 1280×800 | 1280×800 | ok |
| `screenshot-4-editor.png` | 1280×800 | 1280×800 | ok |
| `screenshot-5-repull.png` | 1280×800 | 1280×800 | ok |
| `promo-tile-440x280.png` | 440×280 | 440×280 | ok |
| `promo-marquee-1400x560.png` | 1400×560 | 1400×560 | ok |

Upload the screenshots in numbered order; the first is the one most people
actually look at.

The unnumbered shots in `docs/shots/` are for the landing page and are the wrong
size for the store. Do not upload those.

## Listing copy

`docs/store/LISTING.md` is the source for the listing text, and it is more
detailed than the copy in this file. Where the two disagree, prefer LISTING.md
for wording and this file for the permission, packaging and data-use answers.

### Two claims that had to be reconciled

Both of these were found by comparing the assets against the built extension,
and both are now resolved in the extension's favour rather than by softening the
listing:

**Row actions.** The promotional screenshots show preview, rename and delete
icons on each row of the library. Those affordances existed only as a click, a
double-click, and a button inside the reader - so the pictures promised
something the interface did not offer. The icons are now real. A store listing
whose screenshots show controls that do not exist is a policy problem as well
as a broken promise.

**"Catches files automatically."** LISTING.md describes files being picked up as
they are written as though it were the default. Auto-capture ships **off**, by
deliberate choice - the extension should not write to storage because it
happened to observe activity. Either reword that section to say it is available
and off by default, or turn the default on before shipping. Do not leave the
listing saying it happens by itself while the setting says otherwise.

## Distribution

- **Visibility** — Public
- **Regions** — All
- **Pricing** — Free
- Do not set "mature content"

## After submitting

Review usually takes a few days and can take longer for a first submission from
a new account. Expect a round trip on the permission question above.

Once published, put the store link in the README and on the landing page, and
replace the "not on the Chrome Web Store yet" line in both.

## Honest risks

**The endpoints Trove uses are private and undocumented.** They can change
without notice and the extension will break when they do. All knowledge of them
is confined to `src/content/api.js`, so the repair is one file — but a store
listing with a one-star review saying "stopped working" is harder to fix than
the code.

**Automated access to a third-party service.** Trove uses the user's own
session to read their own files, which is the mildest version of this, but
whether it sits inside Anthropic's terms of service is a question for those
terms rather than for me. Worth reading them before publishing under a company
name.

**The name.** Check `Trove` is not already taken in the store, and that it does
not collide with a trademark in the developer-tools category.
