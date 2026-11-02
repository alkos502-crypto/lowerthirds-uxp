// Lower Thirds Studio — UXP panel for Premiere Pro 26
// Нижние трети из CSV в MOGRT: фикс. трек V3, длительность 7 сек,
// авто-маппинг (ФИО/Имя Фамилия -> «Имя Фамилия», Должность -> «Должность»),
// выбор MOGRT-шаблона с дефолтом.
const ppro = require("premierepro");
const { entrypoints } = require("uxp");
const { localFileSystem } = require("uxp").storage;
const XLSX = require("./xlsx.full.min.js");

// Шаблон по умолчанию (как в CEP-версии). Меняется кнопкой «Выбрать».
const DEFAULT_MOGRT_PATH = "/Volumes/MEDIASTORE/МОНТАЖ 2026/ОФОРМЛЕНИЕ/MC TITLE Russia1 mac.mogrt";
const NAME_PARAM = "Имя Фамилия";   // параметр в MOGRT для имени
const ROLE_PARAM = "Должность";     // параметр в MOGRT для должности
const VIDEO_TRACK_INDEX = 2;        // V3 (0-based: 0=V1, 1=V2, 2=V3)
const DURATION_SECONDS = 7;

let mogrtPath = DEFAULT_MOGRT_PATH; // абсолютный путь к выбранному .mogrt
let tableHeaders = [];
let tableRows = [];

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function setStatus(text, kind) { const s = $("status"); s.textContent = text; s.className = "status " + (kind || ""); }
function setProgress(p) { $("progress").style.width = Math.max(0, Math.min(100, p)) + "%"; }

function pathBase(p) { const a = String(p || "").split("/"); return a[a.length - 1] || p; }

// Поиск колонки по одному из допустимых названий
function colIndexByNames(names) {
  const low = tableHeaders.map(h => String(h || "").trim().toLowerCase());
  for (let a = 0; a < low.length; a++) for (let b = 0; b < names.length; b++) if (low[a] === names[b]) return a;
  for (let c = 0; c < low.length; c++) for (let d = 0; d < names.length; d++) if (low[c].indexOf(names[d]) !== -1) return c;
  return -1;
}

// ── Выбор MOGRT ────────────────────────────────────────────────
async function chooseMogrt() {
  try {
    const f = await localFileSystem.getFileForOpening({ types: ["mogrt"], allowMultiple: false });
    if (!f) return;
    mogrtPath = f.nativePath;
    $("mogrtName").textContent = pathBase(f.name) || f.name;
    setStatus("Шаблон выбран.", "ok");
  } catch (e) { setStatus(e.message || String(e), "err"); }
}

// ── Загрузка данных ────────────────────────────────────────────
async function chooseCsv() {
  try {
    const f = await localFileSystem.getFileForOpening({ types: ["xlsx", "xls", "csv", "tsv", "txt"], allowMultiple: false });
    if (!f) return;
    setStatus("Читаю файл…", "info");
    const name = (f.name || "").toLowerCase();
    let workbook;
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buf = await f.read({ format: "binary" });
      workbook = XLSX.read(buf, { type: "array" });
    } else {
      const text = await f.read();
      workbook = XLSX.read(text, { type: "string", raw: true });
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("В файле нет листов.");
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!json.length) throw new Error("Файл пуст.");
    tableRows = json;
    tableHeaders = Object.keys(json[0]);
    $("csvName").textContent = f.name;
    renderTable();
    refreshGenerate();
    setStatus("Загружено строк: " + json.length + ".", "ok");
  } catch (e) {
    setStatus(e.message || String(e), "err");
  }
}

function renderTable() {
  const shown = tableRows.slice(0, 4);
  $("preview").innerHTML =
    '<table class="pt"><thead><tr>' + tableHeaders.map(h => '<th>' + esc(h) + '</th>').join("") + '</tr></thead><tbody>' +
    shown.map(r => '<tr>' + tableHeaders.map(h => '<td>' + esc(r[h]) + '</td>').join("") + '</tr>').join("") +
    '</tbody></table>';
  $("rowCount").textContent = tableRows.length + " строк";
}

function refreshGenerate() {
  const ready = !!mogrtPath && tableRows.length > 0;
  $("btnGenerate").disabled = !ready;
  $("btnClear").disabled = tableRows.length === 0;
}

