import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'

// jsdom ships a `crypto` global without `subtle`, which hash.js needs.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}
