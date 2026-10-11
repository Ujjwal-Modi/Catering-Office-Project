import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs, query, where } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "demo-catering",
  firestore: { rules: fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log("  ✓", name); } catch (e) { fail++; console.log("  ✗", name, "-", e.message.split("\n")[0]); } }
const db = (uid) => env.authenticatedContext(uid).firestore();

// ---- setup flow
await t("first root setup batch succeeds", () => {
  const d = db("root"); const b = writeBatch(d);
  b.set(doc(d, "users/root"), { name: "Root", role: "root", active: true, email: "r@x.com" });
  b.set(doc(d, "meta/setup"), { rootUid: "root" });
  b.set(doc(d, "masters/lists"), { vendorTypes: ["Dairy"] });
  return assertSucceeds(b.commit());
});
await t("second root setup denied", () => {
  const d = db("evil"); const b = writeBatch(d);
  b.set(doc(d, "users/evil"), { name: "E", role: "root", active: true });
  b.set(doc(d, "meta/setup"), { rootUid: "evil" });
  return assertFails(b.commit());
});
await t("self-create as admin denied", () => assertFails(setDoc(doc(db("x"), "users/x"), { role: "admin", active: true })));

// ---- seed via admin
await t("root creates admin", () => assertSucceeds(setDoc(doc(db("root"), "users/adm"), { name: "Adm", role: "admin", active: true })));
await t("admin creates staff", () => assertSucceeds(setDoc(doc(db("adm"), "users/s1"), { name: "S1", role: "user", active: true })));
await setDoc(doc(db("adm"), "users/s2"), { name: "S2", role: "user", active: true });
await setDoc(doc(db("adm"), "users/off"), { name: "Off", role: "user", active: false });
await t("admin cannot create root", () => assertFails(setDoc(doc(db("adm"), "users/r2"), { role: "root", active: true })));
await t("admin cannot edit root", () => assertFails(updateDoc(doc(db("adm"), "users/root"), { name: "hack" })));
await t("root edits own name", () => assertSucceeds(updateDoc(doc(db("root"), "users/root"), { name: "Root 2" })));
await t("root cannot deactivate self", () => assertFails(updateDoc(doc(db("root"), "users/root"), { active: false })));
await t("staff cannot promote self", () => assertFails(updateDoc(doc(db("s1"), "users/s1"), { role: "admin" })));
await t("staff edits own phone", () => assertSucceeds(updateDoc(doc(db("s1"), "users/s1"), { phone: "123" })));
await t("staff cannot read other users", () => assertFails(getDoc(doc(db("s1"), "users/s2"))));
await t("admin lists users", () => assertSucceeds(getDocs(collection(db("adm"), "users"))));

// ---- vendors
await t("admin writes vendor + rate", async () => {
  await assertSucceeds(setDoc(doc(db("adm"), "vendors/v1"), { type: "Dairy", name: "Milk Co", unit: "litre", active: true }));
  await assertSucceeds(setDoc(doc(db("adm"), "vendorPrivate/v1"), { rate: 50 }));
});
await t("staff reads vendors", () => assertSucceeds(getDocs(collection(db("s1"), "vendors"))));
await t("staff cannot read rates", () => assertFails(getDoc(doc(db("s1"), "vendorPrivate/v1"))));
await t("staff cannot write vendor", () => assertFails(setDoc(doc(db("s1"), "vendors/v2"), { name: "x" })));
await t("inactive user cannot read vendors", () => assertFails(getDocs(collection(db("off"), "vendors"))));

// ---- projects
const P = { name: "Wedding", startDate: "2026-10-10", endDate: "2026-10-12", assignedUsers: ["s1"], freeze: "none" };
await t("admin creates project", () => assertSucceeds(setDoc(doc(db("adm"), "projects/p1"), P)));
await t("bad dates rejected", () => assertFails(setDoc(doc(db("adm"), "projects/bad"), { ...P, endDate: "2026-10-01" })));
await t("staff cannot create project", () => assertFails(setDoc(doc(db("s1"), "projects/p2"), P)));
await t("staff lists assigned projects", () => assertSucceeds(getDocs(query(collection(db("s1"), "projects"), where("assignedUsers", "array-contains", "s1")))));
await t("unassigned staff cannot read project", () => assertFails(getDoc(doc(db("s2"), "projects/p1"))));

const E = { vendorId: "v1", vendorName: "Milk Co", vendorType: "Dairy", unit: "litre", date: "2026-10-11", slot: "Morning",
  orderedQty: 10, receivedQty: 0, remark: "", ordered: false, received: false, createdBy: "s1", createdByName: "S1" };
