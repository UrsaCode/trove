# Claude File Vault — Design

**Date:** 2026-08-16
**Status:** Approved for planning

## Purpose

A Chrome extension that captures files Claude generates in a claude.ai conversation, stores them locally, and lets the user render, edit, update, and delete them from an options page.

Today those files exist only inside the conversation. Reading one means clicking its card; keeping one means downloading it and losing the link back to where it came from. This extension keeps a durable, browsable local library that stays connected to its source conversation, so a file can be re-pulled whenever Claude changes it.

## Scope

**In scope for v1**

- Capturing files Claude generates into the conversation sandbox output directory
- Grouping captured files by source conversation
- Rendering a captured file (HTML, SVG, PNG, and other self-contained single files)
- Editing a captured file's text content and saving the edit locally
- Updating a captured file from its source conversation
- Deleting individual files and whole conversations
- Automatic capture triggered by observing Claude write files during a live conversation

**Out of scope for v1**

- Screenshot capture (explicitly deferred by the user; a likely v2 feature)
- Files the user uploaded into a conversation (the sandbox upload directory)
- Classic Claude artifacts that never touch the sandbox filesystem
- Multi-file rendering, where one captured file references another
- Version history — updates overwrite
- Any form of sync, sharing, or cloud storage

## Background: how files actually reach the page

This was verified live against a real conversation before the design was written. The findings below are load-bearing and drive most decisions in this document.

The example conversation does not use Claude artifacts. It uses the sandbox filesystem, via tool calls that create files and then present them in the transcript. claude.ai exposes two relevant private endpoints, both scoped to a single conversation and both authenticated by the ordinary session cookie:

- A **list endpoint** returning every file path in the conversation sandbox, plus a metadata array carrying each file's size, content type, and creation timestamp.
- A **download endpoint** taking an absolute sandbox path and returning that file's bytes.

Verified behaviour:

| Check | Result |
|---|---|
| Listing a real conversation | 22 files returned with full metadata |
| Output files | 10 HTML files |
| Upload files | 12 PNGs (out of scope) |
| Downloading a text file | 200, complete and well-formed content |
| Downloading a binary file | 200, correct byte count and valid PNG signature |
| Downloading a nonexistent path | Clean 404 with a JSON error body |

Three consequences shaped the design:

1. **The download endpoint returns the file's current state, not its original state.** The file creation tool wrote 30,371 bytes; the endpoint later returned 30,646 bytes for the same path, reflecting edits made afterwards by other tool calls. Therefore "update this file" is simply the same request issued again.
2. **The list endpoint enumerates everything at once**, so capturing an entire conversation costs one list request plus one download per file worth taking.
3. **Neither endpoint depends on the conversation being live.** A conversation opened months later can be captured identically to one still being written.

The rendered file cards in the transcript are identifiable by a stable CSS class on the card cell, nested inside a card container. This is the injection point for per-file buttons.

## Approach

Three approaches were considered.

**A. API-first capture (chosen).** A content script running on claude.ai calls the list and download endpoints directly. Because the content script is same-origin with claude.ai, the session cookie attaches automatically — no token extraction, no CORS negotiation, no cross-site cookie restrictions.

**B. DOM scraping (rejected).** Reading content out of the rendered file preview panel. This requires opening each file's panel and scraping a virtualised code view that only renders visible lines. It is fragile against any Claude redesign and cannot see files that were never presented in a card.

**C. Network interception (adopted as a complement, not a foundation).** Patching the page's network functions to capture files as they stream past. Interception cannot see a conversation opened after the fact, because the traffic has already happened. As the sole mechanism it would leave older conversations uncapturable.

The chosen design is **A as the foundation, with C layered on top as a change signal.**

### Why interception signals rather than intercepted content

The file-creation tool streams a file's full text, but subsequent edits stream only a diff against the existing file. Reconstructing content from the stream would therefore start correct and silently drift out of date as a file is edited.

