import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { getErrorMessage } from "../api/errors";
import { loadProductNames } from "../api/products";
import { useAuth } from "../context/AuthContext";
import OrderCard from "../components/OrderCard";
import LiveBadge from "../components/LiveBadge";
import { onRealtime, watchOrder } from "../api/realtime";
import { statusLabels } from "../utils/status";

function OrderDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [result, setResult] = useState({ key: null, order: null, names: {}, error: "" });
  const [message, setMessage] = useState("");

  const loading = result.key !== id;

  useEffect(() => {
    let ignore = false;
    api
      .get("/orders/" + id)
      .then(async (res) => {
        const order = res.data.data;
        const names = await loadProductNames(order.items.map((item) => item.productId));
        if (!ignore) setResult({ key: id, order, names, error: "" });
      })
      .catch((err) => {
        if (!ignore) {
          setResult({
            key: id,
            order: null,
            names: {},
            error: getErrorMessage(err, {
              FORBIDDEN: "هذا الطلب لا يخصّك، لا يمكنك عرضه",
            }),
          });
        }
      });
    return () => {
      ignore = true;
    };
  }, [id]);

  // ===== المتطلب الرابع: متابعة حالة الطلب لحظياً (للزبون صاحب الطلب فقط) =====
  const role = user ? user.role : "";
  useEffect(() => {
    if (role !== "CUSTOMER") return;
    const stop = watchOrder(id);
    const off = onRealtime("order.status.changed", (order) => {
      if (order.id !== id) return;
      setResult((r) => (r.order ? { ...r, order: { ...r.order, ...order } } : r));
      setMessage("تم تحديث حالة طلبك: " + statusLabels[order.status]);
    });
    return () => {
      off();
      stop();
    };
  }, [id, role]);

  async function handleCancel() {
    if (!window.confirm("هل أنت متأكد من إلغاء الطلب؟")) return;
    setMessage("");
    try {
      const res = await api.post("/orders/" + id + "/cancel");
      setResult((r) => ({ ...r, order: res.data.data }));
      setMessage("تم إلغاء الطلب");
    } catch (err) {
      setMessage("");
      setResult((r) => ({
        ...r,
        error: getErrorMessage(err, {
          INVALID_STATUS_TRANSITION: "لا يمكن إلغاء هذا الطلب، حالته تغيّرت",
        }),
      }));
    }
  }

  return (
    <div className="container page">
      <a className="back-link" style={{ cursor: "pointer" }} onClick={() => navigate(-1)}>
        → رجوع
      </a>

      {message && <div className="alert alert-success">{message}</div>}
      {!loading && result.error && <div className="alert alert-error">{result.error}</div>}
      {role === "CUSTOMER" && <LiveBadge />}
      {loading && <div className="spinner"></div>}

      {!loading && result.order && (
        <OrderCard
          order={result.order}
          names={result.names}
          canCancel={user.role === "CUSTOMER"}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}

export default OrderDetailsPage;
