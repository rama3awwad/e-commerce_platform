import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { imageSrc } from "../api/client";
import { getErrorMessage } from "../api/errors";
import { useCart } from "../context/CartContext";

// رسالة خطأ إنشاء الطلب: إذا الكمية غير كافية نعرض تفاصيل كل منتج
function orderErrorMessage(err, items) {
  // انتهت المهلة: ممكن الطلب يكون انسجل بالسيرفر بس الرد ما وصل
  if (err.code === "ECONNABORTED") {
    return "انتهت مهلة الطلب. ما منعرف إذا انسجل الطلب أو لا، تأكد من صفحة طلباتي قبل ما تعيد المحاولة حتى ما ينعمل طلب مرتين";
  }
  const data = err.response && err.response.data;
  if (data && data.code === "INSUFFICIENT_STOCK" && Array.isArray(data.details)) {
    const lines = data.details.map((d) => {
      const item = items.find((i) => i.productId === d.productId);
      const name = item ? item.name : "منتج";
      return name + ": المتوفر " + d.available + " والمطلوب " + d.requested;
    });
    return "الكمية غير كافية:\n" + lines.join("\n");
  }
  return getErrorMessage(err, {
    NOT_FOUND: "أحد المنتجات لم يعد متوفراً في المتجر، احذفه من السلة",
    INVENTORY_UNAVAILABLE:
      "خدمة المستودع غير متاحة حالياً ولم يتم إنشاء الطلب. سلتك محفوظة، حاول مرة ثانية بعد قليل",
  });
}

function CartPage() {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart();
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleOrder() {
    setError("");
    setLoading(true);
    try {
      const body = {
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      };
      await api.post("/orders", body);
      clearCart();
      navigate("/orders", { state: { created: true } });
    } catch (err) {
      setError(orderErrorMessage(err, items));
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="container page">
        <h1 className="page-title">السلة</h1>
        <div className="empty">
          السلة فارغة. <Link to="/products">تصفح المنتجات</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <h1 className="page-title">السلة</h1>

      {error && (
        <div className="alert alert-error" style={{ whiteSpace: "pre-line" }}>
          {error}
        </div>
      )}

      <div className="card">
        {items.map((item) => (
          <div key={item.productId} className="cart-row">
            {item.imageUrl ? (
              <img className="cart-thumb" src={imageSrc(item.imageUrl)} alt={item.name} />
            ) : (
              <div className="cart-thumb"></div>
            )}

            <div className="cart-name">
              {item.name}
              <div className="muted">{Number(item.price).toFixed(2)} $</div>
            </div>

            <input
              className="input qty-input"
              type="number"
              min="1"
              max="100"
              value={item.quantity}
              onChange={(e) => {
                const n = Number(e.target.value);
                updateQuantity(item.productId, Math.max(1, Math.min(n || 1, 100)));
              }}
            />

            <strong>{(Number(item.price) * item.quantity).toFixed(2)} $</strong>

            <button
              className="btn btn-danger btn-small"
              onClick={() => removeItem(item.productId)}
            >
              حذف
            </button>
          </div>
        ))}

        <div className="cart-total">
          <span>الإجمالي</span>
          <span>{totalPrice.toFixed(2)} $</span>
        </div>

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handleOrder} disabled={loading}>
            {loading ? "جاري إنشاء الطلب..." : "إنشاء الطلب"}
          </button>
          <button className="btn btn-outline" onClick={clearCart} disabled={loading}>
            تفريغ السلة
          </button>
        </div>
      </div>
    </div>
  );
}

export default CartPage;