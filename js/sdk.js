/**
 * Single place that pins the Firebase SDK version (10.12.2).
 * Every other file imports Firebase functions from here.
 * To upgrade, replace the version in the four URLs below.
 */

export { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

export {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
