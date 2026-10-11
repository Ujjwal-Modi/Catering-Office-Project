import { auth, db, isConfigured } from "../firebase.js";
import { createUserWithEmailAndPassword, doc, getDoc, writeBatch, serverTimestamp } from "../sdk.js";
import { DEFAULT_MASTERS } from "../data.js";
import { $, toast, errorText, setBusy } from "../ui.js";

const form = $("#setup-form");

if (!isConfigured) {
  $("#done").innerHTML = "Configure Firebase in <b>js/firebase-config.js</b> first (see README).";
  $("#done").hidden = false;
} else {
  getDoc(doc(db, "meta", "setup")).then((snap) => {
    if (snap.exists()) $("#done").hidden = false;
    else form.hidden = false;
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!form.checkValidity()) return form.reportValidity();
  const btn = form.querySelector("button");
  setBusy(btn, true, "Creating…");
  let user;
  try {
    const cred = await createUserWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
    user = cred.user;

    // Atomic: root profile + setup marker + default master lists.
    const batch = writeBatch(db);
    batch.set(doc(db, "users", user.uid), {
      name: form.name.value.trim(),
      phone: form.phone.value.trim(),
      email: user.email,
      role: "root",
      active: true,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "meta", "setup"), { rootUid: user.uid, createdAt: serverTimestamp() });
    batch.set(doc(db, "masters", "lists"), DEFAULT_MASTERS);
    await batch.commit();

    toast("Root admin created", "success");
    location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    // Roll back the login if the profile could not be written (e.g. setup already done).
    if (user) await user.delete().catch(() => {});
    toast(errorText(err), "error");
  } finally {
    setBusy(btn, false);
  }
});
