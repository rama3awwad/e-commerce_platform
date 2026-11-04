import { useEffect, useState } from "react";
import api from "../../api/client";
import { getErrorMessage } from "../../api/errors";
import { useAuth } from "../../context/AuthContext";
import Modal from "../../components/Modal";
import Pagination from "../../components/Pagination";
import { formatDate } from "../../utils/status";

// فورم إنشاء مستخدم جديد (الطريقة الوحيدة لإنشاء حساب مسؤول)
function UserForm({ onSaved, onClose }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    role: "CUSTOMER",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.username.trim().length < 3) {
      setError("اسم المستخدم لازم يكون 3 أحرف على الأقل");
      return;
    }
    if (form.password.length < 8) {
      setError("كلمة المرور لازم تكون 8 أحرف على الأقل");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/users", form);
      onSaved(res.data.data);
    } catch (err) {
      setError(
        getErrorMessage(err, {
          CONFLICT: "البريد الإلكتروني أو اسم المستخدم مستخدم مسبقاً",
        })
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="مستخدم جديد" onClose={onClose}>
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <div className="form-group">
            <label>الاسم الأول</label>
            <input className="input" name="firstName" value={form.firstName} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label>الاسم الأخير</label>
            <input className="input" name="lastName" value={form.lastName} onChange={handleChange} required />
          </div>
        </div>

        <div className="form-group">
          <label>اسم المستخدم (3 أحرف على الأقل)</label>
          <input className="input" name="username" value={form.username} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>البريد الإلكتروني</label>
          <input className="input" type="email" name="email" value={form.email} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>كلمة المرور (8 أحرف على الأقل)</label>
          <input className="input" type="password" name="password" value={form.password} onChange={handleChange} required />
        </div>

        <div className="form-group">
          <label>الدور</label>
          <select className="select" name="role" value={form.role} onChange={handleChange}>
            <option value="CUSTOMER">عميل</option>
            <option value="ADMIN">مسؤول</option>
          </select>
        </div>

        <div className="row modal-actions">
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "جاري الإنشاء..." : "إنشاء المستخدم"}
          </button>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
            إلغاء
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdminUsersPage() {
  const { user: me } = useAuth();
  const [result, setResult] = useState({ key: null, users: [], meta: null, error: "" });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [reload, setReload] = useState(0); // عدّاد لإعادة الجلب بعد الإنشاء/الحذف
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState(null);

  const queryKey = [page, search, reload].join("|");
  const loading = result.key !== queryKey;

  useEffect(() => {
    let ignore = false;
    const params = { page: page, limit: 10 };
    if (search) params.search = search;

    api
      .get("/users", { params })
      .then((res) => {
        if (!ignore) {
          setResult({ key: queryKey, users: res.data.data.items, meta: res.data.data.meta, error: "" });
        }
      })
      .catch((err) => {
        if (!ignore) setResult({ key: queryKey, users: [], meta: null, error: getErrorMessage(err) });
      });
    return () => {
      ignore = true;
    };
  }, [queryKey, page, search]);

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function patchUser(updated) {
    setResult((r) => ({
      ...r,
      users: r.users.map((u) => (u.id === updated.id ? updated : u)),
    }));
  }

  async function toggleRole(u) {
    const nextRole = u.role === "ADMIN" ? "CUSTOMER" : "ADMIN";
    if (
      !window.confirm(
        "تغيير دور " + (u.username || u.email) + " إلى " + (nextRole === "ADMIN" ? "مسؤول" : "عميل") + "؟"
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    setBusyId(u.id);
    try {
      const res = await api.put("/users/" + u.id, { role: nextRole });
      patchUser(res.data.data);
      setMessage("تم تغيير دور " + (u.username || u.email));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(u) {
    const disabling = u.isActive;
    if (
      disabling &&
      !window.confirm("تعطيل حساب " + (u.username || u.email) + "؟ ما رح يقدر يسجّل دخول.")
    ) {
      return;
    }
    setError("");
    setMessage("");
    setBusyId(u.id);
    try {
      const res = await api.put("/users/" + u.id, { isActive: !u.isActive });
      patchUser(res.data.data);
      setMessage(disabling ? "تم تعطيل الحساب" : "تم تفعيل الحساب");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u) {
    if (!window.confirm("حذف حساب " + (u.username || u.email) + " نهائياً؟")) return;
    setError("");
    setMessage("");
    setBusyId(u.id);
    try {
      await api.delete("/users/" + u.id);
      setReload((n) => n + 1); // نعيد الجلب
      setMessage("تم حذف المستخدم");
    } catch (err) {
      setError(
        getErrorMessage(err, {
          BAD_REQUEST: "ما بتنحذف حسابك، سجّل دخول بحساب مسؤول ثاني إذا حبيت تحذفه",
        })
      );
    } finally {
      setBusyId(null);
    }
  }

  function displayName(u) {
    return [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";
  }

  return (
    <div className="container page">
      <div className="toolbar">
        <h1 className="page-title" style={{ marginBottom: 0 }}>
          إدارة المستخدمين
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            setError("");
            setMessage("");
            setModal(true);
          }}
        >
          + مستخدم جديد
        </button>
      </div>

      {message && <div className="alert alert-success">{message}</div>}
      {!loading && error && <div className="alert alert-error">{error}</div>}

      <div className="toolbar">
        <form className="search-form" onSubmit={handleSearch}>
          <input
            className="input"
            placeholder="ابحث بالاسم أو البريد أو اسم المستخدم..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button className="btn btn-primary">بحث</button>
        </form>
      </div>

      {loading ? (
        <div className="spinner"></div>
      ) : result.users.length === 0 ? (
        <div className="empty">ما في مستخدمين مطابقين</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>اسم المستخدم</th>
                <th>البريد</th>
                <th>الدور</th>
                <th>الحالة</th>
                <th>تاريخ التسجيل</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {result.users.map((u) => {
                const isMe = me && u.id === me.id;
                return (
                  <tr key={u.id}>
                    <td className="product-cell-name">
                      {displayName(u)}
                      {isMe && <span className="muted"> (حسابك)</span>}
                    </td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className={"badge badge-" + (u.role === "ADMIN" ? "CONFIRMED" : "SHIPPED")}>
                        {u.role === "ADMIN" ? "مسؤول" : "عميل"}
                      </span>
                    </td>
                    <td>
                      <span className={"badge badge-" + (u.isActive ? "DELIVERED" : "CANCELLED")}>
                        {u.isActive ? "نشط" : "معطل"}
                      </span>
                    </td>
                    <td className="muted">{formatDate(u.createdAt)}</td>
                    <td>
                      {isMe ? (
                        <span className="muted">—</span>
                      ) : (
                        <div className="actions-cell">
                          <button
                            className="btn btn-outline btn-small"
                            onClick={() => toggleRole(u)}
                            disabled={busyId === u.id}
                          >
                            {u.role === "ADMIN" ? "تخفيض لعميل" : "ترقية لمسؤول"}
                          </button>
                          <button
                            className="btn btn-outline btn-small"
                            onClick={() => toggleActive(u)}
                            disabled={busyId === u.id}
                          >
                            {u.isActive ? "تعطيل" : "تفعيل"}
                          </button>
                          <button
                            className="btn btn-danger btn-small"
                            onClick={() => handleDelete(u)}
                            disabled={busyId === u.id}
                          >
                            حذف
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && <Pagination meta={result.meta} page={page} onPage={setPage} />}

      {modal && (
        <UserForm
          onSaved={(u) => {
            setModal(false);
            setReload((n) => n + 1); // نعيد الجلب
            setMessage("تم إنشاء المستخدم " + (u.username || u.email));
          }}
          onClose={() => setModal(false)}
        />
      )}
    </div>
  );
}

export default AdminUsersPage;
