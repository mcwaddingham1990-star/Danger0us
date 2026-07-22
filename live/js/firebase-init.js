/*
  Firebase bootstrap. Loaded (via the compat SDK, so it works with plain
  <script> tags, no bundler) before js/data.js on every page.
*/

const firebaseConfig = {
  apiKey: "AIzaSyClOG4d5WoOJLfFGpAqZ-IrE2efLOpxQoQ",
  authDomain: "dangerousrides.firebaseapp.com",
  projectId: "dangerousrides",
  storageBucket: "dangerousrides.firebasestorage.app",
  messagingSenderId: "887818633576",
  appId: "1:887818633576:web:a7ac24bde0135dccc416dd",
};

firebase.initializeApp(firebaseConfig);

const drAuth = firebase.auth();
const drDb = firebase.firestore();

// The one account allowed to self-provision as admin on signup.
const DR_ADMIN_EMAIL = "m.c.waddingham1990@gmail.com";
