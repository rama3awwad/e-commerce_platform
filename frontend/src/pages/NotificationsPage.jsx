import { useEffect, useState } from "react";
import api from "../api/client";
import { getErrorMessage } from "../api/errors";
import { useNotifications } from "../context/NotificationsContext";
import Pagination from "../components/Pagination";
import { formatDate, notificationTypeLabels } from "../utils/status";

function NotificationsPage() {
  const { refresh } = useNotifications();

  const [result, setResult] = useState({ key: null, items: [], meta: null, error: "" });
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const queryKey = String(page);
  const loading = result.key !== queryKey;

  useEffect(() => {
    let ignore = false;
    api
      .get("/notifications", { params: { page: page, limit: 10 } })
      .then((res) => {
        if (!ignore) {
          setResult({
            key: queryKey,
            items: res.data.data.items,
            meta: res.data.data.meta,
            error: "",
          });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setResult({ key: queryKey, items: [], meta: null, error: getErrorMessage(err) });
        }
      });
    return () => {
      ignore = true;
    };
  }, [queryKey, page]);

  async function markRead(notification) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await api.patch("/notifications/" + notification.id + "/read");
      setResult((r) => ({
        ...r,
        items: r.items.map((n) =>
          n.id === notification.id ? { ...n, isRead: true } : n
        ),
        meta: r.meta ? { ...r.meta, unreadCount: Math.max(0, r.meta.unreadCount - 1) } : r.meta,
      }));
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function markAllRead() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await api.patch("/notifications/read-all");
      setResult((r) => ({
        ...r,
        items: r.items.map((n) => ({ ...n, isRead: true })),
        meta: r.meta ? { ...r.meta, unreadCount: 0 } : r.meta,
      }));
      setMessage("تم تحديد جميع الإشعارات كمقروءة");
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function setError(msg) {
    setResult((r) => ({ ...r, error: msg }));
  }

  const unreadCount = result.meta ? result.meta.unreadCount || 0 : 0;

  return (
    <div className="container page">
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          الإشعارات
          {unreadCount > 0 && <span className="notif-count">{unreadCount} غير مقروء</span>}
        </h1>
        {unreadCount > 0 && (
          <button className="btn btn-outline btn-small" onClick={markAllRead} disabled={busy}>
            تحديد الكل كمقروء
          </button>
        )}
      </div>

      {!loading && result.error && <div className="alert alert-error">{result.error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      {loading ? (
        <div className="spinner"></div>
      ) : result.items.length === 0 ? (
        <div className="empty">ما في إشعارات، لما يصير شي جديد رح تلاقيه هون</div>
      ) : (
        result.items.map((n) => (
          <div key={n.id} className={"notif" + (n.isRead ? "" : " notif-unread")}>
            <span className="notif-type">
              {notificationTypeLabels[n.type] || "إشعار"}
            </span>
            <div className="notif-body">
              <div className="notif-title">
                {n.title}
                {!n.isRead && <span className="notif-dot" aria-label="غير مقروء"></span>}
              </div>
              <div className="notif-message">{n.message}</div>
              <div className="muted notif-date">{formatDate(n.createdAt)}</div>
            </div>
            {!n.isRead && (
              <button
                className="btn btn-outline btn-small"
                onClick={() => markRead(n)}
                disabled={busy}
              >
                تحديد كمقروء
              </button>
            )}
          </div>
        ))
      )}

      {!loading && <Pagination meta={result.meta} page={page} onPage={setPage} />}
    </div>
  );
}

export default NotificationsPage;
