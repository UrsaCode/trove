/**
 * The Claude API adapter.
 *
 * This is the ONLY module permitted to know Claude endpoint shapes. These are
 * private, undocumented endpoints; when they change, this file is the whole
 * repair. Nothing else in the extension may contain an endpoint path.
 *
 * Every request runs from a content script, which is same-origin with
 * claude.ai, so the session cookie attaches without any token handling.
 */

import { parsePath, isOutput } from '../lib/paths.js'

const ORIGIN = 'https://claude.ai'

/** The session is not usable - the user must sign in to claude.ai. */
export class AuthError extends Error {
  constructor(status) {
    super('Not signed in to claude.ai, or the session has expired.')
    this.name = 'AuthError'
    this.status = status
  }
}

/** The file is gone upstream; the stored copy becomes orphaned. */
export class FileMissingError extends Error {
  constructor(path) {
    super(`File no longer exists in the conversation: ${path}`)
    this.name = 'FileMissingError'
    this.path = path
  }
}

/** The endpoint answered, but not in a shape we recognise. */
export class ApiShapeError extends Error {
  constructor(detail) {
    super(`Unexpected response from claude.ai (${detail}). The private API may have changed.`)
    this.name = 'ApiShapeError'
  }
}

function api(...segments) {
  return `${ORIGIN}/api/${segments.join('/')}`
}

async function get(url, { fetchImpl = globalThis.fetch, path } = {}) {
  const response = await fetchImpl(url, { credentials: 'include' })
  if (response.status === 401 || response.status === 403) throw new AuthError(response.status)
  if (response.status === 404) throw new FileMissingError(path ?? url)
  if (!response.ok) throw new ApiShapeError(`HTTP ${response.status}`)
  return response
}

/**
 * The account may belong to several organisations; only the one with the chat
 * capability owns conversations. The API-only organisation would 404 here.
 */
export async function resolveOrgId({ fetchImpl } = {}) {
  const response = await get(api('organizations'), { fetchImpl })
  const orgs = await response.json()
  if (!Array.isArray(orgs)) throw new ApiShapeError('organizations was not an array')

  const chat = orgs.find((o) => Array.isArray(o?.capabilities) && o.capabilities.includes('chat'))
  if (!chat?.uuid) throw new ApiShapeError('no organisation with the chat capability')
  return chat.uuid
}

/**
 * Every file the conversation sandbox holds, narrowed to the outputs directory
 * - the files Claude generated. Uploads are deliberately excluded.
 *
 * Returns listing metadata only. Content costs a separate request per file,
 * which is why change detection compares sizes and timestamps first.
 */
export async function listOutputFiles(orgId, convId, { fetchImpl } = {}) {
  const response = await get(
    api('organizations', orgId, 'conversations', convId, 'wiggle', 'list-files'),
    { fetchImpl },
  )
  const body = await response.json()
  if (!Array.isArray(body?.files)) throw new ApiShapeError('listing had no files array')

  const metaByPath = new Map((body.files_metadata ?? []).map((m) => [m.path, m]))

  return body.files.filter(isOutput).map((path) => {
    const meta = metaByPath.get(path) ?? {}
    const { name, ext, mime, kind } = parsePath(path, meta.content_type)
    return {
      path,
      name,
      ext,
      mime,
      kind,
      size: meta.size ?? 0,
      created_at: meta.created_at ?? null,
    }
  })
}

/**
 * The file's CURRENT content. This is the crux of the whole design: the
 * endpoint reflects edits made after the file was first written, so "update"
 * is simply this same request issued again.
 */
export async function downloadFile(orgId, convId, path, { fetchImpl } = {}) {
  const url = `${api('organizations', orgId, 'conversations', convId, 'wiggle', 'download-file')}?path=${encodeURIComponent(path)}`
  const response = await get(url, { fetchImpl, path })

  // The endpoint labels everything octet-stream, so the path decides.
  const { name, ext, mime, kind } = parsePath(path)
  const content = kind === 'text' ? await response.text() : await response.blob()
  return { path, name, ext, mime, kind, content }
}

/**
 * The conversation title as shown in the tab. Cheap and accurate; the full
 * conversation endpoint would download every message just to read one field.
 */
export function conversationTitle(doc = globalThis.document) {
  const title = doc?.title ?? ''
  return title.replace(/\s*[-–—]\s*Claude\s*$/, '').trim() || 'Untitled conversation'
}
