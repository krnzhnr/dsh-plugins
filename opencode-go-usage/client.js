/**
 * OpenCode Go usage tracker — Client half.
 *
 * Collapsed it behaves like the composer's context-usage pill: a small ring
 * gauge plus the percentage of the window closest to its limit. Clicking it
 * opens a portaled detail panel (mirroring the context meter panel) with the
 * per-window dollar amounts, percentages, and reset countdowns.
 *
 * The Host half owns the API key and the console cache; this half only calls
 * its authenticated route.
 */
window.__ModuleLoader__.load({
  id: '@local/opencode-go-usage',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'opencode-go-usage'
    /** Host route, addressed document-relative like every Host plugin route. */
    const STATUS_ROUTE = 'opencode-go-usage/status'
    /** Browser poll period; the Host caches a successful console read for longer. */
    const POLL_MS = 60_000
    /** Countdown / relative-time tick. */
    const TICK_MS = 30_000
    /** Ring geometry shared with the host's context meter (14px viewBox, 2px stroke). */
    const RING_RADIUS = 5.5
    const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
    /** Panel placement gap and viewport margin, matching the host dialogs. */
    const ANCHOR_GAP = 8
    const VIEWPORT_MARGIN = 12
    /** Style element identity for this plugin's stylesheet. */
    const STYLE_ID = '@local/opencode-go-usage/UsagePill.css'

    /** The three metered windows, in display order. */
    const WINDOWS = [
      { key: 'fiveHour', short: 'pill.window.fiveHour', long: 'window.fiveHour.long' },
      { key: 'week', short: 'pill.window.week', long: 'window.week.long' },
      { key: 'month', short: 'pill.window.month', long: 'window.month.long' },
    ]

    /** English dictionary (the only shipped locale; other locales fall back to it). */
    const en = {
      'pill.aria': 'OpenCode Go: {window} window {percent}% used',
      'pill.label': '{window} · {percent}%',
      'pill.loading': '…',
      'pill.error': '!',
      'pill.window.fiveHour': '5h',
      'pill.window.week': 'week',
      'pill.window.month': 'month',
      'panel.title': 'OpenCode Go',
      'panel.loading': 'Reading usage…',
      'panel.ofLimit': 'of {window} limit used',
      'panel.figures': '{used} / {limit}',
      'panel.rowValue': '{percent}% · {used} / {limit}',
      'panel.resets': '{window} resets in {time}',
      'panel.updated.ago': 'updated {time} ago',
      'panel.updated.now': 'updated just now',
      'panel.renews': 'renews {date}',
      'panel.cancelled': 'cancelled, active until {date}',
      'panel.extraBalance': 'extra usage from balance is on',
      'panel.refresh': 'Refresh usage',
      'panel.retry': 'Retry',
      'panel.pace': 'On pace for {percent}%',
      'panel.paceDay': 'averaging {percent}% a day',
      'window.fiveHour.long': '5h window',
      'window.week.long': 'Week',
      'window.month.long': 'Month',
      'plan.go': 'Go',
      'plan.go-plus': 'Go Plus',
      'plan.go-teams': 'Go Teams',
      'error.no-auth': 'No OpenCode Go key found.',
      'error.invalid-auth': 'OpenCode rejected the API key.',
      'error.network': 'OpenCode Console is unreachable.',
      'error.timeout': 'OpenCode Console timed out.',
      'error.http': 'OpenCode Console returned an error.',
      'error.bad-response': 'OpenCode Console returned an unexpected answer.',
      'error.bad-auth-file': 'The OpenCode auth file is unreadable.',
      'error.internal': 'Usage could not be read.',
      'error.hint.auth': 'Sign in to OpenCode Go in OpenCode, or set authFile in the plugin config.',
      'error.hint.network': 'Retrying automatically.',
    }

    /** Russian dictionary: full UI translation, same keys and placeholders. */
    const ru = {
      'pill.aria': 'OpenCode Go: окно {window} использовано на {percent}%',
      'pill.label': '{window} · {percent}%',
      'pill.loading': '…',
      'pill.error': '!',
      'pill.window.fiveHour': '5ч',
      'pill.window.week': 'нед',
      'pill.window.month': 'мес',
      'panel.title': 'OpenCode Go',
      'panel.loading': 'Читаю расход…',
      'panel.ofLimit': 'от лимита {window}',
      'panel.figures': '{used} / {limit}',
      'panel.rowValue': '{percent}% · {used} / {limit}',
      'panel.resets': '{window}: сброс через {time}',
      'panel.updated.ago': 'обновлено {time} назад',
      'panel.updated.now': 'обновлено только что',
      'panel.renews': 'продление {date}',
      'panel.cancelled': 'отменена, активна до {date}',
      'panel.extraBalance': 'включены траты с баланса',
      'panel.refresh': 'Обновить расход',
      'panel.retry': 'Повторить',
      'panel.pace': 'Прогноз {percent}%',
      'panel.paceDay': 'в среднем {percent}% в день',
      'window.fiveHour.long': 'Окно 5 часов',
      'window.week.long': 'Неделя',
      'window.month.long': 'Месяц',
      'plan.go': 'Go',
      'plan.go-plus': 'Go Plus',
      'plan.go-teams': 'Go Teams',
      'error.no-auth': 'Ключ OpenCode Go не найден.',
      'error.invalid-auth': 'Консоль OpenCode отклонила ключ.',
      'error.network': 'Консоль OpenCode недоступна.',
      'error.timeout': 'Консоль OpenCode не отвечает.',
      'error.http': 'Консоль OpenCode вернула ошибку.',
      'error.bad-response': 'Консоль OpenCode вернула неожиданный ответ.',
      'error.bad-auth-file': 'Файл auth OpenCode не читается.',
      'error.internal': 'Не удалось прочитать расход.',
      'error.hint.auth': 'Войди в OpenCode Go в OpenCode или укажи authFile в настройках плагина.',
      'error.hint.network': 'Повторяю автоматически.',
    }

    /** Stylesheet copied from the host's stats-pill and stat-dialog modules, namespaced. */
    const CSS = `
.ocg_anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}
.ocg_pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}
button.ocg_pill{cursor:pointer}
button.ocg_pill:hover,button.ocg_pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.ocg_pill svg{flex:none;width:14px;height:14px}
.ocg_label{text-overflow:ellipsis;min-width:0;overflow:hidden}
.ocg_ringTrack{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:2px}
.ocg_ringFill{fill:none;stroke-width:2px;stroke-linecap:round}
.ocg_panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:min(320px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:14px;font-size:12px;line-height:18px;position:fixed}
.ocg_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}
.ocg_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}
.ocg_titleLabel svg{flex:none;width:14px;height:14px}
.ocg_titleValue{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);font-weight:400}
.ocg_rule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}
.ocg_header{align-items:center;gap:6px;display:flex;font-variant-numeric:tabular-nums}
.ocg_percent{color:var(--dsw-alias-label-primary);font-weight:500}
.ocg_headline{color:var(--dsw-alias-label-tertiary)}
.ocg_figures{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);margin-left:auto;font-weight:500}
.ocg_bar{background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;height:4px;margin:10px 0 12px;overflow:hidden;position:relative}
.ocg_barFill{height:100%;border-radius:999px;transition:width 240ms ease}
.ocg_paceTick{position:absolute;top:-1px;bottom:-1px;width:2px;border-radius:1px;background:rgba(255,255,255,.92);box-shadow:0 0 0 .5px rgba(0,0,0,.5);pointer-events:auto}
.ocg_rows{margin:0;display:flex;flex-direction:column;gap:6px}
.ocg_row{margin:0;display:flex;align-items:center;gap:6px;min-width:0}
.ocg_rowLabel{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;min-width:0;display:inline-flex}
.ocg_swatch{border-radius:2px;width:8px;height:8px;flex:none;display:inline-block}
.ocg_value{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;margin:0 0 0 auto;text-align:right;white-space:nowrap;flex:none}
.ocg_footer{border-top:.5px solid var(--dsw-alias-border-l2);margin-top:10px;padding-top:8px;display:flex;flex-direction:column;gap:4px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.ocg_footerLine{display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:0}
.ocg_meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ocg_refresh{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:1px 4px}
.ocg_refresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.ocg_errorText{color:var(--dsw-alias-state-error-primary)}
.ocg_loading{color:var(--dsw-alias-label-tertiary)}
`

    /** Translate a key from the Russian dictionary (host has no Russian UI language). */
    function fallbackT(key, params) {
      const template = ru[key] ?? en[key] ?? key
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        name in params ? String(params[name]) : match,
      )
    }

    /** Pick a state token for a usage percentage. */
    function toneFor(percent) {
      if (percent >= 90) return 'var(--dsw-alias-state-error-primary)'
      if (percent >= 70) return 'var(--dsw-alias-state-warn-primary)'
      return 'var(--dsw-alias-state-success-primary)'
    }

    /** The window closest to its limit (highest percentage; first window wins ties). */
    function nearestWindow(meters) {
      let nearest = WINDOWS[0]
      for (const candidate of WINDOWS) {
        if ((meters[candidate.key]?.percent ?? 0) > (meters[nearest.key]?.percent ?? 0)) nearest = candidate
      }
      return nearest
    }

    /** Format USD with two decimals (a tiny non-zero charge still reads as $0.01). */
    function money(value) {
      const number = Number(value) || 0
      if (number > 0 && number < 0.01) return '$0.01'
      return `$${number.toFixed(2)}`
    }

    /** Format a duration in milliseconds as a short countdown (`2d 3h`, `3h 12m`, `42m`). */
    function formatDuration(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '0m'
      const minutes = Math.round(ms / 60_000)
      const days = Math.floor(minutes / 1440)
      const hours = Math.floor((minutes % 1440) / 60)
      const rest = minutes % 60
      if (days > 0) return `${days}d ${hours}h`
      if (hours > 0) return `${hours}h ${rest}m`
      return `${rest}m`
    }

    /** Relative age for the last successful read. */
    function formatAgo(t, ms) {
      if (!Number.isFinite(ms) || ms < 45_000) return t('panel.updated.now')
      return t('panel.updated.ago', { time: formatDuration(ms) })
    }

    /** Short local date (`26 Nov 2026`). */
    function formatDate(iso) {
      if (typeof iso !== 'string' || iso === '') return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    }

    /** Plan display label. */
    function planLabel(t, product) {
      return t(product === 'go-plus' || product === 'go-teams' ? `plan.${product}` : 'plan.go')
    }

    /** Milliseconds until an ISO instant, or null. */
    function remaining(iso, now) {
      if (typeof iso !== 'string' || iso === '') return null
      const target = new Date(iso).getTime()
      if (Number.isNaN(target)) return null
      return target - now
    }

    /** Fetch one status payload from the Host half. */
    async function fetchUsage(force) {
      const response = await fetch(`${STATUS_ROUTE}${force ? '?force=1' : ''}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      if (payload === null || typeof payload !== 'object') throw new Error('Bad payload')
      return payload
    }

    /** Ring gauge matching the composer context meter. */
    function Ring({ percent, color }) {
      const value = Math.max(0, Math.min(100, Number(percent) || 0))
      return h(
        'svg',
        { viewBox: '0 0 14 14', width: '14', height: '14', 'aria-hidden': true },
        h('circle', {
          className: 'ocg_ringTrack',
          cx: '7',
          cy: '7',
          r: RING_RADIUS,
        }),
        h('circle', {
          className: 'ocg_ringFill',
          cx: '7',
          cy: '7',
          r: RING_RADIUS,
          style: { stroke: color },
          strokeDasharray: `${(RING_CIRCUMFERENCE * value) / 100} ${RING_CIRCUMFERENCE}`,
          transform: 'rotate(-90 7 7)',
        }),
      )
    }

    /** Fixed placement for the portaled panel: above the anchor, clamped to the viewport. */
    function panelStyle(anchor, panel, previous) {
      const margin = VIEWPORT_MARGIN
      const width = Math.min(panel.width, window.innerWidth - margin * 2)
      let left = anchor.left + anchor.width / 2 - width / 2
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
      let top = anchor.top - ANCHOR_GAP - panel.height
      if (top < margin) top = Math.min(anchor.bottom + ANCHOR_GAP, window.innerHeight - panel.height - margin)
      const next = { position: 'fixed', left: Math.round(left), top: Math.round(top) }
      if (
        previous !== null &&
        previous.position === next.position &&
        Math.abs(previous.left - next.left) < 0.5 &&
        Math.abs(previous.top - next.top) < 0.5
      ) {
        return previous
      }
      return next
    }

    /** Open state, anchored fixed placement, and dismissal for one pill dialog. */
    function useStatDialog() {
      const [open, setOpen] = React.useState(false)
      const [pos, setPos] = React.useState(null)
      const rootRef = React.useRef(null)
      const panelRef = React.useRef(null)

      // Measure and keep the portaled panel anchored above the trigger.
      React.useEffect(() => {
        if (!open) {
          setPos(null)
          return undefined
        }
        const update = () => {
          if (rootRef.current === null || panelRef.current === null) return
          const anchor = rootRef.current.getBoundingClientRect()
          const panel = panelRef.current.getBoundingClientRect()
          setPos((previous) => panelStyle(anchor, panel, previous))
        }
        update()
        window.addEventListener('resize', update)
        window.addEventListener('scroll', update, true)
        return () => {
          window.removeEventListener('resize', update)
          window.removeEventListener('scroll', update, true)
        }
      }, [open])

      // Re-anchor when the panel content changes height (loading -> data -> error).
      React.useEffect(() => {
        if (!open) return
        const id = requestAnimationFrame(() => {
          if (rootRef.current === null || panelRef.current === null) return
          const anchor = rootRef.current.getBoundingClientRect()
          const panel = panelRef.current.getBoundingClientRect()
          setPos((previous) => panelStyle(anchor, panel, previous))
        })
        return () => cancelAnimationFrame(id)
      })

      // Outside pointerdown and Escape dismiss, like the host stat dialogs.
      React.useEffect(() => {
        if (!open) return undefined
        const onPointer = (event) => {
          const target = event.target
          if (rootRef.current?.contains(target) === true) return
          if (panelRef.current?.contains(target) === true) return
          setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointer, true)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onPointer, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      return { open, setOpen, rootRef, panelRef, pos }
    }

    /** The header, bar, window rows, and plan footer of the open panel. */
    function PanelBody({ t, payload, now, busy, onRefresh, onRetry }) {
      if (payload === null) {
        return h('div', { className: 'ocg_loading' }, t('panel.loading'))
      }
      if (payload.ok !== true) {
        const code = typeof payload.code === 'string' ? payload.code : 'internal'
        const message = t(`error.${code}`) === `error.${code}` ? t('error.internal') : t(`error.${code}`)
        const hint =
          code === 'no-auth' || code === 'bad-auth-file'
            ? t('error.hint.auth')
            : code === 'network' || code === 'timeout'
              ? t('error.hint.network')
              : ''
        return h(
          'div',
          { className: 'ocg_loading' },
          h('div', { className: 'ocg_errorText', title: payload.message ?? '' }, message),
          hint ? h('div', { style: { marginTop: '4px' } }, hint) : null,
          h(
            'div',
            { style: { marginTop: '10px' } },
            h(
              'button',
              {
                type: 'button',
                className: 'ocg_refresh',
                onClick: onRetry,
                disabled: busy,
                style: {
                  border: '0.5px solid var(--dsw-alias-border-l1)',
                  padding: '2px 8px',
                  color: 'var(--dsw-alias-label-secondary)',
                },
              },
              t('panel.retry'),
            ),
          ),
        )
      }

      const snapshot = payload.snapshot
      const nearest = nearestWindow(snapshot.meters)
      const meter = snapshot.meters[nearest.key]
      const resetMs = remaining(meter?.resetsAt, now)
      const endDate = formatDate(snapshot.periodEndsAt)
      const planState = snapshot.cancelAtPeriodEnd
        ? t('panel.cancelled', { date: endDate })
        : endDate
          ? t('panel.renews', { date: endDate })
          : ''
      // Linear month-end projection, same math as the Console Activity page:
      // pace = month% / elapsed fraction of the billing period.
      const monthMeter = snapshot.meters.month
      let paceText = ''
      let dailyText = ''
      const subStart = Date.parse(snapshot.subscribedAt)
      const subEnd = Date.parse(snapshot.periodEndsAt)
      if (monthMeter && Number.isFinite(subStart) && Number.isFinite(subEnd) && subEnd > subStart) {
        const elapsed = now - subStart
        if (elapsed > 0) {
          const frac = Math.min(1, elapsed / (subEnd - subStart))
          const mp = Math.max(0, Number(monthMeter.percent) || 0)
          if (frac > 0) {
            paceText = t('panel.pace', { percent: Math.round(mp / frac) })
            const days = elapsed / 86400000
            if (days > 0.05) dailyText = t('panel.paceDay', { percent: Math.round((mp / days) * 10) / 10 })
          }
        }
      }
      const paceLine = [paceText, dailyText].filter(Boolean).join(' · ')
      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'ocg_rows' },
          WINDOWS.map((window) => {
            const rowMeter = snapshot.meters[window.key]
            const rowPercent = Math.max(0, Math.min(100, Number(rowMeter?.percent) || 0))
            const rowReset = remaining(rowMeter?.resetsAt, now)
            // Per-window linear projection to the end of its own window.
            // Month meter carries no startsAt, so the billing period bounds stand in.
            const paceStart = window.key === 'month' ? snapshot.subscribedAt : rowMeter?.startsAt
            const paceEnd = window.key === 'month' ? snapshot.periodEndsAt : rowMeter?.resetsAt
            let paceTick = null
            const paceS = Date.parse(paceStart)
            const paceE = Date.parse(paceEnd)
            if (Number.isFinite(paceS) && Number.isFinite(paceE) && paceE > paceS) {
              const paceElapsed = now - paceS
              if (paceElapsed > 0) {
                const paceFrac = Math.min(1, paceElapsed / (paceE - paceS))
                if (paceFrac > 0) {
                  const paceRaw = Math.max(0, Number(rowMeter?.percent) || 0) / paceFrac
                  const paceClamped = Math.max(0, Math.min(100, paceRaw))
                  paceTick = h('div', {
                    className: 'ocg_paceTick',
                    style: { left: `calc(${paceClamped}% - 1px)` },
                    title: t('panel.pace', { percent: Math.round(paceRaw) }),
                  })
                }
              }
            }
            return h(
              React.Fragment,
              { key: window.key },
              h(
                'div',
                {
                  className: 'ocg_header',
                  title:
                    rowReset !== null && rowReset > 0
                      ? t('panel.resets', { window: t(window.short), time: formatDuration(rowReset) })
                      : '',
                },
                h('span', { className: 'ocg_percent' }, `${Math.round(rowPercent)}%`),
                h('span', { className: 'ocg_headline' }, t('panel.ofLimit', { window: t(window.short) })),
                h(
                  'span',
                  { className: 'ocg_figures' },
                  t('panel.figures', { used: money(rowMeter?.usedUsd), limit: money(rowMeter?.limitUsd) }),
                ),
              ),
              h(
                'div',
                {
                  className: 'ocg_bar',
                  role: 'progressbar',
                  'aria-valuemin': 0,
                  'aria-valuemax': 100,
                  'aria-valuenow': Math.round(rowPercent),
                  'aria-label': t(window.long),
                },
                h('div', {
                  className: 'ocg_barFill',
                  style: { width: `${rowPercent}%`, background: toneFor(rowPercent) },
                }),
                paceTick,
              ),
            )
          }),
        ),
        h(
          'div',
          { className: 'ocg_footer' },
          h(
            'div',
            { className: 'ocg_footerLine' },
            h('span', { className: 'ocg_meta' }, [planLabel(t, snapshot.product), planState].filter(Boolean).join(' · ')),
          ),
          paceLine
            ? h(
                'div',
                { className: 'ocg_footerLine' },
                h('span', { className: 'ocg_meta' }, paceLine),
              )
            : null,
          h(
            'div',
            { className: 'ocg_footerLine' },
            h(
              'span',
              { className: 'ocg_meta' },
              [
                resetMs !== null && resetMs > 0
                  ? t('panel.resets', { window: t(nearest.short), time: formatDuration(resetMs) })
                  : '',
                formatAgo(t, now - Date.parse(payload.fetchedAt)),
              ]
                .filter(Boolean)
                .join(' · '),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'ocg_refresh',
                title: t('panel.refresh'),
                'aria-label': t('panel.refresh'),
                onClick: onRefresh,
                disabled: busy,
              },
              busy ? '…' : '↻',
            ),
          ),
          snapshot.useBalance ? h('div', { className: 'ocg_meta' }, t('panel.extraBalance')) : null,
        ),
      )
    }

    /** The composer-dock pill and its portaled detail panel. */
    function UsagePill() {
      // Хост без русского языка интерфейса, поэтому всегда русский словарь.
      const t = fallbackT
      const [state, setState] = React.useState({ phase: 'loading', payload: null })
      const [busy, setBusy] = React.useState(false)
      const [now, setNow] = React.useState(() => Date.now())
      const alive = React.useRef(true)
      const { open, setOpen, rootRef, panelRef, pos } = useStatDialog()

      const load = React.useCallback(async (force) => {
        if (force) setBusy(true)
        try {
          const payload = await fetchUsage(force)
          if (!alive.current) return
          setState(payload.ok === true ? { phase: 'ready', payload } : { phase: 'error', payload })
        } catch (error) {
          if (!alive.current) return
          setState({
            phase: 'error',
            payload: { ok: false, code: 'network', message: String(error?.message ?? error) },
          })
        } finally {
          if (alive.current && force) setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        alive.current = true
        load(false)
        const poll = setInterval(() => load(false), POLL_MS)
        const tick = setInterval(() => setNow(Date.now()), TICK_MS)
        return () => {
          alive.current = false
          clearInterval(poll)
          clearInterval(tick)
        }
      }, [load])

      const payload = state.payload
      const snapshot = payload?.ok === true ? payload.snapshot : null
      const nearest = snapshot ? nearestWindow(snapshot.meters) : null
      const percent = snapshot ? Math.max(0, Math.min(100, Number(snapshot.meters[nearest.key]?.percent) || 0)) : 0
      const ringColor =
        state.phase === 'ready'
          ? percent >= 70
            ? toneFor(percent)
            : 'var(--dsw-alias-label-tertiary)'
          : state.phase === 'error'
            ? 'var(--dsw-alias-state-error-primary)'
            : 'var(--dsw-alias-border-l3)'
      const label =
        state.phase === 'ready'
          ? t('pill.label', { window: t(nearest.short), percent: Math.round(percent) })
          : state.phase === 'error'
            ? t('pill.error')
            : t('pill.loading')
      const aria =
        state.phase === 'ready'
          ? t('pill.aria', { window: t(nearest.short), percent: Math.round(percent) })
          : state.phase === 'error'
            ? (payload?.message ?? t('pill.error'))
            : t('panel.loading')

      return h(
        'span',
        { ref: rootRef, className: 'ocg_anchor', 'data-composer-stat': 'opencode-go-usage' },
        h(
          'button',
          {
            type: 'button',
            className: 'ocg_pill',
            'aria-haspopup': 'dialog',
            'aria-expanded': open,
            'aria-label': aria,
            title: aria,
            style: state.phase === 'error' ? { color: 'var(--dsw-alias-state-error-primary)' } : undefined,
            onClick: () => setOpen(!open),
          },
          h(Ring, { percent: state.phase === 'ready' ? percent : 0, color: ringColor }),
          h('span', { className: 'ocg_label' }, label),
        ),
        open
          ? ReactDOM.createPortal(
              h(
                'div',
                {
                  ref: panelRef,
                  className: 'ocg_panel',
                  role: 'dialog',
                  'aria-label': t('panel.title'),
                  style: pos ?? { position: 'fixed', left: 0, top: 0, visibility: 'hidden' },
                },
                h(
                  'div',
                  { className: 'ocg_title' },
                  h('span', { className: 'ocg_titleLabel' }, h(Ring, { percent: state.phase === 'ready' ? percent : 0, color: ringColor }), t('panel.title')),
                  snapshot ? h('span', { className: 'ocg_titleValue' }, planLabel(t, snapshot.product)) : null,
                ),
                h('div', { className: 'ocg_rule', 'aria-hidden': true }),
                h(PanelBody, {
                  t,
                  payload,
                  now,
                  busy,
                  onRefresh: () => load(true),
                  onRetry: () => load(true),
                }),
              ),
              document.body,
            )
          : null,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {}
          if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return () => {}
          const tag = document.createElement('style')
          tag.dataset.plugin = '@local/opencode-go-usage'
          tag.dataset.pluginCss = STYLE_ID
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'opencode-go-usage: styles')
        ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'opencode-go-usage: dictionaries')
        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'opencode-go-usage',
              order: 2,
              locale: NS,
            },
            UsagePill,
          ),
        )
      },
    }
  },
})
