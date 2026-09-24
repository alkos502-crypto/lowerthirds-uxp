// Lower Thirds Studio — UXP panel for Premiere Pro 26
const ppro = require("premierepro");
const { entrypoints } = require("uxp");
const { localFileSystem } = require("uxp").storage;
const XLSX = require("./xlsx.full.min.js");

const NAME_HINT = ["Name", "Name Second line", "Титтр"]; // common param names hint

let mogrtPath = null;    // absolute path to selected .mogrt
let mogrtParams = [];    // discovered text params from template
let tableHeaders = [];   // column names from spreadsheet
let tableRows = [];      // row objects from spreadsheet

function $(id) { return document.getElementById(id); }
function setStatus(text, kind) { const s = $("status"); s.textContent = text; s.className = "status " + (kind || ""); }
function setProgress(p) { $("progress").style.width = Math.max(0, Math.min(100, p)) + "%"; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// ── MOGRT selection & inspection ───────────────────────────────────────

async function chooseMogrt() {
  try {
    const f = await localFileSystem.getFileForOpening({ types: ["mogrt"], allowMultiple: false });
    if (!f) return;
    mogrtPath = f.nativePath;
    $("mogrtName").textContent = f.name;
    setStatus("Template selected. Click Inspect Parameters.", "info");
    refreshGenerate();
  } catch (e) { setStatus(e.message || String(e), "err"); }
}

async function inspectMogrt() {
  if (!mogrtPath) { setStatus("Select a .mogrt template first.", "err"); return; }
  setStatus("Inspecting template...", "info");
  try {
    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error("No open project. Open a project first.");
    const sequence = await project.getActiveSequence();
    if (!sequence) throw new Error("No active sequence. Open the target sequence.");

    const editor = ppro.SequenceEditor.getEditor(sequence);
    // Insert a probe on track V1 at time 0, read text params, then remove it.
    const probeTime = ppro.TickTime.createWithSeconds(0);
    let items = [];
    project.lockedAccess(() => {
      // Use valid, guaranteed-existing track indices (V1=0, A1=0).
      items = editor.insertMogrtFromPath(mogrtPath, probeTime, 0, 0);
    });
    if (!items || !items.length) throw new Error("Insert failed: could not place probe clip.");
    const item = items[0];

    const params = [];
    const chain = await item.getComponentChain();
    const comps = chain.getComponentCount();
    for (let i = 0; i < comps; i++) {
      const comp = chain.getComponentAtIndex(i);
      let match = "";
      try { match = await comp.getMatchName(); } catch (e) { match = ""; }
      const isText = /ADBE Text/i.test(match) || /Text/i.test(match);
      const pcount = comp.getParamCount();
      for (let p = 0; p < pcount; p++) {
        const param = comp.getParam(p);
        const dn = String(param.displayName || "").trim();
        if (!dn) continue;
        params.push({ displayName: dn, isText });
      }
    }

    // Remove probe clip. Wrapped entirely so failures don't break inspection.
    try {
      const sel = ppro.TrackItemSelection.createEmptySelection((s) => { s.addItem(item, false); });
      if (sel) {
        project.lockedAccess(() => {
          const action = editor.createRemoveItemsAction(sel, true, ppro.Constants.MediaType.VIDEO);
          project.executeTransaction((ca) => ca.addAction(action), "Remove LT probe");
        });
      }
    } catch (e) {
      console.error("Could not remove probe clip:", e);
    }

    mogrtParams = params;
    renderParams();
    if (tableHeaders.length) buildMapping();
    setStatus("Found " + params.length + " MOGRT parameters.", "ok");
  } catch (e) {
    setStatus(e.message || String(e), "err");
  }
}

function renderParams() {
  const el = $("paramList");
  if (!mogrtParams.length) { el.innerHTML = '<div class="param-item">No params found (not an AE-based MOGRT?)</div>'; }
  else {
    el.innerHTML = mogrtParams.map(p =>
      '<div class="param-item' + (p.isText ? ' text' : '') + '">' + esc(p.displayName) +
      (p.isText ? '<span class="t">TEXT</span>' : '') + '</div>'
    ).join("");
  }
  el.classList.add("show");
}

// ── Spreadsheet loading ────────────────────────────────────────────────

async function chooseCsv() {
  try {
    const f = await localFileSystem.getFileForOpening({ types: ["xlsx", "xls", "csv", "tsv", "txt"], allowMultiple: false });
    if (!f) return;
    setStatus("Reading spreadsheet...", "info");
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
    if (!sheet) throw new Error("Spreadsheet has no sheets.");
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (!json.length) throw new Error("Spreadsheet is empty.");
    tableRows = json;
    tableHeaders = Object.keys(json[0]);
    $("csvName").textContent = f.name;
    renderTable();
    buildMapping();
    refreshGenerate();
    setStatus("Loaded " + json.length + " rows.", "ok");
  } catch (e) {
    setStatus(e.message || String(e), "err");
  }
}

function renderTable() {
  const shown = tableRows.slice(0, 4);
  const head = tableHeaders;
  $("preview").innerHTML =
    '<table class="pt"><thead><tr>' + head.map(h => '<th>' + esc(h) + '</th>').join("") + '</tr></thead><tbody>' +
    shown.map(r => '<tr>' + head.map(h => '<td>' + esc(r[h]) + '</td>').join("") + '</tr>').join("") +
    '</tbody></table>';
  $("rowCount").textContent = tableRows.length + " rows";
}

function buildMapping() {
  const el = $("mapping");
  el.innerHTML = "";
  const names = tableHeaders.slice(0, 8);
  const hasParams = mogrtParams.length > 0;

  if (!hasParams) {
    el.innerHTML = '<div class="hint">Run "Inspect Parameters" first to see MOGRT text params.</div>';
  }

  names.forEach(col => {
    const row = document.createElement("div");
    row.className = "map-row";
    row.innerHTML = '<span class="col"></span>';
    row.querySelector(".col").textContent = col;

    let input;
    if (hasParams) {
      const sel = document.createElement("select");
      // empty -> not mapped
      const emptyOpt = document.createElement("option");
      emptyOpt.value = ""; emptyOpt.textContent = "(skip)";
      sel.appendChild(emptyOpt);
      // parameters (text ones first)
      const sorted = mogrtParams.slice().sort((a, b) => (b.isText ? 1 : 0) - (a.isText ? 1 : 0));
      sorted.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.displayName;
        opt.textContent = (p.isText ? "[TEXT] " : "") + p.displayName;
        // smart default: match by name fold
        const norm = s => s.toLowerCase().replace(/[\s_]+/g, "").trim();
        if (p.isText && norm(col) === norm(p.displayName)) opt.selected = true;
        sel.appendChild(opt);
      });
      input = sel;
    } else {
      input = document.createElement("input");
      input.type = "text";
      input.dataset.col = col;
    }

    input.dataset.col = col;
    row.appendChild(input);
    el.appendChild(row);
  });

  refreshGenerate();
}

