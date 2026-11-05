// Точечные исправления официального русского перевода DSH — Client half.
//
// Официальный ru уже встроен в ядро (dsh-client-ui-conversation,
// dsh-client-ui-chat и др., все 8 языков регистрируются одним вызовом
// locale.register(ns, { zh, en, ja, es, fr, de, ru, pt })). Повторный
// register для занятой пары (ns, ru) кидает исключение, поэтому полные
// словари здесь больше не регистрируем и язык через addLanguage не добавляем:
// обе операции теперь — дело ядра. Вместо этого правим зарегистрированные
// словари по месту: locale.dicts.get(ns).get('ru') — живой объект, lookup
// читает его при каждом translate, так что Object.assign виден новым строкам.
//
// Стиль держим как у официалов и английского оригинала: заголовки действий
// отвечают на вопрос «Что сделать? / Что?» (инфинитив или существительное:
// «Создать цель», «Читать», «Поиск»), а не «Что делаю?» («Создаю», «Читаю»).
// Состояния завершения — активное прошедшее время от лица агента
// («Записал файлы»), а не дубль прогресса («Чтение файлов»).
window.__ModuleLoader__.load({
  id: '@local/dsh-locale-ru',
  factory() {
    // ns -> { key: исправленное значение }. Только явные ляпы машинного
    // перевода; всё остальное официальное оставляем как есть.
    const OVERRIDES = {
      conversation: {
        // Имена собственные инструментов — латиницей, как в en.
        'tool.title.bash': 'Bash',
        'tool.title.pwsh': 'Pwsh',
        'tool.title.grep': 'Grep',
        'tool.title.glob': 'Glob',
        // Смысловые ошибки.
        'tool.title.queryRuntime': 'Запросить рантайм',
        'tool.title.inspectProviders': 'Проверить провайдеров',
        'tool.title.interruptAgent': 'Прервать агента',
        'tool.title.signalTerminal': 'Послать сигнал терминалу',
        'tool.title.lsp': 'Запросить символы кода',
        'tool.title.hoverSymbol': 'Проверить символ',
        // Единообразие: везде инфинитив, как у соседних ключей.
        'tool.title.inspectPlugins': 'Проверить плагины',
        'tool.title.runCordis': 'Запустить плагин Cordis',
        'tool.title.findReferences': 'Найти ссылки',
        // Падеж/число: «субагент» требует винительного падежа.
        'tool.title.subagent': 'Создать субагента',
        // Единый термин «командная задача» (в официалах мелькает
        // «командное задание» и «групповая задача»).
        'tool.title.getTeamTask': 'Прочитать командную задачу',
        'tool.title.updateTeamTask': 'Обновить командную задачу',
        // Термин отрядов — «участник», а не «товарищ».
        'tool.title.spawnTeammate': 'Создать участника команды',
        // Различение двух разных «Search» и неполного «Получить».
        'tool.title.webSearch': 'Поиск в вебе',
        'tool.title.webFetch': 'Получить страницу',
        // Единый термин «задача» (в официалах мелькает «задание»).
        'tool.title.readJob': 'Прочитать вывод задачи',
        'tool.title.killJob': 'Отменить фоновую задачу',
        'tool.title.listJobs': 'Список фоновых задач',
        // Единообразие List-* → «Список …».
        'tool.title.listTeamTasks': 'Список командных задач',
        // Вежливое повеление вместо инфинитива, как у соседних ключей.
        'tool.title.waitAgent': 'Ждать субагента',
        // Единый термин «провайдер» (в официалах — «поставщик»,
        // а providers.count — вовсе «проверяет поставщиков»).
        'detail.field.provider': 'Провайдер',
        'detail.providers.count': '{count} inspect-провайдеров',
        // Единый термин «задача» (в официалах — «задание»).
        'detail.jobs.count': '{count} фоновые задачи',
        // «dsh web» — режим запуска, а не веб-сайт.
        'error.sessionInUse': 'Этот сеанс уже используется, возможно, другим работающим экземпляром DSH (например, dsh web или десктопным приложением). Закройте другие работающие экземпляры DSH и повторите попытку.',
        // Ключей нет даже в en (есть только в ja) — без правки виден сырой ключ.
        'hint.plan': 'опишите задачу, чтобы создать план',
        'placeholder.plan': 'опишите задачу, чтобы создать план',
        // Единый термин «задача» для списка дел (en To-dos; в официалах — «Дела»).
        'todo.title': 'Задачи',
      },
      cordis: {
        // «Беги» — про ноги, а не про запуск плагина.
        'action.run': 'Запустить',
        'action.stop': 'Остановить',
      },
      goal: {
        // «Четкая» — прилагательное вместо глагола «очистить».
        'action.clear': 'Очистить цель',
      },
      plan: {
        // «Планировка» — про квартиры, а не про план агента.
        'preview.open': 'Открыть план в боковой панели',
        'preview.openNamed': 'Открыть план: {title}',
      },
      trajectory: {
        // Был перевёрнут порядок слов («траектория поиска»).
        'toolbar.search': 'Поиск по траектории',
        'details.provider': 'Провайдер',
      },
      forgePanel: {
        // Фамильярное «ты» вместо инфинитива.
        'changes.local.prompt': 'Создать запрос на изменение для изменений этого сеанса',
      },
      deliverables: {
        'review.split': 'Переключиться на разделённый вид',
      },
      shortcuts: {
        'global-hint': 'Открыть откуда угодно',
      },
      'settings.permission': {
        // Проверяет та же модель (same-model review), а не «проверка модели».
        'auto.description': 'Работа без песочницы после экспериментальной проверки каждого вызова встроенного инструмента и вложенного вызова PTC той же моделью.',
      },
      model: {
        'error.sessionInUse': 'Этот сеанс уже используется, возможно, другим работающим экземпляром DSH (например, dsh web или десктопным приложением). Закройте другие работающие экземпляры DSH и повторите попытку.',
        // «Аргументация» вместо уровня рассуждений (+ лишнее «версия»).
        'trigger.ariaEffort': 'Выберите модель, текущая {model}, уровень рассуждений {effort}',
      },
      job: {
        'list.aria': 'Фоновые задачи',
      },
      workspace: {
        'archive.confirm.jobs.one': '{n} фоновая задача: {names}',
        'archive.confirm.jobs.other': '{n} фоновые задачи: {names}',
        // Инфинитив, как у соседних пунктов меню («Создать ответвление…»).
        'menu.archiveSession': 'Архивировать сеанс',
        'actions.archive': 'Архивировать',
      },
      'schedule.catalog': {
        // Первая фраза выбивалась («заданий» при «задачи» дальше).
        'list.empty': 'Задач пока нет. Здесь отображаются задачи, созданные в ваших сеансах.',
      },
      chat: {
        // Заголовок состояния агента, а не приказ пользователю.
        'message.think': 'Думаю',
        // Единый термин «провайдер».
        'message.turnUsage.model': 'Провайдер / модель',
        // Отглагольное существительное вместо причастия «кто?».
        'message.stepProcess.subagents': 'Координация субагентов',
        // Завершение — активное прошедшее время от лица агента («Что сделал?»):
        // «Записал файлы», а не дубль прогресса («Чтение файлов») и не кривые
        // причастия («Искомый код», «Задаваемые вопросы»).
        'message.stepProcess.done.thinking': 'Завершил анализ',
        'message.stepProcess.done.read': 'Прочитал файлы',
        'message.stepProcess.done.readImage': 'Прочитал изображения',
        'message.stepProcess.done.write': 'Записал файлы',
        'message.stepProcess.done.search': 'Выполнил поиск кода',
        'message.stepProcess.done.edit': 'Отредактировал файлы',
        'message.stepProcess.done.commands': 'Выполнил команды',
        'message.stepProcess.done.code': 'Выполнил код',
        'message.stepProcess.done.webSearch': 'Выполнил поиск в интернете',
        'message.stepProcess.done.webFetch': 'Посетил веб-страницы',
        'message.stepProcess.done.subagents': 'Скоординировал субагентов',
        'message.stepProcess.done.plan': 'Обновил план',
        'message.stepProcess.done.questions': 'Задал вопросы',
        'message.stepProcess.done.tools': 'Вызвал инструменты',
      },
    };

    // Оригиналы для отката при выгрузке бандла. Ключ — ns + '\0' + key.
    const saved = new Map();

    function applyOverrides(locale) {
      const dicts = locale.dicts;
      if (!dicts || typeof dicts.get !== 'function') {
        console.warn('[dsh-locale-ru] locale.dicts недоступен — правки не применены');
        return { applied: 0, skipped: 0 };
      }
      let applied = 0;
      let skipped = 0;
      for (const ns of Object.keys(OVERRIDES)) {
        const locales = dicts.get(ns);
        const ru = locales && typeof locales.get === 'function' ? locales.get('ru') : undefined;
        if (!ru || typeof ru !== 'object') {
          skipped += Object.keys(OVERRIDES[ns]).length;
          continue;
        }
        for (const [key, value] of Object.entries(OVERRIDES[ns])) {
          const saveKey = `${ns}\u0000${key}`;
          if (!saved.has(saveKey)) saved.set(saveKey, ru[key]);
          if (ru[key] !== value) ru[key] = value;
          applied += 1;
        }
      }
      return { applied, skipped };
    }

    function restoreOriginals(locale) {
      const dicts = locale.dicts;
      if (!dicts || typeof dicts.get !== 'function') return;
      for (const [saveKey, original] of saved) {
        const sep = saveKey.indexOf('\u0000');
        const ns = saveKey.slice(0, sep);
        const key = saveKey.slice(sep + 1);
        const ru = dicts.get(ns)?.get('ru');
        if (!ru || typeof ru !== 'object') continue;
        if (original === undefined) delete ru[key];
        else ru[key] = original;
      }
      saved.clear();
    }

    return {
      inject: ['locale'],
      apply(ctx) {
        ctx.effect(() => {
          const locale = ctx.locale;
          let inApply = false;
          const apply = () => {
            if (inApply) return;
            inApply = true;
            try {
              applyOverrides(locale);
            } finally {
              inApply = false;
            }
          };
          // Первичная правка после монтирования ядра (наш бандл идёт
          // последним слоем профиля, так что словари ядра уже на месте).
          apply();
          // Переприменение при будущих перерегистрациях ядра (HMR):
          // register/publish ядра бампают ревизию и будят подписчиков.
          let unsub = () => {};
          try {
            unsub = locale.subscribe(apply);
          } catch {
            // Подписка недоступна — правки всё равно видны новым строкам.
          }
          // Один ререндер, чтобы уже видимые строки перечитали словари.
          try {
            const snap = typeof locale.getSnapshot === 'function'
              ? locale.getSnapshot()
              : locale.getLocale();
            if (typeof locale.publish === 'function' && snap) locale.publish(snap.active, false);
          } catch {
            // publish нет в контракте сервиса — обновление придёт само.
          }
          return () => {
            try { unsub(); } catch { /* ignore */ }
            try { restoreOriginals(locale); } catch { /* ignore */ }
          };
        }, 'dsh-locale-ru: overrides');
      },
    };
  },
});
