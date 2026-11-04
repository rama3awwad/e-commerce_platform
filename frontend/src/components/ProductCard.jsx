import { Link } from "react-router-dom";
import { imageSrc } from "../api/client";

function ProductCard({ product }) {
  return (
    <Link to={"/products/" + product.id} className="product-card">
      <div className="product-image-wrap">
        {product.imageUrl ? (
          <img
            className="product-image"
            src={imageSrc(product.imageUrl)}
            alt={product.name}
          />
        ) : (
          <div className="product-image"></div>
        )}
      </div>

      <div className="product-info">
        <div className="product-name">{product.name}</div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="product-price">{Number(product.price).toFixed(2)} $</div>
          {product.stock === 0 && <span className="badge badge-CANCELLED">نفد</span>}
        </div>
      </div>
    </Link>
  );
}

export default ProductCard;