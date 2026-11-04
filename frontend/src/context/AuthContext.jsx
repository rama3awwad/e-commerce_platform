import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // loading يبدأ true فقط إذا في توكن محفوظ، حتى ما منعمل setState داخل الـ effect
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() =>
    Boolean(localStorage.getItem("token"))
  );

  // عند فتح الموقع: إذا في توكن محفوظ نجيب بيانات المستخدم
  useEffect(() => {
    if (!localStorage.getItem("token")) {
      return;
    }
    let ignore = false;
    api
      .get("/auth/me")
      .then((res) => {
        if (!ignore) setUser(res.data.data);
      })
      .catch(() => localStorage.removeItem("token"))
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function login(identifier, password) {
    const res = await api.post("/auth/login", { identifier, password });
    localStorage.setItem("token", res.data.data.accessToken);
    setUser(res.data.data.user);
  }

  async function register(form) {
    const res = await api.post("/auth/register", form);
    localStorage.setItem("token", res.data.data.accessToken);
    setUser(res.data.data.user);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
