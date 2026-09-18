import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        data: credentials,
      }),
    }),

    register: builder.mutation({
      query: (formData) => ({
        url: "/auth/register",
        method: "POST",
        data: formData,
      }),
    }),

    googleLogin: builder.mutation({
      query: ({ idToken }) => ({
        url: "/auth/google",
        method: "POST",
        data: { idToken },
      }),
    }),

    getMe: builder.query({
      query: () => ({
        url: "/auth/me",
        method: "GET",
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useGoogleLoginMutation,
  useLazyGetMeQuery,
} = authApi;
