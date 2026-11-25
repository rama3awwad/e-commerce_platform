import { useEffect, useState } from "react";
import api from "../../api/client";
import { getErrorMessage } from "../../api/errors";
import Pagination from "../../components/Pagination";
import { formatDate } from "../../utils/status";

const jobLabels = {
  QUEUED: "بالانتظار",
  RETRYING: "إعادة محاولة",
  SENT: "أُرسل",
  DEAD: "فشل نهائي (DLQ)",
};
const WORKERS = ["worker-1", "worker-2", "worker-3"];

// مراقبة الإيميلات (المتطلب الرابع): حالة كل رسالة، عدد المحاولات، الـ DLQ، وإعادة المعالجة
function AdminAsyncMonitorPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], counts: {}, meta: null });
  const [forceFail, setForceFail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [workers, setWorkers] = useState(null);

  // تحديث تلقائي كل 3 ثواني: بتشوف الحالة تتغير (بالانتظار، ثم إعادة محاولة، ثم DLQ) بدون Refresh
  useEffect(() => {
    let ignore = false;
    function load() {
      const params = { page, limit: 10 };
      if (status) params.status = status;
      api
        .get("/admin/email-jobs", { params })
        .then((res) => {
          if (!ignore) {
            setData(res.data.data);
            setError("");
          }
        })
        .catch((err) => {
          if (!ignore) setError(getErrorMessage(err));
        });
    }
    load();
    const timer = setInterval(load, 3000);
    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, [page, status]);

  useEffect(() => {
    api
      .get("/admin/email-jobs/settings")
      .then((res) => setForceFail(res.data.data.forceFail))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ignore = false;
    function load() {
      api.get("/admin/email-jobs/workers")
        .then((res) => { if (!ignore) setWorkers(res.data.data); })
        .catch(() => {});
    }
    load();
    const timer = setInterval(load, 4000);
    return () => { ignore = true; clearInterval(timer); };
  }, []);

  function chooseStatus(value) {
    setStatus(value);
    setPage(1);
  }

  async function toggleForceFail() {
    setBusy(true);
    setError("");
    try {
      const res = await api.patch("/admin/email-jobs/settings", { forceFail: !forceFail });
      setForceFail(res.data.data.forceFail);
      setMessage(
        res.data.data.forceFail
          ? "تم تفعيل محاكاة الفشل: كل الإيميلات الجديدة رح تفشل (للعرض فقط)"
          : "تم إيقاف محاكاة الفشل: الإيميلات رح ترسل بشكل طبيعي"
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function requeue(job) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.post("/admin/email-jobs/" + job.id + "/requeue");
      setMessage("أُعيد إرسال إيميل الطلب #" + job.orderNumber + " إلى الطابور");
    } catch (err) {
      setError(getErrorMessage(err, { INVALID_STATE: "يمكن إعادة معالجة الرسائل الفاشلة نهائياً فقط" }));
    } finally {
      setBusy(false);
    }
  }

  const counts = data.counts || {};

  return (
    <div className="container page">
      <h1 className="page-title">مراقبة الإيميلات (الطابور والـ Worker)</h1>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong>محاكاة فشل الإيميل:</strong>{" "}
            <span className={"badge " + (forceFail ? "badge-DEAD" : "badge-SENT")}>
              {forceFail ? "مفعّلة" : "متوقفة"}
            </span>
            <div className="muted">
              عند التفعيل كل محاولة إرسال بتفشل، فبتشوف إعادة المحاولة بعد 30 ثانية ثم 90 ثانية ثم الـ DLQ.
            </div>
          </div>
          <button className="btn btn-outline btn-small" disabled={busy} onClick={toggleForceFail}>
            {forceFail ? "إيقاف المحاكاة" : "تفعيل المحاكاة"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>الـ Workers (طابور order.email)</strong>
        {workers && workers.queue.available ? (
          <div className="muted" style={{ margin: "6px 0 12px" }}>
            Consumers نشطين الآن: <strong>{workers.queue.consumers}</strong> / {WORKERS.length} · بالانتظار: {workers.queue.messagesReady} · قيد المعالجة: {workers.queue.messagesUnacknowledged}
          </div>
        ) : <div className="muted" style={{ margin: "6px 0 12px" }}>تعذّرت قراءة RabbitMQ: {workers ? workers.queue.reason : "..."}</div>}
        <div className="table-wrap"><table className="table">
          <thead><tr><th>الـ Worker</th><th>رسائل عالجها</th><th>آخر نشاط</th></tr></thead>
          <tbody>{WORKERS.map((name) => {
            const row = workers && workers.byWorker.find((worker) => worker.worker === name);
            return <tr key={name}><td>{name}</td><td>{row ? row.processed : 0}</td><td className="muted">{row && row.lastActivityAt ? formatDate(row.lastActivityAt) : "-"}</td></tr>;
          })}</tbody>
        </table></div>
      </div>

      <div className="chips">
        <button className={"chip" + (status === "" ? " active" : "")} onClick={() => chooseStatus("")}>
          الكل
        </button>
        {Object.keys(jobLabels).map((key) => (
          <button
            key={key}
            className={"chip" + (status === key ? " active" : "")}
            onClick={() => chooseStatus(key)}
          >
            {jobLabels[key]} ({counts[key] || 0})
          </button>
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="empty">ما في رسائل بهالحالة</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الطلب</th>
                <th>المستلم</th>
                <th>الحالة</th>
                <th>المحاولات</th>
                <th>عولج بواسطة</th>
                <th>آخر خطأ</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((job) => (
                <tr key={job.id}>
                  <td>#{job.orderNumber}</td>
                  <td>{job.recipient}</td>
                  <td>
                    <span className={"badge badge-" + job.status}>{jobLabels[job.status]}</span>
                  </td>
                  <td>
                    {job.attempts} / {job.maxAttempts}
                  </td>
                  <td>{job.processedBy || "-"}</td>
                  <td className="muted">{job.lastError || "-"}</td>
                  <td className="muted">{formatDate(job.createdAt)}</td>
                  <td>
                    {job.status === "DEAD" && (
                      <button className="btn btn-primary btn-small" disabled={busy} onClick={() => requeue(job)}>
                        إعادة معالجة
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination meta={data.meta} page={page} onPage={setPage} />
    </div>
  );
}

export default AdminAsyncMonitorPage;
