import api from "./api";

export const projectService = {
  async getProjects(params = {}) {
    const response = await api.get("/projects", { params });
    return response.data;
  },

  async getProjectById(id) {
    const response = await api.get(`/projects/${id}`);
    return response.data;
  },

  async createProject(data) {
    const response = await api.post("/projects", data);
    return response.data;
  },

  async updateProject(id, data) {
    const response = await api.put(`/projects/${id}`, data);
    return response.data;
  },

  async deleteProject(id) {
    const response = await api.delete(`/projects/${id}`);
    return response.data;
  },
};
