import { useEffect, useState } from "react";
import api from "../api/client";
import { getErrorMessage } from "../api/errors";
import { summarizeResults } from "../utils/concurrency";

// نجيب الكمية الحالية للمنتج (مصدرها خدمة المستودع)
async function fetchStock(productId) {
  const res = await api.get("/products/" + productId);
  return res.data.data.stock;
}

// نبعت طلب واحد ونرجع نتيجته مع الزمن
async function sendOneOrder(productId, quantity) {
  const start = Date.now();
  try {
    const res = await api.post("/orders", {
      items: [{ productId: productId, quantity: quantity }],
    });
    return {
      ok: true,
      orderId: res.data.data.id,
      orderNumber: res.data.data.orderNumber,
      ms: Date.now() - start,
    };
  } catch (err) {
    const data = err.response && err.response.data;
    return {
      ok: false,
      code: (data && data.code) || "",
      message: getErrorMessage(err),
      ms: Date.now() - start,
    };
  }
}

function ConcurrencyTestPage() {
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [stock, setStock] = useState(null);
  const [count, setCount] = useState(5);
  const [quantity, setQuantity] = useState(1);

  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // جلب المنتجات مرة وحدة لتعبئة القائمة
  useEffect(() => {
    api
      .get("/products", { params: { limit: 100 } })
      .then((res) => {
        const items = res.data.data.items;
        setProducts(items);
        if (items.length > 0) {
          setProductId(items[0].id);
          setStock(items[0].stock);
        }
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function refreshStock(id) {
    try {
      setStock(await fetchStock(id));
    } catch (err) {
      setStock(null);
      setError(getErrorMessage(err));
    }
  }

  function handleSelect(id) {
    setProductId(id);
    setResults(null);
    setError("");
    setMessage("");
    refreshStock(id);
  }

  async function runTest() {
    setError("");
    setMessage("");
    setResults(null);
    setRunning(true);

    try {
      const stockBefore = await fetchStock(productId);
      setStock(stockBefore);

      // نبعت كل الطلبات بنفس اللحظة: ما في await بين الطلبات
      const requests = [];
      for (let i = 0; i < count; i++) {
        requests.push(sendOneOrder(productId, quantity));
      }
      const outcomes = await Promise.all(requests);

      // الكمية بعد الاختبار (إذا المستودع وقع نكمل بدونها)
      let stockAfter = null;
      try {
        stockAfter = await fetchStock(productId);
        setStock(stockAfter);
      } catch {
        setStock(null);
      }

      setResults({
        outcomes: outcomes,
        stockBefore: stockBefore,
        stockAfter: stockAfter,
        quantity: quantity,
        summary: summarizeResults(outcomes, stockBefore, quantity, stockAfter),
      });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  // نلغي طلبات الاختبار الناجحة حتى ترجع الكمية ونقدر نعيد الاختبار
  async function cancelTestOrders() {
    setCancelling(true);
    setError("");
    setMessage("");

    const toCancel = results.outcomes.filter((o) => o.ok && !o.cancelled);
    const cancelledIds = [];
    await Promise.all(
      toCancel.map(async (o) => {
        try {
          await api.post("/orders/" + o.orderId + "/cancel");
          cancelledIds.push(o.orderId);
        } catch {
          // تجاهل: الطلب يمكن انلغى قبل أو تغيرت حالته
        }
      })
    );

    setResults({
      ...results,
      outcomes: results.outcomes.map((o) =>
        cancelledIds.includes(o.orderId) ? { ...o, cancelled: true } : o
      ),
    });
    setMessage("تم إلغاء " + cancelledIds.length + " طلب وإرجاع الكمية للمخزون");
    await refreshStock(productId);
    setCancelling(false);
  }

  const summary = results ? results.summary : null;
  const hasActiveOrders = results && results.outcomes.some((o) => o.ok && !o.cancelled);

  return (
    <div className="container page">
      <h1 className="page-title">اختبار التزامن (Race Condition)</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <strong>كيف تستخدم الصفحة</strong>
        <ol className="test-steps">
          <li>من حساب المسؤول: ضبط مخزون منتج على 1 من صفحة إدارة المنتجات.</li>
          <li>من حساب الزبون: اختيار نفس المنتج من هون.</li>
          <li>الضغط على إرسال: بيطلع كل الطلبات بنفس اللحظة على آخر قطعة.</li>
          <li>المتوقع: ينجح طلب واحد فقط، والباقي ينرفض بسبب الكمية.</li>
        </ol>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="test-controls">
          <div className="form-group test-product">
            <label>المنتج</label>
            <select
              className="select"
              value={productId}
              onChange={(e) => handleSelect(e.target.value)}
              disabled={running}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group test-small">
            <label>عدد الطلبات</label>
            <input
              className="input"
              type="number"
              min="2"
              max="20"
              value={count}
              onChange={(e) => {
                const n = Number(e.target.value);
                setCount(Math.max(2, Math.min(n || 2, 20)));
              }}
              disabled={running}
            />
          </div>

          <div className="form-group test-small">
            <label>الكمية بكل طلب</label>
            <input
              className="input"
              type="number"
              min="1"
              max="10"
              value={quantity}
              onChange={(e) => {
                const n = Number(e.target.value);
                setQuantity(Math.max(1, Math.min(n || 1, 10)));
              }}
              disabled={running}
            />
          </div>
        </div>

        <p style={{ marginBottom: 16 }}>
          المخزون الحالي:{" "}
          <span className="test-stock">{stock === null ? "غير معروف" : stock}</span>{" "}
          <button
            className="btn btn-outline btn-small"
            onClick={() => refreshStock(productId)}
            disabled={running || !productId}
          >
            تحديث
          </button>
        </p>

        <button
          className="btn btn-primary"
          onClick={runTest}
          disabled={running || !productId}
        >
          {running ? "جاري إرسال الطلبات..." : "أرسل " + count + " طلبات بنفس اللحظة"}
        </button>
      </div>

      {summary && (
        <>
          {summary.oversold && (
            <div className="alert alert-error">
              انباع أكتر من المتوفر: نجح {summary.success} طلب والكمية كانت تكفي لـ{" "}
              {summary.expectedSuccess} فقط. هاد خلل بخدمة المستودع (الحجز مو ذري).
            </div>
          )}
          {!summary.oversold && summary.inconclusive && (
            <div className="alert alert-info">
              الاختبار غير مكتمل: فشل {summary.otherFailed} طلب بسبب خطأ غير الكمية (مثلاً
              المستودع متوقف أو محاولات كثيرة). شوف الجدول.
            </div>
          )}
          {summary.correct && (
            <div className="alert alert-success">
              النتيجة صحيحة: نجح {summary.success} طلب فقط من {summary.total}، والباقي (
              {summary.stockFailed}) انرفض بسبب الكمية. ما صار بيع زيادة.
            </div>
          )}
          {!summary.oversold && !summary.inconclusive && !summary.correct && (
            <div className="alert alert-info">
              انرفضت طلبات رغم إنه الكمية كانت تكفي لـ {summary.expectedSuccess} طلب. نجح
              {" "}{summary.success} فقط.
            </div>
          )}

          <p style={{ marginBottom: 12 }}>
            المخزون قبل الاختبار: <strong>{results.stockBefore}</strong> ، بعده:{" "}
            <strong>{results.stockAfter === null ? "غير معروف" : results.stockAfter}</strong>{" "}
            (المتوقع بعد الطلبات الناجحة: {summary.expectedStockAfter})
            {summary.stockConsistent === false && (
              <span className="badge badge-CANCELLED" style={{ marginInlineStart: 8 }}>
                المخزون غير متطابق
              </span>
            )}
          </p>

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>النتيجة</th>
                  <th>التفاصيل</th>
                  <th>الزمن</th>
                </tr>
              </thead>
              <tbody>
                {results.outcomes.map((o, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      {o.ok ? (
                        <span className="badge badge-DELIVERED">نجح</span>
                      ) : o.code === "INSUFFICIENT_STOCK" ? (
                        <span className="badge badge-PENDING">رُفض (الكمية)</span>
                      ) : (
                        <span className="badge badge-CANCELLED">خطأ</span>
                      )}
                    </td>
                    <td>
                      {o.ok
                        ? "طلب رقم #" + o.orderNumber + (o.cancelled ? " (تم إلغاؤه)" : "")
                        : o.message}
                    </td>
                    <td>{o.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasActiveOrders && (
            <button
              className="btn btn-danger"
              onClick={cancelTestOrders}
              disabled={cancelling}
            >
              {cancelling ? "جاري الإلغاء..." : "إلغاء طلبات الاختبار وإرجاع الكمية"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default ConcurrencyTestPage;