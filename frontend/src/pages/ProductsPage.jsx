import { useEffect, useState } from "react";
import api from "../api/client";
import { getErrorMessage, isRetryable } from "../api/errors";
import { cacheProducts } from "../api/products";
import Pagination from "../components/Pagination";
import ProductCard from "../components/ProductCard";

function ProductsPage() {
  const [categories, setCategories] = useState([]);
  // نخزن النتيجة مع مفتاح الاستعلام، وloading منشتق منه بدون setState داخل الـ effect
  const [result, setResult] = useState({
    key: null,
    products: [],
    meta: null,
    error: "",
    retryable: false,
  });

  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  // زر إعادة المحاولة بيزيد هالعدّاد فبيتغير queryKey وبيعيد الجلب
  const [reload, setReload] = useState(0);

  const queryKey = [page, category, search, reload].join("|");
  const loading = result.key !== queryKey;
  const { products, meta, error, retryable } = result;

  // جلب الأقسام مرة وحدة
  useEffect(() => {
    api
      .get("/categories")
      .then((res) => setCategories(res.data.data))
      .catch(() => {});
  }, []);

  // جلب المنتجات كل ما تغيرت الصفحة أو القسم أو البحث
  useEffect(() => {
    let ignore = false;

    const params = { page: page, limit: 12 };
    if (category) params.category = category;
    if (search) params.search = search;

    api
      .get("/products", { params })
      .then((res) => {
        if (ignore) return;
        cacheProducts(res.data.data.items);
        setResult({
          key: queryKey,
          products: res.data.data.items,
          meta: res.data.data.meta,
          error: "",
          retryable: false,
        });
      })
      .catch((err) => {
        if (!ignore) {
          setResult({
            key: queryKey,
            products: [],
            meta: null,
            error: getErrorMessage(err),
            retryable: isRetryable(err),
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [queryKey, page, category, search]);

  function chooseCategory(id) {
    setCategory(id);
    setPage(1);
  }

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  return (
    <div className="container page">
      <h1 className="page-title">المنتجات</h1>

      <div className="toolbar">
        <form className="search-form" onSubmit={handleSearch}>
          <input
            className="input"
            placeholder="ابحث عن منتج..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button className="btn btn-primary">بحث</button>
        </form>
      </div>

      <div className="chips">
        <button
          className={"chip" + (category === "" ? " active" : "")}
          onClick={() => chooseCategory("")}
        >
          الكل
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={"chip" + (category === c.id ? " active" : "")}
            onClick={() => chooseCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {!loading && error && (
        <div className="alert alert-error alert-action">
          <span>{error}</span>
          {retryable && (
            <button className="btn btn-outline btn-small" onClick={() => setReload(reload + 1)}>
              إعادة المحاولة
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="spinner"></div>
      ) : products.length === 0 ? (
        <div className="empty">لا توجد منتجات مطابقة</div>
      ) : (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {!loading && <Pagination meta={meta} page={page} onPage={setPage} />}
    </div>
  );
}

export default ProductsPage;