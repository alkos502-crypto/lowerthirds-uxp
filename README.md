# Lower Thirds Studio — UXP plugin for Adobe Premiere Pro 26

Создаёт нижние трети (lower thirds) на таймлайне из данных таблицы, используя ваш `.mogrt`-шаблон. UXP-версия (нативная для Premiere Pro 2025/2026).

## Чем отличается от CEP-версии

- Работает на **UXP** (`require("premierepro")`), а не через ExtendScript/CXS — штатный механизм Premiere Pro 2025+.
- Не требует включения Reactor/адаптеров — грузится напрямую UXP-рантаймом.
- Асинхронное API; правки таймлайна выполняются внутри `project.lockedAccess()`.

## Структура

```
lowerthirds-uxp/
├── manifest.json            # UXP-манифест (id, host, permissions, entrypoints)
├── index.html               # панель
├── style.css                # стили
├── index.js                 # логика панели + Premiere UXP API
├── js/
│   └── xlsx.full.min.js     # SheetJS — парсинг .xlsx/.csv
└── README.md
```

## Установка (разработка через UXP Developer Tool)

UXP-плагины Premiere штатно подключаются через **UXP Developer Tool**:

1. Откройте **Premiere Pro 26** и в **Preferences → Plug-ins Général → Developer Mode** включите **Developer Mode** (это даёт UDT доступ к панели).
2. Запустите **UXP Developer Tool** (входит в состав Creative Cloud / доступен для скачивания).
3. В UDT: **Add Plugin** → выберите `manifest.json` из этой папки.
4. Нажмите **Load** (или **Load & Watch** — автоперезагрузка при правке кода).
5. В Premiere Pro: меню **Window → Extensions → Lower Thirds Studio**.

### Установка «как готовый плагин» (без UDT)

Соберите/подпишите `.ccx` через UXP Developer Tool → **Build**, либо поместите папку в:
```
<user>/AppData/Local/Adobe/UXP/Plugins (Windows)
~/Library/Application Support/Adobe/UXP/Plugins (macOS)
```
и включите Developer Mode в Premiere. Распространение через Creative Cloud Marketplace требует UXP-подпись.

## Использование

1. **Browse (MOGRT)** → выберите `.mogrt` (шаблон, созданный в After Effects с текстовыми параметрами).
2. **Inspect Parameters** → плагин временно вставит шаблон, прочитает имена текстовых параметров и уберёт пробный клип. В списке появятся параметры (помеченные `TEXT`).
3. **Browse (DATA)** → выберите `.xlsx` / `.csv` / `.tsv`. Первый лист/блок станет данными.
4. **COLUMN MAPPING** → для каждой колонки укажите, в какой MOGRT-параметр она идёт (поле подсказывает доступные параметры).
5. **PLACEMENT** → видеодорожка, длительность, стартовый сдвиг, либо «использовать маркеры».
6. **GENERATE LOWER THIRDS**.

## Требования к MOGRT

- Только шаблоны, созданные в **Adobe After Effects**, с выведенными редактируемыми текстовыми параметрами.
- Встроенные в Premiere «Essential Graphics»-шаблоны (без AE) не имеют текстовых параметров — `Inspect` их не увидит.

## Известные особенности

- `insertMogrtFromPath` получает **абсолютный путь** файла. Для пути из `getFileForOpening` используется `f.nativePath`.
- Правки таймлайна выполняются в `project.lockedAccess()` + `project.executeTransaction()` (требование UXP Premiere). Асинхронное чтение компонентов (`getComponentChain`, `getMatchName`) — вне lock-блока.
- Удаление «пробного» клипа после Inspect — best-effort через `createRemoveItemsAction`; при сбое останется один клип-«заглушка» в конце таймлайна (можно удалить вручную).
- Пробный клип вставляется на видео-дорожку 20 (V21) в 1 ч от начала — обычно пустую.

## Права (manifest)

- `localFileSystem: "fullAccess"` — чтобы открывать `.mogrt` и таблицу без запросов прав на каждый файл. Можно сузить до `"request"`.

## Отладка

- Console UXP Developer Tool показывает `console.*`.
- Включённый Developer Mode обязателен для UDT-подключения.