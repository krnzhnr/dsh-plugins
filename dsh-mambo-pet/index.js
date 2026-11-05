/**
 * dsh-mambo-pet — installer for the Mambo pet.
 *
 * User pets are not Cordis plugins: the pet registry scans `$DSH_HOME/pets/<id>/`
 * at host startup (there is no hot rescan). This Host half copies the bundled
 * `pets/mambo/` directory there on apply, so installing the bundle stages the
 * pet; a DSH host restart then makes Mambo selectable in Settings → Pet.
 * Re-applying updates the files in place.
 *
 * Sprites: TracenAcademy v4.0 (Desktop Gremlin), character Mambo by Kritzkingvoid
 * (see the pet manifest for author/license/homepage).
 *
 * No network, no telemetry, no writes outside `$DSH_HOME/pets/mambo`.
 *
 * @module @local/dsh-mambo-pet
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis function-plugin name. */
export const name = 'dsh-mambo-pet'

/** No service dependencies: pure file install. */
export const inject = []

/** Pet id this bundle ships (directory name, pet.json id). */
export const PET_ID = 'mambo'

/** Bundled pets root, relative to the package root. */
export const PETS_ROOT = 'pets'

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
 * Install the bundled pet into a DSH home.
 *
 * @param {{ packageDir?: string, homeDir?: string, overwrite?: boolean }} [options] - install targets.
 * @returns {{ id: string, dest: string, copied: number, skipped: number }} install report.
 */
export function installPet(options = {}) {
  const packageDir = options.packageDir ?? dirname(fileURLToPath(import.meta.url))
  const homeDir = options.homeDir ?? resolveDshHome()
  const overwrite = options.overwrite ?? true
  const src = join(packageDir, PETS_ROOT, PET_ID)
  if (!existsSync(join(src, 'pet.json'))) {
    throw new Error(`[dsh-mambo-pet] bundled pet missing: ${src}/pet.json`)
  }
  const dest = join(homeDir, 'pets', PET_ID)
  const { copied, skipped } = copyTree(src, dest, overwrite)
  const manifest = JSON.parse(readFileSync(join(dest, 'pet.json'), 'utf8'))
  if (manifest.id !== PET_ID) {
    throw new Error(`[dsh-mambo-pet] installed pet id mismatch: ${JSON.stringify(manifest.id)}`)
  }
  return { id: PET_ID, dest, copied, skipped }
}

/**
 * Host plugin body: install the pet files on bundle load.
 *
 * Note: the pet registry is scanned at host startup, so the pet becomes
 * selectable only after a DSH restart.
 *
 * @param {object} ctx - Cordis context (unused; the install is context-free).
 * @param {unknown} config - loader row config.
 */
export function apply(ctx, config) {
  installPet({ overwrite: resolveOptions(config).overwrite })
}

export const __test = {
  resolveDshHome,
  resolveOptions,
  copyTree,
  installPet,
  PET_ID,
}
