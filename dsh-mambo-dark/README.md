# Mambo Noir Skin (`@local/dsh-mambo-dark`)

A DeepSeek Harness skin bundle: a dark graphite interface with the Mambo
portrait (16:10, 1920×1200) as the background and the stock DSH blue accent.

The Host half copies the bundled `skins/mambo-dark/` directory into
`$DSH_HOME/skins/mambo-dark/` on load, so the skin appears in
Settings → Appearance (Skin Center) with no manual file moves. Re-installing
updates the files in place.

## Requirements

The Appearance Center engine `@linxin666/dsh-client-ui-skin-center` (skin
catalog UI) is a declared dependency and installs together with this bundle.
If you installed this bundle from a local folder and the Appearance tab is
still missing, add the engine manually — Plugins → **Add plugin → Install a
third-party plugin** with the npm spec
`@linxin666/dsh-client-ui-skin-center` (same profile).

## Contents

- `skins/mambo-dark/skin.json` — skin manifest v2 (`mambo-dark`, v1.0.0)
- `skins/mambo-dark/skin.css` — interface tokens in the stock DSH palette
- `skins/mambo-dark/patches.css` — background layer, scrim and L3 readability
- `skins/mambo-dark/assets/mambo-art.jpg` — portrait background (1920×1200)
- `skins/mambo-dark/preview/dark.jpg`, `preview/light.jpg` — catalog previews

## Configuration

All fields are optional; edit the row config in `cordis.patch.yml`:

| Field | Default | Meaning |
|---|---|---|
| `overwrite` | `true` | Replace existing skin files on re-apply. Set `false` to keep local edits. |

After install, apply the skin in Settings → Appearance → **Mambo Noir**.
A page reload may be needed for the background to appear.

## License

MIT.
