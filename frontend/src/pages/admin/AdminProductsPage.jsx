import { useEffect, useRef, useState } from "react";
import api, { imageSrc } from "../../api/client";
import { getErrorMessage } from "../../api/errors";
import { cacheProducts } from "../../api/products";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // نفس حد الباك: 2 ميغابايت
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// فورم إضافة/تعديل منتج: multipart/form-data مع صورة
function ProductForm({ product, categories, onSaved, onClose }) {
  const isEdit = Boolean(product);
  const [form, setForm] = useState({
    name: product ? product.name : "",
    description: product && product.description ? product.description : "",
    price: product ? String(product.price) : "",
    categoryId: product ? product.categoryId : "",
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(
    product && product.imageUrl ? imageSrc(product.imageUrl) : ""
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function validateImage(chosen) {
    if (!ALLOWED_TYPES.includes(chosen.type)) {
      return "نوع الصورة غير مدعوم (jpeg أو png أو webp فقط)";
    }
    if (chosen.size > MAX_IMAGE_SIZE) {
      return "حجم الصورة كبير (الحد الأقصى 2 ميغابايت)";
    }
    return "";
  }

  function handleFile(e) {
    const chosen = e.target.files && e.target.files[0];
    if (!chosen) return;
    const problem = validateImage(chosen);
    if (problem) {
      setError(problem);
      e.target.value = "";
      return;
    }
    setError("");
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const name = form.name.trim();
    if (name.length < 2 || name.length > 160) {
      setError("اسم المنتج لازم يكون بين حرفين و160 حرف");
      return;
    }
    const price = Number(form.price);
    if (!form.price || !Number.isFinite(price) || price < 0.01) {
      setError("السعر لازم يكون رقماً أكبر من صفر");
      return;
    }
    if (Math.round(price * 100) !== price * 100) {
      setError("السعر بحد أقصى خانتين عشريتين");
      return;
    }
    if (!form.categoryId) {
      setError("اختر القسم");
      return;
    }
    if (!isEdit && !file) {
      setError("صورة المنتج مطلوبة");
      return;
    }

    const data = new FormData();
    data.append("name", name);
    if (form.description.trim()) data.append("description", form.description.trim());
    data.append("price", String(price));
    data.append("categoryId", form.categoryId);
    if (file) data.append("image", file);

    setSubmitting(true);
    try {
      const res = isEdit
        ? await api.patch("/products/" + product.id, data)
        : await api.post("/products", data);
      onSaved(res.data.data, isEdit);
    } catch (err) {
      setError(
        getErrorMessage(err, {
          NOT_FOUND: isEdit ? "المنتج أو القسم غير موجود" : "القسم غير موجود",
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "تعديل المنتج" : "منتج جديد"} onClose={onClose} wide>
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>اسم المنتج *</label>
            <input className="input" name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>السعر (دولار) *</label>
            <input
              className="input"
              name="price"
              type="number"
              step="0.01"
              min="0.01"
              value={form.price}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>القسم *</label>
          <select className="select" name="categoryId" value={form.categoryId} onChange={handleChange} required>
            <option value="">اختر القسم...</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>الوصف</label>
          <textarea
            className="textarea"
            name="description"
            value={form.description}
            onChange={handleChange}
          />
        </div>

        <div className="form-group">
          <label>الصورة {isEdit ? "(اتركها فارغة للإبقاء على الصورة الحالية)" : "*"}</label>
          <div className="file-row">
            <button
              type="button"
              className="btn btn-outline btn-small"
              onClick={() => fileInputRef.current.click()}
            >
              اختر صورة
            </button>
            <span className="muted">
              {file ? file.name : "jpeg أو png أو webp، حتى 2 ميغابايت"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(",")}
              onChange={handleFile}
              hidden
            />
          </div>
          {preview && (
            <img className="file-preview" src={preview} alt="معاينة الصورة" />
          )}
        </div>

        <div className="row modal-actions">
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "إضافة المنتج"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdminProductsPage() {
  const [result, setResult] = useState({ key: null, products: [], meta: null, error: "" });
  const [categories, setCategories] = useState([]);

  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const [modal, setModal] = useState(null); // null | { product }
  const [stockEdits, setStockEdits] = useState({}); // productId -> قيمة جديدة
  const [stockBusy, setStockBusy] = useState({});
  const [reload, setReload] = useState(0); // عدّاد لإعادة الجلب بعد الإضافة/الحذف
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const queryKey = [page, category, search, reload].join("|");
  const loading = result.key !== queryKey;

  useEffect(() => {
    api
      .get("/categories")
      .then((res) => setCategories(res.data.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ignore = false;
    const params = { page: page, limit: 10 };
    if (category) params.category = category;
    if (search) params.search = search;

    api
      .get("/products", { params })
      .then((res) => {
        if (ignore) return;
        cacheProducts(res.data.data.items);
        setResult({ key: queryKey, products: res.data.data.items, meta: res.data.data.meta, error: "" });
      })
      .catch((err) => {
        if (!ignore) setResult({ key: queryKey, products: [], meta: null, error: getErrorMessage(err) });
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

  function startEdit(product) {
    setError("");
    setMessage("");
    setModal({ product });
  }

  function handleSaved(product, wasEdit) {
    // نحدث الصف الحالي إذا موجود، وإلا نعيد الجلب (منتج جديد)
    setResult((r) => {
      const exists = r.products.some((p) => p.id === product.id);
      if (exists) {
        return {
          ...r,
          products: r.products.map((p) => (p.id === product.id ? product : p)),
        };
      }
      return r;
    });
    if (!wasEdit) setReload((n) => n + 1);
    setStockEdits((s) => {
      const next = { ...s };
      delete next[product.id];
      return next;
    });
    setModal(null);
    setMessage(wasEdit ? "تم حفظ تعديلات المنتج" : "تمت إضافة المنتج بنجاح");
  }

  async function saveStock(product) {
    const raw = stockEdits[product.id];
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("المخزون لازم يكون رقماً صحيحاً (0 أو أكثر)");
      return;
    }
    setError("");
    setMessage("");
    setStockBusy((b) => ({ ...b, [product.id]: true }));
    try {
      const res = await api.patch("/products/" + product.id + "/stock", { quantity });
      setResult((r) => ({
        ...r,
        products: r.products.map((p) => (p.id === product.id ? res.data.data : p)),
      }));
      setStockEdits((s) => {
        const next = { ...s };
        delete next[product.id];
        return next;
      });
      setMessage("تم تحديث مخزون " + product.name + " إلى " + quantity);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setStockBusy((b) => ({ ...b, [product.id]: false }));
    }
  }

  async function handleDelete(product) {
    if (
      !window.confirm(
        "هل أنت متأكد من حذف " + product.name + "؟ إذا كان مرتبطاً بطلبات رح يتم تعطيله فقط."
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    try {
      const res = await api.delete("/products/" + product.id);
      setMessage(
        res.data.data && "isActive" in res.data.data
          ? "المنتج مرتبط بطلبات، تم تعطيله بدل الحذف"
          : "تم حذف المنتج"
      );
      setReload((n) => n + 1); // نعيد الجلب
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="container page">
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          إدارة المنتجات
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setError("");
            setMessage("");
            setModal({ product: null });
          }}
        >
          + منتج جديد
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}

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

      {loading ? (
        <div className="spinner"></div>
      ) : result.products.length === 0 ? (
        <div className="empty">ما في منتجات، ابدأ بإضافة منتج جديد</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>المنتج</th>
                <th>القسم</th>
                <th>السعر</th>
                <th>المخزون</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {result.products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="product-cell">
                      {p.imageUrl ? (
                        <img className="product-thumb" src={imageSrc(p.imageUrl)} alt={p.name} />
                      ) : (
                        <div className="product-thumb"></div>
                      )}
                      <div>
                        <div className="product-cell-name">{p.name}</div>
                        {p.description && (
                          <div className="muted product-cell-desc">{p.description}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{p.category ? p.category.name : "—"}</td>
                  <td>{Number(p.price).toFixed(2)} $</td>
                  <td>
                    <div className="stock-cell">
                      <input
                        className="input stock-input"
                        type="number"
                        min="0"
                        value={stockEdits[p.id] !== undefined ? stockEdits[p.id] : p.stock}
                        onChange={(e) =>
                          setStockEdits((s) => ({ ...s, [p.id]: e.target.value }))
                        }
                      />
                      {stockEdits[p.id] !== undefined &&
                        Number(stockEdits[p.id]) !== p.stock && (
                          <button
                            className="btn btn-primary btn-small"
                            onClick={() => saveStock(p)}
                            disabled={stockBusy[p.id]}
                          >
                            {stockBusy[p.id] ? "..." : "حفظ"}
                          </button>
                        )}
                    </div>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button className="btn btn-outline btn-small" onClick={() => startEdit(p)}>
                        تعديل
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => handleDelete(p)}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && <Pagination meta={result.meta} page={page} onPage={setPage} />}

      {modal && (
        <ProductForm
          product={modal.product}
          categories={categories}
          onSaved={handleSaved}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default AdminProductsPage;
