import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const projectsApi = createApi({
  reducerPath: "projectsApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Projects", "Project"],
  endpoints: (builder) => ({
    getProjects: builder.query({
      query: (params = {}) => ({ url: "/projects", method: "GET", params }),
      transformResponse: (response) => response?.data?.projects ?? [],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ _id }) => ({ type: "Project", id: _id })),
              { type: "Projects", id: "LIST" },
            ]
          : [{ type: "Projects", id: "LIST" }],
    }),

    getProjectById: builder.query({
      query: (id) => ({ url: `/projects/${id}`, method: "GET" }),
      transformResponse: (response) => response?.data?.project ?? null,
      providesTags: (result, error, id) => [{ type: "Project", id }],
    }),

    createProject: builder.mutation({
      query: (data) => ({ url: "/projects", method: "POST", data }),
      transformResponse: (response) => response?.data?.project ?? null,
      invalidatesTags: [{ type: "Projects", id: "LIST" }],
    }),

    updateProject: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/projects/${id}`,
        method: "PUT",
        data,
      }),
      transformResponse: (response) => response?.data?.project ?? null,
      invalidatesTags: (result, error, { id }) => [
        { type: "Project", id },
        { type: "Projects", id: "LIST" },
      ],
    }),

    deleteProject: builder.mutation({
      query: (id) => ({ url: `/projects/${id}`, method: "DELETE" }),
      invalidatesTags: (result, error, id) => [
        { type: "Project", id },
        { type: "Projects", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetProjectsQuery,
  useGetProjectByIdQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
} = projectsApi;
