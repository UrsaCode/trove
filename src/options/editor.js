/**
 * CodeMirror 6 mount for Source view.
 *
 * Binary files are not editable: there is nothing useful a text editor can do
 * with a PNG, and letting someone save mangled bytes over a captured file
 * would be a data-loss bug wearing a feature's clothes.
 */

import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { bracketMatching, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'

/** Language by extension; anything unknown gets plain text, not a guess. */
function languageFor(ext) {
  switch (ext) {
    case 'html':
    case 'htm':
    case 'svg':
    case 'xml':
      return [html()]
    case 'css':
      return [css()]
    case 'js':
    case 'mjs':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return [javascript()]
    case 'json':
      return [json()]
    default:
      return []
  }
}

const troveTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      backgroundColor: 'var(--panel)',
      color: 'var(--bone)',
      fontSize: 'var(--t-12)',
    },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.65' },
    '.cm-gutters': {
      backgroundColor: 'var(--panel)',
      color: 'var(--dimmer)',
      border: 'none',
      borderRight: '1px solid var(--rule)',
      paddingRight: '10px',
    },
    '.cm-activeLine': { backgroundColor: 'var(--raise)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--dim)' },
    '.cm-content': { padding: '14px 0' },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(95,211,188,.22)' },
    '.cm-cursor': { borderLeftColor: 'var(--tether)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(229,169,60,.25)' },
  },
  { dark: true },
)

/* Aqua is reserved for the tether, so syntax colour stays off it. */
const troveHighlight = HighlightStyle.define([
  { tag: tags.comment, color: '#585f6b', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string)], color: '#9fc48a' },
  { tag: [tags.number, tags.bool, tags.null], color: '#e5a93c' },
  { tag: [tags.keyword, tags.operatorKeyword], color: '#e0866e' },
  { tag: tags.tagName, color: '#7fb2e5' },
  { tag: [tags.attributeName, tags.propertyName], color: '#c99ad8' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#e9e7e2' },
  { tag: tags.className, color: '#e5a93c' },
  { tag: tags.angleBracket, color: '#585f6b' },
])

export function createEditor(host, { onDirtyChange, wrap = true } = {}) {
  let view = null
  let baseline = ''
  const wrapping = new Compartment()

  function destroy() {
    view?.destroy()
    view = null
  }

  return {
    /** @returns {boolean} whether the file is editable */
    load(file) {
      destroy()
      host.textContent = ''
      if (!file || file.kind !== 'text') return false

      baseline = file.content
      view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: file.content,
          extensions: [
            lineNumbers(),
            history(),
            bracketMatching(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
            syntaxHighlighting(troveHighlight),
            troveTheme,
            wrapping.of(wrap ? EditorView.lineWrapping : []),
            ...languageFor(file.ext),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onDirtyChange(update.state.doc.toString() !== baseline)
            }),
          ],
        }),
      })
      onDirtyChange(false)
      return true
    },

    setWrap(on) {
      view?.dispatch({ effects: wrapping.reconfigure(on ? EditorView.lineWrapping : []) })
    },

    value() {
      return view ? view.state.doc.toString() : null
    },

    markSaved() {
      baseline = this.value() ?? baseline
      onDirtyChange(false)
    },

    destroy,
  }
}
