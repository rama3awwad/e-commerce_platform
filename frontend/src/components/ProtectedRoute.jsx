import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// role اختياري: إذا حطيناه، بس هالدور بيفتح الصفحة
function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="spinner"></div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role && user.role !== role) {
    return <Navigate to="/products" replace />;
  }
  return children;
}

export default ProtectedRoute;