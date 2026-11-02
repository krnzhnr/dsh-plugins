import { __test } from '../index.js'

const {
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
} = __test

const results = []
function record(label, ok, detail) {
  results.push({ label, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
}

function summarize(result) {
  return `${result.sources.length} sources` + (result.content ? ` + answer (${result.content.length} chars)` : '')
}

const options = resolveOptions({})

// Parsers (no network)
{
  const ddg = parseDuckDuckGoHtml(
    '<div class="result results_links web-result"><h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1">Example &amp; title</a></h2><a class="result__snippet" href="#">Snippet <b>text</b></a></div>',
    5,
  )
  record(
    'parser: DuckDuckGo HTML',
    ddg.length === 1 && ddg[0].url === 'https://example.com/a?b=1' && ddg[0].title === 'Example & title' && ddg[0].snippet === 'Snippet text',
    JSON.stringify(ddg),
  )

  const lite = parseDuckDuckGoLiteHtml(
    "<a rel=\"nofollow\" href=\"//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.org%2Fx&amp;rut=1\" class='result-link'>Lite title</a><td class='result-snippet'>Lite <b>snippet</b></td>",
    5,
  )
  record('parser: DuckDuckGo Lite', lite.length === 1 && lite[0].url === 'https://example.org/x' && lite[0].snippet === 'Lite snippet', JSON.stringify(lite))

  const bing = parseBingHtml(
    '<li class="b_algo"><h2><a target="_blank" href="https://www.bing.com/ck/a?!&&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdl&ntb=1">Bing title</a></h2><div class="b_caption"><p class="b_lineclamp2">Bing snippet</p></div>',
    5,
  )
  record('parser: Bing', bing.length === 1 && bing[0].url === 'https://example.com/page' && bing[0].snippet === 'Bing snippet', JSON.stringify(bing))
  record('parser: Bing direct URL', decodeBingRedirect('https://example.com/direct') === 'https://example.com/direct')
  record('parser: uddg decode', normalizeDuckDuckGoUrl('https://example.com/x') === 'https://example.com/x')

  const exa = parseExaBlocks('Title: A\nURL: https://a.example/1\nPublished: 2026-01-02T00:00:00.000Z\nHighlights:\nhello world\n\n---\n\nTitle: B\nURL: https://b.example/2\nPublished: N/A\nHighlights:\nsecond')
  record('parser: Exa blocks', exa.length === 2 && exa[0].snippet === 'hello world' && exa[1].publishedAt === undefined, JSON.stringify(exa))

  const mcp = parseMcpJsonRpc('event: message\ndata: {"result":{"content":[{"type":"text","text":"X"}]}}\n\n')
  record('parser: MCP SSE', mcp?.result?.content?.[0]?.text === 'X')
  record(
    'content-type classification',
    classifyContentType('text/html; charset=utf-8') === 'html' &&
      classifyContentType('application/json') === 'text' &&
      classifyContentType('image/png') === undefined,
  )
}

// Host policy (no network)
{
  let blocked = false
  try {
    await assertAllowedHost('127.0.0.1', options.fetch, undefined)
  } catch (error) {
    blocked = error.code === 'WEB_BLOCKED_URL'
  }
  record('policy: loopback blocked', blocked)

  let localhostBlocked = false
  try {
    await assertAllowedHost('localhost', options.fetch, undefined)
  } catch {
    localhostBlocked = true
  }
  record('policy: localhost blocked', localhostBlocked)

  let fakeIpAllowed = false
  try {
    await assertAllowedHost('198.18.1.77', options.fetch, undefined)
    fakeIpAllowed = true
  } catch {
    fakeIpAllowed = false
  }
  record('policy: fake-IP range allowed', fakeIpAllowed)
}

const engines = ['tavily-keyless', 'exa-mcp', 'parallel-mcp', 'tinyfish-mcp', 'duckduckgo', 'bing', 'duckduckgo-lite']
for (const engine of engines) {
  try {
    const result = await runFreeSearch({ ...options, engines: [engine] }, { query: 'DeepSeek Harness release', maxResults: 5 }, AbortSignal.timeout(30_000))
    record(`search: ${engine}`, result.sources.length > 0, summarize(result))
  } catch (error) {
    record(`search: ${engine}`, false, `${error.name}: ${error.message}`)
  }
}

// Full chain
try {
  const chain = await runFreeSearch(options, { query: 'what is DeepSeek Harness', maxResults: 4 }, AbortSignal.timeout(50_000))
  record('search: fallback chain', chain.sources.length > 0, summarize(chain))
} catch (error) {
  record('search: fallback chain', false, error.message)
}

// Cooldown skip: a cooled-down first engine must not be attempted.
try {
  const { cooldowns } = __test
  cooldowns.set('tavily-keyless', { until: Date.now() + 60_000 })
  const started = Date.now()
  const chain = await runFreeSearch({ ...options, engines: ['tavily-keyless', 'exa-mcp'] }, { query: 'DeepSeek Harness docs', maxResults: 3 }, AbortSignal.timeout(30_000))
  cooldowns.delete('tavily-keyless')
  record('cooldown: cooled engine skipped', chain.sources.length > 0 && Date.now() - started < 30_000, summarize(chain))
} catch (error) {
  record('cooldown: cooled engine skipped', false, error.message)
}

// Fetch
for (const [label, url] of [
  ['fetch: markdown page', 'https://raw.githubusercontent.com/sst/opencode/dev/README.md'],
  ['fetch: regular page', 'https://example.com/'],
]) {
  try {
    const page = await runFreeFetch(options, { url }, AbortSignal.timeout(40_000))
    record(label, page.statusCode === 200 && page.body.content.length > 0, `HTTP ${page.statusCode}, ${page.body.kind}, ${page.body.content.length} chars`)
  } catch (error) {
    record(label, false, `${error.code ?? error.name}: ${error.message}`)
  }
}

try {
  await runFreeFetch(options, { url: 'http://127.0.0.1:1234/' }, AbortSignal.timeout(5_000))
  record('fetch: loopback blocked', false, 'request unexpectedly succeeded')
} catch (error) {
  record('fetch: loopback blocked', error.code === 'WEB_BLOCKED_URL', `${error.code}: ${error.message}`)
}

const failed = results.filter((entry) => !entry.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) process.exitCode = 1
