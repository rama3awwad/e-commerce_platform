import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { connectRealtime, disconnectRealtime } from "../api/realtime";

// يفتح اتصال الـ WebSocket عند تسجيل الدخول ويغلقه عند الخروج (لا يعرض شيئاً)
function RealtimeConnector() {
  const { user } = useAuth();
  const userId = user ? user.id : null;

  useEffect(() => {
    if (!userId) return;
    connectRealtime(localStorage.getItem("token"));
    return () => disconnectRealtime();
  }, [userId]);

  return null;
}

export default RealtimeConnector;