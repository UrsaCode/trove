# Claude File Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome MV3 extension that captures files Claude generates in a claude.ai conversation, stores them locally grouped by conversation, and renders, edits, updates, and deletes them from an options page.

**Architecture:** A content script on claude.ai is the only component that talks to Claude's private per-conversation file API, because it is same-origin and so authenticates for free. A main-world interceptor raises change signals but never extracts content. A service worker routes messages and owns all database writes. Extension pages render captured files inside a manifest-sandboxed page, which is the only way inline scripts in captured HTML can execute under MV3's content security policy.

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript ES modules, IndexedDB, CodeMirror 6, fflate (zip export), esbuild, vitest with fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-08-16-claude-file-vault-design.md`

## Global Constraints

- **No code blocks in planning or spec documents.** Standing user instruction.
- Manifest V3 only. No `unsafe-eval`, no remote code, no CDN loads — everything bundled locally.
- The API adapter is the single module permitted to know Claude endpoint shapes. No other file may contain an endpoint path.
- The interceptor may only read cloned responses, must never modify page state, and must wrap every hook so failure falls through to original behaviour.
- Auto-capture defaults to **off**.
- Update must never silently discard a locally edited file.
- Capture is limited to the sandbox **outputs** directory. Uploads are out of scope.
- Every colour-coded state must also carry a text label. AA contrast in both colour schemes.
- Pure logic lives in `src/lib/` and must be unit tested. Browser-bound code stays thin.
- Commit after every task.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Dependencies and scripts |
| `build.mjs` | esbuild bundling to `dist/` |
| `vitest.config.js` | Test config, jsdom + fake-indexeddb setup |
| `src/manifest.json` | MV3 manifest, sandbox declaration, content script worlds |
| `src/lib/paths.js` | Sandbox path → name, extension, MIME, kind |
| `src/lib/hash.js` | SHA-256 of text or binary content |
| `src/lib/diff.js` | Classify remote vs stored: new, changed, unchanged, conflict |
| `src/lib/match-card.js` | Card title + type label → sandbox path |
| `src/lib/signal.js` | Does a request URL indicate file-write activity |
| `src/lib/db.js` | IndexedDB schema, CRUD, cascade delete, quota reporting |
| `src/lib/messages.js` | Shared message type constants |
| `src/lib/settings.js` | Settings read/write over extension storage |
| `src/content/api.js` | Claude API adapter — the only endpoint-aware module |
| `src/content/cards.js` | Card discovery and button injection |
| `src/content/main.js` | Content script entry, message handling |
| `src/content/interceptor.js` | Main-world network hooks, signal emission |
| `src/background/sw.js` | Message router, sole DB writer, debounced sync |
| `src/popup/popup.html` `popup.js` | Current conversation summary and capture |
| `src/options/options.html` `options.js` | Three-pane library shell |
| `src/options/editor.js` | CodeMirror mount and save |
| `src/options/preview.js` | Host side of the sandbox bridge |
| `src/options/sandbox.html` `sandbox.js` | Sandboxed renderer |
| `src/options/export.js` | Single-file and zip export |
| `src/styles/tokens.css` | Colour, type, spacing tokens for both schemes |
| `src/styles/app.css` | Options page |
| `src/styles/popup.css` | Popup |

---

## Task 1: Project scaffold, build, and test harness

**Files:** Create `package.json`, `build.mjs`, `vitest.config.js`, `src/manifest.json`, `test/harness.test.js`

**Interfaces:**
- Produces: `npm test`, `npm run build`, `npm run dev`. Build output at `dist/`.

- [ ] **Step 1:** Write `test/harness.test.js` asserting a trivial truth, to prove the runner works before anything depends on it.
- [ ] **Step 2:** Run `npm test`. Expected: fails, vitest not installed.
- [ ] **Step 3:** Create `package.json` with dev dependencies vitest, jsdom, fake-indexeddb, esbuild; runtime dependencies codemirror, `@codemirror/lang-html`, `@codemirror/lang-css`, `@codemirror/lang-javascript`, `@codemirror/lang-json`, fflate. Scripts: `test`, `build`, `dev`. Type set to module.
- [ ] **Step 4:** Create `vitest.config.js` — jsdom environment, `fake-indexeddb/auto` in setup files.
- [ ] **Step 5:** Create `build.mjs` — esbuild bundling each entry point (`background/sw.js`, `content/main.js`, `content/interceptor.js`, `popup/popup.js`, `options/options.js`, `options/sandbox.js`) to `dist/`, format esm, bundle true, then copying `manifest.json`, all HTML, and all CSS into `dist/` preserving relative layout. Watch mode when passed `--watch`.
- [ ] **Step 6:** Create `src/manifest.json` — MV3; permissions `storage`, `unlimitedStorage`, `activeTab`; host permission for claude.ai; module service worker; two content script entries matching claude.ai, one isolated at document idle and one with `world` set to `MAIN` at document start; action popup; options page; `sandbox.pages` listing the sandbox page; a `content_security_policy.sandbox` value permitting inline script within the sandbox only.
- [ ] **Step 7:** Run `npm install`, then `npm test` (expect pass) and `npm run build` (expect `dist/` populated).
- [ ] **Step 8:** Load `dist/` unpacked in Chrome and confirm it installs with no manifest errors.
- [ ] **Step 9:** Commit.

---

## Task 2: Path derivation

**Files:** Create `src/lib/paths.js`, `test/paths.test.js`

**Interfaces:**
- Produces: `parsePath(absolutePath, contentType)` returning an object with `name`, `ext`, `mime`, `kind`. `isOutput(absolutePath)` returning boolean.

- [ ] **Step 1:** Write failing tests covering: an outputs HTML path yields name `fbmp-fleet-console.html`, ext `html`, mime `text/html`, kind `text`; a PNG path yields kind `binary`; SVG yields `image/svg+xml` and kind `text`; unknown extension falls back to `application/octet-stream` and kind `binary`; a supplied content type from listing metadata overrides extension inference; a path with no extension yields empty ext without throwing; `isOutput` returns true only for the outputs directory and false for uploads.
- [ ] **Step 2:** Run tests. Expected: fail, module not found.
- [ ] **Step 3:** Implement. Keep an explicit extension-to-MIME table; treat html, css, js, mjs, json, svg, md, txt, xml, csv, yml, yaml as text and everything else as binary.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 3: Content hashing

**Files:** Create `src/lib/hash.js`, `test/hash.test.js`

**Interfaces:**
- Produces: `hashContent(stringOrBlob)` returning a Promise of a lowercase hex SHA-256 string.

- [ ] **Step 1:** Write failing tests: hashing a known string returns its known SHA-256 hex; the same input hashes identically twice; differing inputs hash differently; a Blob and the equivalent string hash identically.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement over `crypto.subtle.digest`, normalising strings and Blobs to an ArrayBuffer first.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 4: Difference classification

**Files:** Create `src/lib/diff.js`, `test/diff.test.js`

**Interfaces:**
- Consumes: `parsePath` from Task 2.
- Produces: `classifyFile(remoteMeta, storedFile)` returning one of `new`, `unchanged`, `changed`, `conflict`, `orphaned`. `diffConversation(remoteMetaList, storedFileList)` returning an object with arrays `new`, `changed`, `unchanged`, `conflict`, `orphaned` and a `counts` object.

- [ ] **Step 1:** Write failing tests: no stored file yields `new`; matching size and created timestamp yields `unchanged`; differing size yields `changed`; same size but differing created timestamp yields `changed`; a stored file with `edited` true plus a differing remote yields `conflict`, not `changed`; a stored file with `edited` true and an identical remote yields `unchanged`; a stored file whose path is absent from the remote list yields `orphaned`; `diffConversation` buckets a mixed list correctly and its counts sum to the total considered.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement. Conflict must be checked before changed, since conflict is the protective case.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 5: Card matching heuristic

**Files:** Create `src/lib/match-card.js`, `test/match-card.test.js`

**Interfaces:**
- Produces: `slugifyTitle(title)` returning a hyphenated lowercase slug. `extFromTypeLabel(label)` returning an extension or null. `matchCard({title, typeLabel}, candidatePaths)` returning `{path, confidence}` where confidence is `exact`, `fuzzy`, or `none`.

- [ ] **Step 1:** Write failing tests using strings observed on the live page: title `Fbmp fleet thresholds` with type label `Code · HTML` matches `/mnt/user-data/outputs/fbmp-fleet-thresholds.html` with confidence `exact`; a title matching no candidate returns confidence `none` and a null path; a title matching two candidates returns confidence `none` rather than guessing; a title differing only by punctuation or extra whitespace still matches; `extFromTypeLabel` handles `Code · HTML`, `Code · CSS`, `Image · PNG`, and returns null for an unrecognised label; matching is case-insensitive.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement. Match on basename without extension first; only accept when exactly one candidate matches. Ambiguity must return `none` so the caller opens the picker.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 6: Interceptor signal detection

**Files:** Create `src/lib/signal.js`, `test/signal.test.js`

**Interfaces:**
- Produces: `isFileSignal(url)` returning boolean. `conversationIdFromUrl(url)` returning a UUID string or null.

- [ ] **Step 1:** Write failing tests: a completion endpoint URL for a conversation is a signal; the file download endpoint is a signal; the file list endpoint is not a signal, since responding to it would recurse; analytics, telemetry, and static asset URLs are not signals; `conversationIdFromUrl` extracts the UUID from both a chat page URL and an API URL and returns null when absent; a malformed URL returns false rather than throwing.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement, guarding URL parsing in a try/catch that returns false.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 7: Database layer

**Files:** Create `src/lib/db.js`, `test/db.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `openDb()`; `putConversation(record)`; `getConversation(id)`; `listConversations()`; `deleteConversation(id)`; `putFile(record)`; `getFile(id)`; `listFiles(convId)`; `deleteFile(id)`; `fileId(convId, path)`; `storageUsage()` returning per-conversation byte totals. Object stores `conversations` keyed by `id` and `files` keyed by `id` with a `by_conv` index.

