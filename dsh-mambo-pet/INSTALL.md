# Установка питомца Мамбо (`@local/dsh-mambo-pet`, v1.2.0, питомец v2.3.0)

Плагин для **DeepSeek Harness**: гремлин-компаньон **Мамбо** — спокойно дышит
в простое, волнуется в ожидании, думает, бежит во время вызовов инструментов,
пишет вместе со стримингом ответа, радуется успеху и растворяется при ошибке.

Питомец собран под **штатный движок** (`@linxin666/dsh-pet` 0.4.16): каждый трек
не длиннее **64 кадров**, `idle` — 64 кадра по 33 мс с бесшовной петлёй
(кросс-фейд в конце), поэтому проходит валидацию на обычной установке без
патчей движка.

Хост-часть при загрузке копирует `pets/mambo/` в `$DSH_HOME/pets/mambo/`.
Реестр питомцев сканируется **на старте хоста**, поэтому после установки нужен
**перезапуск DSH** (одной перезагрузки страницы недостаточно); затем выберите
Мамбо в Настройки → Питомец.

## Что нужно

1. **DeepSeek Harness** (десктопное приложение или `dsh web`).
2. **Движок питомцев `@linxin666/dsh-pet` 0.4.16** — идёт зависимостью плагина и
   ставится вместе с ним. Питомец рассчитан на штатную версию движка (треки
   ≤64 кадров, `idle` 64 кадра). Если ставили плагин из локальной папки и
   вкладки «Питомец» всё равно нет — доставьте движок вручную в тот же профиль:
   Plugins → **Add plugin → Install a third-party plugin** → npm-спека
   `@linxin666/dsh-pet`, затем перезапустите DSH.
3. Папка плагина в постоянном месте (не перемещайте её после установки).

## Шаг 1. Распакуйте

Распакуйте архив в **постоянную папку**:

- Windows: `C:\Users\<вы>\dsh-plugins\`
- macOS / Linux: `~/dsh-plugins/`

Должно получиться так (важно — без двойной вложенности):

```
C:\Users\<вы>\dsh-plugins\dsh-mambo-pet\package.json
C:\Users\<вы>\dsh-plugins\dsh-mambo-pet\index.js
C:\Users\<вы>\dsh-plugins\dsh-mambo-pet\pets\mambo\pet.json
...
```

## Шаг 2. Установите в DSH

### Вариант A — попросить агента (рекомендуется)

Отправьте агенту:

> Установи локальный бандл плагина в текущий профиль:
> `plugin_manager` → `action: install_bundle`, target:
> `<ПОЛНЫЙ ПУТЬ К ПАПКЕ dsh-mambo-pet>`.
> Если попросит подтверждение — разреши.

### Вариант B — через страницу Plugins

**Plugins** (левая панель) → установка бандла → укажите папку `dsh-mambo-pet`.

### Вариант C — напрямую из GitHub

Plugins → **Add plugin → Install a third-party plugin** → вставить спеку:

```
git+https://github.com/krnzhnr/dsh-plugins.git#main&path:/dsh-mambo-pet
```

Для воспроизводимости вместо `main` лучше указать тег релиза,
например `#dsh-mambo-pet/v1.0.0`.

## Шаг 3. Перезапустите DSH и выберите Мамбо

1. **Полностью перезапустите DSH** (закройте приложение / остановите `dsh`,
   запустите снова). Реестр питомцев читается только на старте.
2. Откройте **Settings → Pet** → выберите **Mambo**.
3. Проверьте: `GET /pet/mambo/pet.json` отдаёт манифест v2.3.0.

## Настройка (необязательно)

В `cordis.patch.yml` внутри папки плагина:

```yaml
config:
  overwrite: true   # false — не трогать изменённые вручную файлы питомца
```

## Если что-то пошло не так

| Симптом | Что делать |
|---|---|
| Мамбо нет в Settings → Pet | Перезапустите **хост DSH целиком** (не только страницу); проверьте `plugin_manager` → `list_bundles`: `@local/dsh-mambo-pet` должен быть `installed`/`enabled` |
| `already-installed` при установке | Сначала `plugin_manager` → `remove_bundle` target `@local/dsh-mambo-pet`, затем установите заново |
| Питомец виден, но анимация странная | Убедитесь, что файлы в `$DSH_HOME/pets/mambo` свежие (переустановите с `overwrite: true`) и перезапустите DSH |

## Удаление

`plugin_manager` → `remove_bundle`, target `@local/dsh-mambo-pet`.
Или страница Plugins → удалить бандл. Каталог `$DSH_HOME/pets/mambo`
удаляется вручную при желании, затем перезапустите DSH.

## Состав архива

```
dsh-mambo-pet/
  package.json          манифест бандла (name, dsh.bundle.patch)
  cordis.patch.yml      слой загрузчика: вставляет host-плагин и конфиг
  index.js              host-часть: копирует питомца в $DSH_HOME/pets
  pets/mambo/           pet.json, frames/ (421 WebP, все треки ≤64), previews/idle.gif
  locale/en.json        название/описание для страницы Plugins
  locale/ru.json
  icon.svg              иконка плагина
  README.md             краткое описание (English)
  INSTALL.md            этот файл
  LICENSE               MIT
  test/                 необязательные тесты для проверки (node)
```

## Приватность и права

- Сеть не используется, телеметрии нет, файлы за пределами
  `$DSH_HOME/pets/mambo` не изменяются.
- Арт: TracenAcademy v4.0 (Desktop Gremlin), персонаж Mambo — Kritzkingvoid;
  см. `author`/`license`/`homepage` в `pets/mambo/pet.json`.

## Лицензия

MIT — см. `LICENSE`.
