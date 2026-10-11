import { requireAuth } from "../auth.js";
import { PHOTOS_ENABLED } from "../firebase-config.js";
import { renderShell } from "../layout.js";
import { listProjects, listVendors, getVendorRates, getMasters, listEntries, listPhotos } from "../data.js";
import {
  filterEntries, filterPhotos, itemRows, summaryRows, projectRows, photoRows, describeFilters, TOTAL_COLUMNS, GROUP_FIELDS,
} from "../report-engine.js";
import { downloadXlsx, downloadCsv, downloadPdf, downloadPhotosZip } from "../export.js";
import { $, $$, esc, options, toast, errorText, setBusy, emptyState, fmtNum, todayISO, qs, SLOTS } from "../ui.js";
import { STATUS_INFO } from "../metrics.js";

const PRESETS = {
  details: { label: "All item details", view: "details" },
  byType: { label: "By vendor type", view: "summary", groupBy: ["vendorType"] },
  byVendor: { label: "By vendor", view: "summary", groupBy: ["vendorType", "vendor"] },
  byDate: { label: "By date", view: "summary", groupBy: ["date", "vendorType", "vendor"] },
  bySlot: { label: "By time", view: "summary", groupBy: ["slot", "vendorType", "vendor"] },
  dateSlot: { label: "Each date & time", view: "summary", groupBy: ["date", "slot", "vendorType", "vendor"] },
  byProject: { label: "Project overview", view: "projects" },
  pending: { label: "Pending / short", view: "details", status: "open" },
  photos: { label: "Photos", view: "photos" },
};
if (!PHOTOS_ENABLED) delete PRESETS.photos; // PHOTOS DISABLED

const VIEW_TITLES = { details: "Item details", summary: "Summary", projects: "Project overview", photos: "Photo report" };

const state = { projects: [], vendors: [], rates: {}, masters: {}, cache: {}, rows: [], photos: [], title: "", filters: {} };

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "reports", title: "Reports" });

try {
  [state.projects, state.vendors, state.rates, state.masters] =
    await Promise.all([listProjects(), listVendors(), getVendorRates(), getMasters()]);
  setupForm();
  if (qs("project")) generate();
} catch (err) {
  $("#output").innerHTML = emptyState(errorText(err), "⚠️");
}

/* ============================ Form ============================ */

function setupForm() {
  $("#presets").innerHTML = Object.entries(PRESETS)
    .map(([k, p]) => `<button type="button" class="chip chip-filter" data-preset="${k}">${p.label}</button>`).join("");
  $("#group-by").innerHTML = Object.entries(GROUP_FIELDS)
    .map(([k, g]) => `<label class="check"><input type="checkbox" name="groupBy" value="${k}" ${k === "vendorType" ? "checked" : ""}/> <span>${g.label}</span></label>`).join("");

  $("#f-projects").innerHTML = options(state.projects.map((p) => ({ value: p.id, label: `${p.name} (${p.startDate})` })), qs("project"));
  $("#f-type").innerHTML = options([...new Set([...state.masters.vendorTypes, ...state.vendors.map((v) => v.type)])].sort(), "", { placeholder: "All types" });
  fillVendors();
  $("#f-slot").innerHTML = options(SLOTS, "", { placeholder: "All times" });
  $("#f-status").innerHTML = options([{ value: "open", label: "Pending / short (not complete)" }, ...Object.entries(STATUS_INFO).map(([value, s]) => ({ value, label: s.label }))], "", { placeholder: "Any status" });
  if (PHOTOS_ENABLED) $("#f-bucket").innerHTML = options(state.masters.photoBuckets, "", { placeholder: "All buckets" }); // PHOTOS DISABLED

  $("#f-type").onchange = fillVendors;
  $("#presets").onclick = (e) => {
    const k = e.target.closest("[data-preset]")?.dataset.preset;
    if (k) applyPreset(k);
  };
  $("#report-form").addEventListener("change", (e) => {
    if (e.target.name === "view") syncView();
    $$("[data-preset]").forEach((b) => b.classList.remove("active"));
  });
  $("#report-form").addEventListener("submit", (e) => { e.preventDefault(); generate(); });
  $("#clear-projects").onclick = () => { [...$("#f-projects").options].forEach((o) => (o.selected = false)); };
  $("#quick-range").onchange = (e) => quickRange(e.target.value);

  $("#btn-xlsx").onclick = () => downloadXlsx(`${fileBase()}.xlsx`, [{ name: state.title, rows: state.rows }]);
  $("#btn-csv").onclick = () => downloadCsv(`${fileBase()}.csv`, state.rows);
  $("#btn-pdf").onclick = () => downloadPdf(`${fileBase()}.pdf`, {
    title: state.title,
    subtitle: describeFilters(state.filters, ctx()),
    rows: state.rows.map((r) => { const { Link, ...rest } = r; return rest; }),
  });
  $("#btn-print").onclick = () => window.print();
  if (PHOTOS_ENABLED) $("#btn-zip").onclick = zipPhotos; // PHOTOS DISABLED
  $("#btn-workbook").onclick = fullWorkbook;
  syncView();
  if (qs("project")) applyPreset("details", false);
}

