# Contributing to Trove

Thanks for looking. Trove is small and opinionated, and the fastest way to get a
change merged is to know which parts are firm and which are open.

## Getting set up

```bash
git clone https://github.com/UrsaCode/trove.git
cd trove
npm install
npm test
npm run build
```

Load `dist/` unpacked at `chrome://extensions` with Developer mode on. Use
`npm run dev` while working, and press reload on the Trove card after each
rebuild — Chrome does not pick up changes on its own.

To exercise it you need a real Claude conversation that has produced files. A
conversation where Claude wrote several HTML files and then edited some of them
is the most useful test case, because it covers capture, divergence and re-pull
in one place.

## The shape of the codebase

Pure logic lives in `src/lib/` and is unit tested. Browser-bound code — DOM
injection, rendering, the editor — stays thin, so that most behaviour can be
tested without a browser.

```
src/lib/        pure functions: paths, diffing, naming, storage, settings
src/content/    runs on claude.ai; api.js is the only endpoint-aware module
src/background/ message routing and the only writer to storage
src/options/    the library, the Reader, the sandboxed renderer
src/popup/      the toolbar panel
src/ui/         shared pieces: the mark, file glyphs, dialogs
```

If you are adding behaviour, ask whether the decision it makes can be a pure
function. Usually it can, and then it can be tested.

## Things that are firm

These are not arbitrary; each one exists because the alternative caused a bug or
told the user something untrue.

- **`src/content/api.js` is the only module that may know a Claude endpoint.**
  Those endpoints are private and will change. Containing them means a break is
  a one-file repair.
- **The interceptor reads request URLs and nothing else.** It never touches a
  response body. Claude streams a file's full text on creation but only a diff on
  edit, so content reconstructed from the stream starts correct and silently goes
  stale.
- **Captured files are untrusted.** They render only inside the manifest-declared
  sandbox page, which has an opaque origin. Never render captured content in an
  ordinary extension page.
- **The interceptor must never be able to break a Claude session.** Every hook
  falls through to the original on failure.
- **Colour means one of three things** — see the design rules in the README.
  Adding a fourth colour, or using aqua for emphasis, is a change to the design
  language and needs discussing first.
- **The UI must not claim something untrue.** A label that says work is happening
  when none is, or a count that is stale, is treated as a bug of the same
  severity as a crash.

## Things that are open

- More file types in the renderer and the editor
- Better card matching, including cases the current heuristic punts to the picker
- Resolving sibling references so multi-file sites render
- Message indices in the lineage strip (see below)
- Accessibility and keyboard coverage
- Translations

## Known gaps, if you want somewhere to start

- **Message index.** The lineage strip is designed to read
  `conversation › msg 27 › /path`, but the file API does not return a message
  index. Deriving it means fetching the conversation tree and matching each path
  to the tool call that wrote it.
- **Multi-file rendering.** A captured page referencing `./style.css` renders
  with that reference unresolved. Resolving it means rewriting references to blob
  URLs of sibling files before handing the markup to the sandbox.
- **Screenshot permissions.** Screenshots use `captureVisibleTab`, which needs
  `activeTab`. If it fails in your build, that is the place to look.

## Style

- Match the surrounding code. There is no linter to argue with.
- Comments explain *why*, not *what*. If a line needs a comment to say what it
  does, rename something instead.
- Copy rules: never "artifact", "sandbox", or "output directory" in user-facing
  text. It says *file*, and where the file came from. Prefer "Save to Trove" over
  "Save" where the direction of travel is the thing people get wrong.

## Tests

```bash
npm test              # once
npm run test:watch    # while working
```

Write the failing test first. New pure logic should arrive with tests for the
interesting cases, not just the happy path — the diffing and naming tests are a
reasonable model.

Anything browser-bound gets verified by hand against a real conversation. Say in
your pull request what you checked, and what you could not.

## Pull requests

- One concern per pull request.
- Say what you changed and why. If you fixed a bug, say what was actually wrong,
  not just what you did about it.
- Say what you verified. "Tests pass" and "I clicked it and it worked" are
  different claims, and both are useful.
- If you touched the UI, a screenshot helps.

## Reporting bugs

Include your Chrome version, whether the extension was built from `main`, and
what you expected. If it involves a specific conversation, the *shape* of it —
how many files, which types, whether any had been edited — is more useful than
its contents. Please do not paste conversation contents into an issue.

## Security

If you find something with security implications — a way for captured content to
escape the sandbox, or for Trove to leak session data — please do not open a
public issue. Email **security@ursacode.com** with a description of the problem
class. Do not include a working exploit.

## Code of conduct

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
