import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../api/errors";

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.username.length < 3) {
      setError("اسم المستخدم لازم يكون 3 أحرف على الأقل");
      return;
    }
    if (form.password.length < 8) {
      setError("كلمة المرور لازم تكون 8 أحرف على الأقل");
      return;
    }

    setLoading(true);
    try {
      await register(form);
      navigate("/products");
    } catch (err) {
      setError(
        getErrorMessage(err, {
          CONFLICT: "البريد الإلكتروني أو اسم المستخدم مستخدم مسبقاً",
        })
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container page">
      <div className="form-card">
        <h1 className="page-title">حساب جديد</h1>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>الاسم الأول</label>
            <input className="input" name="firstName" value={form.firstName} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>الاسم الأخير</label>
            <input className="input" name="lastName" value={form.lastName} onChange={handleChange} required />
          </div>

          <div className="form-group">
            <label>اسم المستخدم</label>
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

          <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "جاري إنشاء الحساب..." : "إنشاء حساب"}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
          عندك حساب؟ <Link to="/login">سجّل الدخول</Link>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;