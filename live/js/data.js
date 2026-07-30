/*
  Shared data layer backed by Firebase: Firestore holds players, settings,
  redemptions, and referrals (shared across every browser/device);
  Firebase Authentication handles real sign-in. Requires
  js/firebase-init.js (and the firebase-*-compat.js SDKs) to be loaded
  first.

  Every function here is async now — callers must await it.
*/

const DEFAULT_SETTINGS = {
  winProbability: 10,      // 0-100, chance-weighted RNG favors clusters forming
  jesterRate: 3,           // 0-100, how often Joker/wild symbols appear
  bonusRate: 14,           // 0-100, how often the Bonus/scatter symbol appears (drives free-spin trigger frequency)
  clusterMin: 5,           // minimum touching symbols to pay (Blue Diamonds floors this at 5 regardless)
};

function drPlayerDefaults(email, extra) {
  const isAdmin = email.toLowerCase() === DR_ADMIN_EMAIL.toLowerCase();
  return Object.assign({
    email,
    role: isAdmin ? "admin" : "player",
    approved: isAdmin,
    credits: isAdmin ? 0 : 100,
    timePlayingMinutes: 0,
    depositHistory: isAdmin ? [] : [{ amount: 100, at: Date.now(), note: "Starting credits" }],
    creditsPlayed: 0,
    creditsWon: 0,
    creditsLost: 0,
    createdAt: Date.now(),
    // Signup credits can't be redeemed until a real deposit is on file.
    hasDeposited: false,
    // Referral program: every player gets their own shareable code.
    referralCode: null,
    referredBy: null,
    referredByCode: null,
    // Per-player overrides merged on top of the global settings doc.
    settingsOverride: {},
  }, extra || {});
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

/*
  "View as player" mode — lets the admin account browse the site as a
  regular player would, without permanently changing anything about the
  account. Purely a client-side UI flag (sessionStorage, so it clears
  itself when the tab closes); it never grants any access on its own —
  every page that honors it still re-checks player.role === "admin" from
  Firestore before showing anything admin-only, so it can't be used by a
  non-admin account to see admin UI.
*/
const DR_VIEW_AS_PLAYER_KEY = "drViewAsPlayer";
function drEnterPlayerView() { sessionStorage.setItem(DR_VIEW_AS_PLAYER_KEY, "1"); }
function drExitPlayerView() { sessionStorage.removeItem(DR_VIEW_AS_PLAYER_KEY); }
function drIsPlayerViewActive() { return sessionStorage.getItem(DR_VIEW_AS_PLAYER_KEY) === "1"; }

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
  const player = await drFindPlayerByUid(session.uid);
  if (!player) return null;
  return drEnsureReferralCode(player);
}

// Self-heals accounts that ended up without a referral code — either
// created before this feature existed, or created via the drSignIn
// missing-profile fallback (which doesn't mint one). Safe to call on
// every load: no-ops once the code is set.
async function drEnsureReferralCode(player) {
  if (player.referralCode) return player;
  const code = drGenerateReferralCode();
  try {
    await drDb.collection("players").doc(player.id).update({ referralCode: code });
    await drDb.collection("referralCodes").doc(code).set({ uid: player.id, email: player.email });
    player.referralCode = code;
  } catch (e) {
    console.error("Could not backfill referral code", e);
  }
  return player;
}

function drGenerateReferralCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let rand = "";
  for (let i = 0; i < 8; i++) rand += chars[Math.floor(Math.random() * chars.length)];
  return "REF-" + rand;
}

async function drLookupReferralCode(code) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const doc = await drDb.collection("referralCodes").doc(normalized).get();
  return doc.exists ? Object.assign({ code: normalized }, doc.data()) : null;
}

async function drSignUp(email, password, referralCode) {
  let referrer = null;
  if (referralCode) {
    referrer = await drLookupReferralCode(referralCode);
  }

  const cred = await drAuth.createUserWithEmailAndPassword(email, password);
  const uid = cred.user.uid;
  const ownCode = drGenerateReferralCode();

  const player = drPlayerDefaults(email, {
    referralCode: ownCode,
    referredBy: referrer ? referrer.uid : null,
    referredByCode: referrer ? referrer.code : null,
  });

  await drDb.collection("players").doc(uid).set(player);

  try {
    await drDb.collection("referralCodes").doc(ownCode).set({ uid, email });
  } catch (e) {
    console.error("Could not register referral code", e);
  }

  if (referrer) {
    try {
      await drDb.collection("referrals").add({
        code: referrer.code,
        referrerUid: referrer.uid,
        referrerEmail: referrer.email,
        newPlayerUid: uid,
        newPlayerEmail: email,
        createdAt: Date.now(),
        rewarded: false,
      });
    } catch (e) {
      console.error("Could not record referral", e);
    }
  }

  return Object.assign({ id: uid }, player);
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

async function drAddDeposit(uid, amount) {
  const ref = drDb.collection("players").doc(uid);
  await drDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const data = doc.data();
    const depositHistory = (data.depositHistory || []).concat([
      { amount, at: Date.now(), note: "Deposit" },
    ]);
    tx.update(ref, {
      credits: (data.credits || 0) + amount,
      depositHistory,
      hasDeposited: true,
    });
  });
}

async function drAddBonusCredits(uid, amount, note) {
  const ref = drDb.collection("players").doc(uid);
  await drDb.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const data = doc.data();
    const depositHistory = (data.depositHistory || []).concat([
      { amount, at: Date.now(), note: note || "Bonus credit" },
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

// Global settings with this specific player's overrides layered on top —
// what the game engine should actually use when resolving that player's spins.
async function drGetEffectiveSettings(player) {
  const global = await drGetSettings();
  const override = (player && player.settingsOverride) || {};
  return Object.assign({}, global, override);
}

async function drSetPlayerSettingsOverride(uid, partial) {
  const updates = {};
  Object.keys(partial).forEach((k) => { updates["settingsOverride." + k] = partial[k]; });
  await drDb.collection("players").doc(uid).update(updates);
}

async function drResetPlayerSettings(uid) {
  await drDb.collection("players").doc(uid).update({ settingsOverride: {} });
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
    if (!data.approved || !data.hasDeposited || amount <= 0 || (data.credits || 0) < amount) return null;

    tx.update(playerRef, { credits: data.credits - amount });
    const redemption = { code, uid, email, amount, status: "pending", createdAt: Date.now() };
    tx.set(redemptionRef, redemption);
    return redemption;
  });
}

async function drSetRedemptionStatus(code, status) {
  await drDb.collection("redemptions").doc(code).update({ status });
}

async function drGetReferrals() {
  const snap = await drDb.collection("referrals").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function drMarkReferralRewarded(id) {
  await drDb.collection("referrals").doc(id).update({ rewarded: true });
}

// Player-submitted comments/bug reports, reviewed by the admin.
async function drCreateFeedback(uid, email, kind, message) {
  const doc = { uid, email, kind, message, status: "new", createdAt: Date.now() };
  const ref = await drDb.collection("feedback").add(doc);
  return Object.assign({ id: ref.id }, doc);
}

async function drGetFeedback() {
  const snap = await drDb.collection("feedback").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function drGetMyFeedback(uid) {
  const snap = await drDb.collection("feedback").where("uid", "==", uid).get();
  return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

async function drMarkFeedbackReviewed(id) {
  await drDb.collection("feedback").doc(id).update({ status: "reviewed" });
}