function refreshGenerate() {
  const ready = mogrtPath && tableRows.length > 0;
  $("btnGenerate").disabled = !ready;
  $("btnClear").disabled = tableRows.length === 0;
}

// ── Generation ─────────────────────────────────────────────────────────

function getMapping() {
  const map = {}; // column -> param display name
  document.querySelectorAll("#mapping .map-row select, #mapping .map-row input").forEach(el => {
    const col = el.dataset.col, val = String(el.value || "").trim();
    if (col && val) map[col] = val;
  });
  return map;
}

async function setTextParams(item, row, mapping) {
  const chain = await item.getComponentChain();
  const comps = chain.getComponentCount();
  const actions = [];
  const foundInComp = []; // for debugging
  for (let i = 0; i < comps; i++) {
    const comp = chain.getComponentAtIndex(i);
    const pcount = comp.getParamCount();
    for (let p = 0; p < pcount; p++) {
      const param = comp.getParam(p);
      const dn = String(param.displayName || "").trim();
      if (!dn) continue;
      foundInComp.push(dn);
      for (const col in mapping) {
        if (mapping[col] === dn) {
          const val = String(row[col] != null ? row[col] : "");
          try {
            // For AE-based MOGRT text params the value must be a MogrtText object.
            const mt = new ppro.MogrtText();
            mt.setText(val);
            actions.push(param.createSetValueAction(param.createKeyframe(mt), true));
          } catch (e) { console.error("param set failed: " + dn, e); }
        }
      }
    }
  }
  if (!actions.length) {
    console.error("No mapped text params matched. Component params: " + JSON.stringify(foundInComp) + ". Mapping: " + JSON.stringify(mapping));
  }
  return actions;
}

