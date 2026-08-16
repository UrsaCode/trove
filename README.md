# Trove

*Files Claude wrote, kept.*

A Chrome extension that turns the files Claude generates in a conversation into a local library you own — browse them, read them, edit them, and re-pull them when the conversation moves on.

Files Claude writes live only inside the conversation that produced them. To read one you click its card; to keep one you download it, and it becomes a loose file with no memory of where it came from. Trove keeps them, grouped by their source conversation, and keeps the link back.

## Design

The extension is **a frame around someone else's document**. The chrome is graphite and recedes; the captured file gets the only light surface on screen. Colour is rationed to three meanings and used for nothing else:

| | Meaning |
|---|---|
| **Aqua** — tether | The file is still linked to a live source |
| **Amber** — moved | Divergence: the source moved on, an edit is unsaved, or edits are about to be overwritten |
| **Red** — sever | Destruction, and only destruction |

Four rules the interface holds itself to:

- **Mono is data.** If the filesystem produced the string — name, path, byte count, timestamp — it is IBM Plex Mono. If a person authored it, it is Archivo.
- **Paper is sacred.** No badge, watermark, toolbar, or overlay is ever drawn on top of a rendered file. Controls live in the bands above and below it.
- **No history, say so.** Updates overwrite, so every screen that can destroy something names what is lost, in plain words, before it happens.
- **Local is a feature.** "Nothing leaves this browser" sits in the rail footer permanently, not in a settings page nobody opens.

## Install

```
npm install
npm run build
```

Then in Chrome: **Extensions → Developer mode → Load unpacked → select `dist/`**.

`npm run dev` rebuilds on change. Reload the extension from the Extensions page after each rebuild.

## Using it

**Capture.** Open a conversation on claude.ai. Every file card gets a **Save** button. Or click the toolbar icon and use **Capture all** to take the whole conversation at once.

**Browse.** Open the library from the popup. Conversations on the rail, files in a table. The Source column is the only coloured thing in the list, so one glance tells you which local copies have fallen behind.

**Read.** Click any file to open the **Reader** in its own tab: the document on paper, full width, with every control in the bands above and below it. **Source** turns the same room into an editor.

**Re-pull.** A file whose source has moved on shows amber and offers **Re-pull**. If you have edited your copy, Trove asks before replacing it — that is the one action it cannot undo.

**Auto-capture.** Off by default. Turn it on in the popup and the extension pulls changes as Claude writes them, without you clicking.

## How it works

Claude exposes two private, per-conversation endpoints — one listing every file in the conversation sandbox with size and timestamp metadata, one returning a file's bytes by path. The extension calls both from a content script running on claude.ai, which is same-origin, so the session cookie attaches with no token handling.

The download endpoint returns a file's **current** content, not the version frozen into the message that created it. That is the design's foundation: "update" is the same request issued again, and it works identically on a conversation opened five minutes ago or five months ago.

**Interception is a signal, not a source.** The extension also watches page traffic, but only reads request URLs — never response bodies. Claude streams a file's full text when it is created but only a diff when it is edited, so content reconstructed from the stream would start correct and quietly go stale. The observer only says "look again"; the API answers.

**Rendering is sandboxed.** MV3 extension pages forbid inline script and iframes inherit that policy, so captured HTML with inline `<script>` would render blank. Previews therefore run in a page declared under the manifest's `sandbox` key, which has a relaxed policy and an opaque origin — captured code runs correctly and cannot reach extension storage, extension APIs, or your Claude session. Captured files are generated code you have not necessarily read, and are treated as untrusted throughout.

## Scope

Captures files Claude generates into the sandbox output directory. It does not capture images you uploaded, and does not handle classic Claude artifacts that never touch the sandbox filesystem.

Updates overwrite; there is no version history. The one guard rail: if a file has local edits **and** has changed upstream, Update blocks and asks before replacing your work.

Rendering handles single self-contained files. A file referencing a sibling file will render with that reference unresolved.

## Caveats

**The endpoints are private and undocumented.** They can change without notice. All knowledge of them lives in `src/content/api.js`, so a break there is a one-file repair.

**Card matching is a heuristic.** A card shows `Trove design`; the file is `trove-design.html`. The extension matches the slugified title against the conversation's known file list — verified against live cards — and, where two candidates match, refuses to guess and offers a picker instead.

**Extension-origin cookie behaviour is unverified.** Rather than gamble on whether Chrome attaches Claude's session cookie to a cross-site request from an extension page, all network traffic is routed through the content script. When the options page needs a capture, the service worker finds an open claude.ai tab, or opens one in the background and closes it again.

## Development

```
npm test          # vitest, 121 tests
npm run test:watch
npm run build
```

Pure logic lives in `src/lib/` and is unit tested; browser-bound code stays thin. Design and plan documents are in `docs/superpowers/`.

| Module | Responsibility |
|---|---|
| `lib/paths.js` | Sandbox path → name, extension, MIME, kind |
| `lib/diff.js` | new / unchanged / changed / conflict / orphaned |
| `lib/match-card.js` | Card title → sandbox path, refusing ambiguity |
| `lib/signal.js` | Whether a URL means "files may have changed" |
| `lib/db.js` | IndexedDB, cascade delete, usage reporting |
| `content/api.js` | The only module that knows Claude endpoints |
| `content/capture.js` | Which files to fetch, and what a record carries |
| `background/router.js` | Message routing, auto-capture gate, debounce |