function fillVendors() {
  const type = $("#f-type").value;
  $("#f-vendor").innerHTML = options(
    state.vendors.filter((v) => !type || v.type === type).map((v) => ({ value: v.id, label: v.name })), "", { placeholder: "All vendors" });
}

function applyPreset(key, run = true) {
  const p = PRESETS[key];
  $(`[name=view][value=${p.view}]`).checked = true;
  if (p.groupBy) $$("[name=groupBy]").forEach((c) => (c.checked = p.groupBy.includes(c.value)));
  $("#f-status").value = p.status || "";
  syncView();
  $$("[data-preset]").forEach((b) => b.classList.toggle("active", b.dataset.preset === key));
  if (run) generate();
}

function syncView() {
  const view = $("[name=view]:checked").value;
  $("#group-wrap").hidden = view !== "summary";
  if (PHOTOS_ENABLED) $("#bucket-wrap").hidden = view !== "photos"; // PHOTOS DISABLED
  $$(".entry-filter").forEach((el) => (el.hidden = view === "photos"));
}

function quickRange(v) {
  const d = new Date();
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  let from = "", to = "";
  if (v === "today") from = to = todayISO();
  if (v === "week") { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); from = iso(s); to = todayISO(); }
  if (v === "month") { from = iso(new Date(d.getFullYear(), d.getMonth(), 1)); to = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  if (v === "lastmonth") { from = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)); to = iso(new Date(d.getFullYear(), d.getMonth(), 0)); }
  if (v === "year") { from = iso(new Date(d.getFullYear(), 0, 1)); to = iso(new Date(d.getFullYear(), 11, 31)); }
  $("#f-from").value = from;
  $("#f-to").value = to;
}

function readFilters() {
  return {
    view: $("[name=view]:checked").value,
    groupBy: $$("[name=groupBy]:checked").map((c) => c.value),
    projectIds: [...$("#f-projects").selectedOptions].map((o) => o.value),
    from: $("#f-from").value,
    to: $("#f-to").value,
    vendorType: $("#f-type").value,
    vendorId: $("#f-vendor").value,
    slot: $("#f-slot").value,
    status: $("#f-status").value,
    bucket: $("#f-bucket")?.value || "", // PHOTOS DISABLED: element is commented out
    user: $("#f-user").value.trim(),
  };
}

/* ============================ Data ============================ */

function ctx() {
  return {
    projects: Object.fromEntries(state.projects.map((p) => [p.id, p])),
    vendors: Object.fromEntries(state.vendors.map((v) => [v.id, v])),
    rates: state.rates,
    showMoney: true,
    showPhotos: PHOTOS_ENABLED, // PHOTOS DISABLED: hides the Photos column
  };
}