async function generate() {
  if (!mogrtPath) throw new Error("Select a MOGRT template.");
  if (!tableRows.length) throw new Error("Load a spreadsheet first.");
  const mapping = getMapping();
  if (!Object.keys(mapping).length) {
    const hint = mogrtParams.length
      ? "Выберите параметр для колонки в разделе COLUMN MAPPING. Available: " + mogrtParams.map(p => p.displayName).join(", ")
      : "Inspect Parameters сначала не нашёл текстовых параметров — добавьте имена вручную в COLUMN MAPPING.";
    throw new Error(hint);
  }

  const project = await ppro.Project.getActiveProject();
  if (!project) throw new Error("No open project.");
  const sequence = await project.getActiveSequence();
  if (!sequence) throw new Error("No active sequence.");
  const editor = ppro.SequenceEditor.getEditor(sequence);

  const trackIndex = Number($("track").value) || 2;
  const duration = Number($("duration").value) || 6;
  const startOffset = Number($("start").value) || 0;
  if (!(duration > 0)) throw new Error("Duration must be > 0.");
  const useMarkers = $("markers").checked;

  // Determine start seconds for each row
  let starts;
  if (useMarkers) {
    const markers = await ppro.Markers.getMarkers(sequence);
    const list = markers.getMarkers([]).sort((a, b) => a.getStart().seconds - b.getStart().seconds);
    if (list.length < tableRows.length) throw new Error("Need " + tableRows.length + " markers, got " + list.length + ".");
    starts = list.slice(0, tableRows.length).map(m => m.getStart().seconds);
  } else {
    starts = tableRows.map((_, i) => startOffset + i * duration);
  }

  // Place each MOGRT and set its text in-place (item reference kept, no re-search).
  setProgress(0);
  $("btnGenerate").disabled = true;
  let done = 0;
  try {
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i];
      const start = ppro.TickTime.createWithSeconds(starts[i]);
      const end = ppro.TickTime.createWithSeconds(starts[i] + duration);
      setStatus("Placing " + (i + 1) + " / " + tableRows.length);
      await new Promise(res => setTimeout(res, 30)); // yield to host

      let item;
      let placed = false;
      project.lockedAccess(() => {
        const items = editor.insertMogrtFromPath(mogrtPath, start, trackIndex, 0);
        if (items && items.length) { item = items[0]; placed = true; }
      });
      if (!placed) throw new Error("Insert failed at row " + (i + 1) + ".");

      // Read text params (async — must be outside lockedAccess), then apply
      // duration/name/text in one undoable transaction.
      const actions = await setTextParams(item, row, mapping);

      project.lockedAccess(() => {
        project.executeTransaction((ca) => {
          try { ca.addAction(item.createSetEndAction(end)); } catch (e) { }
          const nm = Object.keys(mapping).map(c => row[c]).filter(Boolean).join(" - ");
          if (nm) { try { ca.addAction(item.createSetNameAction(nm)); } catch (e) { } }
          actions.forEach(a => { try { ca.addAction(a); } catch (e) { } });
        }, "LT row " + (i + 1));
      });

      done++;
      setProgress((done / tableRows.length) * 100);
      await new Promise(res => setTimeout(res, 30));
    }

    setStatus("Done: placed " + done + " lower thirds.", "ok");
  } finally {
    $("btnGenerate").disabled = false;
  }
}

// ── Init ───────────────────────────────────────────────────────────────

(function initTracks() {
  const sel = $("track");
  for (let v = 1; v <= 16; v++) {
    const o = document.createElement("option");
    o.value = v - 1; // 0-based video index in API (0 = V1)
    o.textContent = "V" + v;
    if (v === 3) o.selected = true;
    sel.appendChild(o);
  }
})();

$("btnMogrt").addEventListener("click", chooseMogrt);
$("btnInspect").addEventListener("click", inspectMogrt);
$("btnCsv").addEventListener("click", chooseCsv);
$("btnClear").addEventListener("click", () => {
  tableRows = []; tableHeaders = []; mogrtParams = [];
  $("csvName").textContent = "No spreadsheet selected";
  $("preview").innerHTML = ""; $("rowCount").textContent = "";
  $("mogrtName").textContent = "No template selected";
  $("paramList").classList.remove("show");
  $("mapping").innerHTML = "";
  setProgress(0); setStatus("Ready"); refreshGenerate();
});
$("btnGenerate").addEventListener("click", async () => {
  try { await generate(); }
  catch (e) { console.error(e); setStatus(e.message || String(e), "err"); $("btnGenerate").disabled = false; }
});
["csvName"].forEach(() => {}); // no-op hook for potential future reuse

setStatus("Ready. Select a template, load a spreadsheet, map columns.", "info");

entrypoints.setup({
  panels: {
    lowerThirdsPanel: { show() {} }
  }
});