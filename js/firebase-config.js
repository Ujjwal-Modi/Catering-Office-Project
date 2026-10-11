/**
 * ------------------------------------------------------------------
 *  STEP 1 OF SETUP: paste your Firebase web-app config here.
 *  Firebase Console → Project settings → General → Your apps → Web app
 * ------------------------------------------------------------------
 */
export const firebaseConfig = {
    apiKey: "AIzaSyBTfIdG-vlGT72DmoovPtGNyiz8UbswJfA",
    authDomain: "catering-office-project.firebaseapp.com",
    projectId: "catering-office-project",
    storageBucket: "catering-office-project.firebasestorage.app",
    messagingSenderId: "590981195769",
    appId: "1:590981195769:web:8bb9e199a97b346d00bf28",
    measurementId: "G-183T4GLPYR"
};

/** Name shown in the header and on the login screen. */
export const APP_NAME = "Catering Office";

/**
 * Staff without an email can log in with a plain username (e.g. "ramesh").
 * Internally it becomes ramesh@<USERNAME_DOMAIN>. Do not change this after
 * users have been created, or their usernames will stop working.
 */
export const USERNAME_DOMAIN = "staff.catering.local";

/**
 * PHOTOS — temporarily DISABLED.
 * All photo code is kept in place (search the project for "PHOTOS DISABLED").
 * To turn photos back on later:
 *   1. set this to true,
 *   2. un-comment the marked blocks in project.html and reports.html,
 *   3. deploy storage rules: firebase deploy --only storage (needs Blaze plan).
 */
export const PHOTOS_ENABLED = false;
