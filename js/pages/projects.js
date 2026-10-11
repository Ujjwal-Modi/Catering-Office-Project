import { requireAuth } from "../auth.js";
import { renderShell } from "../layout.js";
import { watchProjects, watchUsers, getMasters, saveProject, deleteProject, setStaffAccess } from "../data.js";
import {
  $, esc, num, toast, errorText, openModal, confirmDialog, options, debounce, emptyState,
  projectStatus, STATUS_BADGE, FREEZE, rangeLabel, todayISO, fmtNum, accessFor, accessBadges,
} from "../ui.js";

const state = { projects: [], users: [], masters: {}, ready: { projects: false, users: false } };

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "projects", title: "Projects" });
bind();
load();

/**
 * Live listeners instead of one-off reads: the list appears as soon as the
 * server answers (even if the first answer came from an empty offline cache)
 * and stays up to date after edits.
 */
function load() {
  const showError = (err) => ($("#list").innerHTML = emptyState(errorText(err), "⚠️"));
  watchProjects((list, ready) => { state.projects = list; state.ready.projects ||= ready; render(); }, showError);
  watchUsers((list, ready) => { state.users = list; state.ready.users ||= ready; render(); }, showError);
  getMasters().then((m) => (state.masters = m)).catch(() => {});
}

function bind() {
  $("#new-btn").onclick = () => editProject();
  $("#search").oninput = debounce(render);
  $("#status-filter").onchange = render;
  $("#freeze-filter").onchange = render;

  $("#list").addEventListener("click", async (e) => {
    const card = e.target.closest("[data-id]");
    if (!card || e.target.closest("select, label, .staff-access")) return;
    const p = state.projects.find((x) => x.id === card.dataset.id);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return (location.href = `project.html?id=${p.id}`);
    e.preventDefault();
    if (action === "edit") editProject(p);
    if (action === "delete") removeProject(p);
  });

  // Quick per-staff access change from the project card.
  $("#list").addEventListener("change", async (e) => {
    if (!e.target.matches("[data-access]")) return;
    const id = e.target.closest("[data-id]").dataset.id;
    const uid = e.target.dataset.access;
    try {
      await setStaffAccess(id, uid, e.target.value);
      toast(`${userName(uid)}: ${FREEZE[e.target.value].label}`, "success");
    } catch (err) {
      toast(errorText(err), "error");
      render();
    }
  });
}

const userName = (uid) => state.users.find((u) => u.uid === uid)?.name || "Removed user";

function render() {
  if (!state.ready.projects || !state.ready.users) return;
  const term = $("#search").value.trim().toLowerCase();
  const status = $("#status-filter").value;
  const freeze = $("#freeze-filter").value;

  const list = state.projects.filter((p) => {
    if (status && projectStatus(p) !== status) return false;
    if (freeze && !(p.assignedUsers || []).some((uid) => accessFor(p, uid) === freeze)) return false;
    if (!term) return true;
    return [p.name, p.venue, p.eventType, p.remark].join(" ").toLowerCase().includes(term);
  });

  $("#count").textContent = `${list.length} of ${state.projects.length}`;
  if (!list.length) {
    $("#list").innerHTML = emptyState(state.projects.length ? "No projects match your filters." : "No projects yet. Create your first project.");
    return;
  }

  $("#list").innerHTML = list.map((p) => {
    const st = projectStatus(p);
    const assigned = p.assignedUsers || [];
    return `
    <article class="card project-card" data-id="${p.id}">
      <div class="between">
        <div class="gap">
          <span class="badge ${STATUS_BADGE[st]}">${st}</span>
          ${assigned.length ? accessBadges(p) : ""}
        </div>
        <div class="gap">
          <button class="icon-btn" data-action="edit" title="Edit">✎</button>
          <button class="icon-btn danger" data-action="delete" title="Delete">🗑</button>
        </div>
      </div>
      <h3 class="mt">${esc(p.name)}</h3>
      <div class="meta">
        <span>📅 ${rangeLabel(p)}</span>
        ${p.venue ? `<span>📍 ${esc(p.venue)}</span>` : ""}
        ${p.eventType ? `<span>🎉 ${esc(p.eventType)}</span>` : ""}
        ${p.pax ? `<span>👥 ${fmtNum(p.pax)} pax</span>` : ""}
      </div>
      ${assigned.length ? `
        <div class="staff-access mt">
          <span class="xs muted">Staff access</span>
          ${assigned.map((uid) => `
            <div class="staff-access-row">
              <label class="small" for="ac-${p.id}-${uid}">${esc(userName(uid))}</label>
              <select id="ac-${p.id}-${uid}" data-access="${uid}" class="access-${accessFor(p, uid)}">
                ${options(Object.entries(FREEZE).map(([value, f]) => ({ value, label: f.label })), accessFor(p, uid))}
              </select>
            </div>`).join("")}
        </div>` : `<p class="small muted mt">Not assigned to anyone</p>`}
    </article>`;
  }).join("");
}

