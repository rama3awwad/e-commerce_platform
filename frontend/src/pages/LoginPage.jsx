import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../api/errors";

// رسالة خطأ الدخول: إذا 401 بنقرأ عدد المحاولات المتبقية من رد الباك
function loginErrorMessage(err) {
  if (err.response && err.response.status === 401) {
    const found = String(err.response.data.message).match(/(\d+) attempt/);
    if (found) {
      return "بيانات الدخول غير صحيحة. المحاولات المتبقية قبل قفل الحساب: " + found[1];
    }
    return "بيانات الدخول غير صحيحة";
  }
  return getErrorMessage(err, {
    FORBIDDEN: "الحساب مقفل مؤقتاً بسبب كثرة المحاولات الفاشلة (15 دقيقة) أو غير مفعّل",
  });
}

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier, password);
      navigate("/products");
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container page">
      <div className="form-card">
        <h1 className="page-title">تسجيل الدخول</h1>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>البريد الإلكتروني أو اسم المستخدم</label>
            <input
              className="input"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>كلمة المرور</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="btn btn-primary" style={{ width: "100%" }} disabled={loading}>
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
        </form>

        <p className="muted" style={{ marginTop: 16, textAlign: "center" }}>
          ما عندك حساب؟ <Link to="/register">أنشئ حساب جديد</Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;