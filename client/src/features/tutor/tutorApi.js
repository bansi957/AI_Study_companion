import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const tutorApi = createApi({
  reducerPath: "tutorApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Conversation", "ProjectAnalytics"],
  endpoints: (builder) => ({
    askTutor: builder.mutation({
      query: ({ projectId, conversationId, message }) => ({
        url: "/tutor/chat",
        method: "POST",
        data: { projectId, conversationId, message },
      }),
      transformResponse: (response) => response?.data ?? null,
      invalidatesTags: (result, error, { projectId }) => [
        { type: "Conversation", id: result?.conversationId || "LATEST" },
        { type: "Conversation", id: `PROJECT_${projectId}` },
        { type: "Conversation", id: `LATEST_${projectId}` },
        { type: "Conversation", id: "LATEST" },
        "ProjectAnalytics",
      ],
    }),

    getConversation: builder.query({
      query: (id) => ({
        url: `/tutor/conversations/${id}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data?.conversation ?? null,
      providesTags: (result, error, id) => [{ type: "Conversation", id }],
    }),

    getProjectConversations: builder.query({
      query: (projectId) => ({
        url: `/tutor/conversations?projectId=${projectId}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? [],
      providesTags: (result, error, projectId) => [
        { type: "Conversation", id: `PROJECT_${projectId}` },
      ],
    }),

    getLatestConversation: builder.query({
      query: (projectId) => ({
        url: `/tutor/project/${projectId}/latest`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
      providesTags: (result, error, projectId) => [
        { type: "Conversation", id: `LATEST_${projectId}` },
        { type: "Conversation", id: "LATEST" },
      ],
    }),
  }),
});

export const {
  useAskTutorMutation,
  useGetConversationQuery,
  useGetProjectConversationsQuery,
  useGetLatestConversationQuery,
  useLazyGetConversationQuery,
} = tutorApi;
