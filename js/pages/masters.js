import { requireAuth } from "../auth.js";
import { renderShell } from "../layout.js";
import { getMasters, addMasterItem, removeMasterItem, listVendors, MASTER_KINDS } from "../data.js";
import { $, esc, toast, errorText, confirmDialog } from "../ui.js";

let masters = {};
let vendors = [];

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "masters", title: "Masters" });
await load();

async function load() {
  try {
    [masters, vendors] = await Promise.all([getMasters(), listVendors()]);
    render();
  } catch (err) {
    toast(errorText(err), "error");
  }
}

function render() {
  $("#masters").innerHTML = Object.entries(MASTER_KINDS).map(([kind, meta]) => `
    <section class="card" data-kind="${kind}">
      <div class="card-head"><h3>${meta.label}</h3><span class="badge badge-gray">${masters[kind].length}</span></div>
      <form class="gap mb" data-add>
        <input name="value" placeholder="${esc(meta.hint)}" required class="grow" style="flex:1 1 180px" maxlength="60" />
        <button class="btn btn-primary" type="submit">Add</button>
      </form>
      <div class="chips">
        ${masters[kind].map((v) => `<span class="chip">${esc(v)}<button type="button" data-remove="${esc(v)}" title="Remove">✕</button></span>`).join("") || '<span class="muted small">Nothing added yet.</span>'}
      </div>
    </section>`).join("");
}

$("#masters").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const kind = form.closest("[data-kind]").dataset.kind;
  const value = form.value.value.trim();
  if (!value) return;
  if (masters[kind].some((x) => x.toLowerCase() === value.toLowerCase())) return toast("Already in the list.", "warn");
  try {
    await addMasterItem(kind, value);
    masters[kind] = [...masters[kind], value].sort((a, b) => a.localeCompare(b));
    render();
    $(`[data-kind="${kind}"] input`).focus();
  } catch (err) {
    toast(errorText(err), "error");
  }
});

$("#masters").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-remove]");
  if (!btn) return;
  const kind = btn.closest("[data-kind]").dataset.kind;
  const value = btn.dataset.remove;
  if (kind === "vendorTypes") {
    const used = vendors.filter((v) => v.type === value).length;
    if (used) return toast(`${used} vendor(s) use "${value}". Change them first.`, "warn");
  }
  if (!(await confirmDialog(`Remove "${value}" from ${MASTER_KINDS[kind].label}? Existing records keep their value.`, { okLabel: "Remove" }))) return;
  try {
    await removeMasterItem(kind, value);
    masters[kind] = masters[kind].filter((x) => x !== value);
    render();
  } catch (err) {
    toast(errorText(err), "error");
  }
});
