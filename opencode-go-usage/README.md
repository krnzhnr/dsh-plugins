# OpenCode Go Usage (`@local/opencode-go-usage`)

A DeepSeek Harness plugin that tracks your **OpenCode Go / Go Plus / Go Teams**
subscription usage in the composer dock.

It reads the same credential the OpenCode CLI already stores, asks the OpenCode
Console for the subscription status, and shows the three metered windows:

- **5h** — the rolling 5-hour allowance,
- **Week** — the weekly allowance,
- **Month** — the monthly allowance.

## How it looks

A small status pill sits in the composer dock beside the host's activity and
token pills (below the input card), in the same style as the built-in
context-usage meter:

- **Collapsed**: a 14px ring gauge plus the window closest to its limit and its
  percentage, e.g. `5h · 15%`. The ring turns warning/error colored as the
  nearest limit approaches 70% / 90%; hovering shows the full sentence.
- **Click**: a panel opens above the pill (anchored, portaled, closed by an
  outside click or Escape) with:
  - the nearest window's percentage, dollar figures (`$1.75 / $12`), and a
    progress bar,
  - a row per window with its amount, limit, percentage, and reset countdown,
  - a forecast tick on each bar with a small cloud below showing the projected
    end-of-window percent (red when the pace points at or past 100%),
  - the plan state (renewal date or "cancelled, active until …", Extra Usage),
  - the nearest reset countdown, the last-refresh time, and a refresh button.

The pill polls once a minute; the Host caches a successful Console response for
five minutes (`refreshSeconds`). `↻` forces a fresh read.

## Data source and privacy

- The Host half reads the OpenCode Go API key from the OpenCode CLI's own
  `auth.json` (`~/.local/share/opencode/auth.json` on this machine), or from
  `OPENCODE_GO_API_KEY` when set.
- It calls `https://opencode.ai/console/api/go/status` directly from this
  machine with `Authorization: Bearer <key>`.
- The key never reaches the browser: the browser calls a Host route that
  returns only plan/usage facts (plus a masked key prefix and the auth file
  name). The route sits behind the Harness connection trust fence.
- No third-party servers, no telemetry, no writes.

## Configuration

All fields are optional; edit the row config in `cordis.patch.yml` (the bundle
owns its patch layer, so the user's own patch can also override it):

| Field | Default | Meaning |
|---|---|---|
| `refreshSeconds` | `300` | How long a successful Console read stays cached (30–3600). |
| `timeoutMs` | `15000` | Console request deadline (1000–60000). |
| `authFile` | auto-detect | Explicit path to OpenCode's `auth.json`. |
| `providerKey` | `opencode-go` | Auth entry name in `auth.json`. |
| `apiBase` | `https://opencode.ai` | Console origin. |

Auto-detection checks `OPENCODE_AUTH_FILE`, `$XDG_DATA_HOME/opencode/auth.json`,
`~/.local/share/opencode/auth.json`, macOS `Application Support`, `%APPDATA%`,
`%LOCALAPPDATA%`, and `~/.config/opencode/auth.json`.

## Requirements

- An OpenCode installation signed in to OpenCode Go (`/connect` in OpenCode),
  so its `auth.json` holds an `opencode-go` key.
- DeepSeek Harness Web GUI (this bundle ships both a Host plugin and a Client
  plugin; it has no meaning in a headless profile).

## Development

```powershell
node test/host-smoke.mjs            # 16 checks, includes live console and route reads
node test/host-smoke.mjs --offline  # offline checks only (no network)
node test/client-load.mjs           # browser-half factory + pill registration
```

The tests never print the API key.

## License

MIT.
