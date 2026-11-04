import { useEffect, useState } from "react";
import api from "../../api/client";
import { getErrorMessage } from "../../api/errors";
import Modal from "../../components/Modal";

// فورم إضافة/تعديل قسم
function CategoryForm({ category, onSaved, onClose }) {
  const isEdit = Boolean(category);
  const [form, setForm] = useState({
    name: category ? category.name : "",
    slug: category ? category.slug : "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const name = form.name.trim();
    const slug = form.slug.trim().toLowerCase();
    if (name.length < 2 || name.length > 80) {
      setError("اسم القسم لازم يكون بين حرفين و80 حرف");
      return;
    }
    if (slug.length < 2 || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) {
      setError("المعرّف (slug): حروف لاتينية صغيرة وأرقام وشرطات فقط، حرفين على الأقل");
      return;
    }

    setSubmitting(true);
    try {
      const res = isEdit
        ? await api.patch("/categories/" + category.id, { name, slug })
        : await api.post("/categories", { name, slug });
      onSaved(res.data.data, isEdit);
    } catch (err) {
      setError(
        getErrorMessage(err, {
          CONFLICT: "الاسم أو المعرّف مستخدم مسبقاً من قسم ثاني",
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={isEdit ? "تعديل القسم" : "قسم جديد"} onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>اسم القسم *</label>
          <input className="input" name="name" value={form.name} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>المعرّف (slug) *</label>
          <input
            className="input"
            name="slug"
            value={form.slug}
            onChange={handleChange}
            placeholder="مثال: clothing"
            required
          />
        </div>

        <div className="row modal-actions">
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "جاري الحفظ..." : "حفظ"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null); // null | { category }
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api
      .get("/categories")
      .then((res) => setCategories(res.data.data))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  function handleSaved(category, wasEdit) {
    setCategories((list) =>
      wasEdit
        ? list.map((c) => (c.id === category.id ? category : c))
        : [...list, category].sort((a, b) => a.name.localeCompare(b.name))
    );
    setModal(null);
    setMessage(wasEdit ? "تم حفظ تعديلات القسم" : "تمت إضافة القسم بنجاح");
  }

  async function handleDelete(category) {
    if (!window.confirm("هل أنت متأكد من حذف قسم " + category.name + "؟")) return;
    setError("");
    setMessage("");
    setBusyId(category.id);
    try {
      await api.delete("/categories/" + category.id);
      setCategories((list) => list.filter((c) => c.id !== category.id));
      setMessage("تم حذف القسم");
    } catch (err) {
      setError(
        getErrorMessage(err, {
          CONFLICT: "ما بينحذف القسم لأنه فيه منتجات، انقل المنتجات لقسم ثاني أول",
        })
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container page">
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          إدارة الأقسام
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setError("");
            setMessage("");
            setModal({ category: null });
          }}
        >
          + قسم جديد
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner"></div>
      ) : categories.length === 0 ? (
        <div className="empty">ما في أقسام بعد</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>القسم</th>
                <th>المعرّف (slug)</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="product-cell-name">{c.name}</td>
                  <td className="muted">{c.slug}</td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="btn btn-outline btn-small"
                        onClick={() => {
                          setError("");
                          setMessage("");
                          setModal({ category: c });
                        }}
                      >
                        تعديل
                      </button>
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => handleDelete(c)}
                        disabled={busyId === c.id}
                      >
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

      {modal && (
        <CategoryForm
          category={modal.category}
          onSaved={handleSaved}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default AdminCategoriesPage;
