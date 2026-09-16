import { createSlice } from "@reduxjs/toolkit";

// --- Helper: read initial state from localStorage without crashing ---
const loadFromStorage = () => {
  try {
    const token = localStorage.getItem("token") || null;
    const user = localStorage.getItem("user")
      ? JSON.parse(localStorage.getItem("user"))
      : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
};

const { token: storedToken, user: storedUser } = loadFromStorage();

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: storedUser,
    token: storedToken,
    // true while the /me verification call is in-flight on app startup
    isInitializing: !!storedToken,
  },
  reducers: {
    /**
     * Call this after a successful login or register.
     * Persists token + user to localStorage so refreshes work.
     */
    setCredentials: (state, action) => {
      const { user, token } = action.payload;
      state.user = user;
      state.token = token;
      state.isInitializing = false;
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
    },

    /**
     * Call this after /me resolves on startup (or if /me fails).
     * Updates user in state + localStorage without changing the token.
     */
    setUser: (state, action) => {
      state.user = action.payload;
      state.isInitializing = false;
      if (action.payload) {
        localStorage.setItem("user", JSON.stringify(action.payload));
      }
    },

    /**
     * Clears all auth state and localStorage entries.
     * Used by logout and 401 interceptor.
     */
    clearCredentials: (state) => {
      state.user = null;
      state.token = null;
      state.isInitializing = false;
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    },

    /**
     * Mark initialization as done without changing credentials.
     * Called when startup /me check is skipped (no token).
     */
    setInitializingDone: (state) => {
      state.isInitializing = false;
    },
  },
});

export const {
  setCredentials,
  setUser,
  clearCredentials,
  setInitializingDone,
} = authSlice.actions;

// --- Selectors ---
export const selectUser = (state) => state.auth.user;
export const selectToken = (state) => state.auth.token;
export const selectIsAuthenticated = (state) =>
  !!state.auth.token && !!state.auth.user;
export const selectIsInitializing = (state) => state.auth.isInitializing;

export default authSlice.reducer;