- [ ] **Step 1:** Write failing tests: a stored conversation reads back identically; `listConversations` returns newest-updated first; `putFile` upserts, so writing the same conversation and path twice leaves one record with the later content; `listFiles` returns only that conversation's files; `deleteConversation` cascades and removes its files; `deleteFile` leaves siblings intact; a Blob round-trips through storage with its bytes and type intact; `fileId` is stable for the same inputs; `storageUsage` sums text and Blob sizes per conversation.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement over raw IndexedDB with a small promise wrapper. Version 1 schema created in `onupgradeneeded`.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 8: Claude API adapter

**Files:** Create `src/content/api.js`, `test/api.test.js`

**Interfaces:**
- Consumes: `parsePath` from Task 2.
- Produces: `resolveOrgId()`; `listFiles(orgId, convId)` returning `{files, metadata}` filtered to outputs; `downloadFile(orgId, convId, path)` returning a string for text kinds and a Blob for binary; `conversationTitle()`. All accept an injectable fetch for testing.

- [ ] **Step 1:** Write failing tests against a mocked fetch: `resolveOrgId` picks the organisation whose capabilities include chat, not the API-only one; `listFiles` parses the real response shape and returns only outputs paths, excluding uploads; `listFiles` surfaces a descriptive error when the response shape is unrecognised; `downloadFile` returns a string for an HTML path and a Blob for a PNG path; a 404 raises a `FileMissingError`; a 401 or 403 raises an `AuthError`; requests are issued with credentials included.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement. Endpoint paths appear here and nowhere else. Export the two error classes.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 9: Message contract and settings

