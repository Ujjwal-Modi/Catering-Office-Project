import { requireAuth } from "../auth.js";
import { renderShell } from "../layout.js";
import { listVendors, getVendorRates, getMasters, saveVendor, deleteVendor } from "../data.js";
import { $, esc, num, toast, errorText, openModal, confirmDialog, options, debounce, emptyState, fmtMoney } from "../ui.js";

const state = { vendors: [], rates: {}, masters: {} };

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "vendors", title: "Vendor Master" });
await load();
bind();

async function load() {
  try {
    [state.vendors, state.rates, state.masters] = await Promise.all([listVendors(), getVendorRates(), getMasters()]);
    const types = [...new Set([...state.masters.vendorTypes, ...state.vendors.map((v) => v.type)])].sort();
    const cur = $("#type-filter").value;
    $("#type-filter").innerHTML = options(types, cur, { placeholder: "All vendor types" });
    render();
  } catch (err) {
    $("#list").innerHTML = emptyState(errorText(err), "⚠️");
  }
}

function bind() {
  $("#new-btn").onclick = () => editVendor();
  $("#search").oninput = debounce(render);
  $("#type-filter").onchange = render;
  $("#status-filter").onchange = render;
  $("#list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const v = state.vendors.find((x) => x.id === btn.closest("[data-id]").dataset.id);
    if (btn.dataset.action === "edit") editVendor(v);
    if (btn.dataset.action === "delete") removeVendor(v);
  });
}

function render() {
  const term = $("#search").value.trim().toLowerCase();
  const type = $("#type-filter").value;
  const status = $("#status-filter").value;
  const list = state.vendors.filter((v) => {
    if (type && v.type !== type) return false;
    if (status === "active" && v.active === false) return false;
    if (status === "inactive" && v.active !== false) return false;
    return !term || [v.name, v.phone, v.type, v.unit, v.notes].join(" ").toLowerCase().includes(term);
  });

  $("#count").textContent = `${list.length} vendor${list.length === 1 ? "" : "s"}`;
  if (!list.length) {
    $("#list").innerHTML = emptyState(state.vendors.length ? "No vendors match your filters." : "No vendors yet. Add your first vendor.");
    return;
  }
  $("#list").innerHTML = `
    <div class="table-wrap">
      <table class="table responsive">
        <thead><tr><th>Vendor</th><th>Type</th><th>Phone</th><th>Unit</th><th class="num">Rate / unit</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.map((v) => `
            <tr data-id="${v.id}">
              <td data-label="Vendor"><span class="strong">${esc(v.name)}</span>${v.notes ? `<div class="xs muted">${esc(v.notes)}</div>` : ""}</td>
              <td data-label="Type">${esc(v.type)}</td>
              <td data-label="Phone">${v.phone ? `<a href="tel:${esc(v.phone)}">${esc(v.phone)}</a>` : "—"}</td>
              <td data-label="Unit">${esc(v.unit)}</td>
              <td data-label="Rate / unit" class="num">${state.rates[v.id] ? fmtMoney(state.rates[v.id]) : "—"}</td>
              <td data-label="Status">${v.active === false ? '<span class="badge badge-gray">Inactive</span>' : '<span class="badge badge-green">Active</span>'}</td>
              <td class="actions nowrap">
                <a class="icon-btn" href="payments.html?vendor=${v.id}" title="Payments & statement">₹</a>
                <button class="icon-btn" data-action="edit" title="Edit">✎</button>
                <button class="icon-btn danger" data-action="delete" title="Delete">🗑</button>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function editVendor(v = null) {
  openModal({
    title: v ? "Edit vendor" : "Add vendor",
    body: `
      <div class="form-grid cols-2">
        <div class="field">
          <label class="req">Vendor type</label>
          <select name="type" required>${options(state.masters.vendorTypes, v?.type, { placeholder: "Select type" })}</select>
          <span class="hint">Manage types on the <a href="masters.html">Masters</a> page.</span>
        </div>
        <div class="field">
          <label class="req">Vendor name</label>
          <input name="name" required value="${esc(v?.name)}" />
        </div>
        <div class="field">
          <label>Phone number</label>
          <input name="phone" type="tel" inputmode="tel" value="${esc(v?.phone)}" />
        </div>
        <div class="field">
          <label class="req">Unit</label>
          <input name="unit" required list="unit-list" value="${esc(v?.unit)}" placeholder="kg, litre, piece…" />
          <datalist id="unit-list">${options(state.masters.units)}</datalist>
        </div>
        <div class="field">
          <label>Rate per unit (₹)</label>
          <input name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(state.rates[v?.id] ?? "")}" />
          <span class="hint">Only admins can see rates. Used for payment balances.</span>
        </div>
        <div class="field">
          <label>GSTIN</label>
          <input name="gstin" value="${esc(v?.gstin)}" placeholder="Optional" />
        </div>
        <div class="field span-all">
          <label>Address / notes</label>
          <textarea name="notes">${esc(v?.notes)}</textarea>
        </div>
        <label class="check span-all"><input type="checkbox" name="active" ${v?.active === false ? "" : "checked"} /> <span>Active (shown to staff)</span></label>
      </div>`,
    onSubmit: async (fd) => {
      const data = {
        type: fd.get("type"),
        name: fd.get("name").trim(),
        phone: fd.get("phone").trim(),
        unit: fd.get("unit").trim(),
        gstin: fd.get("gstin").trim().toUpperCase(),
        notes: fd.get("notes").trim(),
        active: fd.get("active") === "on",
      };
      const dup = state.vendors.find((x) => x.id !== v?.id && x.type === data.type && x.name.toLowerCase() === data.name.toLowerCase());
      if (dup) {
        toast("A vendor with this name already exists in this type.", "error");
        return false;
      }
      await saveVendor(v?.id, data, num(fd.get("rate")));
      toast(v ? "Vendor updated" : "Vendor added", "success");
      await load();
    },
  });
}

async function removeVendor(v) {
  const ok = await confirmDialog(`Delete vendor "${v.name}"? Existing project items keep the vendor's name. Tip: mark the vendor inactive instead to keep history tidy.`);
  if (!ok) return;
  try {
    await deleteVendor(v.id);
    toast("Vendor deleted", "success");
    await load();
  } catch (err) {
    toast(errorText(err), "error");
  }
}
