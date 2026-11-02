# Free Web Search for DeepSeek Harness

Adds **keyless, free web search** and a **proxy-friendly page fetch** to the
built-in `web_search` / `web_fetch` tools of DeepSeek Harness. No API keys, no
accounts, no third-party npm dependencies.

## What it registers

| Seam | Provider id | Backend |
|---|---|---|
| `ctx.web` search | `free-web` | an ordered keyless chain, first backend with results wins |
| `ctx.web` fetch | `http-fakeip` | the shipped public-HTTP policy, plus the `198.18.0.0/15` fake-IP proxy exemption |

The default search chain:

| # | Engine | Kind | Notes |
|---|---|---|---|
| 1 | `tavily-keyless` | hosted REST | best snippets + optional answer; no account |
| 2 | `exa-mcp` | hosted MCP (anonymous) | semantic search; the same backend OpenCode's built-in `websearch` uses |
| 3 | `parallel-mcp` | hosted MCP (anonymous) | OpenCode's second built-in backend |
| 4 | `tinyfish-mcp` | hosted MCP (anonymous) | OpenCode also ships this one |
| 5 | `duckduckgo` | HTML | classic snippets |
| 6 | `bing` | HTML | classic snippets |
| 7 | `duckduckgo-lite` | HTML | simplest markup, last keyless resort |
| + | `searxng` | self-hosted | appended last when `searxngBaseURL` is set — the only no-quota option |

Behaviour:

- An engine that answers **HTTP 429/403** (or otherwise fails) falls through to
  the next one; a rate-limited engine is put on a **cooldown** (default 5 min,
  honouring `Retry-After`) and skipped by later searches until it expires.
- The whole chain is bounded by `chainBudgetMs` (default 45 s) so one search
  stays inside the tool's 60 s timeout.
- `searxngBaseURL` only becomes reachable when you host an instance; a public
  instance that allows JSON search is not realistically available (tested ones
  answer 429 or HTML-only).

## Why the proxy exemption

Proxy clients in fake-IP/TUN mode answer **every** DNS query with an address
from `198.18.0.0/15` (RFC 2544 benchmarking range) and let the TUN device map it
back to the real host. The shipped `dsh-web-fetch-http` provider correctly
rejects non-public DNS answers, so on such machines every `web_fetch` call fails
with `URL hostname "..." resolves to a non-public IP address`.

`http-fakeip` treats only that benchmarking range as a "route through the local
proxy" marker. Loopback, private, link-local, CGNAT, multicast, reserved, and
documentation ranges are still refused, and so is any URL carrying credentials.
Set `allowFakeIp: false` in the row config to restore the strict
public-address-only policy.

## Limits and realistic capacity

Nothing here is truly unlimited: every hosted keyless backend is rate-limited per
public IP and publishes no hard number.

Empirical check from this machine (October 2026):

- 6 back-to-back searches on each of Tavily keyless, Exa MCP, Parallel MCP, and
  TinyFish MCP — all succeeded, no 429. Short bursts are fine.
- Firecrawl's hosted MCP no longer serves anonymous search (it asks for an API
  key), so it is not part of the chain.
- Public SearXNG instances were unusable for JSON (`429` / bot check / HTML).

Rough expectation: **tens to a couple of hundred searches per day** for
human-paced agent use, no guarantee beyond that. Sustained heavy loops will
start hitting 429s; the chain then moves on and cools the exhausted channel for
5 minutes. There is no SLA and no published quota.

Tool caps that are independent of the provider:

- `web_search`: 1–4 queries per call, at most 8 sources, 60 s tool budget in the
  shipped Web presets (the chain's own budget is 45 s).
- `web_fetch`: 30 s tool budget and a 200k-character rendered cap; this provider
  itself allows 25 s, 5 MB / 100k characters, same-origin redirects only.
- No DeepSeek model call is spent on a search (unlike the shipped
  `deepseek-official` provider), but the agent's conversation and result reading
  still consume model tokens.

Only the `minimal` agent preset omits the web tools; `standard`, `cordis`, and
`ptc` all mount `tool-web`.

## What "unlimited" would actually take

1. **Self-hosted SearXNG** (no third-party quota, only upstream-engine limits).
   Run it with Docker or WSL on this or another machine, enable its JSON output,
   set `searxngBaseURL: http://127.0.0.1:8888`, and it becomes the chain's last
   resort. This machine currently has no Docker and no WSL distro; Python 3.12
   is present but SearXNG does not officially support native Windows.
2. **Free API keys with published quotas** — Tavily 1,000 credits/month, Brave
   Search 2,000 queries/month, Exa new-account credits, Jina free tokens. That
   is predictable but finite; it needs a small keyed-mode extension (not
   implemented here).
3. **Local browser automation** (Playwright/Chrome DevTools) has no API quota but
   is fragile, captcha-prone, and outside the web seam's provider contract.

## Optional configuration

The inserted row accepts a raw `config` mapping (all keys optional):

```yaml
- id: free-web
  name: '@local/free-web-search'
  config:
    engines: [tavily-keyless, exa-mcp, parallel-mcp, tinyfish-mcp, duckduckgo, bing, duckduckgo-lite]
    chainBudgetMs: 45000     # whole-chain budget, keeps the tool call inside 60 s
    cooldownMs: 300000       # skip a 429/403 engine for 5 min (Retry-After wins)
    searxngBaseURL: ''       # e.g. http://127.0.0.1:8888 (must allow format=json); appended last
    maxResults: 8            # 1..20
    allowFakeIp: true        # false → only public IPs, like the shipped fetch provider
    fetchTimeoutMs: 25000
    maxBodyChars: 100000
    maxResponseBytes: 5000000
    maxRedirects: 5
```

Per-engine timeouts are configurable as `tavilyTimeoutMs`, `exaTimeoutMs`,
`parallelTimeoutMs`, `tinyfishTimeoutMs`, `duckduckgoTimeoutMs`, `bingTimeoutMs`,
`duckduckgoLiteTimeoutMs`, `searxngTimeoutMs` (defaults 8–12 s).

## Sharing with another machine

`free-web-search-share/` in this workspace contains a ready-to-send package:

- `dsh-free-web-search-1.1.0.zip` — unpack the folder and install it by path;
- `local-free-web-search-1.1.0.tgz` — for a manager that accepts a local
  tarball spec;
- `SHA256SUMS.txt` — transfer checksums.

The recipient's steps are in `INSTALL.md` inside the archive: unpack to a
permanent folder, then ask the agent to run `plugin_manager` `install_bundle`
with that folder as `target` (or use the Plugins page). The profile links to the
folder, so it must not be moved afterwards. An existing install is replaced by
`remove_bundle` followed by `install_bundle`.

## Install

Install this directory as a profile bundle (see the DSH plugin-development
skill), then verify:

1. `plugin_manager list_plugins` shows the `free-web` row active.
2. A live `web_search` call returns sources and a live `web_fetch` returns a
   page body.
3. `node free-web-search/test/smoke.mjs` passes (23 checks: parsers, host
   policy, all engines, cooldown skip, chain, fetch).

After changing this package's code, re-run the bundle install; a replaced
package may require a Host restart before the new module generation is live.
