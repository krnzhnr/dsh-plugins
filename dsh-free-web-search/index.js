/**
 * free-web-search — free web access for DeepSeek Harness.
 *
 * Registers two providers on the `ctx.web` capability seam, so the built-in
 * `web_search` and `web_fetch` tools keep their schemas and this bundle changes
 * only where the data comes from:
 *
 * - Search (`free-web`): a keyless fallback chain. Tavily's public keyless
 *   endpoint, Exa's hosted anonymous MCP service, Parallel's keyless Search MCP,
 *   TinyFish's keyless MCP, DuckDuckGo HTML, Bing HTML, and DuckDuckGo Lite.
 *   A self-hosted SearXNG instance can be appended as the last resort (it is the
 *   only "no quota" option; host it yourself).
 *   Engines that answer HTTP 429/403 are put on a cooldown and skipped by later
 *   searches until the cooldown expires. A chain-wide budget keeps one search
 *   inside the tool's 60 s timeout.
 * - Fetch (`http-fakeip`): the same safety policy as the shipped
 *   `dsh-web-fetch-http` provider, except that the benchmarking range
 *   198.18.0.0/15 is accepted as a proxy marker. Proxy clients in fake-IP/TUN
 *   mode answer every DNS query with an address from that range, which the
 *   shipped provider rejects as non-public, making `web_fetch` unusable on such
 *   machines. Every other private, loopback, link-local, reserved, and
 *   documentation destination is still refused.
 *
 * No API keys and no third-party dependencies: Node's global `fetch`,
 * `node:dns/promises`, and `node:net` only.
 *
 * @module @local/free-web-search
 */

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const name = 'free-web-search'
export const inject = ['web']

const SEARCH_PROVIDER_ID = 'free-web'
const FETCH_PROVIDER_ID = 'http-fakeip'

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
const EXA_MCP_ENDPOINT = 'https://mcp.exa.ai/mcp'
const PARALLEL_MCP_ENDPOINT = 'https://search.parallel.ai/mcp'
const TINYFISH_MCP_ENDPOINT = 'https://agent.tinyfish.ai/mcp'
const DUCKDUCKGO_ENDPOINT = 'https://html.duckduckgo.com/html/'
const DUCKDUCKGO_LITE_ENDPOINT = 'https://lite.duckduckgo.com/lite/'
const BING_ENDPOINT = 'https://www.bing.com/search'

const PRODUCT_UA = 'deepseek-harness/free-web-search (free keyless search provider)'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const KNOWN_ENGINES = new Set([
  'tavily-keyless',
  'exa-mcp',
  'parallel-mcp',
  'tinyfish-mcp',
  'duckduckgo',
  'bing',
  'duckduckgo-lite',
  'searxng',
])
const DEFAULT_ENGINES = ['tavily-keyless', 'exa-mcp', 'parallel-mcp', 'tinyfish-mcp', 'duckduckgo', 'bing', 'duckduckgo-lite']

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_URL_LENGTH = 2048

/**
 * Rate-limit cooldowns survive across searches in this process. Keyed by engine
 * id; a missing entry or an expired one means the engine may be tried again.
 * @type {Map<string, { until: number }>}
 */
const cooldowns = new Map()

/** Error carrying the seam's machine-readable `code` convention. */
class WebSeamError extends Error {
  constructor(message, code = 'WEB_PROVIDER_ERROR', options) {
    super(message, options)
    this.name = 'WebSeamError'
    this.code = code
  }
}

/**
 * Resolve the bundle's configuration (raw loader row `config`) into defaults.
 * Every field is optional; invalid values fall back instead of failing boot.
 *
 * @param {unknown} config - raw row config.
 * @returns {object} normalized options.
 */
