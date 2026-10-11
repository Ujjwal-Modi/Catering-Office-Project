/* Data access layer: every Firestore / Storage call lives here. */
import { db, storage, auth } from "./firebase.js";
import { firebaseConfig, PHOTOS_ENABLED } from "./firebase-config.js";
import {
  initializeApp, deleteApp, initializeAuth, inMemoryPersistence,
  createUserWithEmailAndPassword, signOut,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, writeBatch, arrayUnion, arrayRemove,
  ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from "./sdk.js";

const withId = (snap) => ({ id: snap.id, ...snap.data() });
const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid || null });

/* ============================ Masters ============================ */

export const MASTER_KINDS = {
  vendorTypes: { label: "Vendor types", hint: "e.g. Grocery, Vegetables, Manpower" },
  units: { label: "Units", hint: "e.g. kg, litre, piece" },
  eventTypes: { label: "Event types", hint: "e.g. Wedding, Corporate" },
  // PHOTOS DISABLED: un-comment to show the photo bucket list on the Masters page.
  // photoBuckets: { label: "Photo buckets", hint: "e.g. Delivery, Kitchen, Bills" },
};

export const DEFAULT_MASTERS = {
  vendorTypes: ["Grocery", "Vegetables", "Fruits", "Dairy", "Meat & Fish", "Bakery", "Beverages", "Gas", "Ice", "Manpower", "Tent & Decor", "Crockery & Utensils", "Transport"],
  units: ["kg", "gram", "litre", "piece", "dozen", "packet", "box", "crate", "bag", "cylinder", "person", "trip"],
  eventTypes: ["Wedding", "Reception", "Engagement", "Birthday", "Corporate", "Conference", "Religious", "Outdoor Catering"],
  photoBuckets: ["Delivery", "Kitchen", "Food Display", "Venue Setup", "Bills & Invoices", "Damage / Issues"],
};

const mastersRef = () => doc(db, "masters", "lists");

export async function getMasters() {
  const snap = await getDoc(mastersRef());
  const data = snap.exists() ? snap.data() : {};
  const out = {};
  for (const k of Object.keys(MASTER_KINDS)) out[k] = [...(data[k] || [])].sort((a, b) => a.localeCompare(b));
  return out;
}

export const addMasterItem = (kind, value) =>
  setDoc(mastersRef(), { [kind]: arrayUnion(value.trim()) }, { merge: true });

export const removeMasterItem = (kind, value) =>
  updateDoc(mastersRef(), { [kind]: arrayRemove(value) });

/* ============================ Users ============================ */

const toUsers = (snap) =>
  snap.docs.map(withId).map((u) => ({ ...u, uid: u.id })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

export async function listUsers() {
  return toUsers(await getDocs(collection(db, "users")));
}

/**
 * Live list. cb(list, ready): `ready` is false while only the (possibly empty)
 * offline cache has answered, so pages can keep showing "Loading…" instead of
 * an empty list until the server replies.
 */
export function watchUsers(cb, onError) {
  return onSnapshot(collection(db, "users"), { includeMetadataChanges: true },
    (s) => cb(toUsers(s), !s.metadata.fromCache || s.size > 0), onError);
}

/**
 * Create a login without signing the admin out: a throw-away secondary
 * Firebase app creates the account, then the admin's session writes the profile.
 */
export async function createUser({ email, password, name, phone, role }) {
  const secondary = initializeApp(firebaseConfig, "create-user-" + Date.now());
  try {
    const secAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      name, phone, email, role, active: true,
      createdAt: serverTimestamp(), createdBy: auth.currentUser.uid,
    });
    await signOut(secAuth);
    return cred.user.uid;
  } finally {
    await deleteApp(secondary);
  }
}

export const updateUser = (uid, data) => updateDoc(doc(db, "users", uid), { ...data, ...stamp() });

export const updateOwnProfile = (uid, { name, phone }) =>
  updateDoc(doc(db, "users", uid), { name, phone, updatedAt: serverTimestamp() });

/* ============================ Vendors ============================ */

