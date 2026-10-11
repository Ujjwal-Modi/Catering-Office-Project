import { requireAuth } from "../auth.js";
import { renderShell } from "../layout.js";
import { listVendors, getVendorRates, listProjects, listPayments, addPayment, deletePayment, loadProjectData } from "../data.js";
import { receivedValue, orderedValue } from "../metrics.js";
import {
  $, esc, num, toast, errorText, openModal, confirmDialog, options, emptyState, fmtMoney, fmtDate, todayISO, qs, PAYMENT_MODES,
} from "../ui.js";
import { downloadXlsx } from "../export.js";

const state = { vendors: [], rates: {}, projects: [], payments: [], entries: [] };

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "payments", title: "Vendor Payments" });
await load();
bind();

async function load() {
  try {
    [state.vendors, state.rates, state.projects, state.payments] =
      await Promise.all([listVendors(), getVendorRates(), listProjects(), listPayments()]);
    ({ entries: state.entries } = await loadProjectData(state.projects, { photos: false }));
    const cur = $("#vendor-filter").value || qs("vendor") || "";
    $("#vendor-filter").innerHTML = options(state.vendors.map((v) => ({ value: v.id, label: `${v.name} (${v.type})` })), cur, { placeholder: "All vendors" });
    $("#project-filter").innerHTML = options(state.projects.map((p) => ({ value: p.id, label: p.name })), $("#project-filter").value, { placeholder: "All projects" });
    render();
  } catch (err) {
    $("#ledger").innerHTML = emptyState(errorText(err), "⚠️");
  }
}

function bind() {
  $("#new-btn").onclick = () => paymentDialog();
  $("#export-btn").onclick = exportLedger;
  ["#vendor-filter", "#project-filter", "#from", "#to"].forEach((s) => ($(s).onchange = render));
}

function filters() {
  return { vendor: $("#vendor-filter").value, project: $("#project-filter").value, from: $("#from").value, to: $("#to").value };
}

const inRange = (d, f) => (!f.from || d >= f.from) && (!f.to || d <= f.to);

/** Per-vendor: value received (qty × rate), payments made, balance due. */
function computeLedger() {
  const f = filters();
  const entries = state.entries.filter((e) => (!f.project || e.projectId === f.project) && inRange(e.date, f));
  const payments = state.payments.filter((p) => (!f.project || p.projectId === f.project) && inRange(p.date, f));
  const rows = state.vendors
    .filter((v) => !f.vendor || v.id === f.vendor)
    .map((v) => {
      const mine = entries.filter((e) => e.vendorId === v.id);
      const ordered = mine.reduce((s, e) => s + orderedValue(e, state.rates), 0);
      const received = mine.reduce((s, e) => s + receivedValue(e, state.rates), 0);
      const paid = payments.filter((p) => p.vendorId === v.id).reduce((s, p) => s + num(p.amount), 0);
      return { v, items: mine.length, ordered, received, paid, balance: received - paid };
    })
    .filter((r) => f.vendor || r.items || r.paid);
  return { rows, payments: payments.filter((p) => !f.vendor || p.vendorId === f.vendor) };
}

