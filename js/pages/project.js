/* Project workspace — used by staff (limited) and admins (full control). */
import { requireAuth } from "../auth.js";
import { PHOTOS_ENABLED } from "../firebase-config.js";
import { renderShell } from "../layout.js";
import {
  watchProject, watchEntries, watchPhotos, listVendors, getMasters, listUsers,
  addEntry, updateEntry, deleteEntry, uploadPhoto, updatePhoto, deletePhoto,
} from "../data.js";
import { entryStatus, shortfall, STATUS_INFO } from "../metrics.js";
import {
  $, $$, esc, num, fmtNum, toast, errorText, openModal, confirmDialog, options, debounce, emptyState, save,
  SLOTS, FREEZE, datesBetween, fmtDate, fmtDay, fmtDateTime, rangeLabel, todayISO, qs, projectStatus, STATUS_BADGE,
  accessFor, accessBadges,
} from "../ui.js";
import { t } from "../i18n.js";

const pid = qs("id");
const profile = await requireAuth();
renderShell(profile, { active: "projects", title: "Project" });

const state = {
  project: null, entries: [], photos: [], vendors: [], masters: {}, users: [],
  tab: "items", bucket: "", unsub: [], pendingRender: false, started: false,
};

if (!pid) {
  $("#page").innerHTML = emptyState("No project selected.", "🤔");
} else {
  init();
}

/* ============================ Boot & permissions ============================ */

async function init() {
  try {
    [state.vendors, state.masters, state.users] = await Promise.all([
      listVendors(), getMasters(), profile.isAdmin ? listUsers() : [],
    ]);
  } catch (err) {
    return fail(errorText(err));
  }
  // Live project doc: if an admin freezes/locks it, the page reacts instantly.
  watchProject(pid, (p) => {
    state.project = p;
    if (!p) return fail("Project not found or you don't have access.");
    if (!profile.isAdmin && !(p.assignedUsers || []).includes(profile.uid)) return fail("This project is not assigned to you.");
    if (!profile.isAdmin && myAccess() === "locked") {
      stopData();
      return fail("🔒 This project is locked by admin. You can't open it right now.");
    }
    $("#project-body").hidden = false;
    $("#blocked").hidden = true;
    renderHead();
    if (!state.started) startData();
    renderAll();
  }, (err) => fail(errorText(err)));
  bindStatic();
}

function startData() {
  state.started = true;
  state.unsub.push(
    watchEntries(pid, (list) => { state.entries = list; renderEntriesSafe(); renderSummary(); updateCounts(); }, (e) => toast(errorText(e), "error")),
  );
  // PHOTOS DISABLED: live photo list only runs when photos are switched on.
  if (PHOTOS_ENABLED) {
    state.unsub.push(watchPhotos(pid, (list) => { state.photos = list; renderPhotos(); updateCounts(); }, (e) => toast(errorText(e), "error")));
  }
}

function stopData() {
  state.unsub.forEach((u) => u());
  state.unsub = [];
  state.started = false;
}

function fail(msg) {
  $("#project-body").hidden = true;
  $("#blocked").hidden = false;
  $("#blocked").innerHTML = `${emptyState(msg, "🚫")}<p class="right"><a class="btn" href="${profile.isAdmin ? "projects.html" : "my-projects.html"}">${t("← Back to projects")}</a></p>`;
}

/** This staff member's own access to the project (set per staff by admin). */
const myAccess = () => accessFor(state.project, profile.uid);

/** Can the current user add/edit anything in this project? */
const canEdit = () => profile.isAdmin || myAccess() === "none";
const canEditDetails = (e) => profile.isAdmin || (canEdit() && !e.ordered);
const canEditReceived = (e) => profile.isAdmin || (canEdit() && !e.received);
const canDelete = (e) => profile.isAdmin || (canEdit() && !e.ordered && e.createdBy === profile.uid);
/** Ordered / Received ticks: staff may tick (when they can edit) but only admins can untick. */
const canTick = (e, flag) => profile.isAdmin || (canEdit() && !e?.[flag]);
const canManagePhoto = (p) => profile.isAdmin || (canEdit() && p.uploadedBy === profile.uid);

/* ============================ Header ============================ */

