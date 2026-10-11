/* Shared UI helpers: DOM, formatting, toasts, modals. No Firebase here. */

export const SLOTS = ["Morning", "Afternoon", "Evening", "Night"];
export const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Other"];
export const FREEZE = {
  none: { label: "Open", badge: "badge-green" },
  readonly: { label: "View only", badge: "badge-amber" },
  locked: { label: "Locked", badge: "badge-red" },
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmtNum = (v) =>
  num(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const fmtMoney = (v) =>
  (num(v) < 0 ? "−₹" : "₹") +
  Math.abs(num(v)).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------------- Dates (stored as "YYYY-MM-DD" strings) ---------------- */

export function todayISO() {
  const d = new Date();
  return toISO(d);
}

export function toISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function fmtDateTime(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function datesBetween(start, end) {
  const out = [];
  if (!start || !end) return out;
  const [y, m, d] = start.split("-").map(Number);
  const cur = new Date(y, m - 1, d);
  for (let i = 0; i < 400 && toISO(cur) <= end; i++) {
    out.push(toISO(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function projectStatus(p) {
  const t = todayISO();
  if (p.endDate < t) return "completed";
  if (p.startDate > t) return "upcoming";
  return "ongoing";
}

export const STATUS_BADGE = {
  upcoming: "badge-blue",
  ongoing: "badge-green",
  completed: "badge-gray",
};

export function rangeLabel(p) {
  return p.startDate === p.endDate
    ? fmtDate(p.startDate)
    : `${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}`;
}

/* ---------------- Feedback ---------------- */

export function toast(message, type = "info") {
  let host = $("#toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.classList.add("hide"), 3200);
  setTimeout(() => el.remove(), 3600);
}

export function errorText(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-credential": "Wrong login ID or password.",
    "auth/wrong-password": "Wrong login ID or password.",
    "auth/user-not-found": "Wrong login ID or password.",
    "auth/email-already-in-use": "That login ID is already taken.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Login ID is not valid.",
    "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
    "auth/network-request-failed": "No internet connection.",
    "permission-denied": "You don't have permission to do that.",
    "unavailable": "Can't reach the server. Check your internet.",
  };
  return map[code] || err?.message || "Something went wrong.";
}

export function setBusy(btn, busy, busyText = "Saving…") {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${esc(busyText)}`;
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.label || btn.innerHTML;
    btn.disabled = false;
  }
}

/**
 * Run a Firestore write. When offline, writes are queued locally and the
 * promise only resolves after sync — so we don't block the UI on it.
 */
export async function save(promise, okMsg = "Saved") {
  if (!navigator.onLine) {
    promise.catch((e) => toast(errorText(e), "error"));
    toast("Saved offline — will sync when internet returns", "warn");
    return;
  }
  await promise;
  if (okMsg) toast(okMsg, "success");
}

export function emptyState(message, icon = "📋") {
  return `<div class="empty"><div class="empty-icon">${icon}</div><p>${esc(message)}</p></div>`;
}

/* ---------------- Modal ---------------- */

/**
 * openModal({ title, body, submitLabel, onSubmit, wide })
 * body: HTML string. If onSubmit is given, body is wrapped in a <form> and
 * onSubmit(formData, form) is awaited; return false to keep the modal open.
 */
export function openModal({ title, body, submitLabel = "Save", onSubmit, wide = false, footer = true }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const tag = onSubmit ? "form" : "div";
  backdrop.innerHTML = `
    <${tag} class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" ${onSubmit ? "novalidate" : ""}>
      <header class="modal-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </header>
      <div class="modal-body">${body}</div>
      ${
        footer
          ? `<footer class="modal-foot">
              <button type="button" class="btn btn-ghost" data-close>${onSubmit ? "Cancel" : "Close"}</button>
              ${onSubmit ? `<button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>` : ""}
            </footer>`
          : ""
      }
    </${tag}>`;
  document.body.appendChild(backdrop);
  document.body.classList.add("no-scroll");
  const modal = backdrop.firstElementChild;

  const close = () => {
    backdrop.remove();
    if (!$(".modal-backdrop")) document.body.classList.remove("no-scroll");
  };
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", function onKey(e) {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKey);
    }
  });

  if (onSubmit) {
    modal.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!modal.checkValidity()) {
        modal.reportValidity();
        return;
      }
      const btn = modal.querySelector('button[type="submit"]');
      setBusy(btn, true);
      try {
        const keepOpen = (await onSubmit(new FormData(modal), modal)) === false;
        if (!keepOpen) close();
      } catch (err) {
        console.error(err);
        toast(errorText(err), "error");
      } finally {
        setBusy(btn, false);
      }
    });
  }
  // Autofocus on desktop only — on phones it would pop the keyboard over the form.
  if (window.matchMedia("(min-width: 640px)").matches) {
    modal.querySelector("input:not([type=hidden]):not([disabled]),select,textarea")?.focus();
  }
  return { el: modal, close };
}

export function confirmDialog(message, { okLabel = "Delete", danger = true } = {}) {
  return new Promise((resolve) => {
    const { el, close } = openModal({
      title: "Please confirm",
      body: `<p>${esc(message)}</p>`,
      footer: false,
    });
    el.insertAdjacentHTML(
      "beforeend",
      `<footer class="modal-foot">
        <button type="button" class="btn btn-ghost" data-no>Cancel</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes>${esc(okLabel)}</button>
      </footer>`
    );
    el.querySelector("[data-yes]").onclick = () => { close(); resolve(true); };
    el.querySelector("[data-no]").onclick = () => { close(); resolve(false); };
    el.querySelector("[data-close]").addEventListener("click", () => resolve(false));
  });
}

export function options(list, selected, { placeholder } = {}) {
  const ph = placeholder ? `<option value="">${esc(placeholder)}</option>` : "";
  return (
    ph +
    list
      .map((item) => {
        const value = typeof item === "object" ? item.value : item;
        const label = typeof item === "object" ? item.label : item;
        return `<option value="${esc(value)}" ${String(value) === String(selected ?? "") ? "selected" : ""}>${esc(label)}</option>`;
      })
      .join("")
  );
}

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}
