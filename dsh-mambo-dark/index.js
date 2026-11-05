/**
 * dsh-mambo-dark — installer for the Mambo Noir skin.
 *
 * Asset skins are not Cordis plugins: the skin-center catalog reads them from
 * `$DSH_HOME/skins/<id>/` (user source, shadowing built-ins). This Host half
 * copies the bundled `skins/mambo-dark/` directory there on apply, so installing
 * the bundle makes the skin appear in Settings → Appearance (Skin Center) with
 * no manual file moves. Re-applying updates the files in place.
 *
 * No network, no telemetry, no writes outside `$DSH_HOME/skins/mambo-dark`.
 *
 * @module @local/dsh-mambo-dark
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis function-plugin name. */
export const name = 'dsh-mambo-dark'

/** No service dependencies: pure file install. */
export const inject = []

/** Skin id this bundle ships (directory name, skin.json id). */
export const SKIN_ID = 'mambo-dark'

/** Bundled skins root, relative to the package root. */
export const SKINS_ROOT = 'skins'

/**
 * Resolve the DSH home directory, mirroring the core plugins: the `DSH_HOME`
 * environment override wins, otherwise the platform home is used.
 *
 * @param {NodeJS.ProcessEnv} [env] - environment to read.
 * @param {string} [home] - platform home fallback.
 * @returns {string} absolute DSH home path.
 */
export function resolveDshHome(env = process.env, home = homedir()) {
  const raw = env.DSH_HOME
  if (typeof raw === 'string' && raw.trim() !== '') {
    const expanded = raw.trim().startsWith('~/') || raw.trim() === '~'
      ? join(home, raw.trim().slice(2))
      : raw.trim()
    return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded)
  }
  return join(home, '.dsh')
}

/**
 * Resolve the bundle configuration (raw loader row `config`).
 * Every field is optional; invalid values fall back instead of failing boot.
 *
 * @param {unknown} config - raw row config.
 * @returns {{ overwrite: boolean }} normalized options.
 */
export function resolveOptions(config) {
  const input = config !== null && typeof config === 'object' && !Array.isArray(config) ? config : {}
  return {
    overwrite: input.overwrite !== false,
  }
}

/**
 * Copy one directory tree. Counts copied vs skipped (existing, overwrite off) files.
 *
 * @param {string} srcDir - bundled source directory.
 * @param {string} destDir - destination directory (created).
 * @param {boolean} overwrite - replace existing files.
 * @returns {{ copied: number, skipped: number }} copy stats.
 */
export function copyTree(srcDir, destDir, overwrite) {
  let copied = 0
  let skipped = 0
  const stack = [[srcDir, destDir]]
  mkdirSync(destDir, { recursive: true })
  while (stack.length > 0) {
    const [src, dest] = stack.pop()
    mkdirSync(dest, { recursive: true })
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      const from = join(src, entry.name)
      const to = join(dest, entry.name)
      if (entry.isDirectory()) {
        stack.push([from, to])
      } else if (entry.isFile()) {
        if (!overwrite && existsSync(to)) {
          skipped += 1
          continue
        }
        copyFileSync(from, to)
        copied += 1
      }
    }
  }
  return { copied, skipped }
}

/**
 * Install the bundled skin into a DSH home.
 *
 * @param {{ packageDir?: string, homeDir?: string, overwrite?: boolean }} [options] - install targets.
 * @returns {{ id: string, dest: string, copied: number, skipped: number }} install report.
 */
export function installSkin(options = {}) {
  const packageDir = options.packageDir ?? dirname(fileURLToPath(import.meta.url))
  const homeDir = options.homeDir ?? resolveDshHome()
  const overwrite = options.overwrite ?? true
  const src = join(packageDir, SKINS_ROOT, SKIN_ID)
  if (!existsSync(join(src, 'skin.json'))) {
    throw new Error(`[dsh-mambo-dark] bundled skin missing: ${src}/skin.json`)
  }
  const dest = join(homeDir, 'skins', SKIN_ID)
  const { copied, skipped } = copyTree(src, dest, overwrite)
  const manifest = JSON.parse(readFileSync(join(dest, 'skin.json'), 'utf8'))
  if (manifest.id !== SKIN_ID) {
    throw new Error(`[dsh-mambo-dark] installed skin id mismatch: ${JSON.stringify(manifest.id)}`)
  }
  return { id: SKIN_ID, dest, copied, skipped }
}

/**
 * Host plugin body: install the skin files on bundle load.
 *
 * @param {object} ctx - Cordis context (unused; the install is context-free).
 * @param {unknown} config - loader row config.
 */
export function apply(ctx, config) {
  installSkin({ overwrite: resolveOptions(config).overwrite })
}

export const __test = {
  resolveDshHome,
  resolveOptions,
  copyTree,
  installSkin,
  SKIN_ID,
}
