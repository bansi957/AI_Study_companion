import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 60000, // 60s standard timeout for AI requests and remote queries
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

    let message =
      error.response?.data?.message ||
      error.message ||
      "An unexpected network error occurred";

    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      message =
        "Request timed out. The server or file upload is taking longer than expected. Please check your connection and retry.";
    } else if (error.code === "ERR_NETWORK") {
      message =
        "Unable to connect to the backend server. Please verify the backend server is running on port 3000.";
    }

    return Promise.reject({ ...error, customMessage: message });
  }
);

export default api;