Instead the interceptor extracts no file content at all. It only detects that *something in this conversation wrote to the output directory* and raises a signal. The service worker responds by re-running the list request, comparing metadata against what is stored, and downloading only what genuinely changed. This is less parsing, and it cannot drift, because the API remains the single source of truth.

## Architecture

Five components spanning three JavaScript execution contexts.

| Component | Context | Responsibility |
|---|---|---|
| Interceptor | Main world, claude.ai | Patches the page's network functions. Detects file-write activity and raises a signal. Extracts no content. |
| Content script | Isolated world, claude.ai | The only component that talks to Claude's API. Injects card buttons. Relays interceptor signals to the service worker. |
| Service worker | Extension | Message router and sole database writer. Debounces sync requests. |
| Popup | Extension | Current conversation: file list, capture-all action, capture status. |
| Options page | Extension | The library: browse, render, edit, delete, export. |

### Why the content script owns all networking

The content script is genuinely same-origin with claude.ai, so authentication requires no special handling. An extension-origin page fetching claude.ai is a cross-site request, and the session cookie may be withheld depending on its `SameSite` attribute. This is unverified and will be checked during implementation.

The implementation must first test whether an extension-origin request carries the session cookie. If it does, extension pages may call the API directly. If it does not, the fallback is: the service worker locates an open claude.ai tab and routes the request through its content script; if no such tab exists, it opens the source conversation in a background tab, performs the request, and closes the tab.

Under either outcome, all knowledge of Claude's endpoints stays inside a single API adapter module. This is the containment boundary for the risk that these private endpoints change.

## Data model

Storage is IndexedDB in the extension origin, holding two object stores. User settings live in extension sync storage instead, as they are small and benefit from syncing.

**Conversation record.** Identified by the conversation's own UUID. Carries the conversation title, the organisation identifier needed to address the API, the source URL, a file count, a total byte size, and capture and update timestamps.

**File record.** Identified by the combination of conversation identifier and absolute sandbox path. The sandbox path is stable across edits, which makes this a natural key and makes an update a plain upsert rather than a match-and-merge.

Each file record carries:

- Its conversation identifier and absolute sandbox path
- A display name, extension, and MIME type derived from the path and the listing metadata
- A kind discriminator, either text or binary
- The content itself — a string for text, a Blob for binary. IndexedDB stores Blobs natively, so binary files need no base64 encoding and suffer no size inflation.
- A content hash, used to detect whether local content has diverged from what was captured
- The remote size and remote creation timestamp taken from the listing metadata
- An `edited` flag, set when the user saves a local edit
- Capture and update timestamps

### Change detection

The listing metadata already carries each file's size and creation timestamp. Deciding which stored files are stale therefore costs one list request and no downloads. A file is considered changed when its remote size or remote creation timestamp differs from what was recorded at capture time.

### The conflict case

The user chose overwrite-on-update with no version history. This has one sharp edge: a file that was edited locally and has also changed remotely cannot satisfy both.

When a file's `edited` flag is set **and** the remote copy has changed, Update must warn before proceeding and require explicit confirmation. It must not silently discard local edits. This is the only guard rail protecting user work, since there is no history to recover from.

## Capture flows

### Per-card button

A mutation observer watches the transcript for file cards. Each card is matched to a real file path from the listing.

Matching is a heuristic. A card displays a humanised title and a type label; the underlying file has a slugified name and an extension. Normalising the title — lowercasing and replacing spaces with hyphens — and deriving the extension from the type label produces a candidate name to match against the known file list.

Matching against a known candidate set rather than parsing in isolation makes this substantially more reliable, because the set of possible answers is small and known. Where the result is ambiguous or empty, the button must not guess: it opens a small picker listing the conversation's files and lets the user choose.

The button reads **Save** when the file is not yet stored and **Update** when it is, with a change indicator when the remote copy differs from the stored copy.

