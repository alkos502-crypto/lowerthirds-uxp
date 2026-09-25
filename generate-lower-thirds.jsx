// ============================================================
// Lower Thirds Generator — ExtendScript (.jsx) для Premiere Pro
// Работает на checked API: вставка MOGRT + замена текста
// (textEditValue + fontTextRunLength) — то, что UXP не умеет.
//
// ЗАПУСК: File -> Scripts -> Run Script File... -> выбрать файл,
//   либо положить в папку Scripts так, чтобы появился в
//   File -> Scripts.
//
// НАСТРОЙКА: поправьте константы в блоке "НАСТРОЙКИ" ниже.
// ============================================================

// ---------- НАСТРОЙКИ (приведите под себя) ----------------
// Путь к шаблону .mogrt (создан в After Effects)
var MOGRT_PATH = "/Volumes/MEDIASTORE/lowerthirds-uxp/assets/MC TITLE Russia1 ISPRAVLEN.mogrt";

// Путь к CSV-файлу с данными. Первая строка — заголовки.
var CSV_PATH = "/Volumes/MEDIASTORE/data.csv";

// Номера колонок (0 = первая) для: имя, должность (или иные поля)
var COL_NAME = 0;    // колонка с именем
var COL_ROLE = 1;    // колонка с должностью

// Имена текстовых параметров в MOGRT (как в Essential Graphics)
var PARAM_NAME = "Имя Фамилия";   // displayName параметра имени
var PARAM_ROLE = "Должность";     // displayName параметра должности

// Вставка
var VIDEO_TRACK_INDEX = 0;   // 0 = V1, 1 = V2, 2 = V3 ...
var START_SECONDS = 0;       // начало первой трети (сек от начала секвенции)
var DURATION_SECONDS = 6;    // длительность каждой трети
var GAP_SECONDS = 0;         // пауза между третями
// -----------------------------------------------------------

var TICKS_PER_SEC = 254016000000; // константа времени Premiere

// ---------- CSV парсер (учитывает кавычки) ----------------
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  var lines = text.split("\n");
  var first = "";
  for (var i = 0; i < lines.length; i++) { if (lines[i].trim().length) { first = lines[i]; break; } }
  if (!first) return [];
  var sep = ";";
  if (first.indexOf("\t") !== -1) sep = "\t";
  else if (first.indexOf(";") === -1 && first.indexOf(",") !== -1) sep = ",";

  function parseLine(line) {
    var out = [], cur = "", quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = !quoted;
      } else if (ch === sep && !quoted) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  var rows = [];
  for (var k = 0; k < lines.length; k++) {
    var l = lines[k];
    if (!l.trim()) continue;
    if (k === 0) continue; // заголовки пропускаем
    rows.push(parseLine(l));
  }
  return rows;
}

// ---------- Чтение файла --------------------------------
function readFile(path) {
  var f = new File(path);
  if (!f.exists) throw new Error("Файл не найден: " + path);
  f.open("r");
  var txt = f.read();
  f.close();
  return txt;
}

// ---------- Установка текстового параметра MOGRT ---------
// Меняем текст: JSON с textEditValue + длиной строки.
function setMOGRTText(mgtComp, paramDisplayName, newText) {
  if (!mgtComp || !mgtComp.properties) return false;
  var param = null;
  try { param = mgtComp.properties.getParamForDisplayName(paramDisplayName); } catch (e) {}
  if (!param) return false;
  try {
    var raw = param.getValue();
    var obj = (typeof raw === "string") ? JSON.parse(raw) : raw;
    if (!obj || typeof obj !== "object") return false;
    obj.textEditValue = String(newText);
    obj.fontTextRunLength = [String(newText).length];
    param.setValue(JSON.stringify(obj), true);
    return true;
  } catch (e) {
    $.writeln("Не удалось установить параметр '" + paramDisplayName + "': " + e.message);
    return false;
  }
}

// ---------- Главная функция ------------------------------
function main() {
  var seq = app.project.activeSequence;
  if (!seq) { alert("Нет активной секвенции. Откройте нужную секвенцию и запустите скрипт снова."); return; }

  var rows = parseCSV(readFile(CSV_PATH));
  if (!rows.length) { alert("CSV пуст или не найдены данные."); return; }

  // Дорожка
  var trackIdx = VIDEO_TRACK_INDEX;
  while (seq.videoTracks.numTracks < trackIdx + 1) { seq.addVideoTrack(); }
  var track = seq.videoTracks[trackIdx];

  var cursorTicks = Math.round(START_SECONDS * TICKS_PER_SEC);
  var durTicks = Math.round(DURATION_SECONDS * TICKS_PER_SEC);
  var gapTicks = Math.round(GAP_SECONDS * TICKS_PER_SEC);

  var created = 0;
  var failures = 0;

  for (var r = 0; r < rows.length; r++) {
    var name = (rows[r][COL_NAME] !== undefined ? rows[r][COL_NAME] : "");
    var role = (rows[r][COL_ROLE] !== undefined ? rows[r][COL_ROLE] : "");

    // 1. вставляем MOGRT в нужную позицию
    var item;
    try {
      item = seq.importMGT(MOGRT_PATH, cursorTicks, trackIdx, 0);
    } catch (e) {
      $.writeln("Строка " + (r + 1) + ": не удалось вставить MOGRT: " + e.message);
      failures++; continue;
    }
    if (!item) { failures++; continue; }

    // 3. меняем текст
    var mgtComp = null;
    try { mgtComp = item.getMGTComponent(); } catch (e) {}
    var ok1 = setMOGRTText(mgtComp, PARAM_NAME, name);
    var ok2 = setMOGRTText(mgtComp, PARAM_ROLE, role);

    if (ok1 || ok2) created++; else failures++;

    cursorTicks += durTicks + gapTicks;
  }

  alert("Готово.\nСоздано нижних третей: " + created + "\nОшибок: " + failures);
}

// Обработчик ошибок верхнего уровня
try {
  main();
} catch (e) {
  alert("Ошибка скрипта: " + e.message);
}