export function resolveOptions(config) {
  const input = config !== null && typeof config === 'object' && !Array.isArray(config) ? config : {}
  const explicitEngines = Array.isArray(input.engines)
    ? input.engines.filter((engine) => typeof engine === 'string' && KNOWN_ENGINES.has(engine))
    : []
  const searxngBaseURL =
    typeof input.searxngBaseURL === 'string' ? input.searxngBaseURL.trim().replace(/\/+/gu, '/').replace(/\/$/u, '') : ''
  let engines = explicitEngines.length > 0 ? [...explicitEngines] : [...DEFAULT_ENGINES]
  if (searxngBaseURL !== '' && !engines.includes('searxng')) engines = [...engines, 'searxng']
  if (searxngBaseURL === '') engines = engines.filter((engine) => engine !== 'searxng')
  if (engines.length === 0) engines = [...DEFAULT_ENGINES]
  return {
    engines,
    searxngBaseURL,
    maxResults: intOr(input.maxResults, 8, 1, 20),
    tavilySearchDepth: input.tavilySearchDepth === 'advanced' ? 'advanced' : 'basic',
    includeAnswer: input.includeAnswer !== false,
    chainBudgetMs: intOr(input.chainBudgetMs, 45_000, 5_000, 120_000),
    cooldownMs: intOr(input.cooldownMs, 300_000, 10_000, 3_600_000),
    engineTimeoutMs: {
      tavily: intOr(input.tavilyTimeoutMs, 10_000, 1_000, 60_000),
      exa: intOr(input.exaTimeoutMs, 12_000, 1_000, 60_000),
      parallel: intOr(input.parallelTimeoutMs, 10_000, 1_000, 60_000),
      tinyfish: intOr(input.tinyfishTimeoutMs, 10_000, 1_000, 60_000),
      duckduckgo: intOr(input.duckduckgoTimeoutMs, 8_000, 1_000, 60_000),
      bing: intOr(input.bingTimeoutMs, 8_000, 1_000, 60_000),
      'duckduckgo-lite': intOr(input.duckduckgoLiteTimeoutMs, 8_000, 1_000, 60_000),
      searxng: intOr(input.searxngTimeoutMs, 10_000, 1_000, 60_000),
    },
    fetch: {
      allowFakeIp: input.allowFakeIp !== false,
      timeoutMs: intOr(input.fetchTimeoutMs, 25_000, 1_000, 300_000),
      maxResponseBytes: intOr(input.maxResponseBytes, 5_000_000, 1_024, 50_000_000),
      maxBodyChars: intOr(input.maxBodyChars, 100_000, 256, 5_000_000),
      maxRedirects: intOr(input.maxRedirects, 5, 0, 20),
      userAgent:
        typeof input.userAgent === 'string' && input.userAgent.trim() !== '' ? input.userAgent.trim() : PRODUCT_UA,
    },
  }
}

/**
 * Register both providers on `ctx.web`.
 *
 * @param {object} ctx - the plugin context; `web` is injected above.
 * @param {unknown} config - raw loader row config.
 */
export function apply(ctx, config) {
  const options = resolveOptions(config)
  ctx.web.registerSearchProvider({
    id: SEARCH_PROVIDER_ID,
    available: () => true,
    search: (request, signal) => runFreeSearch(options, request, signal),
  })
  ctx.web.registerFetchProvider({
    id: FETCH_PROVIDER_ID,
    available: () => true,
    fetch: (request, signal) => runFreeFetch(options, request, signal),
  })
}

// ─── search ─────────────────────────────────────────────────────────────────

/**
 * Run the configured keyless engines in order until one produces results.
 * Engines on a rate-limit cooldown are skipped; the whole chain is bounded by
 * `chainBudgetMs` so one search stays inside the tool's timeout.
 *
 * @param {object} options - normalized bundle options.
 * @param {{query?: string, maxResults?: number}} request - the seam's search request.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<{content?: string, sources: Array<object>, truncated: boolean}>} normalized result.
 */
export async function runFreeSearch(options, request, signal) {
  const query = typeof request?.query === 'string' ? request.query.trim() : ''
  if (query === '') throw new WebSeamError('web search query is empty', 'WEB_INVALID_QUERY')
  const requested = Number.isInteger(request?.maxResults) ? request.maxResults : options.maxResults
  const maxResults = Math.max(1, Math.min(requested, 20))
  const failures = []
  const startedAt = Date.now()
  for (const engineId of options.engines) {
    throwIfAborted(signal)
    const cooling = cooldowns.get(engineId)
    if (cooling !== undefined && cooling.until > Date.now()) {
      failures.push(`${engineId}: cooling down for ${Math.ceil((cooling.until - Date.now()) / 1000)}s`)
      continue
    }
    if (Date.now() - startedAt >= options.chainBudgetMs) {
      failures.push(`chain budget of ${Math.round(options.chainBudgetMs / 1000)}s exhausted`)
      break
    }
    try {
      const outcome = await runEngine(engineId, options, query, maxResults, signal)
      const content =
        typeof outcome?.content === 'string' && outcome.content.trim() !== '' ? outcome.content.trim() : undefined
      const sources = dedupeSources(Array.isArray(outcome?.sources) ? outcome.sources : [])
      if (sources.length > 0 || content !== undefined) {
        cooldowns.delete(engineId)
        return content === undefined ? { sources, truncated: false } : { content, sources, truncated: false }
      }
      failures.push(`${engineId}: no results`)
    } catch (error) {
      if (signal?.aborted === true) throw abortError(signal)
      if (error?.rateLimited === true) {
        const waitMs = error.retryAfterMs ?? options.cooldownMs
        cooldowns.set(engineId, { until: Date.now() + waitMs })
      }
      failures.push(`${engineId}: ${errorMessage(error)}`)
    }
  }
  throw new WebSeamError(`free web search returned no results (${failures.join('; ')})`, 'WEB_PROVIDER_ERROR')
}

