# Lower Thirds Studio — UXP-версия (Premiere Pro 26)

Отдельный UXP-вариант плагина нижних третей. Код копирует проверенный механизм
из `lowerthirds-uxp` (вставка MOGRT через `insertMogrtFromPath` + смена текста
через `ppro.MogrtText`), но под нашу фиксированную спецификацию.

## Параметры (заданы в `index.js`)
- **Трек:** V3 (Video 3), константа `VIDEO_TRACK_INDEX = 2`.
- **Длительность титра:** 7 сек (`DURATION_SECONDS`).
- **Шаблон:** по умолчанию `DEFAULT_MOGRT_PATH` (путь из старого плагина),
  меняется кнопкой «Выбрать».
- **Авто-маппинг:** колонка «ФИО»/«Имя Фамилия»/«Имя»/«Фамилия» → параметр
  «Имя Фамилия»; колонка «Должность» → параметр «Должность». Без ручного маппинга.
- Формат данных: `.xlsx`, `.csv`, `.tsv` (первый лист/блок), первая строка — заголовки.

## Структура
```
LowerThirdsUxp/
├── manifest.json        # UXP-манифест (id com.mytool.lowerthirds.uxp)
├── index.html           # панель
├── style.css
├── index.js             # логика + UXP Premiere API
└── xlsx.full.min.js     # SheetJS для парсинга таблиц
```

## Установка (разработка, через UXP Developer Tool)
1. В Premiere Pro 26 включите **Developer Mode** (Preferences → Plug-ins → Developer Mode).
2. Запустите **UXP Developer Tool** (из Creative Cloud).
3. **Add Plugin** → выберите `manifest.json` из этой папки → **Load** (или Load & Watch).
4. В Premiere Pro: **Window → Extensions → Lower Thirds Studio**.

### Как готовый плагин (без UDT)
Соберите `.ccx` через UXP Developer Tool → **Build**, либо положите папку в:
- macOS: `~/Library/Application Support/Adobe/UXP/Plugins`
- Windows: `<user>\AppData\Local\Adobe\UXP\Plugins`
и включите Developer Mode. Для распространения через Creative Cloud Marketplace требуется подпись.

## Использование
1. «Обзор…» в блоке **ДАННЫЕ ТИТРОВ** → выбрать таблицу (xlsx/csv/tsv).
2. (по желанию) «Выбрать» в блоке **MOGRT-ШАБЛОН** → другой шаблон (по умолчанию —
   путь из конфига старого плагина).
3. **СОЗДАТЬ НИЖНИЕ ТРЕТИ** — титры кладутся встык по 7 сек на V3, текст подставляется.

## Требования к MOGRT
Шаблон должен быть создан в **Adobe After Effects** с выведенными редактируемыми
текстовыми параметрами. Параметры должны называться **«Имя Фамилия»** и **«Должность»**.

## Отличие от CEP-версии
- CEP (`LowerThirds/`) работает через ExtendScript/CSXS и грузится из
  `CEP/extensions`. UXP (`LowerThirdsUxp/`) — нативная панель Premiere 2025/2026
  через UXP Developer Tool.
- Функционально одинаковы: CSV → V3 → 7 сек → авто-маппинг → выбор шаблона.

## Отладка
- Console UXP Developer Tool показывает `console.*`.
- Developer Mode обязателен для подключения через UDT.