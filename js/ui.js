/* Shared UI helpers: DOM, formatting, toasts, modals. No Firebase here. */
import { t, locale } from "./i18n.js";

export const SLOTS = ["Morning", "Afternoon", "Evening", "Night"];
export const PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Other"];
export const FREEZE = {
  none: { label: "Open", badge: "badge-green" },
  readonly: { label: "View only", badge: "badge-amber" },
  locked: { label: "Locked", badge: "badge-red" },
};

/** A staff member's access to a project: per-staff setting, falling back to the old project-wide one. */
export const accessFor = (p, uid) => p?.staffAccess?.[uid] || p?.freeze || "none";

/** Counts of assigned staff per access mode, e.g. { none: 2, readonly: 1, locked: 0 }. */
export function accessCounts(p) {
  const c = { none: 0, readonly: 0, locked: 0 };
  (p?.assignedUsers || []).forEach((uid) => c[accessFor(p, uid)]++);
  return c;
}

/** Short text such as "Open" or "2 open · 1 view only". */
export function accessSummary(p) {
  const c = accessCounts(p);
  if (!c.readonly && !c.locked) return "Open";
  return Object.entries(c).filter(([, n]) => n).map(([k, n]) => `${n} ${FREEZE[k].label.toLowerCase()}`).join(" · ");
}

/** Badges for the access summary (one "Open" badge when nobody is restricted). */
export function accessBadges(p) {
  const c = accessCounts(p);
  if (!c.readonly && !c.locked) return `<span class="badge ${FREEZE.none.badge}">Open</span>`;
  return Object.entries(c).filter(([, n]) => n)
    .map(([k, n]) => `<span class="badge ${FREEZE[k].badge}">${n} ${FREEZE[k].label.toLowerCase()}</span>`).join("");
}

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
  num(v).toLocaleString(locale(), { maximumFractionDigits: 2 });

export const fmtMoney = (v) =>
  (num(v) < 0 ? "−₹" : "₹") +
  Math.abs(num(v)).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  return new Date(y, m - 1, d).toLocaleDateString(locale(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function fmtDay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export function fmtDateTime(ts) {
  if (!ts) return "";
  const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return d.toLocaleString(locale(), {
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
  el.textContent = t(message);
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
  return t(map[code] || err?.message || "Something went wrong.");
}

export function setBusy(btn, busy, busyText = "Saving…") {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="spinner"></span> ${esc(t(busyText))}`;
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
  return `<div class="empty"><div class="empty-icon">${icon}</div><p>${esc(t(message))}</p></div>`;
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
        <h3>${esc(t(title))}</h3>
        <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
      </header>
      <div class="modal-body">${body}</div>
      ${
        footer
          ? `<footer class="modal-foot">
              <button type="button" class="btn btn-ghost" data-close>${t(onSubmit ? "Cancel" : "Close")}</button>
              ${onSubmit ? `<button type="submit" class="btn btn-primary">${esc(t(submitLabel))}</button>` : ""}
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
      body: `<p>${esc(t(message))}</p>`,
      footer: false,
    });
    el.insertAdjacentHTML(
      "beforeend",
      `<footer class="modal-foot">
        <button type="button" class="btn btn-ghost" data-no>${t("Cancel")}</button>
        <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes>${esc(t(okLabel))}</button>
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

/** Adds an eye button to every password field so people can see what they type. */
export function addPasswordToggles(root = document) {
  root.querySelectorAll('input[type="password"]').forEach((input) => {
    if (input.closest(".pw-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "pw-wrap";
    input.replaceWith(wrap);
    wrap.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-eye";
    const EYE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 5c-5 0-9.3 3.1-11 7 1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>';
    const EYE_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M2.1 3.5 3.5 2.1l18.4 18.4-1.4 1.4-3.2-3.2A12 12 0 0 1 12 19c-5 0-9.3-3.1-11-7a12.6 12.6 0 0 1 4-4.9zm5.6 5.6a4.5 4.5 0 0 0 6.2 6.2l-1.5-1.5a2.5 2.5 0 0 1-3.2-3.2zM12 5c5 0 9.3 3.1 11 7a12.4 12.4 0 0 1-3.3 4.4l-3.3-3.3A4.5 4.5 0 0 0 10.9 7.6L8.6 5.3A12 12 0 0 1 12 5z"/></svg>';
    const sync = () => {
      const shown = input.type === "text";
      btn.innerHTML = shown ? EYE_OFF : EYE;
      btn.setAttribute("aria-label", t(shown ? "Hide password" : "Show password"));
      btn.title = btn.getAttribute("aria-label");
    };
    // mousedown keeps focus (and the phone keyboard) on the field.
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => { input.type = input.type === "password" ? "text" : "password"; sync(); });
    // Hide again after submitting so the browser can offer to save it.
    input.form?.addEventListener("submit", () => { input.type = "password"; sync(); });
    sync();
    wrap.appendChild(btn);
  });
}

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}
