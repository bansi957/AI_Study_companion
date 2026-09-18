const { initializeApp, cert, getApps, getApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

let firebaseApp = null;

/**
 * Initializes Firebase Admin SDK using environment credentials.
 * Uses modular exports from firebase-admin v12+ / v13.
 */
const initializeFirebaseAdmin = () => {
  if (firebaseApp) return firebaseApp;

  // If already initialized by default
  const existingApps = getApps();
  if (existingApps && existingApps.length > 0) {
    firebaseApp = existingApps[0];
    return firebaseApp;
  }

  try {
    // 1. Structured environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      // Remove any surrounding wrapping quotes that may have been preserved
      if (
        (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
        (privateKey.startsWith("'") && privateKey.endsWith("'"))
      ) {
        privateKey = privateKey.slice(1, -1);
      }
      // Replace literal escaped \n with actual newlines
      privateKey = privateKey.replace(/\\n/g, "\n");

      firebaseApp = initializeApp({
        credential: cert({
          projectId: projectId.replace(/['"]/g, "").trim(),
          clientEmail: clientEmail.replace(/['"]/g, "").trim(),
          privateKey,
        }),
      });

      console.log("[Firebase Admin] Successfully initialized with service account.");
      return firebaseApp;
    }

    // 2. Stringified Service Account JSON
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount =
        typeof process.env.FIREBASE_SERVICE_ACCOUNT_KEY === "string"
          ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
          : process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log("[Firebase Admin] Initialized with FIREBASE_SERVICE_ACCOUNT_KEY JSON.");
      return firebaseApp;
    }

    // 3. Fallback if projectId only is defined
    if (projectId) {
      firebaseApp = initializeApp({
        projectId: projectId.replace(/['"]/g, "").trim(),
      });
      console.warn("[Firebase Admin] Initialized in basic mode with projectId.");
      return firebaseApp;
    }

    console.warn(
      "[Firebase Admin] WARNING: No Firebase Admin credentials found. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in server/.env"
    );
  } catch (error) {
    console.error("[Firebase Admin] Initialization failed:", error.message);
  }

  return firebaseApp;
};

/**
 * Cryptographically verifies a Firebase ID token sent from the client.
 * Returns the decoded token containing uid, email, name, picture.
 */
const verifyFirebaseIdToken = async (idToken) => {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Missing or invalid Firebase ID token.");
  }

  const app = initializeFirebaseAdmin();
  if (!app) {
    throw new Error(
      "Firebase Admin SDK is not configured on the server. Please check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in server/.env"
    );
  }

  const auth = getAuth(app);
  return await auth.verifyIdToken(idToken);
};

module.exports = {
  initializeFirebaseAdmin,
  verifyFirebaseIdToken,
};
