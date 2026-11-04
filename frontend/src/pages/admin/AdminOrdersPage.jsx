import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import { getErrorMessage } from "../../api/errors";
import { loadProductNames } from "../../api/products";
import Pagination from "../../components/Pagination";
import {
  formatDate,
  nextStatuses,
  statusActionLabels,
  statusLabels,
} from "../../utils/status";

// كرت طلب بأسلوب المسؤول: بعرض اسم العميل وأزرار تغيير الحالة
function AdminOrderCard({ order, names, customers, busy, onStatus }) {
  const transitions = nextStatuses[order.status] || [];
  const customer = customers[order.userId] || "عميل " + order.userId.slice(0, 8);

  return (
    <div className="card order-card">
      <div className="order-head">
        <div>
          <Link to={"/orders/" + order.id} className="order-number">
            طلب رقم #{order.orderNumber}
          </Link>
          <div className="muted">{formatDate(order.createdAt)}</div>
          <div className="muted customer-line">العميل: {customer}</div>
        </div>
        <span className={"badge badge-" + order.status}>
          {statusLabels[order.status]}
        </span>
      </div>

      <div>
        {order.items.map((item) => (
          <div key={item.id} className="order-item">
            <span>
              {names[item.productId] || "..."} × {item.quantity}
            </span>
            <span>{(Number(item.unitPrice) * item.quantity).toFixed(2)} $</span>
          </div>
        ))}
      </div>

      <div className="order-foot">
        <strong>الإجمالي: {Number(order.totalAmount).toFixed(2)} $</strong>
        <div className="row">
          {transitions.length === 0 ? (
            <span className="muted">لا توجد إجراءات، الطلب وصل لحالته النهائية</span>
          ) : (
            transitions.map((next) =>
              next === "CANCELLED" ? (
                <button
                  key={next}
                  className="btn btn-danger btn-small"
                  disabled={busy}
                  onClick={() => onStatus(order, next)}
                >
                  {statusActionLabels[next]}
                </button>
              ) : (
                <button
                  key={next}
                  className="btn btn-primary btn-small"
                  disabled={busy}
                  onClick={() => onStatus(order, next)}
                >
                  {statusActionLabels[next]}
                </button>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}

function AdminOrdersPage() {
  const [result, setResult] = useState({ key: null, orders: [], meta: null, names: {}, error: "" });
  const [customers, setCustomers] = useState({});
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const queryKey = [page, status].join("|");
  const loading = result.key !== queryKey;

  // أسماء العملاء (المسؤول بس): GET /users
  useEffect(() => {
    api
      .get("/users", { params: { page: 1, limit: 100 } })
      .then((res) => {
        const map = {};
        res.data.data.items.forEach((u) => {
          const name =
            [u.firstName, u.lastName].filter(Boolean).join(" ") ||
            u.username ||
            u.email;
          map[u.id] = name + (u.role === "ADMIN" ? " (مسؤول)" : "");
        });
        setCustomers(map);
      })
      .catch(() => {
        // إذا فشل الجلب منعرض رقم جزئي من الـ id بدل الاسم
      });
  }, []);

  useEffect(() => {
    let ignore = false;
    const params = { page: page, limit: 10 };
    if (status) params.status = status;

    api
      .get("/orders", { params })
      .then(async (res) => {
        const list = res.data.data.items;
        const ids = [];
        list.forEach((order) =>
          order.items.forEach((item) => {
            if (!ids.includes(item.productId)) ids.push(item.productId);
          })
        );
        const names = await loadProductNames(ids);
        if (!ignore) {
          setResult({ key: queryKey, orders: list, meta: res.data.data.meta, names, error: "" });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setResult({ key: queryKey, orders: [], meta: null, names: {}, error: getErrorMessage(err) });
        }
      });
    return () => {
      ignore = true;
    };
  }, [queryKey, page, status]);

  function chooseStatus(value) {
    setStatus(value);
    setPage(1);
  }

  async function handleStatus(order, next) {
    if (next === "CANCELLED" && !window.confirm("هل أنت متأكد من إلغاء الطلب؟")) {
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const res = await api.patch("/orders/" + order.id + "/status", { status: next });
      setResult((r) => ({
        ...r,
        orders: r.orders.map((o) => (o.id === order.id ? res.data.data : o)),
      }));
      setMessage(
        "تم تحديث حالة الطلب #" + order.orderNumber + " إلى: " + statusLabels[next]
      );
    } catch (err) {
      setError(
        getErrorMessage(err, {
          INVALID_STATUS_TRANSITION: "لا يمكن تغيير الحالة، حالة الطلب تغيّرت للتو",
          FORBIDDEN: "تغيير حالة الطلب للمسؤول فقط",
        })
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <h1 className="page-title">إدارة الطلبات</h1>

      {message && <div className="alert alert-success">{message}</div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}

      <div className="chips">
        <button
          className={"chip" + (status === "" ? " active" : "")}
          onClick={() => chooseStatus("")}
        >
          الكل
        </button>
        {Object.keys(statusLabels).map((key) => (
          <button
            key={key}
            className={"chip" + (status === key ? " active" : "")}
            onClick={() => chooseStatus(key)}
          >
            {statusLabels[key]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="spinner"></div>
      ) : result.orders.length === 0 ? (
        <div className="empty">ما في طلبات بهالحالة</div>
      ) : (
        result.orders.map((order) => (
          <AdminOrderCard
            key={order.id}
            order={order}
            names={result.names}
            customers={customers}
            busy={busy}
            onStatus={handleStatus}
          />
        ))
      )}

      {!loading && <Pagination meta={result.meta} page={page} onPage={setPage} />}
    </div>
  );
}

export default AdminOrdersPage;
