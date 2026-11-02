/**
 * OpenCode Go usage tracker — Host half.
 *
 * Reads the OpenCode Go API key from the OpenCode CLI's own auth file and asks
 * the OpenCode Console for the subscription's rolling 5-hour, weekly, and
 * monthly usage windows. The browser half renders the result under the
 * conversation composer; this half owns the credential, the network call, and
 * the short-lived cache, so the browser never receives the API key.
 *
 * Everything user-visible (labels, formatting) lives in the Client half; this
 * module returns normalized JSON facts only.
 */
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Cordis function-plugin name. */
export const name = 'opencode-go-usage'
/** The web route carrier and the browser-session trust fence. */
export const inject = ['webServer', 'connection']

/** GET route the Client half addresses (document-relative in the browser). */
const STATUS_ROUTE = '/opencode-go-usage/status'
/** Micro-cents per US dollar: 1 USD = 100 cents = 1e8 micro-cents. */
const MICRO_CENTS_PER_USD = 1e8
/** Console endpoint reporting the Go subscription and its usage meters. */
const STATUS_PATH = '/console/api/go/status'
/** Default auth entry OpenCode writes for the Go provider. */
const DEFAULT_PROVIDER_KEY = 'opencode-go'

/** A failure with a stable machine code the UI can localize. */
class UsageError extends Error {
  /**
   * @param {string} code - stable failure code (no-auth, invalid-auth, ...).
   * @param {string} message - human-readable detail (English, no secrets).
   * @param {{ auth?: object }} [extra] - optional non-secret auth provenance.
   */
  constructor(code, message, extra = {}) {
    super(message)
    this.name = 'UsageError'
    this.code = code
    this.auth = extra.auth
  }
}