async function editProject(p = null) {
  if (!state.ready.users) return toast("Still loading staff list, try again in a moment.");
  if (!state.masters.eventTypes) state.masters = await getMasters().catch(() => ({}));
  const staff = state.users.filter((u) => u.active && u.role === "user");
  const assigned = new Set(p?.assignedUsers || []);
  const eventTypes = [...new Set([...(state.masters.eventTypes || []), ...(p?.eventType ? [p.eventType] : [])])];

  const { el } = openModal({
    title: p ? "Edit project" : "New project",
    wide: true,
    submitLabel: p ? "Save changes" : "Create project",
    body: `
      <div class="form-grid cols-2">
        <div class="field span-all">
          <label class="req">Project name</label>
          <input name="name" required value="${esc(p?.name)}" placeholder="e.g. Sharma Wedding" />
        </div>
        <div class="field">
          <label class="req">Start date</label>
          <input name="startDate" type="date" required value="${esc(p?.startDate || todayISO())}" />
        </div>
        <div class="field">
          <label class="req">End date</label>
          <input name="endDate" type="date" required value="${esc(p?.endDate || todayISO())}" />
        </div>
        <div class="field">
          <label>Venue</label>
          <input name="venue" value="${esc(p?.venue)}" />
        </div>
        <div class="field">
          <label>Event type</label>
          <select name="eventType">${options(eventTypes, p?.eventType, { placeholder: "Select…" })}</select>
        </div>
        <div class="field">
          <label>Pax (guests)</label>
          <input name="pax" type="number" min="0" inputmode="numeric" value="${esc(p?.pax ?? "")}" />
        </div>
        <div class="field">
          <label>Contact person / phone</label>
          <input name="contact" value="${esc(p?.contact)}" placeholder="Optional" />
        </div>
        <div class="field span-all">
          <label>Remark</label>
          <textarea name="remark">${esc(p?.remark)}</textarea>
        </div>
        <div class="field span-all">
          <label>Assign staff &amp; set their access</label>
          ${staff.length
            ? `<div class="check-list staff-pick">${staff.map((u) => `
                <div class="staff-pick-row">
                  <label class="check"><input type="checkbox" name="assigned" value="${u.uid}" ${assigned.has(u.uid) ? "checked" : ""}/>
                  <span>${esc(u.name)} <span class="muted xs">${esc(u.phone || "")}</span></span></label>
                  <select name="access-${u.uid}" aria-label="Access for ${esc(u.name)}" ${assigned.has(u.uid) ? "" : "disabled"}>
                    ${options(Object.entries(FREEZE).map(([value, f]) => ({ value, label: f.label })), p ? accessFor(p, u.uid) : "none")}
                  </select>
                </div>`).join("")}</div>`
            : `<p class="small muted">No active staff users. Create them on the Users page.</p>`}
          <span class="hint">Open: can add/edit · View only: can open but not edit · Locked: can't open.</span>
        </div>
      </div>`,
    onSubmit: async (fd) => {
      const data = {
        name: fd.get("name").trim(),
        startDate: fd.get("startDate"),
        endDate: fd.get("endDate"),
        venue: fd.get("venue").trim(),
        eventType: fd.get("eventType"),
        pax: num(fd.get("pax")),
        contact: fd.get("contact").trim(),
        remark: fd.get("remark").trim(),
        assignedUsers: fd.getAll("assigned"),
        // Access is per staff member now; the old project-wide setting is reset to Open.
        staffAccess: Object.fromEntries(fd.getAll("assigned").map((uid) => [uid, fd.get(`access-${uid}`) || "none"])),
        freeze: "none",
      };
      if (data.endDate < data.startDate) {
        toast("End date can't be before start date.", "error");
        return false;
      }
      await saveProject(p?.id, data);
      toast(p ? "Project updated" : "Project created", "success");
    },
  });

  // Access dropdown is only active for ticked staff.
  el.addEventListener("change", (e) => {
    if (e.target.name !== "assigned") return;
    el.querySelector(`[name="access-${e.target.value}"]`).disabled = !e.target.checked;
  });
}

async function removeProject(p) {
  const ok = await confirmDialog(`Delete "${p.name}"? All its items and photos will be permanently deleted.`);
  if (!ok) return;
  try {
    toast("Deleting…");
    await deleteProject(p.id);
    toast("Project deleted", "success");
  } catch (err) {
    toast(errorText(err), "error");
  }
}
