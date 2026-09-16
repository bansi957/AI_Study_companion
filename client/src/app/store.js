import { configureStore } from "@reduxjs/toolkit";
import { authApi } from "../features/auth/authApi";
import { spacesApi } from "../features/spaces/spacesApi";
import { projectsApi } from "../features/projects/projectsApi";
import authReducer from "../features/auth/authSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [spacesApi.reducerPath]: spacesApi.reducer,
    [projectsApi.reducerPath]: projectsApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      spacesApi.middleware,
      projectsApi.middleware
    ),
});
