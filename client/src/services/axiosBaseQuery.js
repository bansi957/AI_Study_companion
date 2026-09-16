/**
 * axiosBaseQuery — RTK Query base query that wraps the existing Axios instance.
 *
 * This preserves:
 *  - The Authorization header interceptor (reads token from localStorage)
 *  - The 401 → "auth:logout" custom event behavior
 *  - The consistent error shape (customMessage) used throughout the app
 *
 * Usage: baseQuery: axiosBaseQuery()
 */
import api from "./api";
import { store } from "../app/store";
import { clearCredentials } from "../features/auth/authSlice";

export const axiosBaseQuery =
  () =>
  async ({ url, method, data, params }) => {
    try {
      const result = await api({
        url,
        method,
        data,
        params,
      });
      return { data: result.data };
    } catch (axiosError) {
      // If the Axios interceptor already fired the auth:logout event,
      // also dispatch the Redux action so the store is immediately updated.
      if (axiosError?.response?.status === 401) {
        const isAuthEndpoint =
          url?.includes("/auth/login") || url?.includes("/auth/register");
        if (!isAuthEndpoint) {
          store.dispatch(clearCredentials());
        }
      }

      return {
        error: {
          status: axiosError?.response?.status,
          data:
            axiosError?.response?.data ??
            axiosError?.customMessage ??
            axiosError?.message,
          customMessage:
            axiosError?.customMessage ||
            axiosError?.response?.data?.message ||
            axiosError?.message ||
            "An unexpected error occurred",
        },
      };
    }
  };
