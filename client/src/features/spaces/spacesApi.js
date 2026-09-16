import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const spacesApi = createApi({
  reducerPath: "spacesApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Spaces", "Space"],
  endpoints: (builder) => ({
    getSpaces: builder.query({
      query: () => ({ url: "/spaces", method: "GET" }),
      // Normalize: return the spaces array directly for easy consumption
      transformResponse: (response) => response?.data?.spaces ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ _id }) => ({ type: "Space", id: _id })),
              { type: "Spaces", id: "LIST" },
            ]
          : [{ type: "Spaces", id: "LIST" }],
    }),

    getSpaceById: builder.query({
      query: (id) => ({ url: `/spaces/${id}`, method: "GET" }),
      transformResponse: (response) => response?.data?.space ?? null,
      providesTags: (result, error, id) => [{ type: "Space", id }],
    }),

    createSpace: builder.mutation({
      query: (data) => ({ url: "/spaces", method: "POST", data }),
      transformResponse: (response) => response?.data?.space ?? null,
      invalidatesTags: [{ type: "Spaces", id: "LIST" }],
    }),

    updateSpace: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/spaces/${id}`,
        method: "PUT",
        data,
      }),
      transformResponse: (response) => response?.data?.space ?? null,
      invalidatesTags: (result, error, { id }) => [
        { type: "Space", id },
        { type: "Spaces", id: "LIST" },
      ],
    }),

    deleteSpace: builder.mutation({
      query: (id) => ({ url: `/spaces/${id}`, method: "DELETE" }),
      invalidatesTags: (result, error, id) => [
        { type: "Space", id },
        { type: "Spaces", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetSpacesQuery,
  useGetSpaceByIdQuery,
  useCreateSpaceMutation,
  useUpdateSpaceMutation,
  useDeleteSpaceMutation,
} = spacesApi;