async function runEngine(engineId, options, query, maxResults, signal) {
  switch (engineId) {
    case 'tavily-keyless':
      return tavilySearch(options, query, maxResults, signal)
    case 'exa-mcp':
      return exaMcpSearch(options, query, maxResults, signal)
    case 'parallel-mcp':
      return parallelMcpSearch(options, query, maxResults, signal)
    case 'tinyfish-mcp':
      return tinyfishMcpSearch(options, query, maxResults, signal)
    case 'duckduckgo':
      return duckDuckGoSearch(options, query, maxResults, signal)
    case 'bing':
      return bingSearch(options, query, maxResults, signal)
    case 'duckduckgo-lite':
      return duckDuckGoLiteSearch(options, query, maxResults, signal)
    case 'searxng':
      return searxngSearch(options, query, maxResults, signal)
    default:
      throw new Error(`unknown search engine "${engineId}"`)
  }
}

/** Tavily's public keyless search endpoint (no account, rate-limited). */
async function tavilySearch(options, query, maxResults, signal) {
  const body = {
    query,
    max_results: maxResults,
    search_depth: options.tavilySearchDepth,
    include_answer: options.includeAnswer === true,
    include_images: false,
    chunks_per_source: 3,
  }
  const response = await fetchWithTimeout(
    TAVILY_ENDPOINT,
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': options.fetch.userAgent,
        'x-tavily-access-mode': 'keyless',
      },
      body: JSON.stringify(body),
    },
    options.engineTimeoutMs.tavily,
    signal,
  )
  await ensureOk(response, 'Tavily keyless search')
  const json = await readJson(response, 'Tavily')
  const sources = []
  for (const item of Array.isArray(json?.results) ? json.results : []) {
    const url = typeof item?.url === 'string' ? item.url.trim() : ''
    if (url === '') continue
    const source = { url }
    if (typeof item.title === 'string' && item.title.trim() !== '') source.title = item.title.trim()
    if (typeof item.content === 'string' && item.content.trim() !== '') source.snippet = trimText(item.content, 1_200)
    if (typeof item.published_date === 'string' && item.published_date.trim() !== '')
      source.publishedAt = item.published_date.trim()
    sources.push(source)
  }
  const answer = typeof json?.answer === 'string' && json.answer.trim() !== '' ? json.answer.trim() : undefined
  return answer === undefined ? { sources } : { content: answer, sources }
}

/** Exa's hosted MCP search service, called anonymously (no API key). */
async function exaMcpSearch(options, query, maxResults, signal) {
  const message = await callMcpTool(options, {
    endpoint: EXA_MCP_ENDPOINT,
    tool: 'web_search_exa',
    arguments: { query, numResults: maxResults },
    engineLabel: 'Exa MCP search',
    timeoutMs: options.engineTimeoutMs.exa,
    signal,
  })
  const blocks = Array.isArray(message?.result?.content) ? message.result.content : []
  const chunk = blocks.find((block) => block?.type === 'text' && typeof block.text === 'string')?.text ?? ''
  return { sources: parseExaBlocks(chunk) }
}

/** Parallel's hosted Search MCP, called anonymously (no API key). */
async function parallelMcpSearch(options, query, maxResults, signal) {
  const message = await callMcpTool(options, {
    endpoint: PARALLEL_MCP_ENDPOINT,
    tool: 'web_search',
    arguments: { objective: query, search_queries: [query] },
    engineLabel: 'Parallel MCP search',
    timeoutMs: options.engineTimeoutMs.parallel,
    signal,
  })
  const blocks = Array.isArray(message?.result?.content) ? message.result.content : []
  const chunk = blocks.find((block) => typeof block?.text === 'string')?.text ?? ''
  let payload
  try {
    payload = JSON.parse(chunk)
  } catch (error) {
    throw new WebSeamError('Parallel returned an unreadable result payload', 'WEB_PROVIDER_ERROR', { cause: error })
  }
  const sources = []
  for (const item of Array.isArray(payload?.results) ? payload.results : []) {
    const url = typeof item?.url === 'string' ? item.url.trim() : ''
    if (url === '') continue
    const source = { url }
    if (typeof item.title === 'string' && item.title.trim() !== '') source.title = item.title.trim()
    const excerpt = Array.isArray(item.excerpts) ? item.excerpts.filter((part) => typeof part === 'string').join(' ') : ''
    if (excerpt.trim() !== '') source.snippet = trimText(excerpt, 1_200)
    if (typeof item.publish_date === 'string' && item.publish_date.trim() !== '') source.publishedAt = item.publish_date.trim()
    sources.push(source)
    if (sources.length >= maxResults) break
  }
  return { sources }
}

