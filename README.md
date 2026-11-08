# dsh-plugins

Плагины для [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): исправления русского перевода интерфейса, трекер расхода OpenCode Go, бесплатный веб-поиск без ключей, тёмный скин с портретом на фоне и питомец Мамбо.

| Плагин | Версия | Что делает |
|---|---|---|
| `dsh-locale-ru/` | 1.3.0 | Отдельный язык «Русский исправленный»: полные словари + 30 фиксов, fallback на официальный |
| `opencode-go-usage/` | 0.3.0 | Пилюля расхода подписки OpenCode Go под полем ввода (5 часов, неделя, месяц) |
| `dsh-free-web-search/` | 1.1.0 | Веб-поиск без ключей (7 запасных бэкендов) и fetch-провайдер |
| `dsh-mambo-dark/` | 1.2.0 | Тёмный графитовый скин Мамбо Нуар: портрет 16:10 на фоне, синий акцент; движок центра оформления 0.4.16 в зависимостях |
| `dsh-mambo-pet/` | 1.2.0 | Питомец Мамбо (`frames2d`, 8 треков, pet v2.3.0: idle 64 кадра — stock-совместимо, русская озвучка; движок питомцев 0.4.16 в зависимостях, нужен рестарт DSH) |

Лицензия — MIT (см. [LICENSE](./LICENSE)).

## Установка

### Вариант 1. С локального диска

Plugins → **Add plugin** → вставить абсолютный путь к папке плагина, например:

```
F:\Programing\Utils\dsh-plugins\dsh-locale-ru
```

То же через CLI: `dsh plugin add F:\Programing\Utils\dsh-plugins\dsh-locale-ru`.

### Вариант 2. Напрямую из GitHub

Plugins → **Add plugin → Install a third-party plugin** → вставить спеку из таблицы (копипаста, ник уже подставлен):

<!-- install-specs:start -->
| Плагин | Версия | Спека (ветка `main`) | Пин на тег |
|---|---|---|---|
| `dsh-free-web-search/` | 1.1.0 | `git+https://github.com/krnzhnr/dsh-plugins.git#main&path:/dsh-free-web-search` | — |
| `dsh-locale-ru/` | 1.3.0 | `git+https://github.com/krnzhnr/dsh-plugins.git#main&path:/dsh-locale-ru` | — |
| `dsh-mambo-dark/` | 1.2.0 | `git+https://github.com/krnzhnr/dsh-plugins.git#main&path:/dsh-mambo-dark` | `git+https://github.com/krnzhnr/dsh-plugins.git#dsh-mambo-dark/v1.2.0&path:/dsh-mambo-dark` |
| `dsh-mambo-pet/` | 1.2.0 | `git+https://github.com/krnzhnr/dsh-plugins.git#main&path:/dsh-mambo-pet` | `git+https://github.com/krnzhnr/dsh-plugins.git#dsh-mambo-pet/v1.2.0&path:/dsh-mambo-pet` |
| `opencode-go-usage/` | 0.3.0 | `git+https://github.com/krnzhnr/dsh-plugins.git#main&path:/opencode-go-usage` | — |
<!-- install-specs:end -->

Спеки выше — для `github.com/krnzhnr`. Под чужой форк таблица пересоберётся сама при пуше в `main` (воркфлоу `install-specs`), вручную — так:

```
node tools/install-specs.cjs <ник> [--ref ветка] --write-readme
```

Для воспроизводимости вместо `main` лучше указать пин на тег (правая колонка; тег должен существовать в репо — скрипт сам проверяет `git tag`). Нужны git в PATH и доступ к github.com.

### После установки

- Исправления перевода применяются сами (перечитать страницу: `Ctrl+Shift+R`).
- Скин Мамбо Нуар: применить в Settings → Appearance (Центр оформления).
- Питомец Мамбо: **перезапустить DSH целиком** (реестр питомцев читается на старте хоста), затем выбрать Мамбо в Settings → Pet.

### Обновление

Автообновлений нет: новая версия ставится как удаление + установка заново (Plugins → выключить/удалить → Add plugin с новой спекой). Перед переустановкой изменённого бандла DSH сам требует `remove` — это нормально.

## Разработка

- Каждый плагин — обычный npm-пакет: `package.json` (`dsh.bundle.patch`, `dsh.client`), `cordis.patch.yml`, `index.js` (Host), `client.js` (Web UI, опционально), `locale/*.json`, `icon.svg`.
- Правки в установленном бандле подхватываются через HMR; замена файлов пакета целиком иногда требует перезапуска страницы.
- Правило версий: содержимое изменилось → версия в `package.json` вверх (иначе установщик откажет: «already-installed»).
- Тег релиза: `<имя-плагина>/v<версия>`, например `dsh-locale-ru/v1.0.4`.
