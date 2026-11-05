// Генератор install-спек для плагинов репозитория.
// Использование:
//   node tools/install-specs.mjs [ник] [--ref main] [--write-readme]
//
// Печатает для каждой папки-бандла спеку вида:
//   git+https://github.com/<ник>/dsh-plugins.git#main&path:/dsh-locale-ru
// Пин на тег добавляется, только если такой тег уже есть в репо.
// С --write-readme обновляет таблицу между маркерами
// <!-- install-specs:start --> … <!-- install-specs:end --> в корневом README.md.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const nick = args.find((a) => !a.startsWith('--')) || 'krnzhnr';
const ref = (() => {
  const i = args.indexOf('--ref');
  return i !== -1 && args[i + 1] ? args[i + 1] : 'main';
})();
const writeReadme = args.includes('--write-readme');

let tags = new Set();
try {
  tags = new Set(execSync('git tag', { cwd: root, encoding: 'utf8' }).split('\n').map((t) => t.trim()).filter(Boolean));
} catch {
  // не git-репозиторий — пины на теги пропускаем
}

const bundles = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'tools')
  .map((e) => e.name)
  .filter((dir) => {
    const pkgFile = path.join(root, dir, 'package.json');
    if (!fs.existsSync(pkgFile)) return false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      return Boolean(pkg.dsh && pkg.dsh.bundle);
    } catch {
      return false;
    }
  })
  .map((dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf8'));
    const tag = `${dir}/v${pkg.version}`;
    return { dir, version: pkg.version, main: `git+https://github.com/${nick}/dsh-plugins.git#${ref}&path:/${dir}`, pin: tags.has(tag) ? `git+https://github.com/${nick}/dsh-plugins.git#${tag}&path:/${dir}` : null };
  });

const rows = bundles.map(
  (b) => `| \`${b.dir}/\` | ${b.version} | \`${b.main}\` | ${b.pin ? `\`${b.pin}\`` : '—'} |`
);
const table = [
  '| Плагин | Версия | Спека (ветка `' + ref + '`) | Пин на тег |',
  '|---|---|---|---|',
  ...rows,
].join('\n');

if (writeReadme) {
  const readmeFile = path.join(root, 'README.md');
  const text = fs.readFileSync(readmeFile, 'utf8');
  const start = '<!-- install-specs:start -->';
  const end = '<!-- install-specs:end -->';
  if (!text.includes(start) || !text.includes(end)) {
    console.error('В README.md нет маркеров install-specs:start/end — сначала добавьте секцию.');
    process.exit(1);
  }
  const next = text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${table}\n${end}`);
  fs.writeFileSync(readmeFile, next);
  console.log(`README.md обновлён: ${bundles.length} плагинов.`);
} else {
  console.log(table);
}