**Files:** Create `src/lib/messages.js`, `src/lib/settings.js`, `test/settings.test.js`

**Interfaces:**
- Produces: message type constants `CAPTURE_ALL`, `CAPTURE_FILE`, `SYNC_CHECK`, `FILES_CHANGED`, `SAVE_FILES`, `GET_STATUS`. `getSettings()` and `setSetting(key, value)` over extension sync storage, with defaults `autoCapture` false and `theme` `system`.

- [ ] **Step 1:** Write failing tests with a stubbed extension storage API: defaults are returned when storage is empty; `autoCapture` defaults to false; a written setting reads back; an unknown key is rejected rather than stored.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 10: Service worker router

**Files:** Create `src/background/sw.js`, `test/sw-router.test.js`

**Interfaces:**
- Consumes: `db.js`, `messages.js`, `settings.js`, `diff.js`.
- Produces: `handleMessage(message, sender, deps)` — a pure-ish router taking injected dependencies so it can be tested without a browser.

- [ ] **Step 1:** Write failing tests: `SAVE_FILES` writes each file and upserts its conversation record; `SAVE_FILES` recomputes the conversation's file count and byte total; `FILES_CHANGED` is ignored when auto-capture is off; `FILES_CHANGED` with auto-capture on requests a sync from the sending tab; repeated `FILES_CHANGED` within the debounce window trigger only one sync; an unknown message type returns an error result rather than throwing.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement the router plus a thin runtime listener that wires real dependencies to it.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Commit.

