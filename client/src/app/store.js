import { configureStore } from "@reduxjs/toolkit";
import { authApi } from "../features/auth/authApi";
import { spacesApi } from "../features/spaces/spacesApi";
import { projectsApi } from "../features/projects/projectsApi";
import { materialsApi } from "../features/materials/materialsApi";
import { tutorApi } from "../features/tutor/tutorApi";
import { quizApi } from "../features/quiz/quizApi";
import { analyticsApi } from "../features/analytics/analyticsApi";
import { adminApi } from "../features/admin/adminApi";
import authReducer from "../features/auth/authSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [spacesApi.reducerPath]: spacesApi.reducer,
    [projectsApi.reducerPath]: projectsApi.reducer,
    [materialsApi.reducerPath]: materialsApi.reducer,
    [tutorApi.reducerPath]: tutorApi.reducer,
    [quizApi.reducerPath]: quizApi.reducer,
    [analyticsApi.reducerPath]: analyticsApi.reducer,
    [adminApi.reducerPath]: adminApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(
      authApi.middleware,
      spacesApi.middleware,
      projectsApi.middleware,
      materialsApi.middleware,
      tutorApi.middleware,
      quizApi.middleware,
      analyticsApi.middleware,
      adminApi.middleware
    ),
});