/** Clamp a finite number into an inclusive range, or fall back to a default. */
function clampNumber(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** Read one positive integer-ish config value in whole seconds. */
function wholeSeconds(value, fallback, min, max) {
  const number = clampNumber(value, fallback, min, max)
  return Math.round(number)
}

/**
 * Project the Loader row's `config` mapping onto the options this plugin uses.
 * Unknown fields are ignored; every field is optional.
 * @param {unknown} config - raw row config.
 * @returns {object} resolved options.
 */
export function resolveOptions(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const apiBase =
    typeof raw.apiBase === 'string' && raw.apiBase.trim() !== ''
      ? raw.apiBase.trim().replace(/\/+$/, '')
      : 'https://opencode.ai'
  const authFile =
    typeof raw.authFile === 'string' && raw.authFile.trim() !== '' ? raw.authFile.trim() : undefined
  const providerKey =
    typeof raw.providerKey === 'string' && raw.providerKey.trim() !== ''
      ? raw.providerKey.trim()
      : DEFAULT_PROVIDER_KEY
  const apiKey =
    typeof raw.apiKey === 'string' && raw.apiKey.trim() !== '' ? raw.apiKey.trim() : undefined
  return {
    apiBase,
    providerKey,
    apiKey,
    authFile,
    refreshSeconds: wholeSeconds(raw.refreshSeconds, 300, 30, 3600),
    timeoutMs: wholeSeconds(raw.timeoutMs, 15000, 1000, 60000),
  }
}

/**
 * Candidate `auth.json` locations OpenCode uses across platforms, in priority
 * order. A caller-configured path replaces this list entirely.
 * @param {Record<string, string | undefined>} env - process environment.
 * @param {string} home - the user's home directory.
 * @returns {string[]} candidate paths, de-duplicated, order-preserving.
 */
export function authFileCandidates(env = process.env, home = homedir()) {
  const candidates = []
  const push = (path) => {
    if (path !== undefined && path !== '' && !candidates.includes(path)) candidates.push(path)
  }
  push(env.OPENCODE_AUTH_FILE)
  if (env.XDG_DATA_HOME !== undefined && env.XDG_DATA_HOME !== '') {
    push(join(env.XDG_DATA_HOME, 'opencode', 'auth.json'))
  }
  push(join(home, '.local', 'share', 'opencode', 'auth.json'))
  push(join(home, 'Library', 'Application Support', 'opencode', 'auth.json'))
  if (env.APPDATA !== undefined && env.APPDATA !== '') {
    push(join(env.APPDATA, 'opencode', 'auth.json'))
  }
  if (env.LOCALAPPDATA !== undefined && env.LOCALAPPDATA !== '') {
    push(join(env.LOCALAPPDATA, 'opencode', 'auth.json'))
  }
  push(join(home, '.config', 'opencode', 'auth.json'))
  return candidates
}

/** Mask a credential for display: a short prefix plus an ellipsis. */
export function maskKey(key) {
  if (typeof key !== 'string' || key === '') return ''
  return `${key.slice(0, 12)}…`
}

/**
 * Extract the Go API key from one parsed `auth.json` document.
 * OpenCode writes `{ "<provider>": { "type": "api", "key": "oc_sk_…" } }`;
 * a bare string entry and an `apiKey` spelling are also accepted defensively.
 * @param {unknown} document - parsed auth file.
 * @param {string} providerKey - provider entry to read.
 * @returns {string | undefined} the key, when present and non-empty.
 */
export function apiKeyFromAuthDocument(document, providerKey = DEFAULT_PROVIDER_KEY) {
  if (document === null || typeof document !== 'object') return undefined
  const record = document[providerKey]
  let key
  if (typeof record === 'string') key = record
  else if (record !== null && typeof record === 'object') {
    if (typeof record.key === 'string') key = record.key
    else if (typeof record.apiKey === 'string') key = record.apiKey
  }
  if (typeof key !== 'string') return undefined
  const trimmed = key.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Resolve the console API key and its provenance.
 *
 * Priority: explicit `config.apiKey`, then `OPENCODE_GO_API_KEY`, then the
 * provider entry in OpenCode's own `auth.json`. Nothing is written anywhere.
 * @param {object} options - resolved options.
 * @param {{ env?: Record<string, string | undefined>, home?: string, readText?: (path: string) => Promise<string> }} [deps] - injected environment/facts for tests.
 * @returns {Promise<{ key: string, auth: { source: string, file?: string, keyPrefix: string } }>} credential and provenance.
 */
export async function resolveApiKey(options, deps = {}) {
  const env = deps.env ?? process.env
  const home = deps.home ?? homedir()
  const readText = deps.readText ?? ((path) => readFile(path, 'utf8'))

  if (options.apiKey !== undefined) {
    return {
      key: options.apiKey,
      auth: { source: 'config', keyPrefix: maskKey(options.apiKey) },
    }
  }
  const envKey = env.OPENCODE_GO_API_KEY
  if (typeof envKey === 'string' && envKey.trim() !== '') {
    const key = envKey.trim()
    return { key, auth: { source: 'env', keyPrefix: maskKey(key) } }
  }

  const candidates =
    options.authFile !== undefined ? [options.authFile] : authFileCandidates(env, home)
  let lastMissing = candidates[0]
  for (const file of candidates) {
    let text
    try {
      text = await readText(file)
    } catch {
      continue
    }
    let document
    try {
      document = JSON.parse(text)
    } catch {
      throw new UsageError('bad-auth-file', `OpenCode auth file is not valid JSON: ${file}`, {
        auth: { source: 'auth-file', file },
      })
    }
    const key = apiKeyFromAuthDocument(document, options.providerKey)
    if (key === undefined) {
      throw new UsageError(
        'no-auth',
        `OpenCode auth file has no "${options.providerKey}" API key: ${file}`,
        { auth: { source: 'auth-file', file } },
      )
    }
    return {
      key,
      auth: { source: 'auth-file', file, keyPrefix: maskKey(key) },
    }
  }

  throw new UsageError(
    'no-auth',
    options.authFile !== undefined
      ? `OpenCode auth file not found: ${options.authFile}`
      : `OpenCode auth file not found (looked in ${candidates.length} locations, starting with ${lastMissing})`,
  )
}

/** Convert a numeric micro-cents field into USD, clamped at zero. */
function usdFromMicroCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0
  return value / MICRO_CENTS_PER_USD
}

/**
 * Read a count that the console serializes as either a JSON number or a
 * numeric string (micro-cents travel as strings to avoid precision loss).
 * @param {unknown} value - raw field.
 * @returns {number} finite non-negative number, 0 otherwise.
 */
function countOf(value) {
  let number = NaN
  if (typeof value === 'number') number = value
  else if (typeof value === 'string' && value.trim() !== '') number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return number
}

/**
 * Normalize one usage meter: raw micro-cents for exactness, USD for display,
 * a percentage, and the reset boundary.
 * @param {any} meter - raw meter object from the console.
 * @returns {object} normalized meter.
 */
export function normalizeMeter(meter) {
  const raw = meter !== null && typeof meter === 'object' ? meter : {}
  const limitMicroCents = countOf(raw.limitMicroCents)
  const usedMicroCents = countOf(raw.usedMicroCents)
  return {
    usedUsd: usdFromMicroCents(usedMicroCents),
    limitUsd: usdFromMicroCents(limitMicroCents),
    percent:
      limitMicroCents > 0
        ? Math.round(Math.min(1000, (usedMicroCents / limitMicroCents) * 100) * 100) / 100
        : 0,
    startsAt: typeof raw.startsAt === 'string' ? raw.startsAt : null,
    resetsAt: typeof raw.resetsAt === 'string' ? raw.resetsAt : null,
  }
}

/**
 * Project the console's `/console/api/go/status` document into the facts the
 * Client half renders. Missing optional groups degrade to nulls rather than
 * failing the whole response.
 * @param {unknown} payload - parsed console response.
 * @returns {object} normalized snapshot.
 */
export function normalizeStatus(payload) {
  if (payload === null || typeof payload !== 'object') {
    throw new UsageError('bad-response', 'OpenCode Console returned an unexpected payload')
  }
  const access = payload.access !== null && typeof payload.access === 'object' ? payload.access : {}
  const meters = access.meters !== null && typeof access.meters === 'object' ? access.meters : {}
  const asString = (value) => (typeof value === 'string' ? value : null)
  return {
    product: asString(payload.product) ?? 'go',
    renewalProduct: asString(payload.renewalProduct),
    currency: asString(payload.renewalCurrency) ?? 'usd',
    subscribedAt: asString(access.startsAt),
    periodEndsAt: asString(access.endsAt),
    cancelAtPeriodEnd:
      typeof payload.cancelAtPeriodEnd === 'boolean'
        ? payload.cancelAtPeriodEnd
        : access.cancelAtPeriodEnd === true,
    useBalance: payload.useBalance === true,
    renewalPending: payload.renewalPending === true,
    nextPeriodPaid: payload.nextPeriodPaid === true,
    renewalStopReason: asString(payload.renewalStopReason),
    meters: {
      fiveHour: normalizeMeter(meters.fiveHour),
      week: normalizeMeter(meters.week),
      month: normalizeMeter(meters.month),
    },
  }
}

/**
 * Perform the console request and normalize its body.
 * @param {object} options - resolved options.
 * @param {string} key - OpenCode Go API key.
 * @param {AbortSignal | undefined} signal - external cancellation.
 * @returns {Promise<object>} normalized snapshot.
 */
export async function fetchGoStatus(options, key, signal) {
  const url = `${options.apiBase}${STATUS_PATH}`
  let response
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${key}`,
        accept: 'application/json',
        'user-agent': 'dsh-opencode-go-usage/1.0',
      },
      signal: signal ?? AbortSignal.timeout(options.timeoutMs),
    })
  } catch (error) {
    const name = error !== null && typeof error === 'object' && 'name' in error ? error.name : ''
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new UsageError('timeout', `OpenCode Console did not answer within ${options.timeoutMs} ms`)
    }
    throw new UsageError('network', `Could not reach OpenCode Console: ${String(
      error !== null && typeof error === 'object' && 'message' in error ? error.message : error,
    )}`)
  }

  if (response.status === 401 || response.status === 403) {
    throw new UsageError(
      'invalid-auth',
      'OpenCode rejected the API key (it may be revoked, expired, or lack usage access)',
    )
  }
  if (!response.ok) {
    let detail = ''
    try {
      const text = (await response.text()).slice(0, 300)
      if (text !== '') detail = `: ${text}`
    } catch {}
    throw new UsageError('http', `OpenCode Console answered HTTP ${response.status}${detail}`)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    throw new UsageError('bad-response', 'OpenCode Console returned a non-JSON body')
  }
  return normalizeStatus(payload)
}

/** Send a JSON response with no-store caching. */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Host plugin body: one authenticated GET route serving a cached snapshot.
 * @param {object} ctx - Cordis context with `webServer` and `connection`.
 * @param {unknown} config - Loader row config.
 */
export function apply(ctx, config) {
  const options = resolveOptions(config)
  const connection = Reflect.get(ctx, 'connection')
  const ttlMs = options.refreshSeconds * 1000

  /** @type {{ at: number, value: object } | null} */
  let cached = null
  /** @type {Promise<object> | null} */
  let inflight = null

  /** Load a snapshot, honoring the cache unless `force` is set. */
  const load = (force) => {
    if (!force && cached !== null && Date.now() - cached.at < ttlMs) {
      return Promise.resolve(cached.value)
    }
    if (inflight !== null) return inflight
    inflight = (async () => {
      try {
        const { key, auth } = await resolveApiKey(options)
        const snapshot = await fetchGoStatus(options, key)
        const value = { ok: true, fetchedAt: new Date().toISOString(), snapshot, auth }
        cached = { at: Date.now(), value }
        return value
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  /** Answer one status request. */
  const handler = async (req, res) => {
    const rejection = connection.requestRejection(req)
    if (rejection !== undefined) {
      res.statusCode = rejection
      res.end()
      return
    }
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('allow', 'GET')
      res.end()
      return
    }
    let force = false
    try {
      force = new URL(String(req.url), 'http://localhost').searchParams.get('force') === '1'
    } catch {}
    try {
      sendJson(res, 200, await load(force))
    } catch (error) {
      const failure =
        error instanceof UsageError
          ? error
          : new UsageError(
              'internal',
              String(
                error !== null && typeof error === 'object' && 'message' in error
                  ? error.message
                  : error,
              ),
            )
      sendJson(res, 200, {
        ok: false,
        code: failure.code,
        message: failure.message,
        ...(failure.auth === undefined ? {} : { auth: failure.auth }),
        fetchedAt: new Date().toISOString(),
      })
    }
  }

  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: STATUS_ROUTE, handler }),
    `opencode-go-usage: GET ${STATUS_ROUTE}`,
  )
}
