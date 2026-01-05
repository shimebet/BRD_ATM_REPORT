import axios from "axios";

/* =====================================================
   AXIOS INSTANCE
===================================================== */
const api = axios.create({
  baseURL: "http://localhost:4000/api",
  timeout: 15000
});

/* =====================================================
   ATTACH JWT TOKEN TO EVERY REQUEST
===================================================== */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("cbe_token"); // MUST match Login.jsx
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/* =====================================================
   GLOBAL RESPONSE HANDLING (OPTIONAL BUT GOOD)
===================================================== */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      console.warn("Unauthorized – token missing or expired");
      // optional: auto logout
      // localStorage.removeItem("cbe_token");
      // window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