### Capture all

The popup enumerates the conversation's output files, classifies each as new, changed, or unchanged, and captures all of them in one action.

### Automatic capture

The interceptor raises a signal; the service worker debounces for roughly two seconds, re-lists the conversation, and pulls whatever changed.

This is **disabled by default** and enabled by a settings toggle, so the extension never writes to storage without the user having asked for that behaviour.

### Interceptor safety requirements

The interceptor runs inside a page the user depends on. It must therefore be strictly non-destructive:

- It must only read a cloned copy of any response, never the response the page itself will consume.
- Every hook must be wrapped so that any internal failure falls through to the untouched original behaviour.
- It must never modify a request, a response, or any page state.

A defect in capture code must not be capable of breaking a Claude session.

## Rendering

**The constraint.** Extension pages run under a strict content security policy that forbids inline scripts, and an iframe inherits its parent's policy. The captured files are self-contained HTML with inline scripts and styles, so rendering one inside an ordinary extension page would produce a blank frame and console errors.

**The solution.** Chrome provides a documented escape hatch: pages declared as sandboxed in the manifest receive a relaxed policy and a unique opaque origin. The options page embeds such a page in an iframe and passes file content to it by message.

This solves the correctness problem and the security problem together. The captured file's scripts execute exactly as intended, while the opaque origin denies them access to extension storage, extension APIs, and the user's Claude session. Captured content is treated as untrusted, which is appropriate — it is generated code the user has not necessarily read.

Rendering is scoped to single self-contained files. HTML, SVG, and images render directly. Files that reference sibling files will render with those references unresolved; multi-file resolution is explicitly deferred.

## Options page

Three panes. A conversations rail on the left, showing title, file count, total size, and capture date. The selected conversation's file list in the middle. The selected file's detail pane on the right.

The detail pane offers two views:

- **Preview** — the sandboxed renderer described above.
- **Code** — a CodeMirror 6 editor with a language mode chosen from the file extension. Saving writes to the database and sets the `edited` flag.

Per-file actions: Update, Delete, Export. Per-conversation actions: Update all, Delete, Export all as a zip archive.

## Visual design

The extension should feel like a well-made developer tool, not a browser add-on. It sits next to Claude in the user's workflow, so it should read as adjacent to Claude rather than as a copy of it, and it should never look like an unstyled settings page.

**Principle.** Filenames and paths are the actual content here, not decoration around it. The design gives them typographic weight and keeps everything else quiet.

**Ground and palette.** Dark-first, following the system colour scheme, with a warm near-black ground rather than a blue-grey one — cold greys would fight Claude's warmth on the adjacent tab. A single accent colour in the clay/terracotta family carries primary actions. Beyond that, colour is reserved strictly for state and never used for ornament:

| State | Treatment |
|---|---|
| New, not yet captured | Accent |
| Changed remotely | Amber |
| Captured and current | Muted green |
| Locally edited | Distinct marker, since this is the state with data at risk |
| Orphaned upstream | Desaturated, visibly inert |

**Typography.** A system UI stack for interface chrome, and a genuine monospace for every filename, path, and byte count. Mixing the two is the main visual signal that this is a tool for files. Size hierarchy stays shallow — three sizes, distinguished by weight and colour rather than scale jumps.

**Status as edge, not badges.** Per-file state is shown with a thin coloured rule on the leading edge of a row plus a text label, not a scatter of pills. With ten-plus files per conversation, badge-per-row becomes noise; an edge rule stays scannable down a column.

**Options page layout.** Three panes, resizable: a conversations rail, the file list for the selected conversation, and the detail pane holding Preview and Code. This is a familiar mail-client shape and needs no explanation. The detail pane's two views share one header so switching between rendering and editing a file feels like turning it over rather than navigating away.

**Preview surface.** Rendered files sit on a neutral surface distinct from the app ground, so the boundary between the extension's UI and untrusted rendered content is always visually obvious. Transparent images render over a subtle checkerboard.

