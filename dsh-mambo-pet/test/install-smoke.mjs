// Offline checks for the dsh-mambo-pet installer (no network, no DSH host).
// Run: node test/install-smoke.mjs
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const { installPet, resolveDshHome, resolveOptions, PET_ID } = await import('../index.js')

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok' : 'FAIL'} - ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures += 1
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
check('package name is @local/dsh-mambo-pet', pkg.name === '@local/dsh-mambo-pet', pkg.name)
check('bundle patch points at cordis.patch.yml', pkg?.dsh?.bundle?.patch === './cordis.patch.yml')
check('host-only bundle (no dsh.client)', pkg?.dsh?.client === undefined)

const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
check('patch inserts dsh-mambo-pet row', patch.includes('id: dsh-mambo-pet') && patch.includes('@local/dsh-mambo-pet'))

for (const rel of ['pets/mambo/pet.json', 'pets/mambo/previews/idle.gif',
  'locale/en.json', 'locale/ru.json', 'icon.svg', 'README.md', 'INSTALL.md', 'LICENSE']) {
  check(`file present: ${rel}`, existsSync(join(ROOT, rel)))
}

const pet = JSON.parse(readFileSync(join(ROOT, 'pets/mambo/pet.json'), 'utf8'))
check('pet id matches folder', pet.id === PET_ID, String(pet.id))
check('pet renderer is frames2d', pet.renderer === 'frames2d', String(pet.renderer))
check('pet has 12 tracks', Object.keys(pet.frames2d.tracks).length === 12,
  String(Object.keys(pet.frames2d.tracks).length))
check('review loops (streaming fix)', pet.frames2d.tracks.review?.loop === true &&
  pet.frames2d.tracks.review?.fallback === undefined)
for (const track of ['waiting', 'thinking', 'tool', 'review']) {
  check(`work track loops: ${track}`, pet.frames2d.tracks[track]?.loop !== false)
}

let frameCount = 0
let frameBytes = 0
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.isFile()) {
      frameCount += 1
      frameBytes += statSync(full).size
    }
  }
}
walk(join(ROOT, 'pets/mambo/frames'))
check('frames directory is populated (600+ files)', frameCount >= 600, String(frameCount))
for (const track of Object.keys(pet.frames2d.tracks)) {
  const missing = pet.frames2d.tracks[track].frames.filter((f) => !existsSync(join(ROOT, 'pets/mambo/frames', track, f)))
  check(`all ${track} frames present`, missing.length === 0, missing.slice(0, 3).join(','))
}

check('resolveDshHome honors DSH_HOME', resolveDshHome({ DSH_HOME: '/tmp/x' }, '/home/u') === '/tmp/x')
check('overwrite defaults to true', resolveOptions({}).overwrite === true)

const sandbox = mkdtempSync(join(tmpdir(), 'mambo-pet-'))
try {
  const first = installPet({ packageDir: ROOT, homeDir: sandbox, overwrite: true })
  check('install copies pet files', first.copied >= 670, JSON.stringify({ copied: first.copied, skipped: first.skipped }))
  check('install target is pets/mambo', first.dest === join(sandbox, 'pets', PET_ID))
  const second = installPet({ packageDir: ROOT, homeDir: sandbox, overwrite: false })
  check('second install skips existing files', second.copied === 0 && second.skipped === first.copied,
    JSON.stringify(second))
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
