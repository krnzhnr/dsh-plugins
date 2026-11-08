# Mambo Pet (`@local/dsh-mambo-pet`)

A DeepSeek Harness pet bundle: **Mambo**, a small gremlin companion that reacts
to the session — idles calmly, leans in while thinking, runs while tools work,
writes along with answers, celebrates success and dissolves on failure.

The Host half copies the bundled `pets/mambo/` directory into
`$DSH_HOME/pets/mambo/` on load. The pet registry scans that directory at host
startup, so a **DSH restart is required after install** (a page reload is not
enough); then pick **Mambo** in Settings → Pet.

## Requirements

The pet engine `@linxin666/dsh-pet` (Pet tab, registry, floating-pet renderer)
is a declared dependency (`0.4.16`) and installs together with this bundle. If
you installed this bundle from a local folder and the Pet tab is still missing,
add the engine manually — Plugins → **Add plugin → Install a third-party
plugin** with the npm spec `@linxin666/dsh-pet` (same profile, then restart
DSH).

The pet is built for the **stock engine**: every track is at most **64 frames**
(`frames2d` cap in stock `@linxin666/dsh-pet` 0.4.16), so it validates as-is on
a normal install.

## Contents (pet v2.3.0, Russian voice included)

- `pets/mambo/pet.json` — pet manifest v2 (`mambo`, `frames2d`, 8 tracks)
- `pets/mambo/voice.json` — Russian voice pack (all 11 status scenes, 17 tool
  families, whispers, remarks): Mambo speaks Russian even with no global voice
- `pets/mambo/frames/` — 421 WebP frames, 300×300
  (`idle`, `waiting`, `thinking`, `tool`, `review`, `done`, `failed`, `drag`)
- `pets/mambo/previews/idle.gif` — catalog preview

**Stock-compatible idle:** 64 frames × 33 ms (2.11 s loop). The frames come from
a 64-frame window of the original 340-frame idle animation; the last 6 frames
are pre-rendered cross-fades that morph back onto the first frame, so the loop
seam is exact (no jump/teleport). A DSH restart after install — required anyway
because the pet registry is scanned at host startup — also picks up the new
frame count.

Work-phase tracks (`waiting`, `thinking`, `tool`, `review`) loop for as long as
the phase lasts; `review` was looped so streaming answers no longer drop the pet
to idle mid-stream. `done`/`failed` are one-shots with an idle fallback, and
`drag` plays while the pet is being dragged. Ambient one-shot tracks were
removed in 1.2.0 — the stock renderer never plays them, so they only added
package weight.

Sprites: TracenAcademy v4.0 (Desktop Gremlin), character Mambo by Kritzkingvoid —
see `author`/`license`/`homepage` in `pets/mambo/pet.json`.

## Configuration

All fields are optional; edit the row config in `cordis.patch.yml`:

| Field | Default | Meaning |
|---|---|---|
| `overwrite` | `true` | Replace existing pet files on re-apply. Set `false` to keep local edits. |

## Changelog

### 1.2.0 (2026-11-08)

- **Stock compatibility:** every `frames2d` track is now ≤64 frames (the cap in
  stock `@linxin666/dsh-pet` 0.4.16), so the bundle validates on a regular
  install. Previously the 170-frame idle needed a patched engine.
- `idle` rebuilt: 64 frames × 33 ms, the best-closure 64-frame window from the
  340-frame source, with a pre-rendered 6-frame cross-fade tail → seamless loop
  (seam MSE 0).
- Removed the four `ambient-*` tracks and their 144 frames — the stock renderer
  does not play them. Package pet payload: 671 → 421 frames (−38%), ~14.1 → 8.7 MB.
- Engine dependency pinned to `@linxin666/dsh-pet` 0.4.16; manifest version
  `2.3.0`; preview GIF rebuilt from the new idle.
- Docs updated with the stock-compat note (64-frame idle) and the DSH-restart
  requirement.

### 1.1.0

- Russian voice pack (`voice.json`): all 11 status scenes, 17 tool families,
  whispers and remarks.
- `review` track loops so streaming answers do not drop the pet to idle.

### 1.0.0

- First public bundle: Mambo pet (`frames2d`), installer Host half, plugins-page
  locales, icon.

## License

MIT. The artwork follows its original terms (Desktop Gremlin by Kritzkingvoid,
TracenAcademy v4.0) — see the pet manifest.
