/**
 * Host-half smoke test, runnable with the bundled Node.js:
 *   node test/host-smoke.mjs            (offline checks + live console read)
 *   node test/host-smoke.mjs --offline  (offline checks only)
 *
 * It never prints the API key. Live mode reads the same OpenCode credential the
 * plugin uses and prints only the normalized, non-secret snapshot.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  apiKeyFromAuthDocument,
  apply,
  authFileCandidates,
  fetchGoStatus,
  maskKey,
  normalizeMeter,
  normalizeStatus,
  resolveApiKey,
  resolveOptions,
} from '../index.js'

const offline = process.argv.includes('--offline')
let passed = 0

/** Run one named check, awaiting its assertions. */
async function check(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`ok ${passed} - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await check('defaults', () => {
  const options = resolveOptions(undefined)
  assert.equal(options.apiBase, 'https://opencode.ai')
  assert.equal(options.refreshSeconds, 300)
  assert.equal(options.timeoutMs, 15000)
  assert.equal(options.providerKey, 'opencode-go')
  assert.equal(options.authFile, undefined)
})

await check('clamps and trims config', () => {
  const options = resolveOptions({
    apiBase: 'https://example.test/',
    refreshSeconds: 5,
    timeoutMs: 999999,
    authFile: '  C:/tmp/auth.json  ',
    providerKey: ' opencode-go ',
  })
  assert.equal(options.apiBase, 'https://example.test')
  assert.equal(options.refreshSeconds, 30)
  assert.equal(options.timeoutMs, 60000)
  assert.equal(options.authFile, 'C:/tmp/auth.json')
  assert.equal(options.providerKey, 'opencode-go')
})

await check('auth candidates are ordered, de-duplicated, platform-aware', () => {
  const env = {
    OPENCODE_AUTH_FILE: 'C:/custom/auth.json',
    XDG_DATA_HOME: 'C:/xdg',
    APPDATA: 'C:/roaming',
    LOCALAPPDATA: 'C:/local',
  }
  const candidates = authFileCandidates(env, 'C:/home')
  assert.equal(candidates[0], 'C:/custom/auth.json')
  assert.equal(candidates[1], join('C:/xdg', 'opencode', 'auth.json'))
  assert.ok(candidates.includes(join('C:/home', '.local', 'share', 'opencode', 'auth.json')))
  assert.ok(candidates.includes(join('C:/home', '.config', 'opencode', 'auth.json')))
  assert.equal(new Set(candidates).size, candidates.length)
})

await check('api key extraction', () => {
  assert.equal(apiKeyFromAuthDocument({ 'opencode-go': { type: 'api', key: 'oc_sk_x' } }), 'oc_sk_x')
  assert.equal(apiKeyFromAuthDocument({ 'opencode-go': { apiKey: 'oc_sk_y' } }), 'oc_sk_y')
  assert.equal(apiKeyFromAuthDocument({ 'opencode-go': 'oc_sk_z' }), 'oc_sk_z')
  assert.equal(apiKeyFromAuthDocument({ 'opencode-go': { key: '   ' } }), undefined)
  assert.equal(apiKeyFromAuthDocument({ openai: { key: 'oc_sk_nope' } }), undefined)
  assert.equal(apiKeyFromAuthDocument(null), undefined)
})

await check('key masking keeps the prefix only', () => {
  assert.equal(maskKey('oc_sk_1234567890abcdef'), 'oc_sk_123456…')
  assert.equal(maskKey(''), '')
})

await check('meter normalization converts micro-cents and percent', () => {
  // The Console serializes micro-cents as strings; numbers are accepted too.
  const meter = normalizeMeter({
    limitMicroCents: '1200000000',
    usedMicroCents: '140122657',
    startsAt: '2026-10-31T17:43:07.000Z',
    resetsAt: '2026-10-31T22:43:07.000Z',
  })
  assert.equal(meter.limitUsd, 12)
  assert.equal(meter.usedUsd, 1.40122657)
  assert.equal(meter.percent, 11.68)
  assert.equal(meter.resetsAt, '2026-10-31T22:43:07.000Z')
  const numeric = normalizeMeter({ limitMicroCents: 1200000000, usedMicroCents: 140122657 })
  assert.equal(numeric.limitUsd, 12)
  assert.equal(numeric.usedUsd, 1.40122657)
  assert.deepEqual(normalizeMeter(undefined), {
    usedUsd: 0,
    limitUsd: 0,
    percent: 0,
    startsAt: null,
    resetsAt: null,
  })
})

await check('status normalization keeps plan facts and all three windows', () => {
  const snapshot = normalizeStatus({
    product: 'go',
    renewalProduct: 'go',
    renewalCurrency: 'usd',
    cancelAtPeriodEnd: true,
    useBalance: false,
    access: {
      startsAt: '2026-10-26T03:03:33.000Z',
      endsAt: '2026-11-26T03:03:33.000Z',
      meters: {
        fiveHour: { limitMicroCents: '1200000000', usedMicroCents: '140122657' },
        week: { limitMicroCents: '3000000000', usedMicroCents: '540125523' },
        month: { limitMicroCents: '6000000000', usedMicroCents: '540125523' },
      },
    },
  })
  assert.equal(snapshot.product, 'go')
  assert.equal(snapshot.periodEndsAt, '2026-11-26T03:03:33.000Z')
  assert.equal(snapshot.cancelAtPeriodEnd, true)
  assert.equal(snapshot.meters.fiveHour.limitUsd, 12)
  assert.equal(snapshot.meters.week.limitUsd, 30)
  assert.equal(snapshot.meters.month.limitUsd, 60)
  assert.equal(snapshot.meters.week.percent, 18.0)
  assert.throws(() => normalizeStatus(null), /unexpected payload/)
})

await check('resolveApiKey prefers config and env without touching disk', async () => {
  const viaConfig = await resolveApiKey({ apiKey: 'oc_sk_config', providerKey: 'opencode-go' })
  assert.equal(viaConfig.key, 'oc_sk_config')
  assert.equal(viaConfig.auth.source, 'config')
  const viaEnv = await resolveApiKey(
    { providerKey: 'opencode-go' },
    { env: { OPENCODE_GO_API_KEY: 'oc_sk_env' }, home: 'C:/nowhere' },
  )
  assert.equal(viaEnv.key, 'oc_sk_env')
  assert.equal(viaEnv.auth.source, 'env')
})

await check('resolveApiKey reads an explicit auth file and reports the path', async () => {
  const result = await resolveApiKey(
    { providerKey: 'opencode-go', authFile: 'C:/tmp/auth.json' },
    {
      env: {},
      home: 'C:/nowhere',
      readText: async () => JSON.stringify({ 'opencode-go': { type: 'api', key: 'oc_sk_file' } }),
    },
  )
  assert.equal(result.key, 'oc_sk_file')
  assert.equal(result.auth.file, 'C:/tmp/auth.json')
  assert.equal(result.auth.source, 'auth-file')
})

await check('resolveApiKey fails with no-auth when nothing exists', async () => {
  await assert.rejects(
    () =>
      resolveApiKey(
        { providerKey: 'opencode-go' },
        {
          env: {},
          home: 'C:/nowhere',
          readText: async () => {
            throw new Error('ENOENT')
          },
        },
      ),
    (error) => error.code === 'no-auth' && /not found/.test(error.message),
  )
})

await check('resolveApiKey rejects a malformed auth file', async () => {
  await assert.rejects(
    () =>
      resolveApiKey(
        { providerKey: 'opencode-go', authFile: 'C:/tmp/auth.json' },
        { env: {}, home: 'C:/nowhere', readText: async () => '{not json' },
      ),
    (error) => error.code === 'bad-auth-file',
  )
})

/** Minimal HTTP response recorder for route-handler tests. */
function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    chunks: [],
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(chunk) {
      if (chunk !== undefined) this.chunks.push(String(chunk))
    },
    get body() {
      return this.chunks.join('')
    },
  }
}

/** Install the plugin over a fake Cordis context and return its registered route. */
function installFakePlugin(rejection, config = {}) {
  let route
  const ctx = {
    connection: { requestRejection: () => rejection },
    webServer: {
      register(candidate) {
        route = candidate
        return () => {}
      },
    },
    effect(callback) {
      callback()
      return () => {}
    },
  }
  apply(ctx, config)
  assert.ok(route !== undefined, 'host half registers a webServer route')
  return route
}

await check('route rejects requests failing the connection trust fence', async () => {
  const route = installFakePlugin(403)
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, '/opencode-go-usage/status')
  const res = fakeResponse()
  await route.handler({ method: 'GET', url: '/opencode-go-usage/status', headers: {} }, res)
  assert.equal(res.statusCode, 403)
  assert.equal(res.body, '')
})

await check('route refuses non-GET methods', async () => {
  const route = installFakePlugin(undefined)
  const res = fakeResponse()
  await route.handler({ method: 'POST', url: '/opencode-go-usage/status', headers: {} }, res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'GET')
})

if (offline) {
  console.log(`\n${passed}/${passed} passed (offline)`)
} else {
  await check('live: real OpenCode credential resolves', async () => {
    const options = resolveOptions({})
    const { key, auth } = await resolveApiKey(options)
    assert.ok(key.startsWith('oc_sk_'))
    assert.equal(auth.source, 'auth-file')
    assert.ok(auth.file && auth.file.includes('opencode'))
    console.log(`   auth file: ${auth.file}, key: ${auth.keyPrefix}`)
  })

  await check('live: route serves a normalized snapshot and never leaks the key', async () => {
    const options = resolveOptions({ refreshSeconds: 300 })
    const { key } = await resolveApiKey(options)
    const route = installFakePlugin(undefined, { refreshSeconds: 300 })
    const res = fakeResponse()
    await route.handler({ method: 'GET', url: '/opencode-go-usage/status?force=1', headers: {} }, res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.ok(!res.body.includes(key), 'response must not contain the raw API key')
    const payload = JSON.parse(res.body)
    assert.equal(payload.ok, true)
    assert.ok(payload.snapshot.meters.fiveHour.limitUsd > 0)
    assert.ok(payload.snapshot.meters.week.limitUsd > 0)
    assert.ok(payload.snapshot.meters.month.limitUsd > 0)
    assert.equal(payload.auth.keyPrefix.includes('…'), true)
    // A second read within the cache window must reuse the same snapshot.
    const cached = fakeResponse()
    await route.handler({ method: 'GET', url: '/opencode-go-usage/status', headers: {} }, cached)
    const second = JSON.parse(cached.body)
    assert.equal(second.fetchedAt, payload.fetchedAt)
    console.log(
      `   route snapshot: ${JSON.stringify({
        fetchedAt: payload.fetchedAt,
        fiveHour: payload.snapshot.meters.fiveHour.percent,
        week: payload.snapshot.meters.week.percent,
        month: payload.snapshot.meters.month.percent,
      })}`,
    )
  })

  await check('live: console status fetches and normalizes', async () => {
    const options = resolveOptions({})
    const { key } = await resolveApiKey(options)
    const snapshot = await fetchGoStatus(options, key)
    assert.ok(['go', 'go-plus', 'go-teams'].includes(snapshot.product))
    for (const window of ['fiveHour', 'week', 'month']) {
      const meter = snapshot.meters[window]
      assert.ok(meter.limitUsd > 0, `${window} limit`)
      assert.ok(meter.percent >= 0, `${window} percent`)
    }
    console.log(
      `   live snapshot: ${JSON.stringify({
        product: snapshot.product,
        fiveHour: `${snapshot.meters.fiveHour.percent}%`,
        week: `${snapshot.meters.week.percent}%`,
        month: `${snapshot.meters.month.percent}%`,
        cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
      })}`,
    )
  })
  console.log(`\n${passed}/${passed} passed`)
}
