import api from "./api";

export const spaceService = {
  async getSpaces() {
    const response = await api.get("/spaces");
    return response.data;
  },

  async getSpaceById(id) {
    const response = await api.get(`/spaces/${id}`);
    return response.data;
  },

  async createSpace(data) {
    const response = await api.post("/spaces", data);
    return response.data;
  },

  async updateSpace(id, data) {
    const response = await api.put(`/spaces/${id}`, data);
    return response.data;
  },

  async deleteSpace(id) {
    const response = await api.delete(`/spaces/${id}`);
    return response.data;
  },
};
