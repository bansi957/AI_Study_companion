import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const quizApi = createApi({
  reducerPath: "quizApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Quiz", "Attempt", "ProjectAnalytics", "ProjectGrowth"],
  endpoints: (builder) => ({
    generateQuiz: builder.mutation({
      query: ({
        projectId,
        totalQuestions = 5,
        difficulty = "adaptive",
        conceptIds = [],
        questionFormat = "mixed",
      }) => ({
        url: "/quizzes/generate",
        method: "POST",
        data: { projectId, totalQuestions, difficulty, conceptIds, questionFormat },
      }),
      transformResponse: (response) => response?.data ?? null,
      invalidatesTags: ["ProjectAnalytics"],
    }),

    startAttempt: builder.mutation({
      query: ({ quizId }) => ({
        url: `/quizzes/${quizId}/start`,
        method: "POST",
      }),
      transformResponse: (response) => response?.data ?? null,
    }),

    submitAnswer: builder.mutation({
      query: ({ quizId, attemptId, questionId, answer }) => ({
        url: `/quizzes/${quizId}/answer`,
        method: "POST",
        data: { attemptId, questionId, answer },
      }),
      transformResponse: (response) => response?.data ?? null,
    }),

    completeQuiz: builder.mutation({
      query: ({ quizId, attemptId }) => ({
        url: `/quizzes/${quizId}/complete`,
        method: "POST",
        data: { attemptId },
      }),
      transformResponse: (response) => response?.data ?? null,
      invalidatesTags: ["ProjectAnalytics", "ProjectGrowth", "Attempt"],
    }),

    getQuiz: builder.query({
      query: (quizId) => ({
        url: `/quizzes/${quizId}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data?.quiz ?? null,
      providesTags: (result, error, quizId) => [{ type: "Quiz", id: quizId }],
    }),
  }),
});

export const {
  useGenerateQuizMutation,
  useStartAttemptMutation,
  useSubmitAnswerMutation,
  useCompleteQuizMutation,
  useGetQuizQuery,
} = quizApi;
