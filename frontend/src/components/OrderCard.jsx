import { Link } from "react-router-dom";
import { statusLabels, formatDate } from "../utils/status";

function OrderCard({ order, names, canCancel, onCancel }) {
  const cancellable =
    canCancel && (order.status === "PENDING" || order.status === "CONFIRMED");

  return (
    <div className="card order-card">
      <div className="order-head">
        <div>
          <Link to={"/orders/" + order.id} className="order-number">
            طلب رقم #{order.orderNumber}
          </Link>
          <div className="muted">{formatDate(order.createdAt)}</div>
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
        {cancellable && (
          <button
            className="btn btn-danger btn-small"
            onClick={() => onCancel(order.id)}
          >
            إلغاء الطلب
          </button>
        )}
      </div>
    </div>
  );
}

export default OrderCard;