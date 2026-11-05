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
is a declared dependency and installs together with this bundle. If you
installed this bundle from a local folder and the Pet tab is still missing,
add the engine manually — Plugins → **Add plugin → Install a third-party
plugin** with the npm spec `@linxin666/dsh-pet` (same profile, then restart
DSH).

## Contents (pet v2.2.2, Russian voice included)

- `pets/mambo/pet.json` — pet manifest v2 (`mambo`, `frames2d`, 12 tracks)
- `pets/mambo/voice.json` — Russian voice pack (all 11 status scenes, 17 tool
  families, whispers, remarks): Mambo speaks Russian even with no global voice
- `pets/mambo/frames/` — 671 WebP frames, 300×300 (idle, waiting, thinking,
  tool, review, done, failed, drag + 4 ambient one-shots)
- `pets/mambo/previews/idle.gif` — catalog preview

Work-phase tracks (`waiting`, `thinking`, `tool`, `review`) loop for as long as
the phase lasts; `review` was looped in v2.2.1 so streaming answers no longer
drop the pet to idle mid-stream. `done`/`failed` and the `ambient-*` bonuses
are one-shots with an idle fallback.

Sprites: TracenAcademy v4.0 (Desktop Gremlin), character Mambo by Kritzkingvoid —
see `author`/`license`/`homepage` in `pets/mambo/pet.json`.

## Configuration

All fields are optional; edit the row config in `cordis.patch.yml`:

| Field | Default | Meaning |
|---|---|---|
| `overwrite` | `true` | Replace existing pet files on re-apply. Set `false` to keep local edits. |

## License

MIT. The artwork follows its original terms (Desktop Gremlin by Kritzkingvoid,
TracenAcademy v4.0) — see the pet manifest.