function renderHead() {
  const p = state.project;
  const fz = profile.isAdmin ? "none" : myAccess();
  const st = projectStatus(p);
  document.title = p.name;
  $(".topbar-title").textContent = p.name;

  $("#project-head").innerHTML = `
    <div class="card">
      <div class="between">
        <div>
          <div class="gap mb"><span class="badge ${STATUS_BADGE[st]}">${t(st)}</span>${profile.isAdmin ? ((p.assignedUsers || []).length ? accessBadges(p) : "") : `<span class="badge ${FREEZE[fz].badge}">${t(FREEZE[fz].label)}</span>`}</div>
          <h2>${esc(p.name)}</h2>
        </div>
        ${profile.isAdmin ? `
          <div class="gap no-print">
            <a class="btn" href="projects.html" title="Change staff access from the project's card or edit form">👥 Staff access</a>
            <a class="btn" href="reports.html?project=${p.id}">📊 Reports</a>
          </div>` : ""}
      </div>
      <div class="meta mt">
        <span>📅 ${rangeLabel(p)}</span>
        ${p.venue ? `<span>📍 ${esc(p.venue)}</span>` : ""}
        ${p.eventType ? `<span>🎉 ${esc(p.eventType)}</span>` : ""}
        ${p.pax ? `<span>👥 ${t("{n} pax", { n: fmtNum(p.pax) })}</span>` : ""}
        ${p.contact ? `<span>📞 ${esc(p.contact)}</span>` : ""}
      </div>
      ${p.remark ? `<p class="small mt">${esc(p.remark)}</p>` : ""}
    </div>`;

  const banner = $("#freeze-banner");
  banner.hidden = true;
  if (!profile.isAdmin && fz === "readonly") {
    banner.hidden = false;
    banner.className = "banner banner-warn";
    banner.textContent = t("👁 Admin has set this project to view only for you — you can view it but not make changes.");
  } else if (profile.isAdmin) {
    const name = (uid) => state.users.find((u) => u.uid === uid)?.name || "Removed user";
    const restricted = (p.assignedUsers || []).filter((uid) => accessFor(p, uid) !== "none");
    if (restricted.length) {
      banner.hidden = false;
      banner.className = "banner banner-info";
      banner.textContent = `Restricted staff: ${restricted.map((uid) => `${name(uid)} (${FREEZE[accessFor(p, uid)].label})`).join(", ")}. Admins can still edit.`;
    }
  }
}

/* ============================ Tabs ============================ */

function bindStatic() {
  $(".tabs").addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tab]");
    if (!tab) return;
    state.tab = tab.dataset.tab;
    $$(".tab").forEach((b) => b.classList.toggle("active", b === tab));
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== state.tab));
  });
  ["#f-date", "#f-slot", "#f-type", "#f-status"].forEach((s) => ($(s).onchange = renderEntriesSafe));
  $("#f-search").oninput = debounce(renderEntriesSafe);
  $("#entries").addEventListener("focusout", () => {
    if (state.pendingRender) setTimeout(renderEntriesSafe, 0);
  });
  $("#entries").addEventListener("click", onEntryClick);
  $("#entries").addEventListener("change", onEntryChange);
  if (PHOTOS_ENABLED) { // PHOTOS DISABLED
    $("#photo-grid").addEventListener("click", onPhotoClick);
    $("#bucket-chips").addEventListener("click", (e) => {
      const c = e.target.closest("[data-bucket]");
      if (!c) return;
      state.bucket = c.dataset.bucket;
      renderPhotos();
    });
  }
}

function updateCounts() {
  $("#count-items").textContent = state.entries.length;
  if (PHOTOS_ENABLED) $("#count-photos").textContent = state.photos.length; // PHOTOS DISABLED
}

function renderAll() {
  renderAddForm();
  renderFilters();
  renderEntriesSafe();
  if (PHOTOS_ENABLED) { // PHOTOS DISABLED
    renderUploadCard();
    renderPhotos();
  }
  renderSummary();
  updateCounts();
}

/* ============================ Item form ============================ */

const projectDates = () => datesBetween(state.project.startDate, state.project.endDate);
const activeVendors = (type) => state.vendors.filter((v) => v.active !== false && (!type || v.type === type));
const vendorTypes = () => [...new Set(activeVendors().map((v) => v.type))].sort();

function defaultDate() {
  const today = todayISO();
  const dates = projectDates();
  return dates.includes(today) ? today : dates[0];
}