/** TinyFish's hosted MCP search, called anonymously (no API key). */
async function tinyfishMcpSearch(options, query, maxResults, signal) {
  const message = await callMcpTool(options, {
    endpoint: TINYFISH_MCP_ENDPOINT,
    tool: 'search',
    arguments: { query },
    engineLabel: 'TinyFish MCP search',
    timeoutMs: options.engineTimeoutMs.tinyfish,
    signal,
    headers: { 'x-tinyfish-access-mode': 'keyless' },
  })
  const blocks = Array.isArray(message?.result?.content) ? message.result.content : []
  const chunk = blocks.find((block) => block?.type === 'text' && typeof block.text === 'string')?.text ?? ''
  let payload
  try {
    payload = JSON.parse(chunk)
  } catch (error) {
    throw new WebSeamError('TinyFish returned an unreadable result payload', 'WEB_PROVIDER_ERROR', { cause: error })
  }
  const sources = []
  for (const item of Array.isArray(payload?.results) ? payload.results : []) {
    const url = typeof item?.url === 'string' ? item.url.trim() : ''
    if (url === '') continue
    const source = { url }
    if (typeof item.title === 'string' && item.title.trim() !== '') source.title = item.title.trim()
    if (typeof item.snippet === 'string' && item.snippet.trim() !== '') source.snippet = trimText(item.snippet, 800)
    sources.push(source)
    if (sources.length >= maxResults) break
  }
  return { sources }
}

