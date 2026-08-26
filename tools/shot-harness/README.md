# Screenshot harness

Static pages that render Trove's real surfaces using the **shipped**
stylesheets and fonts, seeded with plausible content. The screenshots on the
landing page come from here, so the pictures exercise the same CSS the
extension does rather than being mockups of it.

They also serve as a way to inspect layout without loading the extension,
which is useful because Chrome does not allow automating `chrome-extension://`
pages.

## Running

Serve the repository root — the pages link stylesheets by absolute path so
that the `@font-face` rules inside them resolve:

```bash
python -m http.server 8788
```

Then open:

| Page | Shows |
|---|---|
| `/tools/shot-harness/library.html` | The library, with a file selected and previewed |
| `/tools/shot-harness/reader.html` | The Reader, with a rendered file on paper |
| `/tools/shot-harness/popup.html` | The popup, scaled up as a product shot |
| `/tools/shot-harness/modal.html` | The screenshot modal, over a full-screen render |

`modal.html` imports the real `screenshot-modal.js` and stubs
`chrome.runtime.sendMessage`, so the modal under inspection is the shipped one
with only the capture faked.

## Caveats

Bump the `?v=` on the stylesheet links if you change CSS and the page keeps
serving the old file — a stale cache here once cost an hour of chasing a
layout bug that had already been fixed.

These pages are development tooling. They are not part of the published site,
and nothing in `src/` imports them.