/** Shared field markup for add + edit. `e` is an existing entry or null. */
function entryFields(e, prefix) {
  const lockDetails = e && !canEditDetails(e);
  const lockReceived = e && !canEditReceived(e);
  const type = e?.vendorType || "";
  const vendorsOfType = type ? activeVendors(type) : [];
  // Keep the entry's vendor visible even if it was later deactivated.
  if (e && !vendorsOfType.some((v) => v.id === e.vendorId)) vendorsOfType.push({ id: e.vendorId, name: e.vendorName, unit: e.unit });
  const dis = lockDetails ? "disabled" : "";
  const slot = e?.slot || "";

  return `
    <div class="form-grid cols-2">
      <div class="field">
        <label class="req">${t("Vendor type")}</label>
        <select name="vendorType" required ${dis} data-role="type">${options(vendorTypes().concat(type && !vendorTypes().includes(type) ? [type] : []), type, { placeholder: t("Select type") })}</select>
      </div>
      <div class="field">
        <label class="req">${t("Vendor name")}</label>
        <select name="vendorId" required ${dis} data-role="vendor">${options(vendorsOfType.map((v) => ({ value: v.id, label: v.name })), e?.vendorId, { placeholder: t(type ? "Select vendor" : "Select type first") })}</select>
      </div>
      <div class="field">
        <label class="req">${t("Date")}</label>
        <select name="date" required ${dis}>${options(projectDates().map((d) => ({ value: d, label: fmtDay(d) })), e?.date || defaultDate())}</select>
      </div>
      <div class="field">
        <label>${t("Unit")}</label>
        <input data-role="unit" value="${esc(e?.unit || "")}" disabled placeholder="${t("Auto from vendor")}" />
      </div>
      <div class="field span-all">
        <label class="req">${t("Time")}</label>
        <div class="segmented">
          ${SLOTS.map((s) => `
            <input type="radio" id="${prefix}-slot-${s}" name="slot" value="${s}" required ${slot === s ? "checked" : ""} ${dis} />
            <label for="${prefix}-slot-${s}">${t(s)}</label>`).join("")}
        </div>
      </div>
      <div class="field">
        <label class="req">${t("Ordered quantity")}</label>
        <div class="unit-addon"><input name="orderedQty" type="number" min="0.01" step="any" inputmode="decimal" required value="${esc(e?.orderedQty ?? "")}" ${dis} /><span data-role="unit-tag">${esc(e?.unit || t("unit"))}</span></div>
      </div>
      <div class="field">
        <label>${t("Received quantity")}</label>
        <div class="unit-addon"><input name="receivedQty" type="number" min="0" step="any" inputmode="decimal" value="${esc(e?.receivedQty || "")}" ${lockReceived ? "disabled" : ""} /><span data-role="unit-tag">${esc(e?.unit || t("unit"))}</span></div>
      </div>
      <div class="field span-all">
        <label>${t("Remark")}</label>
        <input name="remark" value="${esc(e?.remark || "")}" placeholder="${t("Optional")}" ${!canEdit() ? "disabled" : ""} />
      </div>
      ${canEdit() ? `
        <div class="span-all item-flags">
          <label class="check"><input type="checkbox" name="ordered" ${e?.ordered ? "checked" : ""} ${canTick(e, "ordered") ? "" : "disabled"}/> <span>${t("Ordered")}</span></label>
          <label class="check"><input type="checkbox" name="received" ${e?.received ? "checked" : ""} ${canTick(e, "received") ? "" : "disabled"}/> <span>${t("Received")}</span></label>
        </div>
        ${profile.isAdmin ? "" : `<p class="span-all xs muted">${t("Once ticked, Ordered and Received can only be unticked by an admin.")}</p>`}` : ""}
    </div>`;
}

/** Wires the type → vendor → unit cascade inside a form. */
function wireCascade(form) {
  const typeSel = form.querySelector('[data-role="type"]');
  const vendorSel = form.querySelector('[data-role="vendor"]');
  const setUnit = () => {
    const v = state.vendors.find((x) => x.id === vendorSel.value);
    const unit = v?.unit || "";
    form.querySelector('[data-role="unit"]').value = unit;
    form.querySelectorAll('[data-role="unit-tag"]').forEach((tag) => (tag.textContent = unit || t("unit")));
  };
  typeSel.addEventListener("change", () => {
    vendorSel.innerHTML = options(activeVendors(typeSel.value).map((v) => ({ value: v.id, label: v.name })), "", {
      placeholder: t(typeSel.value ? "Select vendor" : "Select type first"),
    });
    setUnit();
  });
  vendorSel.addEventListener("change", setUnit);
}