function render() {
  const { rows, payments } = computeLedger();
  const tot = rows.reduce((t, r) => ({ received: t.received + r.received, paid: t.paid + r.paid, balance: t.balance + r.balance }), { received: 0, paid: 0, balance: 0 });

  $("#totals").innerHTML = [
    ["Goods received (value)", tot.received],
    ["Paid", tot.paid],
    ["Balance due", tot.balance],
  ].map(([l, v]) => `<div class="card stat"><div class="stat-label">${l}</div><div class="stat-value" style="font-size:1.4rem">${fmtMoney(v)}</div></div>`).join("");

  const noRate = rows.filter((r) => r.items && !state.rates[r.v.id]).length;
  $("#rate-warning").hidden = !noRate;
  $("#rate-warning").innerHTML = `⚠️ ${noRate} vendor(s) have items but no rate set — their value shows as ₹0. Set rates on the <a href="vendors.html">Vendors</a> page.`;

  $("#ledger").innerHTML = rows.length ? `
    <div class="table-wrap"><table class="table responsive">
      <thead><tr><th>Vendor</th><th class="num">Items</th><th class="num">Rate</th><th class="num">Ordered value</th><th class="num">Received value</th><th class="num">Paid</th><th class="num">Balance</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td data-label="Vendor"><span class="strong">${esc(r.v.name)}</span> <span class="xs muted">${esc(r.v.type)}</span></td>
          <td data-label="Items" class="num">${r.items}</td>
          <td data-label="Rate" class="num">${state.rates[r.v.id] ? `${fmtMoney(state.rates[r.v.id])}/${esc(r.v.unit)}` : "—"}</td>
          <td data-label="Ordered value" class="num">${fmtMoney(r.ordered)}</td>
          <td data-label="Received value" class="num">${fmtMoney(r.received)}</td>
          <td data-label="Paid" class="num">${fmtMoney(r.paid)}</td>
          <td data-label="Balance" class="num strong" style="color:${r.balance > 0.005 ? "var(--danger)" : "var(--ok)"}">${fmtMoney(r.balance)}</td>
        </tr>`).join("")}
      </tbody></table></div>` : emptyState("No vendor activity for these filters.");

  const vName = (id) => state.vendors.find((v) => v.id === id)?.name || "Deleted vendor";
  const pName = (id) => state.projects.find((p) => p.id === id)?.name || "—";
  $("#payments").innerHTML = payments.length ? `
    <div class="table-wrap"><table class="table responsive">
      <thead><tr><th>Date</th><th>Vendor</th><th>Project</th><th>Mode</th><th>Reference</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${payments.map((p) => `
        <tr data-id="${p.id}">
          <td data-label="Date">${fmtDate(p.date)}</td>
          <td data-label="Vendor">${esc(vName(p.vendorId))}</td>
          <td data-label="Project">${esc(pName(p.projectId))}</td>
          <td data-label="Mode">${esc(p.mode)}</td>
          <td data-label="Reference">${esc(p.reference || "")}${p.note ? `<div class="xs muted">${esc(p.note)}</div>` : ""}</td>
          <td data-label="Amount" class="num strong">${fmtMoney(p.amount)}</td>
          <td class="actions"><button class="icon-btn danger" data-del="${p.id}" title="Delete">🗑</button></td>
        </tr>`).join("")}
      </tbody></table></div>` : emptyState("No payments recorded.", "💳");

  $("#payments").onclick = async (e) => {
    const id = e.target.closest("[data-del]")?.dataset.del;
    if (!id || !(await confirmDialog("Delete this payment record?"))) return;
    try {
      await deletePayment(id);
      state.payments = state.payments.filter((p) => p.id !== id);
      toast("Payment deleted", "success");
      render();
    } catch (err) {
      toast(errorText(err), "error");
    }
  };
}

function paymentDialog() {
  const f = filters();
  openModal({
    title: "Record payment",
    body: `
      <div class="form-grid cols-2">
        <div class="field span-all"><label class="req">Vendor</label>
          <select name="vendorId" required>${options(state.vendors.map((v) => ({ value: v.id, label: `${v.name} (${v.type})` })), f.vendor, { placeholder: "Select vendor" })}</select></div>
        <div class="field"><label class="req">Amount (₹)</label><input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required /></div>
        <div class="field"><label class="req">Date</label><input name="date" type="date" value="${todayISO()}" required /></div>
        <div class="field"><label>Mode</label><select name="mode">${options(PAYMENT_MODES, "UPI")}</select></div>
        <div class="field"><label>Reference / UTR / cheque no.</label><input name="reference" /></div>
        <div class="field span-all"><label>Against project (optional)</label>
          <select name="projectId">${options(state.projects.map((p) => ({ value: p.id, label: p.name })), f.project, { placeholder: "General / not project specific" })}</select></div>
        <div class="field span-all"><label>Note</label><input name="note" /></div>
      </div>`,
    onSubmit: async (fd) => {
      const data = Object.fromEntries(fd.entries());
      data.amount = num(data.amount);
      await addPayment(data);
      toast("Payment recorded", "success");
      await load();
    },
  });
}

function exportLedger() {
  const { rows, payments } = computeLedger();
  const vName = (id) => state.vendors.find((v) => v.id === id)?.name || "";
  const pName = (id) => state.projects.find((p) => p.id === id)?.name || "";
  downloadXlsx(`vendor-payments-${todayISO()}.xlsx`, [
    {
      name: "Balances",
      rows: rows.map((r) => ({
        Vendor: r.v.name, Type: r.v.type, Phone: r.v.phone || "", Items: r.items,
        "Rate/Unit": state.rates[r.v.id] || 0, Unit: r.v.unit,
        "Ordered Value": r.ordered, "Received Value": r.received, Paid: r.paid, Balance: r.balance,
      })),
    },
    {
      name: "Payments",
      rows: payments.map((p) => ({
        Date: p.date, Vendor: vName(p.vendorId), Project: pName(p.projectId), Mode: p.mode,
        Reference: p.reference || "", Note: p.note || "", Amount: num(p.amount),
      })),
    },
  ]);
}