export async function listVendors() {
  const snap = await getDocs(collection(db, "vendors"));
  return snap.docs.map(withId).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

/** Rates are admin-only, so they live in a separate collection staff can't read. */
export async function getVendorRates() {
  const snap = await getDocs(collection(db, "vendorPrivate"));
  const rates = {};
  snap.docs.forEach((d) => (rates[d.id] = d.data().rate || 0));
  return rates;
}

export async function saveVendor(id, data, rate) {
  const batch = writeBatch(db);
  const vRef = id ? doc(db, "vendors", id) : doc(collection(db, "vendors"));
  batch.set(vRef, { ...data, ...stamp(), ...(id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
  batch.set(doc(db, "vendorPrivate", vRef.id), { rate: rate || 0, ...stamp() }, { merge: true });
  await batch.commit();
  return vRef.id;
}

export async function deleteVendor(id) {
  const batch = writeBatch(db);
  batch.delete(doc(db, "vendors", id));
  batch.delete(doc(db, "vendorPrivate", id));
  await batch.commit();
}

/* ============================ Projects ============================ */

const sortProjects = (list) => list.sort((a, b) => b.startDate.localeCompare(a.startDate));

export async function listProjects() {
  const snap = await getDocs(query(collection(db, "projects"), orderBy("startDate", "desc")));
  return snap.docs.map(withId);
}

export function watchProjects(cb, onError) {
  return onSnapshot(query(collection(db, "projects"), orderBy("startDate", "desc")), { includeMetadataChanges: true },
    (s) => cb(s.docs.map(withId), !s.metadata.fromCache || s.size > 0), onError);
}

export function watchMyProjects(uid, cb, onError) {
  return onSnapshot(query(collection(db, "projects"), where("assignedUsers", "array-contains", uid)), { includeMetadataChanges: true },
    (s) => cb(sortProjects(s.docs.map(withId)), !s.metadata.fromCache || s.size > 0), onError);
}

export async function listMyProjects(uid) {
  const snap = await getDocs(query(collection(db, "projects"), where("assignedUsers", "array-contains", uid)));
  return sortProjects(snap.docs.map(withId));
}

export async function getProject(id) {
  const snap = await getDoc(doc(db, "projects", id));
  return snap.exists() ? withId(snap) : null;
}

export function watchProject(id, cb, onError) {
  return onSnapshot(doc(db, "projects", id), (s) => cb(s.exists() ? withId(s) : null), onError);
}

export async function saveProject(id, data) {
  if (id) {
    await updateDoc(doc(db, "projects", id), { ...data, ...stamp() });
    return id;
  }
  const r = await addDoc(collection(db, "projects"), {
    ...data, createdAt: serverTimestamp(), createdBy: auth.currentUser.uid, ...stamp(),
  });
  return r.id;
}

export const setFreeze = (id, freeze) => updateDoc(doc(db, "projects", id), { freeze, ...stamp() });

/** Change one staff member's access (none / readonly / locked) on a project. */
export const setStaffAccess = (id, uid, access) =>
  updateDoc(doc(db, "projects", id), { [`staffAccess.${uid}`]: access, ...stamp() });

/** Deletes a project with all its items, photo records and photo files. */
export async function deleteProject(id) {
  const [entries, photos] = await Promise.all([listEntries(id), listPhotos(id)]);
  if (storage) await Promise.all(photos.map((p) => deleteObject(ref(storage, p.path)).catch(() => {})));
  const refs = [
    ...entries.map((e) => doc(db, "projects", id, "entries", e.id)),
    ...photos.map((p) => doc(db, "projects", id, "photos", p.id)),
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
  await deleteDoc(doc(db, "projects", id));
}

/* ============================ Entries (items) ============================ */

const entriesCol = (pid) => collection(db, "projects", pid, "entries");

export const sortEntries = (list) =>
  list.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] ||
    a.vendorType.localeCompare(b.vendorType) ||
    a.vendorName.localeCompare(b.vendorName));

const SLOT_ORDER = { Morning: 0, Afternoon: 1, Evening: 2, Night: 3 };

export async function listEntries(pid) {
  const snap = await getDocs(entriesCol(pid));
  return sortEntries(snap.docs.map(withId).map((e) => ({ ...e, projectId: pid })));
}

export function watchEntries(pid, cb, onError) {
  return onSnapshot(entriesCol(pid), (s) => cb(sortEntries(s.docs.map(withId))), onError);
}

/** Staff entries always start un-ordered; admins may pass ordered/received in `data`. */
export function addEntry(pid, data, profile) {
  return setDoc(doc(entriesCol(pid)), {
    ordered: false,
    received: false,
    ...data,
    createdBy: profile.uid,
    createdByName: profile.name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: profile.uid,
    updatedByName: profile.name,
  });
}

export function updateEntry(pid, id, data, profile) {
  return updateDoc(doc(entriesCol(pid), id), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy: profile.uid,
    updatedByName: profile.name,
  });
}

export const deleteEntry = (pid, id) => deleteDoc(doc(entriesCol(pid), id));

/* ============================ Photos ============================ */

const photosCol = (pid) => collection(db, "projects", pid, "photos");

export async function listPhotos(pid) {
  const snap = await getDocs(photosCol(pid));
  return snap.docs.map(withId).map((p) => ({ ...p, projectId: pid }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export function watchPhotos(pid, cb, onError) {
  return onSnapshot(photosCol(pid), (s) =>
    cb(s.docs.map(withId).sort((a, b) => (b.createdAt?.seconds || Infinity) - (a.createdAt?.seconds || Infinity))), onError);
}

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif" };

/** File extension from the original name, falling back to the MIME type. */
function extensionOf(file) {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(file.name || "")?.[1];
  return (fromName || EXT[file.type] || "jpg").toLowerCase();
}

/**
 * Uploads the ORIGINAL photo — no resizing or recompression — so it can be
 * reused on social media at full quality. onProgress(0–100) reports upload %.
 */
export async function uploadPhoto(pid, file, { bucket, remark, date }, profile, onProgress = () => {}) {
  const ext = extensionOf(file);
  const path = `projects/${pid}/photos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const sRef = ref(storage, path);
  await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(sRef, file, {
      contentType: file.type || "image/jpeg",
      customMetadata: { originalName: file.name || "" },
    });
    task.on("state_changed", (s) => onProgress(Math.round((s.bytesTransferred / s.totalBytes) * 100)), reject, resolve);
  });
  const url = await getDownloadURL(sRef);
  await setDoc(doc(photosCol(pid)), {
    bucket, remark: remark || "", date: date || "", url, path,
    fileName: file.name || "",
    contentType: file.type || "image/jpeg",
    size: file.size,
    uploadedBy: profile.uid,
    uploadedByName: profile.name,
    createdAt: serverTimestamp(),
  });
}

export const updatePhoto = (pid, id, data) => updateDoc(doc(photosCol(pid), id), data);

export async function deletePhoto(pid, photo) {
  await deleteDoc(doc(photosCol(pid), photo.id));
  if (storage) await deleteObject(ref(storage, photo.path)).catch(() => {});
}

/* ============================ Payments ============================ */

export async function listPayments() {
  const snap = await getDocs(query(collection(db, "payments"), orderBy("date", "desc")));
  return snap.docs.map(withId);
}

export const addPayment = (data) =>
  addDoc(collection(db, "payments"), { ...data, createdAt: serverTimestamp(), createdBy: auth.currentUser.uid });

export const deletePayment = (id) => deleteDoc(doc(db, "payments", id));

/* ============================ Bulk loading for reports ============================ */

/** Loads items and photos for many projects in parallel. */
export async function loadProjectData(projects, { photos = PHOTOS_ENABLED } = {}) {
  const results = await Promise.all(
    projects.map(async (p) => ({
      entries: await listEntries(p.id),
      photos: photos ? await listPhotos(p.id) : [],
    }))
  );
  return {
    entries: results.flatMap((r) => r.entries),
    photos: results.flatMap((r) => r.photos),
  };
}
