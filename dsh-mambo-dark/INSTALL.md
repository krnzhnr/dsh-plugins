# Установка скина Мамбо Нуар (`@local/dsh-mambo-dark`, v1.0.0)

Плагин для **DeepSeek Harness** (Web GUI): тёмный графитовый интерфейс
с портретом 16:10 на фоне и штатным синим акцентом DSH.

Хост-часть при загрузке копирует `skins/mambo-dark/` в
`$DSH_HOME/skins/mambo-dark/` — скин появляется в Центре оформления сам,
вручную раскладывать файлы не нужно.

## Что нужно

1. **DeepSeek Harness** с Web GUI (десктопное приложение или `dsh web`).
2. Папка плагина в постоянном месте (не перемещайте её после установки —
   профиль DSH ссылается на неё).

## Шаг 1. Распакуйте

Распакуйте архив в **постоянную папку**:

- Windows: `C:\Users\<вы>\dsh-plugins\`
- macOS / Linux: `~/dsh-plugins/`

Должно получиться так (важно — без двойной вложенности):

```
C:\Users\<вы>\dsh-plugins\dsh-mambo-dark\package.json
C:\Users\<вы>\dsh-plugins\dsh-mambo-dark\index.js
C:\Users\<вы>\dsh-plugins\dsh-mambo-dark\skins\mambo-dark\skin.json
...
```

## Шаг 2. Установите в DSH

### Вариант A — попросить агента (рекомендуется)

Отправьте агенту:

> Установи локальный бандл плагина в текущий профиль:
> `plugin_manager` → `action: install_bundle`, target:
> `<ПОЛНЫЙ ПУТЬ К ПАПКЕ dsh-mambo-dark>`.
> Если попросит подтверждение — разреши.

`target` — абсолютный путь до папки, в которой лежит `package.json`.

### Вариант B — через страницу Plugins

**Plugins** (левая панель) → установка бандла → укажите папку `dsh-mambo-dark`.

### Вариант C — напрямую из GitHub

Plugins → **Add plugin → Install a third-party plugin** → вставить спеку:

```
git+https://github.com/krnzhnr/dsh-plugins.git#main&path:/dsh-mambo-dark
```

Для воспроизводимости вместо `main` лучше указать тег релиза,
например `#dsh-mambo-dark/v1.0.0`.

## Шаг 3. Примените скин

1. Откройте **Settings → Appearance** (Центр оформления).
2. Выберите **Мамбо Нуар** → **Применить**.
3. Если фон не появился — перезагрузите страницу (`Ctrl+R` / `Cmd+R`).

## Настройка (необязательно)

В `cordis.patch.yml` внутри папки плагина:

```yaml
config:
  overwrite: true   # false — не трогать изменённые вручную файлы скина
```

## Если что-то пошло не так

| Симптом | Что делать |
|---|---|
| Скина нет в Центре оформления | Проверьте `plugin_manager` → `list_bundles`: `@local/dsh-mambo-dark` должен быть `installed`/`enabled`; перезапустите DSH |
| Фон не появился после применения | Обновите страницу; проверьте `Settings → Appearance` — скин должен быть активным |
| `already-installed` при установке | Сначала `plugin_manager` → `remove_bundle` target `@local/dsh-mambo-dark`, затем установите заново |

## Удаление

`plugin_manager` → `remove_bundle`, target `@local/dsh-mambo-dark`.
Или страница Plugins → удалить бандл. Файлы в `$DSH_HOME/skins/mambo-dark`
удаляются вручную при желании.

## Состав архива

```
dsh-mambo-dark/
  package.json          манифест бандла (name, dsh.bundle.patch)
  cordis.patch.yml      слой загрузчика: вставляет host-плагин и конфиг
  index.js              host-часть: копирует скин в $DSH_HOME/skins
  skins/mambo-dark/     skin.json, skin.css, patches.css, assets/, preview/
  locale/en.json        название/описание для страницы Plugins
  locale/ru.json
  icon.svg              иконка плагина
  README.md             краткое описание (English)
  INSTALL.md            этот файл
  LICENSE               MIT
  test/                 необязательные тесты для проверки (node)
```

## Лицензия

MIT — см. `LICENSE`. Портрет на фоне — из поставки автора скина.
