import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useNotifications } from "../context/NotificationsContext";

function linkClass({ isActive }) {
  return "nav-link" + (isActive ? " active" : "");
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function Navbar() {
  const { user, logout } = useAuth();
  const { clearCart, totalCount } = useCart();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const isAdmin = user && user.role === "ADMIN";

  function handleLogout() {
    logout();
    clearCart();
    navigate("/login");
  }

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/products" className="logo">
          سوق<span>.</span>
        </Link>

        <nav className="nav">
          {user ? (
            <>
              <NavLink to="/products" className={linkClass}>
                المنتجات
              </NavLink>

              {isAdmin && (
                <>
                  <NavLink to="/admin/products" className={linkClass}>
                    إدارة المنتجات
                  </NavLink>
                  <NavLink to="/admin/orders" className={linkClass}>
                    الطلبات
                  </NavLink>
                  <NavLink to="/admin/categories" className={linkClass}>
                    الأقسام
                  </NavLink>
                  <NavLink to="/admin/users" className={linkClass}>
                    المستخدمين
                  </NavLink>
                </>
              )}

              {user.role === "CUSTOMER" && (
                <>
                  <NavLink to="/cart" className={linkClass}>
                    السلة
                    {totalCount > 0 && <span className="cart-badge">{totalCount}</span>}
                  </NavLink>
                  <NavLink to="/orders" className={linkClass}>
                    طلباتي
                  </NavLink>
                  <NavLink to="/concurrency-test" className={linkClass}>
                    اختبار التزامن
                  </NavLink>
                </>
              )}

              <NavLink to="/notifications" className={linkClass} title="الإشعارات">
                <span className="nav-bell">
                  <BellIcon />
                  {unreadCount > 0 && (
                    <span className="bell-badge">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
              </NavLink>

              <span className="muted">{user.firstName || user.username}</span>
              <button className="btn btn-outline btn-small" onClick={handleLogout}>
                خروج
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">
                دخول
              </Link>
              <Link to="/register" className="btn btn-primary btn-small">
                حساب جديد
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
