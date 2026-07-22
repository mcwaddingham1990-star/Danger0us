/*
  Shared data layer backed by Firebase: Firestore holds players, settings,
  and redemptions (shared across every browser/device); Firebase
  Authentication handles real sign-in. Requires js/firebase-init.js (and the
  firebase-*-compat.js SDKs) to be loaded first.

  Every function here is async now — callers must await it.
*/

const DEFAULT_SETTINGS = {
  winProbability: 10,      // 0-100, chance-weighted RNG favors clusters forming
  jesterRate: 3,           // 0-100, how often jester/wild symbols appear
  avgFreeSpins: 15,        // baseline free spins on trigger
  multiplierFrequency: 50, // 0-100, how fast the cascade multiplier climbs
  jackpotChance: 0.3,      // 0-100
  clusterMin: 5,           // minimum touching symbols to pay
};

function drPlayerDefaults(email) {
  const isAdmin = email.toLowerCase() === DR_ADMIN_EMAIL.toLowerCase();
  return {
    email,
    role: isAdmin ? "admin" : "player",
    approved: isAdmin,
    credits: isAdmin ? 0 : 500,
    timePlayingMinutes: 0,
    depositHistory: isAdmin ? [] : [{ amount: 500, at: Date.now(), note: "Starting credits" }],
    creditsPlayed: 0,
    creditsWon: 0,
    creditsLost: 0,
    createdAt: Date.now(),
  };
}

// Resolves once Firebase Auth has reported the initial sign-in state.
let _drAuthResolve;
const drAuthReady = new Promise((res) => { _drAuthResolve = res; });
drAuth.onAuthStateChanged((user) => {
  if (_drAuthResolve) {
    _drAuthResolve(user);
    _drAuthResolve = null;
  }
});

async function drGetSession() {
  const user = await drAuthReady;
  return user ? { uid: user.uid, email: user.email } : null;
}

async function drRequireSessionOrRedirect(redirectTo) {
  const session = await drGetSession();
  if (!session) {
    window.location.href = redirectTo || "signin.html";
    return null;
  }
  return session;
}

async function drClearSession() {
  await drAuth.signOut();
}

function drPlayerFromDoc(doc) {
  if (!doc.exists) return null;
  return Object.assign({ id: doc.id }, doc.data());
}

async function drFindPlayerByUid(uid) {
  const doc = await drDb.collection("players").doc(uid).get();
  return drPlayerFromDoc(doc);
}

async function drCurrentPlayer() {
  const session = await drGetSession();
  if (!session) return null;
  return drFindPlayerByUid(session.uid);
}

async function drSignUp(email, password) {
  const cred = await drAuth.createUserWithEmailAndPassword(email, password);
  const player = drPlayerDefaults(email);
  await drDb.collection("players").doc(cred.user.uid).set(player);
  return Object.assign({ id: cred.user.uid }, player);
}

async function drSignIn(email, password) {
  const cred = await drAuth.signInWithEmailAndPassword(email, password);
  let player = await drFindPlayerByUid(cred.user.uid);
  if (!player) {
    // Auth account exists but the Firestore profile is missing somehow —
    // recreate it so the app doesn't dead-end.
    const defaults = drPlayerDefaults(email);
    await drDb.collection("players").doc(cred.user.uid).set(defaults);
    player = Object.assign({ id: cred.user.uid }, defaults);
  }
  return player;
}

async function drSendPasswordReset(email) {
  await drAuth.sendPasswordResetEmail(email);
}

async function drGetPlayers() {
  const snap = await drDb.collection("players").get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function drUpsertPlayer(player) {
  const data = Object.assign({}, player);
  const id = data.id;
  delete data.id;
  await drDb.collection("players").doc(id).set(data, { merge: true });
}

async function drApprovePlayer(uid) {
  await drDb.collection("players").doc(uid).update({ approved: true });
}

async function drAddCredits(uid, amount) {
  const ref = drDb.collection("players").doc(uid);
  await drDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const data = doc.data();
    const depositHistory = (data.depositHistory || []).concat([
      { amount, at: Date.now(), note: "Admin credit add" },
    ]);
    tx.update(ref, {
      credits: (data.credits || 0) + amount,
      depositHistory,
    });
  });
}

async function drGetSettings() {
  const doc = await drDb.collection("settings").doc("global").get();
  return Object.assign({}, DEFAULT_SETTINGS, doc.exists ? doc.data() : {});
}

async function drSaveSettings(partial) {
  await drDb.collection("settings").doc("global").set(partial, { merge: true });
  return drGetSettings();
}

async function drGetRedemptions() {
  const snap = await drDb.collection("redemptions").get();
  return snap.docs.map((d) => d.data());
}

async function drGetMyRedemptions(uid) {
  const snap = await drDb.collection("redemptions").where("uid", "==", uid).get();
  return snap.docs.map((d) => d.data());
}

function drGenerateRedeemCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let rand = "";
  for (let i = 0; i < 8; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return "DR-" + rand;
}

async function drCreateRedemption(uid, email, amount) {
  const code = drGenerateRedeemCode();
  const playerRef = drDb.collection("players").doc(uid);
  const redemptionRef = drDb.collection("redemptions").doc(code);

  return drDb.runTransaction(async (tx) => {
    const doc = await tx.get(playerRef);
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data.approved || amount <= 0 || (data.credits || 0) < amount) return null;

    tx.update(playerRef, { credits: data.credits - amount });
    const redemption = { code, uid, email, amount, status: "pending", createdAt: Date.now() };
    tx.set(redemptionRef, redemption);
    return redemption;
  });
}

async function drSetRedemptionStatus(code, status) {
  await drDb.collection("redemptions").doc(code).update({ status });
}
