/**
 * CodeMirror 6 mount for the Code tab.
 *
 * Binary files are not editable: there is nothing useful a text editor can do
 * with a PNG, and letting someone save mangled bytes over a captured file
 * would be a data-loss bug wearing a feature's clothes.
 */

import { EditorState } from '@codemirror/state'
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

/** Reads the page's own tokens, so the editor matches the app in both schemes. */
function token(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function theme() {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: token('--ink-sunken', '#100f0c'),
        color: token('--bone', '#ede7dc'),
        fontSize: token('--text-sm', '12.5px'),
      },
      '.cm-scroller': {
        fontFamily: token('--font-mono', 'ui-monospace, Menlo, monospace'),
        lineHeight: '1.6',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: token('--bone-faint', '#6f6a60'),
        border: 'none',
        paddingRight: '10px',
      },
      '.cm-activeLine': { backgroundColor: token('--ink-raised', '#1c1a16') },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: token('--bone-dim', '#9a9287') },
      '.cm-content': { padding: '14px 0' },
      '&.cm-focused': { outline: 'none' },
      '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(200,106,70,0.28)' },
      '.cm-cursor': { borderLeftColor: token('--clay', '#c86a46') },
    },
    { dark: true },
  )
}

function highlight() {
  return HighlightStyle.define([
    { tag: tags.comment, color: token('--bone-faint', '#6f6a60'), fontStyle: 'italic' },
    { tag: [tags.string, tags.special(tags.string)], color: token('--state-current', '#6e8b62') },
    { tag: [tags.number, tags.bool, tags.null], color: token('--state-changed', '#c99a3e') },
    { tag: [tags.keyword, tags.operatorKeyword], color: token('--clay', '#c86a46') },
    { tag: [tags.tagName], color: token('--clay', '#c86a46') },
    { tag: [tags.attributeName, tags.propertyName], color: token('--state-edited', '#a6628a') },
    { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: token('--bone', '#ede7dc') },
    { tag: tags.className, color: token('--state-changed', '#c99a3e') },
  ])
}

export function createEditor(host, { onDirtyChange }) {
  let view = null
  let baseline = ''

  function destroy() {
    view?.destroy()
    view = null
  }

  return {
    /** @returns {boolean} whether the file is editable */
    load(file) {
      destroy()
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
            syntaxHighlighting(highlight()),
            theme(),
            EditorView.lineWrapping,
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
