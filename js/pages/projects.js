import { requireAuth } from "../auth.js";
import { renderShell } from "../layout.js";
import { listProjects, listUsers, getMasters, saveProject, deleteProject, setFreeze } from "../data.js";
import {
  $, esc, num, toast, errorText, openModal, confirmDialog, options, debounce, emptyState,
  projectStatus, STATUS_BADGE, FREEZE, rangeLabel, todayISO, fmtNum,
} from "../ui.js";

const state = { projects: [], users: [], masters: {} };

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "projects", title: "Projects" });
await load();
bind();

async function load() {
  try {
    [state.projects, state.users, state.masters] = await Promise.all([listProjects(), listUsers(), getMasters()]);
    render();
  } catch (err) {
    $("#list").innerHTML = emptyState(errorText(err), "⚠️");
  }
}

function bind() {
  $("#new-btn").onclick = () => editProject();
  $("#search").oninput = debounce(render);
  $("#status-filter").onchange = render;
  $("#freeze-filter").onchange = render;

  $("#list").addEventListener("click", async (e) => {
    const card = e.target.closest("[data-id]");
    if (!card || e.target.closest("select, label")) return;
    const p = state.projects.find((x) => x.id === card.dataset.id);
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return (location.href = `project.html?id=${p.id}`);
    e.preventDefault();
    if (action === "edit") editProject(p);
    if (action === "delete") removeProject(p);
  });

  $("#list").addEventListener("change", async (e) => {
    if (!e.target.matches("[data-freeze]")) return;
    const id = e.target.closest("[data-id]").dataset.id;
    try {
      await setFreeze(id, e.target.value);
      state.projects.find((x) => x.id === id).freeze = e.target.value;
      toast(`Project set to "${FREEZE[e.target.value].label}"`, "success");
      render();
    } catch (err) {
      toast(errorText(err), "error");
    }
  });
}

const userName = (uid) => state.users.find((u) => u.uid === uid)?.name || "Removed user";

function render() {
  const term = $("#search").value.trim().toLowerCase();
  const status = $("#status-filter").value;
  const freeze = $("#freeze-filter").value;

  const list = state.projects.filter((p) => {
    if (status && projectStatus(p) !== status) return false;
    if (freeze && (p.freeze || "none") !== freeze) return false;
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
    const fz = p.freeze || "none";
    const assigned = (p.assignedUsers || []).map(userName);
    return `
    <article class="card project-card" data-id="${p.id}">
      <div class="between">
        <div class="gap">
          <span class="badge ${STATUS_BADGE[st]}">${st}</span>
          <span class="badge ${FREEZE[fz].badge}">${FREEZE[fz].label}</span>
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
      <p class="small muted mt">${assigned.length ? `Assigned: ${esc(assigned.join(", "))}` : "Not assigned to anyone"}</p>
      <div class="between mt">
        <label class="small muted" for="fz-${p.id}">Access</label>
        <select id="fz-${p.id}" data-freeze style="max-width:180px">
          ${options(Object.entries(FREEZE).map(([value, f]) => ({ value, label: f.label })), fz)}
        </select>
      </div>
    </article>`;
  }).join("");
}

function editProject(p = null) {
  const staff = state.users.filter((u) => u.active && u.role === "user");
  const assigned = new Set(p?.assignedUsers || []);
  const fz = p?.freeze || "none";
  const eventTypes = [...new Set([...(state.masters.eventTypes || []), ...(p?.eventType ? [p.eventType] : [])])];

  openModal({
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
          <label>Assign staff</label>
          ${staff.length
            ? `<div class="check-list">${staff.map((u) => `
                <label class="check"><input type="checkbox" name="assigned" value="${u.uid}" ${assigned.has(u.uid) ? "checked" : ""}/>
                <span>${esc(u.name)} <span class="muted xs">${esc(u.phone || "")}</span></span></label>`).join("")}</div>`
            : `<p class="small muted">No active staff users. Create them on the Users page.</p>`}
        </div>
        <div class="field span-all">
          <label>Access for staff</label>
          <div class="segmented">
            ${Object.entries(FREEZE).map(([value, f]) => `
              <input type="radio" id="fz-${value}" name="freeze" value="${value}" ${fz === value ? "checked" : ""}/>
              <label for="fz-${value}">${f.label}</label>`).join("")}
          </div>
          <span class="hint">Open: staff can add/edit · View only: staff can open but not edit · Locked: staff can't open.</span>
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
        freeze: fd.get("freeze") || "none",
      };
      if (data.endDate < data.startDate) {
        toast("End date can't be before start date.", "error");
        return false;
      }
      await saveProject(p?.id, data);
      toast(p ? "Project updated" : "Project created", "success");
      await load();
    },
  });
}

async function removeProject(p) {
  const ok = await confirmDialog(`Delete "${p.name}"? All its items and photos will be permanently deleted.`);
  if (!ok) return;
  try {
    toast("Deleting…");
    await deleteProject(p.id);
    toast("Project deleted", "success");
    await load();
  } catch (err) {
    toast(errorText(err), "error");
  }
}
