import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { imageSrc } from "../api/client";
import { getErrorMessage, isRetryable } from "../api/errors";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

function ProductDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { addItem } = useCart();

  const [result, setResult] = useState({ key: null, product: null, error: "", retryable: false });
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");
  // زر إعادة المحاولة بيزيد هالعدّاد فبيتغير queryKey وبيعيد الجلب
  const [reload, setReload] = useState(0);

  const queryKey = id + "|" + reload;
  const loading = result.key !== queryKey;

  useEffect(() => {
    let ignore = false;
    api
      .get("/products/" + id)
      .then((res) => {
        if (!ignore) {
          setResult({ key: queryKey, product: res.data.data, error: "", retryable: false });
        }
      })
      .catch((err) => {
        if (!ignore) {
          setResult({
            key: queryKey,
            product: null,
            error: getErrorMessage(err),
            retryable: isRetryable(err),
          });
        }
      });
    return () => {
      ignore = true;
    };
  }, [id, queryKey]);

  function handleAdd() {
    addItem(result.product, quantity);
    setMessage("تمت إضافة المنتج إلى السلة");
  }

  if (loading) {
    return <div className="spinner"></div>;
  }

  const { product, error, retryable } = result;

  if (error) {
    return (
      <div className="container page">
        <Link to="/products" className="back-link">→ رجوع للمنتجات</Link>
        <div className="alert alert-error alert-action">
          <span>{error}</span>
          {retryable && (
            <button className="btn btn-outline btn-small" onClick={() => setReload(reload + 1)}>
              إعادة المحاولة
            </button>
          )}
        </div>
      </div>
    );
  }

  const maxQty = Math.min(product.stock, 100);

  return (
    <div className="container page">
      <Link to="/products" className="back-link">→ رجوع للمنتجات</Link>

      <div className="details">
        {product.imageUrl ? (
          <img
            className="details-image"
            src={imageSrc(product.imageUrl)}
            alt={product.name}
          />
        ) : (
          <div className="details-image"></div>
        )}

        <div>
          <h1 className="details-title">{product.name}</h1>
          {product.category && <p className="muted">{product.category.name}</p>}
          <div className="details-price">{Number(product.price).toFixed(2)} $</div>

          {product.description && (
            <p style={{ marginBottom: 16 }}>{product.description}</p>
          )}

          <p style={{ marginBottom: 20 }}>
            الكمية المتوفرة:{" "}
            {product.stock > 0 ? (
              <span className="badge badge-DELIVERED">{product.stock} قطعة</span>
            ) : (
              <span className="badge badge-CANCELLED">نفدت الكمية</span>
            )}
          </p>

          {message && <div className="alert alert-success">{message}</div>}

          {user && user.role === "CUSTOMER" && product.stock > 0 && (
            <div className="row">
              <input
                className="input qty-input"
                type="number"
                min="1"
                max={maxQty}
                value={quantity}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setQuantity(Math.max(1, Math.min(n || 1, maxQty)));
                }}
              />
              <button className="btn btn-primary" onClick={handleAdd}>
                أضف إلى السلة
              </button>
            </div>
          )}

          {user && user.role === "ADMIN" && (
            <p className="muted">حساب المسؤول لا يمكنه إنشاء طلبات.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductDetailsPage;