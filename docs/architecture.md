# Architecture

How Trove's pieces fit, and why they are arranged this way. Each boundary here
exists because the alternative caused a bug or told the user something untrue.

## The three worlds

A Chrome extension runs code in contexts that cannot see each other's variables.
Trove uses all three, and which world a job belongs in is the main structural
decision in the codebase.

| Component | World | Job |
|---|---|---|
| `content/interceptor.js` | **Main**, on claude.ai | Patches `fetch`/`XHR`. Reads request URLs, raises change signals. |
| `content/main.js` | **Isolated**, on claude.ai | The only component that talks to Claude's API. Injects card buttons. |
| `background/sw.js` + `router.js` | Extension worker | Routes messages. The only writer to storage. |
| `options/`, `popup/` | Extension pages | The library, the Reader, the sandboxed renderer, the toolbar panel. |

### Why the content script owns all networking

It is same-origin with claude.ai, so the session cookie attaches with no token
handling. An extension page fetching claude.ai is a *cross-site* request, and
whether the cookie survives depends on its `SameSite` attribute — which is not
ours to rely on.

So when an extension page needs the API, it messages the worker, which finds an
open claude.ai tab and asks its content script. If no such tab exists, the worker
opens the conversation in a background tab, does the work, and closes it again.

## The data flow of a capture

```
card button / popup / library
        │  message
        ▼
content/main.js ── listOutputFiles ──▶ claude.ai   (metadata only)
        │
        │  diff against storage: new / changed / unchanged / conflict / orphaned
        ▼
content/capture.js ── downloadFile ──▶ claude.ai   (bytes, only for what moved)
        │
        │  SAVE_FILES
        ▼
background/router.js ──▶ IndexedDB
```

The metadata call is what makes this cheap. `list-files` returns each file's size
and creation timestamp, so deciding what is stale costs one request and zero
downloads. Only files that actually moved get fetched.

## Interception is a signal, not a source

The interceptor never reads a response body. It looks at request URLs, decides
whether one implies Claude may have written to the sandbox, and posts a message
saying *look again*. The worker debounces, re-lists, and pulls what changed.

This is deliberate. Claude streams a file's full text when it is **created** but
only a diff when it is **edited**. Content reconstructed from the stream would be
correct at first and then quietly drift, and a wrong file that looks right is
worse than no file. The API stays the single source of truth.

The interceptor also runs inside a page the user depends on, so every hook falls
through to the original function on any failure. A defect in capture code must
not be able to break someone's Claude session.

## Rendering, and why it is sandboxed

MV3 extension pages run under a content security policy that forbids inline
script, and **an iframe inherits its parent's policy**. Captured files are
self-contained HTML with inline `<script>` and `<style>`, so rendering one in an
ordinary extension page produces a blank frame and console errors.

The fix is Chrome's documented escape hatch: a page declared under the manifest's
`sandbox` key gets a relaxed policy and a unique opaque origin. The options page
embeds it in an iframe and passes content in by `postMessage`.

That solves correctness and security together. The file's scripts run exactly as
written, while the opaque origin denies them access to extension storage,
extension APIs, and the user's Claude session. Captured files are generated code
the user has not necessarily read, and are treated as untrusted throughout.

**The handshake matters.** The sandbox announces readiness and the host queues
render requests until it arrives. Posting into an iframe that has not finished
loading drops the message silently, which showed up as a preview stuck on its
placeholder whenever a request beat the frame's script.

## Storage

IndexedDB in the extension origin, two stores.

- **conversations**, keyed by the conversation uuid
- **files**, keyed by `convId|path`, indexed by `convId`

The sandbox path is stable across edits upstream, which makes it a natural key:
a re-pull becomes a plain upsert rather than a match-and-merge, and capturing a
conversation twice is idempotent.

Binary content is persisted as a `Uint8Array` and handed back as a `Blob`.
Structured cloning of Blobs is uneven across IndexedDB implementations, and some
`SubtleCrypto` implementations reject a cross-realm `ArrayBuffer` while accepting
a typed-array view over it. A typed array costs the same bytes as a Blob, unlike
base64.

### What a re-capture must not clobber

A capture replaces content and upstream metadata by design. It must **not**
replace the name the user chose, or a rename would silently undo itself the next
time the source moved on. `lib/naming.js` owns that list, and the router applies
it on every write.

## State, and the five words for it

`lib/diff.js` classifies each file into exactly one state:

| State | Meaning |
|---|---|
| `new` | In the conversation, not in your library |
| `unchanged` | Your copy and the conversation agree |
| `changed` | The source moved on |
| `conflict` | The source moved on **and** you edited your copy |
| `orphaned` | Gone from the conversation; your copy is all that is left |

`conflict` is checked **before** `changed`, because it is the protective case.
Trove keeps no version history, so a re-pull over a local edit is the one action
that cannot be undone, and that distinction is the only guard rail.

## Card matching

A card in the transcript shows a humanised title (`Trove design`) and a type
label (`Code · HTML`). The file behind it is `trove-design.html`. Matching is a
heuristic, but a constrained one: the candidate set is always the conversation's
known file list, so the answer space is small and finite.

The rule that matters is that **ambiguity never guesses**. Two candidates
matching is reported as no match, which sends the caller to an explicit picker. A
wrong binding would silently capture or overwrite the wrong file.

## Testing

Pure logic lives in `src/lib/` and is unit tested with vitest and an in-memory
IndexedDB. Browser-bound code stays thin on purpose, so most behaviour can be
checked without a browser.

`tools/check-ids.mjs` runs in CI and verifies that every element id a page script
reaches for exists in its markup. A rename on one side of that boundary fails
silently at runtime — `el('thing')` returns null, the listener is never attached,
and the button simply does nothing.

## Known structural gaps

- **Message index.** The Reader's lineage strip is designed to read
  `conversation › msg 27 › /path`, but the file API returns no message index.
  Deriving it means fetching the conversation tree and matching each path to the
  tool call that wrote it.
- **Multi-file rendering.** A captured page referencing `./style.css` renders with
  that reference unresolved. Resolving it means rewriting references to blob URLs
  of sibling files before handing the markup to the sandbox.
- **The endpoints are private.** They will change. All knowledge of them is
  confined to `content/api.js` so that a break is a one-file repair.
