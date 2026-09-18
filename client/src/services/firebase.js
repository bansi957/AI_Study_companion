import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

// Vite env configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
};

// Check if basic credentials are provided
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId
);

let app = null;
let auth = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });
  } catch (err) {
    console.error("[Firebase Client] Initialization error:", err);
  }
} else {
  console.warn(
    "[Firebase Client] VITE_FIREBASE_* environment variables are not fully configured. Please check client/.env"
  );
}

/**
 * Sign in using Google popup dialog.
 * Returns the Firebase UserCredential.
 */
export const signInWithGooglePopup = async () => {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error(
      "Firebase is not configured. Please add VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, and VITE_FIREBASE_PROJECT_ID to client/.env"
    );
  }
  return await signInWithPopup(auth, googleProvider);
};

/**
 * Fallback: Sign in using Google redirect (recommended for mobile browsers / strict popup blockers).
 */
export const signInWithGoogleRedirect = async () => {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error("Firebase is not configured.");
  }
  return await signInWithRedirect(auth, googleProvider);
};

/**
 * Checks if user has returned from a redirect-based sign-in flow.
 */
export const checkRedirectResult = async () => {
  if (!isFirebaseConfigured || !auth) return null;
  try {
    return await getRedirectResult(auth);
  } catch (err) {
    console.error("[Firebase Client] Redirect result check error:", err);
    throw err;
  }
};

/**
 * Signs out of the Firebase session.
 */
export const firebaseSignOut = async () => {
  if (!isFirebaseConfigured || !auth) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.error("[Firebase Client] Sign-out error:", err);
  }
};

/**
 * Subscribes to Firebase auth state changes.
 */
export const onFirebaseAuthStateChanged = (callback) => {
  if (!isFirebaseConfigured || !auth) return () => {};
  return onAuthStateChanged(auth, callback);
};

export { auth, googleProvider };