/** Projects in scope: chosen ones, or every project overlapping the date range. */
function scopeProjects(f) {
  if (f.projectIds.length) return state.projects.filter((p) => f.projectIds.includes(p.id));
  return state.projects.filter((p) => (!f.from || p.endDate >= f.from) && (!f.to || p.startDate <= f.to));
}

async function loadScope(projects, needPhotos) {
  await Promise.all(projects.map(async (p) => {
    const c = (state.cache[p.id] ??= {});
    if (!c.entries) c.entries = await listEntries(p.id);
    if (needPhotos && !c.photos) c.photos = await listPhotos(p.id);
  }));
  return {
    entries: projects.flatMap((p) => state.cache[p.id].entries),
    photos: needPhotos ? projects.flatMap((p) => state.cache[p.id].photos) : [],
  };
}

/* ============================ Generate ============================ */

async function generate() {
  const f = (state.filters = readFilters());
  const btn = $("#btn-generate");
  setBusy(btn, true, "Loading…");
  try {
    const projects = scopeProjects(f);
    const c = ctx();
    const needPhotos = PHOTOS_ENABLED && (f.view === "photos" || f.view === "projects"); // PHOTOS DISABLED
    const data = await loadScope(projects, needPhotos);
    const entries = filterEntries(data.entries, f);
    const photos = filterPhotos(data.photos, f);

    if (f.view === "details") state.rows = itemRows(entries, c);
    if (f.view === "summary") state.rows = summaryRows(entries, f.groupBy, c);
    if (f.view === "projects") state.rows = projectRows(projects, entries, photos, c);
    if (f.view === "photos") {
      state.photos = photos.map((p) => ({ ...p, projectName: c.projects[p.projectId]?.name }));
      state.rows = photoRows(photos, c);
    }
    state.title = f.view === "summary"
      ? `Summary by ${f.groupBy.map((k) => GROUP_FIELDS[k].label).join(" › ") || "Vendor Type"}`
      : VIEW_TITLES[f.view];
    renderOutput(f, projects.length);
  } catch (err) {
    console.error(err);
    toast(errorText(err), "error");
  } finally {
    setBusy(btn, false);
  }
}

