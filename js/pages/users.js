import { auth } from "../firebase.js";
import { sendPasswordResetEmail } from "../sdk.js";
import { requireAuth, ROLES, toEmail, loginLabel, isUsernameLogin } from "../auth.js";
import { renderShell } from "../layout.js";
import { listUsers, createUser, updateUser, listProjects } from "../data.js";
import { $, esc, toast, errorText, openModal, options, debounce, emptyState, confirmDialog } from "../ui.js";

const state = { users: [], projects: [] };

const profile = await requireAuth({ admin: true });
renderShell(profile, { active: "users", title: "Users & Admins" });
await load();
bind();

async function load() {
  try {
    [state.users, state.projects] = await Promise.all([listUsers(), listProjects()]);
    render();
  } catch (err) {
    $("#list").innerHTML = emptyState(errorText(err), "⚠️");
  }
}

function bind() {
  $("#new-btn").onclick = () => createDialog();
  $("#search").oninput = debounce(render);
  $("#role-filter").onchange = render;
  $("#list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const u = state.users.find((x) => x.uid === btn.closest("[data-id]").dataset.id);
    if (btn.dataset.action === "edit") editDialog(u);
    if (btn.dataset.action === "reset") resetPassword(u);
  });
}

const canEdit = (u) => u.role !== "root" || u.uid === profile.uid;
const assignedCount = (uid) => state.projects.filter((p) => (p.assignedUsers || []).includes(uid)).length;

function render() {
  const term = $("#search").value.trim().toLowerCase();
  const role = $("#role-filter").value;
  const list = state.users.filter((u) => {
    if (role === "admin" && !["admin", "root"].includes(u.role)) return false;
    if (role === "user" && u.role !== "user") return false;
    if (role === "inactive" && u.active) return false;
    return !term || [u.name, u.email, u.phone].join(" ").toLowerCase().includes(term);
  });

  if (!list.length) {
    $("#list").innerHTML = emptyState("No users found.");
    return;
  }
  $("#list").innerHTML = `
    <div class="table-wrap">
      <table class="table responsive">
        <thead><tr><th>Name</th><th>Login ID</th><th>Phone</th><th>Role</th><th class="num">Projects</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.map((u) => `
            <tr data-id="${u.uid}">
              <td data-label="Name"><span class="strong">${esc(u.name)}</span>${u.uid === profile.uid ? ' <span class="xs muted">(you)</span>' : ""}</td>
              <td data-label="Login ID">${esc(loginLabel(u.email))}</td>
              <td data-label="Phone">${u.phone ? `<a href="tel:${esc(u.phone)}">${esc(u.phone)}</a>` : "—"}</td>
              <td data-label="Role"><span class="badge ${u.role === "user" ? "badge-gray" : "badge-teal"}">${ROLES[u.role]}</span></td>
              <td data-label="Projects" class="num">${u.role === "user" ? assignedCount(u.uid) : "All"}</td>
              <td data-label="Status">${u.active ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-red">Inactive</span>'}</td>
              <td class="actions nowrap">
                ${!isUsernameLogin(u.email) && canEdit(u) ? '<button class="icon-btn" data-action="reset" title="Send password reset email">🔑</button>' : ""}
                ${canEdit(u) ? '<button class="icon-btn" data-action="edit" title="Edit">✎</button>' : '<span class="xs muted">Protected</span>'}
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

const roleOptions = (sel) => options([{ value: "user", label: "Staff (field user)" }, { value: "admin", label: "Admin (full access)" }], sel);

function createDialog() {
  openModal({
    title: "Create user",
    submitLabel: "Create",
    body: `
      <div class="form-grid cols-2">
        <div class="field span-all"><label class="req">Full name</label><input name="name" required /></div>
        <div class="field"><label>Phone</label><input name="phone" type="tel" inputmode="tel" /></div>
        <div class="field"><label class="req">Role</label><select name="role">${roleOptions("user")}</select></div>
        <div class="field">
          <label class="req">Email or username</label>
          <input name="loginId" required autocapitalize="none" autocomplete="off" />
          <span class="hint">Staff without email can use a username like "ramesh01".</span>
        </div>
        <div class="field">
          <label class="req">Password</label>
          <input name="password" type="text" minlength="6" required autocomplete="off" />
          <span class="hint">Min 6 characters. Share it with the user.</span>
        </div>
      </div>`,
    onSubmit: async (fd) => {
      const loginId = fd.get("loginId").trim();
      if (!/^[a-z0-9._@+-]+$/i.test(loginId)) {
        toast("Login ID may use letters, numbers, dot, dash and underscore only.", "error");
        return false;
      }
      await createUser({
        email: toEmail(loginId),
        password: fd.get("password"),
        name: fd.get("name").trim(),
        phone: fd.get("phone").trim(),
        role: fd.get("role"),
      });
      toast("User created", "success");
      await load();
    },
  });
}

function editDialog(u) {
  const self = u.uid === profile.uid;
  const isRoot = u.role === "root";
  openModal({
    title: `Edit ${u.name}`,
    body: `
      <div class="form-grid cols-2">
        <div class="field span-all"><label class="req">Full name</label><input name="name" required value="${esc(u.name)}" /></div>
        <div class="field"><label>Phone</label><input name="phone" type="tel" value="${esc(u.phone)}" /></div>
        <div class="field">
          <label>Role</label>
          ${isRoot ? `<input value="Root Admin" disabled />` : `<select name="role" ${self ? "disabled" : ""}>${roleOptions(u.role)}</select>`}
        </div>
        <div class="field span-all"><label>Login ID</label><input value="${esc(loginLabel(u.email))}" disabled /></div>
        ${self || isRoot ? "" : `
          <label class="check span-all"><input type="checkbox" name="active" ${u.active ? "checked" : ""}/> <span>Active — untick to block this login immediately</span></label>`}
        ${isUsernameLogin(u.email) && !self ? `
          <p class="small muted span-all">Forgot password? Untick “Active”, then create a new login for this person.</p>` : ""}
      </div>`,
    onSubmit: async (fd) => {
      const data = { name: fd.get("name").trim(), phone: fd.get("phone").trim() };
      if (!isRoot) {
        data.role = self ? u.role : fd.get("role");
        data.active = self ? true : fd.get("active") === "on";
      }
      if (!isRoot && !self && u.active && !data.active) {
        if (!(await confirmDialog(`Block ${u.name}? They will be signed out and can't log in.`, { okLabel: "Block" }))) return false;
      }
      await updateUser(u.uid, data);
      toast("User updated", "success");
      await load();
    },
  });
}

async function resetPassword(u) {
  if (!(await confirmDialog(`Send a password reset email to ${u.email}?`, { okLabel: "Send", danger: false }))) return;
  try {
    await sendPasswordResetEmail(auth, u.email);
    toast("Reset email sent", "success");
  } catch (err) {
    toast(errorText(err), "error");
  }
}
