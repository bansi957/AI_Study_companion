import { createApi } from "@reduxjs/toolkit/query/react";
import { axiosBaseQuery } from "../../services/axiosBaseQuery";

export const materialsApi = createApi({
  reducerPath: "materialsApi",
  baseQuery: axiosBaseQuery(),
  tagTypes: ["Materials", "Material", "Concepts"],
  endpoints: (builder) => ({
    getMaterialsByProjectId: builder.query({
      query: (projectId) => ({
        url: `/materials/project/${projectId}`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data?.materials ?? [],
      providesTags: (result, error, projectId) =>
        result
          ? [
              ...result.map(({ id, _id }) => ({ type: "Material", id: id || _id })),
              { type: "Materials", id: projectId },
            ]
          : [{ type: "Materials", id: projectId }],
    }),

    uploadMaterial: builder.mutation({
      query: ({ file, projectId }) => {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", projectId);

        return {
          url: "/materials/upload",
          method: "POST",
          data: formData,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        };
      },
      transformResponse: (response) => response?.data?.material ?? null,
      invalidatesTags: (result, error, { projectId }) => [
        { type: "Materials", id: projectId },
      ],
    }),

    deleteMaterial: builder.mutation({
      query: ({ id }) => ({
        url: `/materials/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Materials" }, { type: "Concepts" }],
    }),

    getMaterialContent: builder.query({
      query: (id) => ({
        url: `/materials/${id}/content`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data ?? null,
    }),

    getMaterialConcepts: builder.query({
      query: (id) => ({
        url: `/materials/${id}/concepts`,
        method: "GET",
      }),
      transformResponse: (response) => response?.data?.concepts ?? [],
      providesTags: (result, error, id) => [{ type: "Concepts", id }],
    }),
  }),
});

export const {
  useGetMaterialsByProjectIdQuery,
  useUploadMaterialMutation,
  useDeleteMaterialMutation,
  useGetMaterialContentQuery,
  useGetMaterialConceptsQuery,
} = materialsApi;