function renderOutput(f, projectCount) {
  $("#output-card").hidden = false;
  if (PHOTOS_ENABLED) $("#btn-zip").hidden = f.view !== "photos"; // PHOTOS DISABLED
  $("#out-title").textContent = state.title;
  $("#out-meta").textContent = `${state.rows.length} row(s) from ${projectCount} project(s) · ${describeFilters(f, ctx())}`;
  $("#print-head").innerHTML = `<h2>${esc(state.title)}</h2><p class="small">${esc(describeFilters(f, ctx()))} · Generated ${new Date().toLocaleString("en-IN")}</p>`;

  if (!state.rows.length) {
    $("#output").innerHTML = emptyState("No data for these filters.", "🔍");
    return;
  }
  const gallery = f.view === "photos"
    ? `<div class="photo-grid mb">${state.photos.map((p) => `
        <a class="photo" href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" loading="lazy" alt="" />
        <span class="cap">${esc(p.projectName)} · ${esc(p.bucket)}${p.remark ? " · " + esc(p.remark) : ""}</span></a>`).join("")}</div>`
    : "";
  $("#output").innerHTML = gallery + table(state.rows);
  $("#output-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

const LIMIT = 1000;
function table(rows) {
  const cols = Object.keys(rows[0]);
  const isNum = (c) => typeof rows[0][c] === "number";
  const money = (c) => /Value|Rate|Per Pax/.test(c);
  const cell = (r, c) => {
    const v = r[c];
    if (c === "Link") return `<a href="${esc(v)}" target="_blank" rel="noopener">Open</a>`;
    if (typeof v === "number") return money(c) ? `₹${fmtNum(v)}` : fmtNum(v);
    return esc(v);
  };
  const totals = cols.map((c) => (TOTAL_COLUMNS.has(c) && isNum(c) ? rows.reduce((s, r) => s + (r[c] || 0), 0) : null));
  return `
    <div class="table-wrap"><table class="table responsive">
      <thead><tr>${cols.map((c) => `<th class="${isNum(c) ? "num" : ""}">${esc(c)}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(0, LIMIT).map((r) => `<tr>${cols.map((c) => `<td data-label="${esc(c)}" class="${isNum(c) ? "num" : ""}">${cell(r, c)}</td>`).join("")}</tr>`).join("")}</tbody>
      ${totals.some((t) => t !== null) ? `<tfoot><tr>${cols.map((c, i) => `<td data-label="${esc(c)}" class="${isNum(c) ? "num" : ""}">${i === 0 ? "Total" : totals[i] === null ? "" : money(c) ? `₹${fmtNum(totals[i])}` : fmtNum(totals[i])}</td>`).join("")}</tr></tfoot>` : ""}
    </table></div>
    ${rows.length > LIMIT ? `<p class="small muted mt">Showing first ${LIMIT} of ${rows.length} rows. Downloads include all rows.</p>` : ""}`;
}

function fileBase() {
  const f = state.filters;
  const proj = f.projectIds?.length === 1 ? state.projects.find((p) => p.id === f.projectIds[0])?.name : "";
  return [state.title, proj, todayISO()].filter(Boolean).join("-").replace(/[^\w\- ›]+/g, "").replace(/[\s›]+/g, "-").toLowerCase();
}

/* ============================ Bulk exports ============================ */

async function fullWorkbook() {
  const btn = $("#btn-workbook");
  setBusy(btn, true, "Building…");
  try {
    const f = readFilters();
    const projects = scopeProjects(f);
    const c = ctx();
    const data = await loadScope(projects, PHOTOS_ENABLED); // PHOTOS DISABLED
    const entries = filterEntries(data.entries, f);
    const photos = filterPhotos(data.photos, f);
    const sum = (g) => summaryRows(entries, g, c);
    await downloadXlsx(`complete-report-${todayISO()}.xlsx`, [
      { name: "Projects", rows: projectRows(projects, entries, photos, c) },
      { name: "Item Details", rows: itemRows(entries, c) },
      { name: "By Vendor Type", rows: sum(["vendorType"]) },
      { name: "By Vendor", rows: sum(["vendorType", "vendor"]) },
      { name: "By Date", rows: sum(["date", "vendorType", "vendor"]) },
      { name: "By Time", rows: sum(["slot", "vendorType", "vendor"]) },
      { name: "Date & Time", rows: sum(["date", "slot", "vendorType", "vendor"]) },
      { name: "By Project & Vendor", rows: sum(["project", "vendorType", "vendor"]) },
      { name: "Pending & Short", rows: itemRows(filterEntries(entries, { status: "open" }), c) },
      ...(PHOTOS_ENABLED ? [{ name: "Photos", rows: photoRows(photos, c) }] : []), // PHOTOS DISABLED
      { name: "Filters", rows: [{ Filters: describeFilters(f, c), "Generated At": new Date().toLocaleString("en-IN"), "Generated By": profile.name }] },
    ]);
  } catch (err) {
    toast(errorText(err), "error");
  } finally {
    setBusy(btn, false);
  }
}

async function zipPhotos() {
  const btn = $("#btn-zip");
  setBusy(btn, true, "Preparing…");
  try {
    await downloadPhotosZip(`photos-${todayISO()}.zip`, state.photos, (i, n) => { btn.innerHTML = `<span class="spinner"></span> ${i}/${n}`; });
  } catch (err) {
    toast(errorText(err), "error");
  } finally {
    setBusy(btn, false);
  }
}
