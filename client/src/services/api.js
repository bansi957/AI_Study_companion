import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Attach Authorization token to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to format error messages consistently
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If token expired or unauthorized (and not on login/register endpoints), trigger logout event
    if (error.response?.status === 401) {
      const isAuthEndpoint =
        error.config.url?.includes("/auth/login") ||
        error.config.url?.includes("/auth/register");

      if (!isAuthEndpoint) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("auth:logout"));
      }
    }

    const message =
      error.response?.data?.message ||
      error.message ||
      "An unexpected network error occurred";

    return Promise.reject({ ...error, customMessage: message });
  }
);

export default api;