await t("staff adds item (open project)", () => assertSucceeds(setDoc(doc(db("s1"), "projects/p1/entries/e1"), E)));
await t("staff cannot add pre-ticked item", () => assertFails(setDoc(doc(db("s1"), "projects/p1/entries/e2"), { ...E, ordered: true })));
await t("staff cannot add outside dates", () => assertFails(setDoc(doc(db("s1"), "projects/p1/entries/e3"), { ...E, date: "2026-10-20" })));
await t("staff cannot add bad slot", () => assertFails(setDoc(doc(db("s1"), "projects/p1/entries/e4"), { ...E, slot: "Lunch" })));
await t("unassigned staff cannot add", () => assertFails(setDoc(doc(db("s2"), "projects/p1/entries/e5"), { ...E, createdBy: "s2" })));
await t("staff updates received qty", () => assertSucceeds(updateDoc(doc(db("s1"), "projects/p1/entries/e1"), { receivedQty: 8 })));
await t("staff cannot tick ordered", () => assertFails(updateDoc(doc(db("s1"), "projects/p1/entries/e1"), { ordered: true })));
await t("admin ticks ordered", () => assertSucceeds(updateDoc(doc(db("adm"), "projects/p1/entries/e1"), { ordered: true })));
await t("staff cannot change qty after ordered", () => assertFails(updateDoc(doc(db("s1"), "projects/p1/entries/e1"), { orderedQty: 20 })));
await t("staff can still change received qty", () => assertSucceeds(updateDoc(doc(db("s1"), "projects/p1/entries/e1"), { receivedQty: 9 })));
await t("staff cannot delete ordered item", () => assertFails(deleteDoc(doc(db("s1"), "projects/p1/entries/e1"))));
await t("admin ticks received", () => assertSucceeds(updateDoc(doc(db("adm"), "projects/p1/entries/e1"), { received: true })));
await t("staff cannot change received qty after received", () => assertFails(updateDoc(doc(db("s1"), "projects/p1/entries/e1"), { receivedQty: 10 })));
await t("staff adds photo record", () => assertSucceeds(setDoc(doc(db("s1"), "projects/p1/photos/ph1"), { bucket: "Kitchen", uploadedBy: "s1", url: "u", path: "p" })));

// ---- freeze modes
await updateDoc(doc(db("adm"), "projects/p1"), { freeze: "readonly" });
await t("readonly: staff can read items", () => assertSucceeds(getDocs(collection(db("s1"), "projects/p1/entries"))));
await t("readonly: staff cannot add", () => assertFails(setDoc(doc(db("s1"), "projects/p1/entries/e6"), E)));
await t("readonly: staff cannot add photo", () => assertFails(setDoc(doc(db("s1"), "projects/p1/photos/ph2"), { bucket: "K", uploadedBy: "s1" })));
await t("readonly: admin can still add", () => assertSucceeds(setDoc(doc(db("adm"), "projects/p1/entries/e7"), E)));
await updateDoc(doc(db("adm"), "projects/p1"), { freeze: "locked" });
await t("locked: staff cannot read items", () => assertFails(getDocs(collection(db("s1"), "projects/p1/entries"))));
await t("locked: staff cannot read photos", () => assertFails(getDocs(collection(db("s1"), "projects/p1/photos"))));
await t("locked: project still listed for staff", () => assertSucceeds(getDoc(doc(db("s1"), "projects/p1"))));
await t("bad freeze value rejected", () => assertFails(updateDoc(doc(db("adm"), "projects/p1"), { freeze: "maybe" })));

// ---- per-staff access
await setDoc(doc(db("adm"), "projects/p3"), { ...P, assignedUsers: ["s1", "s2"], staffAccess: { s1: "none", s2: "readonly" } });
await t("per-staff: open staff can add", () => assertSucceeds(setDoc(doc(db("s1"), "projects/p3/entries/a1"), E)));
await t("per-staff: view-only staff can read", () => assertSucceeds(getDocs(collection(db("s2"), "projects/p3/entries"))));
await t("per-staff: view-only staff cannot add", () => assertFails(setDoc(doc(db("s2"), "projects/p3/entries/a2"), { ...E, createdBy: "s2" })));
await t("admin changes one staff's access", () => assertSucceeds(updateDoc(doc(db("adm"), "projects/p3"), { "staffAccess.s1": "locked" })));
await t("per-staff: locked staff cannot read items", () => assertFails(getDocs(collection(db("s1"), "projects/p3/entries"))));
await t("per-staff: other staff unaffected", () => assertSucceeds(getDocs(collection(db("s2"), "projects/p3/entries"))));
await t("bad per-staff value rejected", () => assertFails(updateDoc(doc(db("adm"), "projects/p3"), { "staffAccess.s2": "maybe" })));

// ---- payments & deactivation
await t("admin records payment", () => assertSucceeds(setDoc(doc(db("adm"), "payments/x"), { vendorId: "v1", amount: 100, date: "2026-10-11" })));
await t("staff cannot read payments", () => assertFails(getDocs(collection(db("s1"), "payments"))));
await updateDoc(doc(db("adm"), "users/s1"), { active: false });
await t("deactivated staff blocked", () => assertFails(getDocs(collection(db("s1"), "vendors"))));
await t("staff cannot delete user docs", () => assertFails(deleteDoc(doc(db("adm"), "users/s2"))));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
