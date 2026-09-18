import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const analyticsApi = createApi({
  reducerPath: "analyticsApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["ProjectAnalytics", "ProjectGrowth"],
  endpoints: (builder) => ({
    getProjectAnalytics: builder.query({
      query: (projectId) => ({
        url: `/analytics/project/${projectId}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
      providesTags: (result, error, projectId) => [
        { type: "ProjectAnalytics", id: projectId },
      ],
    }),

    getProjectGrowth: builder.query({
      query: (projectId) => ({
        url: `/growth/project/${projectId}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
      providesTags: (result, error, projectId) => [
        { type: "ProjectGrowth", id: projectId },
      ],
    }),

    getGlobalAnalytics: builder.query({
      query: () => ({
        url: "/analytics/global",
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
      providesTags: ["GlobalAnalytics"],
    }),

    getUserActivity: builder.query({
      query: (limit = 10) => ({
        url: `/activity?limit=${limit}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data?.activities ?? [],
      providesTags: ["UserActivity"],
    }),
  }),
});

export const {
  useGetProjectAnalyticsQuery,
  useGetProjectGrowthQuery,
  useGetGlobalAnalyticsQuery,
  useGetUserActivityQuery,
} = analyticsApi;
