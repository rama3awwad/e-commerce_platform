import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client";
import { getErrorMessage } from "../api/errors";
import { loadProductNames } from "../api/products";
import OrderCard from "../components/OrderCard";
import Pagination from "../components/Pagination";
import { statusLabels } from "../utils/status";

function OrdersPage() {
  const location = useLocation();

  const [result, setResult] = useState({ key: null, orders: [], meta: null, names: {}, error: "" });
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState(
    location.state && location.state.created ? "تم إنشاء الطلب بنجاح" : ""
  );

  const queryKey = [page, status].join("|");
  const loading = result.key !== queryKey;

  useEffect(() => {
    let ignore = false;

    const params = { page: page, limit: 10 };
    if (status) params.status = status;

    api
      .get("/orders", { params })
      .then(async (res) => {
        const list = res.data.data.items;

        // نجيب أسماء المنتجات الموجودة بالطلبات
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

  async function handleCancel(id) {
    if (!window.confirm("هل أنت متأكد من إلغاء الطلب؟")) return;
    setMessage("");
    try {
      const res = await api.post("/orders/" + id + "/cancel");
      setResult((r) => ({
        ...r,
        orders: r.orders.map((o) => (o.id === id ? res.data.data : o)),
      }));
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
      <h1 className="page-title">طلباتي</h1>

      {message && <div className="alert alert-success">{message}</div>}
      {!loading && result.error && <div className="alert alert-error">{result.error}</div>}

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
        <div className="empty">لا توجد طلبات</div>
      ) : (
        result.orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            names={result.names}
            canCancel={true}
            onCancel={handleCancel}
          />
        ))
      )}

      {!loading && <Pagination meta={result.meta} page={page} onPage={setPage} />}
    </div>
  );
}

export default OrdersPage;
