import { useCallback, useEffect, useState } from "react";
import api from "../api/client";
import { getErrorMessage } from "../api/errors";
import LiveBadge from "../components/LiveBadge";
import { onRealtime, requestRealtime } from "../api/realtime";
import { statusLabels } from "../utils/status";

// صفحة اختبار الصلاحيات اللحظية (المتطلب الرابع): الزبون يجرّب الاشتراك بقنوات مسموحة وممنوعة
function RealtimeTestPage() {
  const [log, setLog] = useState([]);
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);

  const addLog = useCallback((text, kind) => {
    setLog((old) =>
      [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString("ar"), text, kind }, ...old].slice(0, 30)
    );
  }, []);

  // أي تحديث حالة يصل للزبون عن طلب يتابعه
  useEffect(() => {
    return onRealtime("order.status.changed", (order) => {
      addLog("وصل تحديث لحظي: طلب #" + order.orderNumber + " أصبح " + statusLabels[order.status], "ok");
    });
  }, [addLog]);

  async function subscribe(event, payload, label) {
    setBusy(true);
    const res = await requestRealtime(event, payload);
    if (res.ok) {
      addLog(label + " ← تم القبول" + (res.closed ? " (الطلب منتهٍ، لا يوجد ما يُتابَع)" : ""), "ok");
    } else {
      addLog(label + " ← رُفض: " + res.code + " (" + res.message + ")", "rejected");
    }
    setBusy(false);
  }

  async function followMyLatest() {
    setBusy(true);
    try {
      const res = await api.get("/orders", { params: { page: 1, limit: 1 } });
      const mine = res.data.data.items[0];
      if (!mine) {
        addLog("ما عندك طلبات بعد، أنشئ طلباً أولاً", "rejected");
      } else {
        setBusy(false);
        await subscribe("subscribe:order", { orderId: mine.id }, "اشتراك بطلبي #" + mine.orderNumber);
        return;
      }
    } catch (err) {
      addLog(getErrorMessage(err), "rejected");
    }
    setBusy(false);
  }

  return (
    <div className="container page">
      <h1 className="page-title">اختبار الصلاحيات اللحظية</h1>
      <LiveBadge />
      <p className="muted">
        الاشتراك بالقنوات بيتحقق منه السيرفر: قناة الأدمن للمسؤول فقط، وقناة الطلب لصاحب الطلب فقط.
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button
            className="btn btn-outline btn-small"
            disabled={busy}
            onClick={() => subscribe("subscribe:admin", {}, "اشتراك بقناة الأدمن")}
          >
            اشتراك بقناة الأدمن (لازم يُرفض)
          </button>
          <button className="btn btn-primary btn-small" disabled={busy} onClick={followMyLatest}>
            اشتراك بآخر طلب لي (لازم يُقبل)
          </button>
        </div>
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <input
            className="input"
            placeholder="رقم (id) طلب مستخدم آخر"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value.trim())}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-danger btn-small"
            disabled={busy || !orderId}
            onClick={() => subscribe("subscribe:order", { orderId }, "اشتراك بطلب غير خاص بي")}
          >
            اشتراك بطلب غيري (لازم يُرفض)
          </button>
        </div>
      </div>

      <div className="card">
        <strong>السجل</strong>
        {log.length === 0 ? (
          <div className="empty">لا توجد نتائج بعد</div>
        ) : (
          <ul className="log-list">
            {log.map((entry) => (
              <li key={entry.id} className={"log-" + entry.kind}>
                <span className="muted">{entry.time}</span> {entry.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default RealtimeTestPage;