---

## Task 11: Design tokens and base styles

**Files:** Create `src/styles/tokens.css`

- [ ] **Step 1:** Define tokens on `:root` for the light scheme and override under a dark-scheme media query plus an explicit dark attribute selector, so an in-app theme toggle can win in both directions.
- [ ] **Step 2:** Define a warm near-black ground and warm off-white surfaces, a clay accent, and semantic state colours for new, changed, current, edited, and orphaned. Every state token pairs a colour with a foreground that meets AA against it.
- [ ] **Step 3:** Define a system UI font stack and a monospace stack, three font sizes, a spacing scale, two radii, and one focus-ring token.
- [ ] **Step 4:** Verify every token has a value on bare `:root`, so nothing is defined only inside a media query.
- [ ] **Step 5:** Commit.

---

## Task 12: Sandboxed renderer

**Files:** Create `src/options/sandbox.html`, `src/options/sandbox.js`, `src/options/preview.js`, `test/preview.test.js`

**Interfaces:**
- Produces: `renderInSandbox(iframeEl, {kind, mime, content, name})` on the host side, resolving when the sandbox acknowledges.

- [ ] **Step 1:** Write failing tests for the host side with a stubbed iframe: text HTML posts a message carrying the content; a Blob is converted to an object URL before posting and revoked after acknowledgement; an unsupported kind resolves to an unsupported-preview result rather than posting.
- [ ] **Step 2:** Run tests. Expected: fail.
- [ ] **Step 3:** Implement the host side, then the sandbox page, which listens for the message and writes HTML into a nested frame, sets an image source for image kinds, and posts an acknowledgement. The sandbox must never assume the parent is trusted beyond the expected message shape.
- [ ] **Step 4:** Run tests. Expected: pass.
- [ ] **Step 5:** Manually verify in Chrome that a captured HTML file with inline scripts renders and runs, and that its console shows no CSP violations.
- [ ] **Step 6:** Commit.

---

## Task 13: Options page shell

**Files:** Create `src/options/options.html`, `src/options/options.js`, `src/styles/app.css`

- [ ] **Step 1:** Build the three-pane layout — conversations rail, file list, detail pane — with resizable dividers.
- [ ] **Step 2:** Render conversations from the database, showing title, file count, total size, and capture date.
- [ ] **Step 3:** Render the selected conversation's files with a leading edge rule and a text label for each state, filename in monospace.
- [ ] **Step 4:** Wire the detail pane's Preview and Code tabs behind a shared header.
- [ ] **Step 5:** Implement empty and first-run states explaining the two capture routes.
- [ ] **Step 6:** Implement full keyboard navigation and visible focus rings; verify tab order and AA contrast in both schemes.
- [ ] **Step 7:** Commit.

---

## Task 14: Editor

**Files:** Create `src/options/editor.js`

- [ ] **Step 1:** Mount CodeMirror 6 into the Code tab, choosing a language mode from the file extension and falling back to plain text.
- [ ] **Step 2:** Load the selected file's content, tracking dirty state against the loaded value.
- [ ] **Step 3:** Implement Save — write content, recompute the hash, set the edited flag, clear dirty state.
- [ ] **Step 4:** Warn on navigating away from unsaved changes.
- [ ] **Step 5:** Disable the editor for binary files, showing the preview instead.
- [ ] **Step 6:** Commit.

---

## Task 15: File and conversation actions

**Files:** Create `src/options/export.js`; modify `src/options/options.js`

- [ ] **Step 1:** Implement per-file Delete and per-conversation Delete, each behind a confirmation, using the cascade from Task 7.
- [ ] **Step 2:** Implement single-file export via an object URL download.
- [ ] **Step 3:** Implement conversation export as a zip via fflate, named after the conversation.
- [ ] **Step 4:** Implement Update and Update all, routed through the service worker to the content script; when the classification is `conflict`, show a blocking confirmation naming the file and stating that local edits will be lost, and proceed only on explicit confirmation.
- [ ] **Step 5:** Handle the no-claude.ai-tab case per the spec fallback, and surface the auth-expired error as a sign-in prompt.
- [ ] **Step 6:** Commit.

