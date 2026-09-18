import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const adminApi = createApi({
  reducerPath: "adminApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["AdminDashboard", "AdminUsers", "AdminActivities", "AdminAIUsage", "AdminHealth"],
  endpoints: (builder) => ({
    getAdminDashboard: builder.query({
      query: () => ({
        url: "/admin/dashboard",
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
      providesTags: ["AdminDashboard"],
    }),

    getAdminUsers: builder.query({
      query: (params) => ({
        url: "/admin/users",
        method: "GET",
        params,
      }),
      transformResponse: (response) => response?.data ?? { users: [], total: 0 },
      providesTags: ["AdminUsers"],
    }),

    getAdminActivities: builder.query({
      query: (params) => ({
        url: "/admin/activities",
        method: "GET",
        params,
      }),
      transformResponse: (response) => response?.data ?? { activities: [], total: 0 },
      providesTags: ["AdminActivities"],
    }),

    getAdminAIUsage: builder.query({
      query: (params) => ({
        url: "/admin/ai-usage",
        method: "GET",
        params,
      }),
      transformResponse: (response) => response?.data ?? null,
      providesTags: ["AdminAIUsage"],
    }),

    getAdminHealth: builder.query({
      query: () => ({
        url: "/admin/health",
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
      providesTags: ["AdminHealth"],
    }),

    getAdminProcessing: builder.query({
      query: () => ({
        url: "/admin/processing",
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
    }),
  }),
});

export const {
  useGetAdminDashboardQuery,
  useGetAdminUsersQuery,
  useGetAdminActivitiesQuery,
  useGetAdminAIUsageQuery,
  useGetAdminHealthQuery,
  useGetAdminProcessingQuery,
} = adminApi;
