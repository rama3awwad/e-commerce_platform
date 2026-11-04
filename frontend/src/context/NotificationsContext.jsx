import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const NotificationsContext = createContext({ unreadCount: 0, refresh: () => {} });

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

  // للتحديث اليدوي بعد قراءة إشعار (بينستدعى من معالجات الأحداث فقط)
  const refresh = useCallback(async () => {
    if (!localStorage.getItem("token")) {
      return;
    }
    try {
      const res = await api.get("/notifications", { params: { page: 1, limit: 1 } });
      setUnreadCount(res.data.data.meta.unreadCount || 0);
    } catch {
      // تجاهل: العدّاد يضل على آخر قيمة معروفة
    }
  }, []);

  // تحديث تلقائي: عند تسجيل الدخول + عند التنقل بين الصفحات + كل 30 ثانية
  useEffect(() => {
    if (!user) {
      return;
    }
    let ignore = false;
    async function loadUnread() {
      try {
        const res = await api.get("/notifications", { params: { page: 1, limit: 1 } });
        if (!ignore) {
          setUnreadCount(res.data.data.meta.unreadCount || 0);
        }
      } catch {
        // تجاهل: العدّاد يضل على آخر قيمة معروفة
      }
    }
    loadUnread();
    const timer = setInterval(loadUnread, 30000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [user, location.pathname]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