---

## Task 16: Content script and card injection

**Files:** Create `src/content/cards.js`, `src/content/main.js`

**Interfaces:**
- Consumes: `api.js`, `match-card.js`, `messages.js`, `diff.js`.

- [ ] **Step 1:** Implement the content script entry: resolve organisation and conversation identifiers, cache the organisation identifier, and expose message handlers for `CAPTURE_ALL`, `CAPTURE_FILE`, and `SYNC_CHECK`.
- [ ] **Step 2:** Implement card discovery with a mutation observer, debounced, idempotent — a card must never receive two buttons.
- [ ] **Step 3:** Bind each card to a path via `matchCard`; on confidence `none`, wire the button to open a picker listing the conversation's files.
- [ ] **Step 4:** Label the button Save or Update from stored state, with a change indicator when the remote differs, and render success as a state change on the button rather than a toast.
- [ ] **Step 5:** Style injected elements under a namespaced class prefix so they cannot collide with Claude's own styles, and ensure removal of the extension leaves no residue.
- [ ] **Step 6:** Manually verify against the reference conversation that all ten output files can be captured from their cards.
- [ ] **Step 7:** Commit.

---

## Task 17: Main-world interceptor

**Files:** Create `src/content/interceptor.js`

- [ ] **Step 1:** Patch the page's fetch and XHR open/send, recording only the request URL.
- [ ] **Step 2:** On a URL for which `isFileSignal` is true, post a signal message to the isolated content script scoped to the page origin. Read no response bodies at all — the URL alone is sufficient, which removes any risk of consuming a stream the page needs.
- [ ] **Step 3:** Wrap every hook so any internal failure falls through to the original function untouched.
- [ ] **Step 4:** Relay the signal from the content script to the service worker as `FILES_CHANGED`.
- [ ] **Step 5:** Manually verify that with auto-capture off nothing is written, and that with it on a newly written file is captured within a few seconds; confirm Claude's own behaviour, including streaming responses and file downloads, is unaffected.
- [ ] **Step 6:** Commit.

---

## Task 18: Popup

**Files:** Create `src/popup/popup.html`, `src/popup/popup.js`, `src/styles/popup.css`

- [ ] **Step 1:** Show the current conversation's title and a one-line count summary of new, changed, and unchanged.
- [ ] **Step 2:** List output files with their state, and implement Capture all.
- [ ] **Step 3:** Add the auto-capture toggle and a link to the options page.
- [ ] **Step 4:** Handle the non-conversation page case with a clear explanatory state rather than an empty list.
- [ ] **Step 5:** Commit.

---

## Task 19: End-to-end verification

- [ ] **Step 1:** Run the full test suite; confirm it passes and record the count.
- [ ] **Step 2:** Build, load unpacked, and verify against the reference conversation: capture all, render each of the ten files, edit one and save, update a file, trigger and confirm the conflict warning, delete a file, delete a conversation, export a zip.
- [ ] **Step 3:** Confirm the extension-origin cookie question from the spec, and record the outcome and which path the implementation took in the README.
- [ ] **Step 4:** Write the README covering install, usage, and the private-API caveat.
- [ ] **Step 5:** Commit.

---

## Self-Review

**Spec coverage.** Capture scope Task 8 and 16; conversation grouping Tasks 7 and 13; overwrite versioning Task 15; conflict warning Tasks 4 and 15; single-file rendering Task 12; CodeMirror Task 14; card button Task 16; popup Task 18; interception as signal Tasks 6 and 17; auto-capture default off Tasks 9 and 10; data model Task 7; change detection Task 4; error handling Tasks 8 and 15; visual design Tasks 11 and 13; build and testing Task 1; export Task 15.

**Placeholder scan.** No TBDs. Every step names a concrete action with concrete expected behaviour.

**Type consistency.** `fileId(convId, path)` from Task 7 is the identifier used throughout. `classifyFile` returns the same five states consumed in Tasks 13, 15, and 16. `parsePath` returns `name`, `ext`, `mime`, `kind`, consumed unchanged in Tasks 8, 12, and 14. `matchCard` returns `{path, confidence}` consumed in Task 16.
