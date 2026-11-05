// Offline checks for the dsh-mambo-dark installer (no network, no DSH host).
// Run: node test/install-smoke.mjs
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const { installSkin, resolveDshHome, resolveOptions, SKIN_ID } = await import('../index.js')

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok' : 'FAIL'} - ${name}${detail ? ' — ' + detail : ''}`)
  if (!ok) failures += 1
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
check('package name is @local/dsh-mambo-dark', pkg.name === '@local/dsh-mambo-dark', pkg.name)
check('bundle patch points at cordis.patch.yml', pkg?.dsh?.bundle?.patch === './cordis.patch.yml')
check('host-only bundle (no dsh.client)', pkg?.dsh?.client === undefined)
check('engine pinned as dependency', pkg?.dependencies?.['@linxin666/dsh-client-ui-skin-center'] === '0.4.14',
  JSON.stringify(pkg?.dependencies))

const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
check('patch inserts dsh-mambo-dark row', patch.includes('id: dsh-mambo-dark') && patch.includes('@local/dsh-mambo-dark'))
check('patch claims no foreign engine row (no install conflicts)', !patch.includes('id: ui-skin-center'))

for (const rel of ['skins/mambo-dark/skin.json', 'skins/mambo-dark/skin.css', 'skins/mambo-dark/patches.css',
  'skins/mambo-dark/assets/mambo-art.jpg', 'skins/mambo-dark/preview/dark.jpg', 'skins/mambo-dark/preview/light.jpg',
  'locale/en.json', 'locale/ru.json', 'icon.svg', 'README.md', 'INSTALL.md', 'LICENSE']) {
  check(`file present: ${rel}`, existsSync(join(ROOT, rel)))
}

const skin = JSON.parse(readFileSync(join(ROOT, 'skins/mambo-dark/skin.json'), 'utf8'))
check('skin id matches folder', skin.id === SKIN_ID, String(skin.id))
check('skin manifest is v2', skin.skinManifestVersion === 2)

check('resolveDshHome honors DSH_HOME', resolveDshHome({ DSH_HOME: '/tmp/x' }, '/home/u') === '/tmp/x')
check('overwrite defaults to true', resolveOptions({}).overwrite === true)
check('overwrite can be disabled', resolveOptions({ overwrite: false }).overwrite === false)

const sandbox = mkdtempSync(join(tmpdir(), 'mambo-dark-'))
try {
  const first = installSkin({ packageDir: ROOT, homeDir: sandbox, overwrite: true })
  check('install copies 6 files', first.copied === 6, JSON.stringify(first))
  check('install target is skins/mambo-dark', first.dest === join(sandbox, 'skins', SKIN_ID))
  const second = installSkin({ packageDir: ROOT, homeDir: sandbox, overwrite: false })
  check('second install skips existing files', second.copied === 0 && second.skipped === 6, JSON.stringify(second))
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nall checks passed')