/** DuckDuckGo's server-rendered HTML endpoint (no key; may challenge bots). */
async function duckDuckGoSearch(options, query, maxResults, signal) {
  const url = `${DUCKDUCKGO_ENDPOINT}?q=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      redirect: 'error',
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
    options.engineTimeoutMs.duckduckgo,
    signal,
  )
  await ensureOk(response, 'DuckDuckGo HTML search')
  const html = await response.text()
  return { sources: parseDuckDuckGoHtml(html, maxResults) }
}

/** DuckDuckGo Lite (a separate HTML endpoint with simpler markup). */
async function duckDuckGoLiteSearch(options, query, maxResults, signal) {
  const url = `${DUCKDUCKGO_LITE_ENDPOINT}?q=${encodeURIComponent(query)}`
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      redirect: 'error',
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
    options.engineTimeoutMs['duckduckgo-lite'],
    signal,
  )
  await ensureOk(response, 'DuckDuckGo Lite search')
  const html = await response.text()
  return { sources: parseDuckDuckGoLiteHtml(html, maxResults) }
}

/** Bing's server-rendered HTML endpoint (no key; may challenge bots). */
async function bingSearch(options, query, maxResults, signal) {
  const url = `${BING_ENDPOINT}?q=${encodeURIComponent(query)}&setlang=en&mkt=en-US`
  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      redirect: 'error',
      headers: {
        'user-agent': BROWSER_UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    },
    options.engineTimeoutMs.bing,
    signal,
  )
  await ensureOk(response, 'Bing HTML search')
  const html = await response.text()
  return { sources: parseBingHtml(html, maxResults) }
}

/** Optional SearXNG instance with JSON output enabled (self-hosted last resort). */
async function searxngSearch(options, query, maxResults, signal) {
  if (options.searxngBaseURL === '')
    throw new WebSeamError('SearXNG engine is configured without searxngBaseURL', 'WEB_PROVIDER_ERROR')
  const url = `${options.searxngBaseURL}/search?q=${encodeURIComponent(query)}&format=json&safesearch=0`
  const response = await fetchWithTimeout(
    url,
    { method: 'GET', redirect: 'error', headers: { accept: 'application/json', 'user-agent': options.fetch.userAgent } },
    options.engineTimeoutMs.searxng,
    signal,
  )
  await ensureOk(response, 'SearXNG search')
  const json = await readJson(response, 'SearXNG')
  const sources = []
  for (const item of Array.isArray(json?.results) ? json.results : []) {
    const urlValue = typeof item?.url === 'string' ? item.url.trim() : ''
    if (urlValue === '') continue
    const source = { url: urlValue }
    if (typeof item.title === 'string' && item.title.trim() !== '') source.title = item.title.trim()
    const snippet = typeof item.content === 'string' ? item.content : typeof item.snippet === 'string' ? item.snippet : ''
    if (snippet.trim() !== '') source.snippet = trimText(snippet, 800)
    if (typeof item.publishedDate === 'string' && item.publishedDate.trim() !== '')
      source.publishedAt = item.publishedDate.trim()
    sources.push(source)
    if (sources.length >= maxResults) break
  }
  return { sources }
}

/**
 * Parse a DuckDuckGo HTML page into normalized sources.
 *
 * @param {string} html - the server-rendered result page.
 * @param {number} maxResults - upper bound on parsed sources.
 * @returns {Array<object>} sources with `url`, and optional `title` / `snippet`.
 */
export function parseDuckDuckGoHtml(html, maxResults) {
  const sources = []
  const seen = new Set()
  const blocks = String(html).split(/<div class="result results_links/u).slice(1)
  for (const block of blocks) {
    const anchor = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/u.exec(block)
    if (anchor === null) continue
    const url = normalizeDuckDuckGoUrl(anchor[1])
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    const source = { url }
    const title = cleanHtmlText(anchor[2])
    if (title !== '') source.title = title
    const snippetMatch = /<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/u.exec(block)
    const snippet = snippetMatch === null ? '' : cleanHtmlText(snippetMatch[1])
    if (snippet !== '') source.snippet = trimText(snippet, 800)
    sources.push(source)
    if (sources.length >= maxResults) break
  }
  return sources
}

/**
 * Parse a DuckDuckGo Lite page into normalized sources. Lite emits one
 * `result-link` anchor and one `result-snippet` cell per result; the two lists
 * are zipped in document order.
 *
 * @param {string} html - the Lite result page.
 * @param {number} maxResults - upper bound on parsed sources.
 * @returns {Array<object>} sources with `url`, and optional `title` / `snippet`.
 */
export function parseDuckDuckGoLiteHtml(html, maxResults) {
  const source = String(html)
  const anchors = [...source.matchAll(/<a[^>]*href="([^"]+)"[^>]*class='result-link'[^>]*>([\s\S]*?)<\/a>/gu)]
  const snippets = [...source.matchAll(/<td class='result-snippet'>([\s\S]*?)<\/td>/gu)].map((match) =>
    cleanHtmlText(match[1]),
  )
  const results = []
  const seen = new Set()
  for (let index = 0; index < anchors.length && results.length < maxResults; index++) {
    const url = normalizeDuckDuckGoUrl(anchors[index][1])
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    const item = { url }
    const title = cleanHtmlText(anchors[index][2])
    if (title !== '') item.title = title
    const snippet = snippets[index]
    if (snippet !== undefined && snippet !== '') item.snippet = trimText(snippet, 800)
    results.push(item)
  }
  return results
}

/**
 * Parse a Bing result page into normalized sources.
 *
 * @param {string} html - the server-rendered result page.
 * @param {number} maxResults - upper bound on parsed sources.
 * @returns {Array<object>} sources with `url`, and optional `title` / `snippet`.
 */
export function parseBingHtml(html, maxResults) {
  const results = []
  const seen = new Set()
  const blocks = String(html).split(/<li class="b_algo"/u).slice(1)
  for (const block of blocks) {
    const anchor = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/u.exec(block)
    if (anchor === null) continue
    const url = decodeBingRedirect(anchor[1])
    if (url === '' || seen.has(url)) continue
    seen.add(url)
    const source = { url }
    const title = cleanHtmlText(anchor[2])
    if (title !== '') source.title = title
    const snippetMatch = /<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/u.exec(block)
    const snippet = snippetMatch === null ? '' : cleanHtmlText(snippetMatch[1])
    if (snippet !== '') source.snippet = trimText(snippet, 800)
    results.push(source)
    if (results.length >= maxResults) break
  }
  return results
}

/** Decode Bing's click-tracking wrapper into the target URL when possible. */
export function decodeBingRedirect(raw) {
  const href = decodeHtmlEntities(String(raw).trim())
  if (href === '') return ''
  try {
    const url = new URL(href, 'https://www.bing.com')
    if (/(^|\.)bing\.com$/u.test(url.hostname) && url.pathname.startsWith('/ck/a')) {
      const target = url.searchParams.get('u')
      if (target === null) return ''
      // Bing wraps the base64url target as `a1<base64url>`.
      if (!target.startsWith('a1')) return ''
      const base64 = target
        .slice(2)
        .replace(/-/gu, '+')
        .replace(/_/gu, '/')
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
      const decoded = Buffer.from(padded, 'base64').toString('utf8')
      return /^https?:\/\//u.test(decoded) ? decoded : ''
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    return ''
  } catch {
    return ''
  }
}

/** Decode DuckDuckGo's `uddg` redirect wrapper into the target URL. */
export function normalizeDuckDuckGoUrl(raw) {
  const href = decodeHtmlEntities(String(raw).trim())
  if (href === '') return ''
  try {
    const url = new URL(href.startsWith('//') ? `https:${href}` : href, 'https://duckduckgo.com')
    if (/(^|\.)duckduckgo\.com$/u.test(url.hostname) && url.pathname.startsWith('/l/')) {
      const target = url.searchParams.get('uddg')
      return target !== null ? target : ''
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    return ''
  } catch {
    return ''
  }
}

/** Parse Exa MCP result blocks (`URL:` / `Title:` / `Published:` / `Highlights:`). */
export function parseExaBlocks(text) {
  const sources = []
  for (const block of String(text).split(/\n\n---\n\n/u)) {
    const url = /^URL:\s*(.+)$/mu.exec(block)?.[1]?.trim()
    if (url === undefined || url === '') continue
    const source = { url }
    const title = /^Title:\s*(.+)$/mu.exec(block)?.[1]?.trim()
    if (title !== undefined && title !== '' && title !== 'N/A') source.title = title
    const published = /^Published:\s*(.+)$/mu.exec(block)?.[1]?.trim()
    if (published !== undefined && published !== '' && published !== 'N/A') {
      const timestamp = Date.parse(published)
      if (!Number.isNaN(timestamp)) source.publishedAt = new Date(timestamp).toISOString()
    }
    const body = /^(?:Highlights|Text):\s*\n?([\s\S]*)$/mu.exec(block)?.[1]?.trim()
    if (body !== undefined && body !== '') source.snippet = trimText(body, 1_200)
    sources.push(source)
  }
  return sources
}

/** Extract the JSON-RPC message from a JSON or SSE (`data:`) MCP response body. */
export function parseMcpJsonRpc(body) {
  const trimmed = String(body).trim()
  if (trimmed === '') return undefined
  const parse = (payload) => {
    const candidate = payload.trim()
    if (!candidate.startsWith('{')) return undefined
    try {
      const value = JSON.parse(candidate)
      return value !== null && typeof value === 'object' ? value : undefined
    } catch {
      return undefined
    }
  }
  const direct = parse(trimmed)
  if (direct !== undefined) return direct
  for (const line of trimmed.split('\n')) {
    if (!line.startsWith('data:')) continue
    const parsed = parse(line.slice(5))
    if (parsed !== undefined) return parsed
  }
  return undefined
}

/** POST one MCP `tools/call` and return the JSON-RPC message. */
async function callMcpTool(options, { endpoint, tool, arguments: args, engineLabel, timeoutMs, signal, headers = {} }) {
  const payload = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'user-agent': options.fetch.userAgent,
        ...headers,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
    signal,
  )
  await ensureOk(response, engineLabel)
  const text = await response.text()
  const message = parseMcpJsonRpc(text)
  if (message === undefined) throw new WebSeamError(`${engineLabel} returned an unreadable response`, 'WEB_PROVIDER_ERROR')
  if (message.error !== undefined) throw new WebSeamError(`${engineLabel} error: ${errorMessage(message.error)}`, 'WEB_PROVIDER_ERROR')
  return message
}

// ─── fetch ──────────────────────────────────────────────────────────────────

/**
 * Retrieve one URL with the shipped provider's limits and private-destination
 * policy, plus the 198.18.0.0/15 fake-IP proxy exemption.
 *
 * @param {object} options - normalized bundle options.
 * @param {{url?: string}} request - the seam's fetch request.
 * @param {AbortSignal | undefined} signal - caller cancellation.
 * @returns {Promise<{url: string, statusCode: number, body: {kind: 'html'|'text', content: string}, truncated: boolean}>} retrieval outcome.
 */
export async function runFreeFetch(options, request, signal) {
  const initial = parseFetchUrl(String(request?.url ?? ''))
  let current = initial
  let redirects = 0
  for (;;) {
    throwIfAborted(signal)
    await assertAllowedHost(current.hostname, options.fetch, signal)
    const response = await fetchWithTimeout(
      current,
      {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': options.fetch.userAgent,
          accept: 'text/html,application/xhtml+xml,text/*;q=0.9,application/json;q=0.8',
        },
      },
      options.fetch.timeoutMs,
      signal,
    )
    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirects >= options.fetch.maxRedirects) {
        await cancelBody(response)
        throw new WebSeamError(
          `exceeded the maximum of ${options.fetch.maxRedirects} redirects`,
          'WEB_REDIRECT_BLOCKED',
        )
      }
      const location = response.headers.get('location')
      if (location === null) {
        await cancelBody(response)
        throw new WebSeamError(`redirect response (HTTP ${response.status}) without a Location header`, 'WEB_PROVIDER_ERROR')
      }
      const target = new URL(location, current)
      if (!isSameOrigin(target, current)) {
        await cancelBody(response)
        throw new WebSeamError(
          `cross-origin redirect to ${target.origin} is not followed automatically; retry against that URL directly`,
          'WEB_REDIRECT_BLOCKED',
        )
      }
      await cancelBody(response)
      current = target
      redirects += 1
      continue
    }
    const kind = classifyContentType(response.headers.get('content-type'))
    if (kind === undefined) {
      await cancelBody(response)
      throw new WebSeamError(
        `unsupported content type "${response.headers.get('content-type') ?? 'unknown'}"`,
        'WEB_UNSUPPORTED_CONTENT_TYPE',
      )
    }
    const { text, truncated } = await readCappedText(response, options.fetch, signal)
    return { url: current.toString(), statusCode: response.status, body: { kind, content: text }, truncated }
  }
}

function parseFetchUrl(input) {
  if (input.length > MAX_URL_LENGTH)
    throw new WebSeamError(`URL exceeds the maximum length of ${MAX_URL_LENGTH}`, 'WEB_INVALID_URL')
  let url
  try {
    url = new URL(input)
  } catch (error) {
    throw new WebSeamError(`invalid URL: ${input}`, 'WEB_INVALID_URL', { cause: error })
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebSeamError(`unsupported URL scheme "${url.protocol}" (only http and https are allowed)`, 'WEB_INVALID_URL')
  }
  if (url.username !== '' || url.password !== '')
    throw new WebSeamError('credentials in URLs are not allowed', 'WEB_BLOCKED_URL')
  return url
}

/**
 * Validate every destination the transport may connect to.
 *
 * @param {string} hostname - URL hostname (IPv6 literals keep their brackets).
 * @param {object} fetchOptions - the resolved `fetch` options.
 * @param {AbortSignal | undefined} signal - cancellation for the DNS wait.
 */
export async function assertAllowedHost(hostname, fetchOptions, signal) {
  const host = stripIpv6Brackets(hostname)
  const literalFamily = isIP(host)
  const addresses =
    literalFamily === 0 ? await lookupWithSignal(host, signal) : [{ address: host, family: literalFamily }]
  if (addresses.length === 0)
    throw new WebSeamError(`hostname "${hostname}" resolved to no addresses`, 'WEB_PROVIDER_ERROR')
  for (const entry of addresses) {
    if (entry.family === 4) {
      const value = ipv4ToInt(entry.address)
      if (value === undefined)
        throw new WebSeamError(`hostname "${hostname}" resolved to an invalid IPv4 address`, 'WEB_PROVIDER_ERROR')
      if (fetchOptions.allowFakeIp && inAnyCidrV4(value, FAKE_IP_V4_CIDRS)) continue
      if (inAnyCidrV4(value, BLOCKED_V4_CIDRS)) throw blockedDestination(hostname)
      continue
    }
    if (entry.family === 6) {
      if (isBlockedIpv6(entry.address, fetchOptions)) throw blockedDestination(hostname)
      continue
    }
    throw new WebSeamError(`hostname "${hostname}" resolved to an invalid IP address`, 'WEB_PROVIDER_ERROR')
  }
}

function blockedDestination(hostname) {
  return new WebSeamError(`URL hostname "${hostname}" resolves to a non-public IP address`, 'WEB_BLOCKED_URL')
}

const FAKE_IP_V4_CIDRS = [['198.18.0.0', 15]]
const BLOCKED_V4_CIDRS = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

function ipv4ToInt(address) {
  const parts = String(address).split('.')
  if (parts.length !== 4) return undefined
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return undefined
    const octet = Number(part)
    if (octet > 255) return undefined
    value = ((value << 8) >>> 0) + octet
  }
  return value >>> 0
}

function inCidrV4(value, base, bits) {
  const baseValue = ipv4ToInt(base)
  if (baseValue === undefined) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return ((value & mask) >>> 0) === ((baseValue & mask) >>> 0)
}

function inAnyCidrV4(value, cidrs) {
  return cidrs.some(([base, bits]) => inCidrV4(value, base, bits))
}

function isBlockedIpv6(address, fetchOptions) {
  const value = String(address).toLowerCase()
  if (value === '::' || value === '::1') return true
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  if (/^fe[89ab]/u.test(value)) return true
  if (value.startsWith('2001:db8')) return true
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length)
    const embedded = ipv4ToInt(mapped)
    if (embedded === undefined) return true
    if (fetchOptions.allowFakeIp && inAnyCidrV4(embedded, FAKE_IP_V4_CIDRS)) return false
    return inAnyCidrV4(embedded, BLOCKED_V4_CIDRS)
  }
  return false
}

function isSameOrigin(a, b) {
  return a.protocol === b.protocol && a.hostname === b.hostname && a.port === b.port
}

function classifyContentType(contentType) {
  const mime = String(contentType ?? '')
    .replace(/;.*$/su, '')
    .trim()
    .toLowerCase()
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html'
  if (mime.startsWith('text/')) return 'text'
  if (mime === 'application/json' || mime === 'application/xml' || mime.endsWith('+json') || mime.endsWith('+xml'))
    return 'text'
  return undefined
}

function parseCharset(contentType) {
  const match = /;\s*charset\s*=\s*"?([^";]+)"?/iu.exec(String(contentType ?? ''))
  return match?.[1]?.trim().toLowerCase()
}

async function readCappedText(response, fetchOptions, signal) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > fetchOptions.maxResponseBytes) {
    await cancelBody(response)
    throw new WebSeamError(
      `response exceeds the maximum of ${fetchOptions.maxResponseBytes} bytes`,
      'WEB_FETCH_TOO_LARGE',
    )
  }
  if (response.body === null) return { text: '', truncated: false }
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  let truncatedByBytes = false
  try {
    for (;;) {
      throwIfAborted(signal)
      const { done, value } = await reader.read()
      if (done) break
      const remaining = fetchOptions.maxResponseBytes - total
      if (value.byteLength > remaining) {
        chunks.push(value.subarray(0, remaining))
        total += remaining
        truncatedByBytes = true
        break
      }
      chunks.push(value)
      total += value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const charset = parseCharset(response.headers.get('content-type'))
  let text
  try {
    text = new TextDecoder(charset ?? 'utf-8').decode(bytes)
  } catch {
    text = new TextDecoder('utf-8').decode(bytes)
  }
  const truncatedByChars = text.length > fetchOptions.maxBodyChars
  return {
    text: truncatedByChars ? text.slice(0, fetchOptions.maxBodyChars) : text,
    truncated: truncatedByBytes || truncatedByChars,
  }
}

async function cancelBody(response) {
  try {
    await response.body?.cancel()
  } catch {
    /* best-effort cancellation */
  }
}

// ─── shared helpers ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url, init, timeoutMs, signal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const composed = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal])
  try {
    return await fetch(url, { ...init, signal: composed })
  } catch (error) {
    if (signal?.aborted === true) throw abortError(signal)
    if (timeoutSignal.aborted)
      throw new WebSeamError(`request timed out after ${timeoutMs} ms`, 'WEB_PROVIDER_ERROR', { cause: error })
    throw error
  }
}

async function ensureOk(response, engineLabel) {
  if (response.ok) return
  const error = new WebSeamError(`${engineLabel} failed with HTTP ${response.status}`, 'WEB_PROVIDER_ERROR')
  error.status = response.status
  if (response.status === 429 || response.status === 403) {
    error.rateLimited = true
    error.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
  }
  throw error
}

function parseRetryAfter(value) {
  if (value === null) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 3_600_000)
  const date = Date.parse(value)
  if (Number.isNaN(date)) return undefined
  return Math.min(Math.max(date - Date.now(), 0), 3_600_000)
}

async function readJson(response, label) {
  try {
    return await response.json()
  } catch (error) {
    throw new WebSeamError(`${label} returned an unreadable JSON body`, 'WEB_PROVIDER_ERROR', { cause: error })
  }
}

async function lookupWithSignal(hostname, signal) {
  const pending = lookup(hostname, { all: true, order: 'verbatim' })
  if (signal === undefined) return await pending
  if (signal.aborted) throw abortError(signal)
  return await new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function throwIfAborted(signal) {
  if (signal?.aborted === true) throw abortError(signal)
}

function abortError(signal) {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error('web request aborted')
  error.name = 'AbortError'
  return error
}

function dedupeSources(sources) {
  const seen = new Set()
  const result = []
  for (const source of sources) {
    const url = typeof source?.url === 'string' ? source.url.trim() : ''
    if (url === '' || seen.has(url)) continue
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue
    seen.add(url)
    const normalized = { url: parsed.toString() }
    if (typeof source.title === 'string' && source.title.trim() !== '') normalized.title = source.title.trim()
    if (typeof source.snippet === 'string' && source.snippet.trim() !== '') normalized.snippet = source.snippet.trim()
    if (typeof source.publishedAt === 'string' && source.publishedAt.trim() !== '')
      normalized.publishedAt = source.publishedAt.trim()
    result.push(normalized)
  }
  return result
}

function trimText(text, limit) {
  const collapsed = String(text).replace(/\s+/gu, ' ').trim()
  return collapsed.length > limit ? `${collapsed.slice(0, limit - 1)}…` : collapsed
}

function cleanHtmlText(html) {
  return decodeHtmlEntities(
    String(html)
      .replace(/<[^>]*>/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  )
}

function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&')
}

function stripIpv6Brackets(hostname) {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
}

function intOr(value, fallback, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** Focused helpers exported for the workspace smoke test. */
export const __test = {
  resolveOptions,
  runFreeSearch,
  runFreeFetch,
  parseDuckDuckGoHtml,
  parseDuckDuckGoLiteHtml,
  parseBingHtml,
  normalizeDuckDuckGoUrl,
  decodeBingRedirect,
  parseExaBlocks,
  parseMcpJsonRpc,
  assertAllowedHost,
  classifyContentType,
  cooldowns,
  WebSeamError,
}
