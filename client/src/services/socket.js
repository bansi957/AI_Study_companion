import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  import.meta.env.VITE_API_URL?.replace(/\/api\/?$/, "") ||
  "http://localhost:3000";

let socket = null;

/**
 * Get or initialize socket singleton
 */
export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log(`[Socket.io] Connected to server: ${socket.id}`);
    });

    socket.on("connect_error", (err) => {
      console.warn(`[Socket.io] Connection error: ${err.message}`);
    });
  }

  return socket;
};

/**
 * Join a specific project room to receive real-time document updates
 */
export const joinProjectRoom = (projectId) => {
  if (!projectId) return;
  const s = getSocket();
  if (s.connected) {
    s.emit("join:project", projectId);
  } else {
    s.once("connect", () => {
      s.emit("join:project", projectId);
    });
  }
};

/**
 * Leave a specific project room
 */
export const leaveProjectRoom = (projectId) => {
  if (!projectId) return;
  const s = getSocket();
  if (s.connected) {
    s.emit("leave:project", projectId);
  }
};

/**
 * Subscribe to material status updates
 *
 * @param {Function} callback - Receives { projectId, materialId, status, stage, pageCount, error }
 * @returns {Function} Unsubscribe function
 */
export const subscribeToMaterialStatus = (callback) => {
  const s = getSocket();
  const handler = (data) => {
    callback(data);
  };

  s.on("material:status", handler);

  return () => {
    s.off("material:status", handler);
  };
};