**Popup.** Compact and single-purpose: the conversation title, a one-line summary of counts, the file list, and one primary action. It answers "what's here and what's new" without scrolling in the common case.

**Empty and first-run states are treated as real screens**, not afterthoughts. A newly installed extension with nothing captured is the first thing every user sees, and it should explain the two ways to capture rather than showing an empty box.

**Motion** is short and functional — roughly 120–160ms, ease-out. Capture confirmation is expressed as a state change on the affected row, not a stack of toasts.

Accessibility is a requirement, not a polish item: full keyboard navigation, visible focus rings, AA contrast in both schemes, and no state communicated by colour alone — every coloured state also carries a text label.

## Error handling

| Condition | Behaviour |
|---|---|
| File no longer exists in the sandbox (404) | Mark the stored file orphaned; keep the content; show it as no longer updatable |
| Not authenticated / session expired | Surface a clear prompt to sign in to claude.ai; do not retry silently |
| Endpoint shape changed or unparseable response | Fail the capture with a visible, specific error naming the API adapter as the failure point |
| No claude.ai tab available for a request | Follow the fallback described under Architecture |
| Update would discard local edits | Block and require explicit confirmation |
| Storage quota exceeded | Report which conversations are largest and offer deletion |

The extension requests unlimited storage, so quota exhaustion should be rare, but it is handled rather than assumed away.

## Testing strategy

Development follows TDD. The design deliberately factors decision-making into pure functions so that the majority of behaviour is unit-testable without a browser.

Tooling is vitest with an in-memory IndexedDB implementation.

Unit-tested units:

- **API adapter** — against mocked responses: listing parsed correctly, 404 handled, text and binary paths distinguished
- **Path derivation** — sandbox path to display name, extension, MIME type, and kind
- **Difference calculation** — classifying files as new, changed, unchanged, or conflicted
- **Card matching** — the heuristic, exercised against real card title and type-label strings captured from a live conversation
- **Interceptor signal detection** — deciding whether a given request indicates file-write activity
- **Database layer** — create, read, update, delete, and cascading deletion of a conversation's files

Manually verified, because they are inherently browser-bound: card button injection, sandboxed rendering, and the editor.

The example conversation used during discovery is a good manual test case: ten HTML files, all containing inline scripts, several of which changed after creation.

## Build and tooling

esbuild via a small build script, producing an unpacked extension directory. No framework. CodeMirror 6 is the only substantial runtime dependency; it must be bundled locally, since extensions cannot load from a CDN.

Two scripts: a one-shot build and a watch mode for development.

## Risks

1. **The endpoints are private and undocumented.** They may change or disappear without notice. Contained to a single API adapter module, so a break is a one-file repair.
2. **Card matching is heuristic.** Mitigated by matching against a known candidate set, and by falling back to an explicit picker rather than guessing wrong.
3. **Cookie behaviour for extension-origin requests is unverified.** Resolved by the content-script-owns-networking design plus the documented tab fallback; to be confirmed early in implementation.
4. **Captured content is untrusted code.** Mitigated by rendering exclusively inside a sandboxed, opaque-origin page.
5. **Overwrite-on-update destroys local edits.** Mitigated by the mandatory conflict confirmation; accepted as a deliberate trade for simplicity.

## Decisions made

| Question | Decision |
|---|---|
| What counts as a capturable file | Files Claude generates into the sandbox output directory |
| Uploads included | No |
| Organisation | Grouped by source conversation |
| Versioning | Overwrite, no history, with a conflict warning |
| Rendering | Single self-contained files only |
| Editor | CodeMirror 6 |
| Capture controls | Per-card button and extension toolbar popup |
| Capture mechanism | API-first, with interception as a change signal |
| Auto-capture default | Off |
| Visual direction | Dark-first, warm ground, single clay accent, monospace filenames, three-pane library |
