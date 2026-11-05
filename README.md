# dsh-plugins

Плагины для [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): исправления русского перевода интерфейса, трекер расхода OpenCode Go, бесплатный веб-поиск без ключей.

| Плагин | Версия | Что делает |
|---|---|---|
| `dsh-locale-ru/` | 1.2.0 | Русский язык поверх официального: полные словари (~2560 ключей) + 306 точечных правок |
| `opencode-go-usage/` | 0.3.0 | Пилюля расхода подписки OpenCode Go под полем ввода (5 часов, неделя, месяц) |
| `dsh-free-web-search/` | 1.1.0 | Веб-поиск без ключей (7 запасных бэкендов) и fetch-провайдер |

Лицензия — MIT (см. [LICENSE](./LICENSE)).

## Установка

### Вариант 1. С локального диска

Plugins → **Add plugin** → вставить абсолютный путь к папке плагина, например:

```
F:\Programing\Utils\dsh-plugins\dsh-locale-ru
```

То же через CLI: `dsh plugin add F:\Programing\Utils\dsh-plugins\dsh-locale-ru`.

### Вариант 2. Напрямую из GitHub

Plugins → **Add plugin → Install a third-party plugin** → вставить спеку (замените `<ник>`):

```
git+https://github.com/<ник>/dsh-plugins.git#main&path:/dsh-locale-ru
```

Хвост `&path:/…` выбирает плагин внутри монорепо:
`&path:/dsh-locale-ru`, `&path:/opencode-go-usage`, `&path:/dsh-free-web-search`.

Для воспроизводимости вместо `main` лучше указать тег релиза, например `#dsh-locale-ru/v1.1.0`. Нужны git в PATH и доступ к github.com.

### После установки

- Исправления перевода применяются сами (перечитать страницу: `Ctrl+Shift+R`).

### Обновление

Автообновлений нет: новая версия ставится как удаление + установка заново (Plugins → выключить/удалить → Add plugin с новой спекой). Перед переустановкой изменённого бандла DSH сам требует `remove` — это нормально.

## Разработка

- Каждый плагин — обычный npm-пакет: `package.json` (`dsh.bundle.patch`, `dsh.client`), `cordis.patch.yml`, `index.js` (Host), `client.js` (Web UI, опционально), `locale/*.json`, `icon.svg`.
- Правки в установленном бандле подхватываются через HMR; замена файлов пакета целиком иногда требует перезапуска страницы.
- Правило версий: содержимое изменилось → версия в `package.json` вверх (иначе установщик откажет: «already-installed»).
- Тег релиза: `<имя-плагина>/v<версия>`, например `dsh-locale-ru/v1.0.4`.
