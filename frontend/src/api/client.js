import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const api = axios.create({
  baseURL: API_URL + "/api/v1",
  timeout: 15000,
});

// نضيف التوكن مع كل طلب
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = "Bearer " + token;
  }
  return config;
});

// إذا انتهت الجلسة (401) نرجع لصفحة الدخول
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response && error.response.status;
    const url = (error.config && error.config.url) || "";
    if (status === 401 && !url.includes("/auth/login")) {
      localStorage.removeItem("token");
      localStorage.removeItem("cart");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

// صور الـ seed روابط كاملة، والصور المرفوعة مسار يبدأ بـ /uploads
export function imageSrc(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return API_URL + url;
}