// ── Генерация ──────────────────────────────────────────────────
async function setTextParams(item, textValues) {
  // textValues: { paramDisplayName: "текст" }
  const chain = await item.getComponentChain();
  const comps = chain.getComponentCount();
  const actions = [];
  for (let i = 0; i < comps; i++) {
    const comp = chain.getComponentAtIndex(i);
    const pcount = comp.getParamCount();
    for (let p = 0; p < pcount; p++) {
      const param = comp.getParam(p);
      const dn = String(param.displayName || "").trim();
      if (!dn || textValues[dn] === undefined) continue;
      const val = String(textValues[dn]);
      if (val === "") continue;
      try {
        const mt = new ppro.MogrtText();
        mt.setText(val);
        actions.push(param.createSetValueAction(param.createKeyframe(mt), true));
      } catch (e) { console.error("Не удалось задать параметр " + dn, e); }
    }
  }
  return actions;
}

async function generate() {
  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("Нет открытого проекта.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("Нет активной последовательности.");
  const editor = ppro.SequenceEditor.getEditor(sequence);

  const iFio = colIndexByNames(["фио", "имя фамилия", "имя", "фамилия"]);
  const iDolj = colIndexByNames(["должность"]);
  const fioCol = iFio >= 0 ? tableHeaders[iFio] : null;
  const doljCol = iDolj >= 0 ? tableHeaders[iDolj] : null;

  const rows = tableRows.filter(r => Object.keys(r).some(k => String(r[k] || "").trim() !== ""));
  if (!rows.length) throw new Error("Нет заполненных строк.");
  const skipped = tableRows.length - rows.length;

  setProgress(0);
  $("btnGenerate").disabled = true;
  let done = 0, fails = 0;
  try {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const start = ppro.TickTime.createWithSeconds(i * DURATION_SECONDS);
      const end = ppro.TickTime.createWithSeconds(i * DURATION_SECONDS + DURATION_SECONDS);
      setStatus("Размещаю " + (i + 1) + " / " + rows.length);
      await new Promise(res => setTimeout(res, 30));

      const textValues = {};
      if (fioCol) textValues[NAME_PARAM] = String(row[fioCol] || "");
      if (doljCol) textValues[ROLE_PARAM] = String(row[doljCol] || "");

      let item = null, placed = false;
      project.lockedAccess(() => {
        const items = editor.insertMogrtFromPath(mogrtPath, start, VIDEO_TRACK_INDEX, 0);
        if (items && items.length) { item = items[0]; placed = true; }
      });
      if (!placed) { fails++; continue; }

      const actions = await setTextParams(item, textValues);
      project.lockedAccess(() => {
        project.executeTransaction((ca) => {
          try { ca.addAction(item.createSetEndAction(end)); } catch (e) {}
          const nm = Object.keys(textValues).map(k => textValues[k]).filter(Boolean).join(" - ");
          if (nm) { try { ca.addAction(item.createSetNameAction(nm)); } catch (e) {} }
          actions.forEach(a => { try { ca.addAction(a); } catch (e) {} });
        }, "LT row " + (i + 1));
      });

      done++;
      setProgress((done / rows.length) * 100);
      await new Promise(res => setTimeout(res, 30));
    }
    const skipMsg = skipped > 0 ? " (пропущено пустых: " + skipped + ")" : "";
    setStatus("Готово: создано " + done + " из " + rows.length + skipMsg, done === rows.length ? "ok" : "err");
  } finally {
    $("btnGenerate").disabled = false;
  }
}

// ── Init ───────────────────────────────────────────────────────
$("mogrtName").textContent = pathBase(DEFAULT_MOGRT_PATH) || "По умолчанию";

$("btnMogrt").addEventListener("click", chooseMogrt);
$("btnCsv").addEventListener("click", chooseCsv);
$("btnClear").addEventListener("click", () => {
  tableRows = []; tableHeaders = [];
  $("csvName").textContent = "Файл не выбран";
  $("preview").innerHTML = ""; $("rowCount").textContent = "";
  setProgress(0); setStatus("Готово"); refreshGenerate();
});
$("btnGenerate").addEventListener("click", async () => {
  try { await generate(); }
  catch (e) { console.error(e); setStatus(e.message || String(e), "err"); $("btnGenerate").disabled = false; }
});

setStatus("Выберите файл данных, при желании смените шаблон, затем создайте титры.", "info");

entrypoints.setup({
  panels: {
    lowerThirdsPanel: { show() {} }
  }
});