function readEntryForm(fd) {
  const v = state.vendors.find((x) => x.id === fd.get("vendorId"));
  return {
    vendorId: fd.get("vendorId"),
    vendorName: v?.name || "",
    vendorType: fd.get("vendorType"),
    unit: v?.unit || "",
    date: fd.get("date"),
    slot: fd.get("slot"),
    orderedQty: num(fd.get("orderedQty")),
    receivedQty: num(fd.get("receivedQty")),
    remark: (fd.get("remark") || "").trim(),
  };
}

function validEntry(d) {
  if (!d.vendorId) return toast("Select a vendor.", "error"), false;
  if (!SLOTS.includes(d.slot)) return toast("Select a time (Morning / Afternoon / Evening / Night).", "error"), false;
  if (d.orderedQty <= 0) return toast("Ordered quantity must be more than 0.", "error"), false;
  if (d.date < state.project.startDate || d.date > state.project.endDate) return toast("Date must be within the project dates.", "error"), false;
  return true;
}

function renderAddForm() {
  const card = $("#add-card");
  if (!canEdit()) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  if (!vendorTypes().length) {
    card.innerHTML = `<div class="banner banner-info">${t("No vendors in the master yet.")}${profile.isAdmin ? ' <a href="vendors.html">Add vendors</a>' : t(" Ask an admin to add vendors.")}</div>`;
    return;
  }
  if (card.dataset.ready === state.project.startDate + state.project.endDate) return; // keep what user typed
  card.dataset.ready = state.project.startDate + state.project.endDate;
  card.innerHTML = `
    <details class="card" ${window.innerWidth > 760 ? "open" : ""} id="add-details">
      <summary class="between" style="cursor:pointer;list-style:none">
        <h3 style="font-size:1rem">${t("➕ Add item")}</h3><span class="muted small">${t(window.innerWidth > 760 ? "tap to collapse" : "tap to open")}</span>
      </summary>
      <form id="add-form" class="mt" novalidate>
        ${entryFields(null, "add")}
        <div class="gap mt" style="justify-content:flex-end">
          <button class="btn btn-primary" type="submit">${t("Save item")}</button>
        </div>
      </form>
    </details>`;
  const form = $("#add-form");
  wireCascade(form);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    if (!form.checkValidity()) return form.reportValidity();
    const d = readEntryForm(fd);
    if (!validEntry(d)) return;
    d.received = fd.get("received") === "on";
    d.ordered = d.received || fd.get("ordered") === "on";
    if (d.received && !d.receivedQty) d.receivedQty = d.orderedQty; // assume full delivery unless entered
    const dup = state.entries.find((x) => x.vendorId === d.vendorId && x.date === d.date && x.slot === d.slot);
    if (dup && !(await confirmDialog(t("{vendor} already has {qty} {unit} for {day} {slot}. Add another entry anyway?",
      { vendor: d.vendorName, qty: fmtNum(dup.orderedQty), unit: dup.unit, day: fmtDay(d.date), slot: t(d.slot) }), { okLabel: "Add anyway", danger: false }))) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await save(addEntry(pid, d, profile), "Item added");
      // Keep type/date/slot for quick consecutive entry; clear the rest.
      form.vendorId.value = "";
      form.orderedQty.value = "";
      form.receivedQty.value = "";
      form.remark.value = "";
      form.querySelector('[data-role="unit"]').value = "";
      form.ordered.checked = form.received.checked = false;
      form.vendorId.focus();
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/* ============================ Item list ============================ */

function renderFilters() {
  const keep = (sel, html) => { const v = $(sel).value; $(sel).innerHTML = html; $(sel).value = v; };
  keep("#f-date", options(projectDates().map((d) => ({ value: d, label: fmtDay(d) })), "", { placeholder: t("All dates") }));
  keep("#f-type", options([...new Set([...vendorTypes(), ...state.entries.map((e) => e.vendorType)])].sort(), "", { placeholder: t("All vendor types") }));
}

function filteredEntries() {
  const f = { date: $("#f-date").value, slot: $("#f-slot").value, type: $("#f-type").value, status: $("#f-status").value, q: $("#f-search").value.trim().toLowerCase() };
  return state.entries.filter((e) =>
    (!f.date || e.date === f.date) &&
    (!f.slot || e.slot === f.slot) &&
    (!f.type || e.vendorType === f.type) &&
    (!f.status || entryStatus(e) === f.status) &&
    (!f.q || [e.vendorName, e.vendorType, e.remark, e.createdByName].join(" ").toLowerCase().includes(f.q)));
}

/** Don't re-render while someone is typing a received qty — wait for blur. */
function renderEntriesSafe() {
  if (document.activeElement?.closest?.("#entries") && document.activeElement.tagName === "INPUT") {
    state.pendingRender = true;
    return;
  }
  state.pendingRender = false;
  if (state.project) renderFilters();
  renderEntries();
}

function renderEntries() {
  const list = filteredEntries();
  if (!list.length) {
    $("#entries").innerHTML = emptyState(state.entries.length ? "No items match the filters." : "No items added yet.", "🧾");
    return;
  }
  const byDate = {};
  list.forEach((e) => ((byDate[e.date] ??= []).push(e)));
  $("#entries").innerHTML = Object.entries(byDate).map(([date, items]) => `
    <section class="day-group">
      <div class="day-head"><span>${fmtDay(date)}</span><span class="muted small">${t(items.length > 1 ? "{n} items" : "{n} item", { n: items.length })}</span></div>
      ${SLOTS.filter((s) => items.some((e) => e.slot === s)).map((slot) => `
        <div class="slot-head">${t(slot)}</div>
        <div class="items">${items.filter((e) => e.slot === slot).map(entryCard).join("")}</div>`).join("")}
    </section>`).join("");
}

function entryCard(e) {
  const s = entryStatus(e);
  const short = shortfall(e);
  const flag = (name, label) => {
    const can = canTick(e, name);
    const title = can ? "" : e[name] ? t("Only admin can untick") : "";
    return `<label class="check" title="${title}"><input type="checkbox" data-flag="${name}" ${e[name] ? "checked" : ""} ${can ? "" : "disabled"}/> <span>${t(label)}</span>${!can && e[name] && !profile.isAdmin ? " 🔒" : ""}</label>`;
  };
  return `
    <article class="item st-${s}" data-id="${e.id}">
      <div class="item-top">
        <div>
          <div class="item-name">${esc(e.vendorName)}</div>
          <div class="xs muted">${esc(e.vendorType)}</div>
        </div>
        <span class="badge ${STATUS_INFO[s].badge}">${t(STATUS_INFO[s].label)}</span>
      </div>
      <div class="item-qty">
        <div class="qty-box"><div class="label">${t("Ordered qty")}</div><div class="val">${fmtNum(e.orderedQty)} <span class="xs muted">${esc(e.unit)}</span></div></div>
        <div class="qty-box">
          <div class="label">${t("Received qty")}${short > 0 ? ` <span style="color:var(--warn)">−${fmtNum(short)}</span>` : ""}</div>
          ${canEditReceived(e)
            ? `<input type="number" min="0" step="any" inputmode="decimal" data-received value="${esc(e.receivedQty || "")}" placeholder="0" aria-label="${t("Received quantity")}" />`
            : `<div class="val">${fmtNum(e.receivedQty)} <span class="xs muted">${esc(e.unit)}</span></div>`}
        </div>
      </div>
      <div class="item-flags">
        ${flag("ordered", "Ordered")}
        ${flag("received", "Received")}
      </div>
      ${e.remark ? `<p class="small mt">💬 ${esc(e.remark)}</p>` : ""}
      <div class="item-foot">
        <span class="xs muted">${esc(e.updatedByName || e.createdByName || "")} · ${fmtDateTime(e.updatedAt || e.createdAt)}</span>
        <span class="gap">
          ${canEdit() ? `<button class="icon-btn" data-action="edit" title="${t("Edit")}">✎</button>` : ""}
          ${canDelete(e) ? `<button class="icon-btn danger" data-action="delete" title="${t("Delete")}">🗑</button>` : ""}
        </span>
      </div>
    </article>`;
}

async function onEntryChange(ev) {
  const card = ev.target.closest("[data-id]");
  if (!card) return;
  const e = state.entries.find((x) => x.id === card.dataset.id);
  try {
    if (ev.target.matches("[data-received]")) {
      await save(updateEntry(pid, e.id, { receivedQty: num(ev.target.value) }, profile), "Received qty saved");
    } else if (ev.target.matches("[data-flag]")) {
      const flag = ev.target.dataset.flag;
      // Staff can only tick (never untick), and are asked first because it can't be undone by them.
      if (!profile.isAdmin) {
        if (!ev.target.checked || e[flag]) { ev.target.checked = !!e[flag]; return; }
        const label = flag === "ordered" ? "Ordered" : "Received";
        if (!(await confirmDialog(t("Mark as \"{flag}\"? Once ticked, only an admin can untick it.", { flag: t(label) }), { okLabel: "Tick", danger: false }))) {
          ev.target.checked = false;
          return;
        }
      }
      const patch = { [flag]: ev.target.checked };
      if (flag === "received" && ev.target.checked) {
        patch.ordered = true;
        if (!num(e.receivedQty)) patch.receivedQty = num(e.orderedQty); // assume full delivery unless entered
      }
      await save(updateEntry(pid, e.id, patch, profile), null);
    }
  } catch (err) {
    toast(errorText(err), "error");
  }
}

async function onEntryClick(ev) {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  const e = state.entries.find((x) => x.id === btn.closest("[data-id]").dataset.id);
  if (btn.dataset.action === "edit") editEntry(e);
  if (btn.dataset.action === "delete") {
    if (!(await confirmDialog(t("Delete {vendor} · {qty} {unit} on {day} {slot}?",
      { vendor: e.vendorName, qty: fmtNum(e.orderedQty), unit: e.unit, day: fmtDay(e.date), slot: t(e.slot) })))) return;
    try {
      await save(deleteEntry(pid, e.id), "Item deleted");
    } catch (err) {
      toast(errorText(err), "error");
    }
  }
}

function editEntry(e) {
  const { el } = openModal({
    title: "Edit item",
    wide: true,
    body: `${!canEditDetails(e) ? `<div class="banner banner-info">${t(canEditReceived(e)
      ? "This item is already ordered — only received quantity and remark can be changed."
      : "This item is already ordered and received — only the remark can be changed.")}</div>` : ""}${entryFields(e, "edit")}`,
    onSubmit: async (fd) => {
      let patch;
      if (canEditDetails(e)) {
        patch = readEntryForm(fd);
        if (!validEntry(patch)) return false;
      } else {
        patch = { remark: (fd.get("remark") || "").trim() };
      }
      if (canEditReceived(e)) patch.receivedQty = num(fd.get("receivedQty"));
      else delete patch.receivedQty;
      if (profile.isAdmin) {
        patch.ordered = fd.get("ordered") === "on";
        patch.received = fd.get("received") === "on";
      } else {
        // Staff: ticks can only go from unticked to ticked.
        if (!e.ordered && fd.get("ordered") === "on") patch.ordered = true;
        if (!e.received && fd.get("received") === "on") {
          patch.received = true;
          patch.ordered = true;
          if (!num(patch.receivedQty ?? e.receivedQty)) patch.receivedQty = num(e.orderedQty);
        }
      }
      await save(updateEntry(pid, e.id, patch, profile), "Item updated");
    },
  });
  if (canEditDetails(e)) wireCascade(el);
}

/* ============================ Photos ============================ */

let pendingFiles = [];
const MAX_PHOTO_MB = 50; // keep in sync with storage.rules
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function renderUploadCard() {
  const card = $("#upload-card");
  card.hidden = !canEdit();
  if (!canEdit() || card.dataset.ready) return;
  card.dataset.ready = "1";
  const dates = projectDates();
  card.innerHTML = `
    <div class="card">
      <div class="card-head"><h3>📷 Add photos</h3></div>
      <div class="form-grid cols-2">
        <div class="field">
          <label class="req">Photo bucket</label>
          <select id="up-bucket">${options(state.masters.photoBuckets, "", { placeholder: "Select bucket" })}</select>
        </div>
        <div class="field">
          <label>Date</label>
          <select id="up-date">${options(dates.map((d) => ({ value: d, label: fmtDay(d) })), defaultDate())}</select>
        </div>
      </div>
      <div class="grid-2 mt">
        <label class="dropzone">📸 Take photo<input type="file" accept="image/*" capture="environment" hidden data-pick /></label>
        <label class="dropzone">🖼 Choose from gallery<input type="file" accept="image/*" multiple hidden data-pick /></label>
      </div>
      <div class="upload-list mt" id="up-list"></div>
      <div class="gap mt" style="justify-content:flex-end" id="up-actions" hidden>
        <button class="btn btn-ghost" id="up-clear" type="button">Clear</button>
        <button class="btn btn-primary" id="up-go" type="button">Upload</button>
      </div>
    </div>`;

  $$("[data-pick]", card).forEach((inp) => inp.addEventListener("change", () => {
    const files = [...inp.files];
    const tooBig = files.filter((f) => f.size > MAX_PHOTO_MB * 1024 * 1024);
    if (tooBig.length) toast(`${tooBig.length} photo(s) over ${MAX_PHOTO_MB} MB were skipped.`, "warn");
    pendingFiles.push(...files.filter((f) => !tooBig.includes(f)).map((file) => ({ file, url: URL.createObjectURL(file), remark: "" })));
    inp.value = "";
    renderPending();
  }));
  $("#up-list").addEventListener("input", (e) => {
    const i = e.target.dataset.remark;
    if (i !== undefined) pendingFiles[i].remark = e.target.value;
  });
  $("#up-list").addEventListener("click", (e) => {
    const i = e.target.closest("[data-rm]")?.dataset.rm;
    if (i === undefined) return;
    URL.revokeObjectURL(pendingFiles[i].url);
    pendingFiles.splice(i, 1);
    renderPending();
  });
  $("#up-clear").onclick = () => { pendingFiles.forEach((f) => URL.revokeObjectURL(f.url)); pendingFiles = []; renderPending(); };
  $("#up-go").onclick = uploadPending;
}

function renderPending() {
  $("#up-actions").hidden = !pendingFiles.length;
  $("#up-go").textContent = `Upload ${pendingFiles.length} photo${pendingFiles.length === 1 ? "" : "s"}`;
  $("#up-list").innerHTML = pendingFiles.map((f, i) => `
    <div class="upload-row">
      <img src="${f.url}" alt="" />
      <div>
        <input data-remark="${i}" value="${esc(f.remark)}" placeholder="Remark (optional)" />
        <span class="xs muted">${esc(f.file.name || "photo")} · ${fmtSize(f.file.size)}</span>
      </div>
      <button class="icon-btn danger" data-rm="${i}" title="Remove">✕</button>
    </div>`).join("");
}

async function uploadPending() {
  const bucket = $("#up-bucket").value;
  if (!bucket) return toast("Select a photo bucket first.", "error");
  if (!navigator.onLine) return toast("Photos need internet to upload. Try again when online.", "warn");
  const btn = $("#up-go");
  btn.disabled = true;
  const total = pendingFiles.length;
  let done = 0;
  const failed = [];
  for (const f of pendingFiles) {
    btn.textContent = `Uploading ${done + 1}/${total}…`;
    try {
      await uploadPhoto(pid, f.file, { bucket, remark: f.remark.trim(), date: $("#up-date").value }, profile,
        (pct) => (btn.textContent = `Uploading ${done + 1}/${total} · ${pct}%`));
      URL.revokeObjectURL(f.url);
    } catch (err) {
      console.error(err);
      failed.push(f);
    }
    done++;
  }
  pendingFiles = failed;
  btn.disabled = false;
  renderPending();
  if (failed.length) toast(`${failed.length} photo(s) failed. Tap Upload to retry.`, "error");
  else toast(`${total} photo${total > 1 ? "s" : ""} uploaded`, "success");
}

function renderPhotos() {
  const buckets = [...new Set([...(state.masters.photoBuckets || []), ...state.photos.map((p) => p.bucket)])];
  const count = (b) => state.photos.filter((p) => p.bucket === b).length;
  $("#bucket-chips").innerHTML = [
    `<button class="chip chip-filter ${!state.bucket ? "active" : ""}" data-bucket="">All (${state.photos.length})</button>`,
    ...buckets.filter(count).map((b) => `<button class="chip chip-filter ${state.bucket === b ? "active" : ""}" data-bucket="${esc(b)}">${esc(b)} (${count(b)})</button>`),
  ].join("");
  const list = state.photos.filter((p) => !state.bucket || p.bucket === state.bucket);
  $("#photo-grid").innerHTML = list.length
    ? `<div class="photo-grid">${list.map((p) => `
        <button class="photo" data-photo="${p.id}" title="${esc(p.remark)}">
          <img src="${esc(p.url)}" loading="lazy" alt="${esc(p.bucket)}" />
          <span class="cap">${esc(p.bucket)}${p.remark ? " · " + esc(p.remark) : ""}</span>
        </button>`).join("")}</div>`
    : emptyState("No photos yet.", "🖼");
}

function onPhotoClick(e) {
  const id = e.target.closest("[data-photo]")?.dataset.photo;
  if (!id) return;
  const p = state.photos.find((x) => x.id === id);
  const manage = canManagePhoto(p);
  const { el, close } = openModal({
    title: p.bucket,
    wide: true,
    body: `
      <img class="lightbox-img" src="${esc(p.url)}" alt="" />
      <p class="small muted mt">${esc(p.uploadedByName)} · ${fmtDateTime(p.createdAt)}${p.date ? ` · for ${fmtDate(p.date)}` : ""}${p.size ? ` · ${fmtSize(p.size)} original` : ""}</p>
      ${manage ? `
        <div class="form-grid cols-2 mt">
          <div class="field"><label>Bucket</label><select id="ph-bucket">${options(state.masters.photoBuckets.concat(state.masters.photoBuckets.includes(p.bucket) ? [] : [p.bucket]), p.bucket)}</select></div>
          <div class="field"><label>Remark</label><input id="ph-remark" value="${esc(p.remark)}" /></div>
        </div>` : p.remark ? `<p>💬 ${esc(p.remark)}</p>` : ""}`,
    footer: false,
  });
  el.insertAdjacentHTML("beforeend", `
    <footer class="modal-foot">
      <a class="btn btn-ghost" href="${esc(p.url)}" target="_blank" rel="noopener">Open original</a>
      ${manage ? `<button class="btn btn-danger" data-del>Delete</button><button class="btn btn-primary" data-save>Save</button>` : ""}
    </footer>`);
  el.querySelector("[data-save]")?.addEventListener("click", async () => {
    try {
      await save(updatePhoto(pid, p.id, { bucket: $("#ph-bucket").value, remark: $("#ph-remark").value.trim() }), "Photo updated");
      close();
    } catch (err) { toast(errorText(err), "error"); }
  });
  el.querySelector("[data-del]")?.addEventListener("click", async () => {
    if (!(await confirmDialog("Delete this photo permanently?"))) return;
    try {
      await deletePhoto(pid, p);
      toast("Photo deleted", "success");
      close();
    } catch (err) { toast(errorText(err), "error"); }
  });
}

/* ============================ Summary ============================ */

function renderSummary() {
  const el = $("#summary");
  if (!state.entries.length) {
    el.innerHTML = emptyState("Add items to see the summary.", "📊");
    return;
  }
  const counts = { pending: 0, ordered: 0, short: 0, received: 0 };
  state.entries.forEach((e) => counts[entryStatus(e)]++);

  const groups = {};
  state.entries.forEach((e) => {
    const k = `${e.vendorType}|${e.vendorId}|${e.unit}`;
    const g = (groups[k] ??= { type: e.vendorType, name: e.vendorName, unit: e.unit, n: 0, ord: 0, rec: 0, short: 0 });
    g.n++; g.ord += num(e.orderedQty); g.rec += num(e.receivedQty); g.short += shortfall(e);
  });
  const rows = Object.values(groups).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

  el.innerHTML = `
    <div class="grid-4 mb">
      ${Object.entries(counts).map(([k, v]) => `<div class="card stat"><div class="stat-label">${t(STATUS_INFO[k].label)}</div><div class="stat-value">${v}</div></div>`).join("")}
    </div>
    <h3 class="section-title">${t("Totals by vendor")}</h3>
    <div class="table-wrap"><table class="table responsive">
      <thead><tr><th>${t("Vendor type")}</th><th>${t("Vendor")}</th><th class="num">${t("Entries")}</th><th class="num">${t("Ordered")}</th><th class="num">${t("Received")}</th><th class="num">${t("Short")}</th></tr></thead>
      <tbody>${rows.map((g) => `
        <tr>
          <td data-label="${t("Vendor type")}">${esc(g.type)}</td>
          <td data-label="${t("Vendor")}" class="strong">${esc(g.name)}</td>
          <td data-label="${t("Entries")}" class="num">${g.n}</td>
          <td data-label="${t("Ordered")}" class="num">${fmtNum(g.ord)} ${esc(g.unit)}</td>
          <td data-label="${t("Received")}" class="num">${fmtNum(g.rec)} ${esc(g.unit)}</td>
          <td data-label="${t("Short")}" class="num" style="color:${g.short > 0 ? "var(--warn)" : "inherit"}">${fmtNum(g.short)} ${esc(g.unit)}</td>
        </tr>`).join("")}
      </tbody></table></div>`;
}
