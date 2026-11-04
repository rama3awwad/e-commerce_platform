# سوق — واجهة المتجر (Frontend)

واجهة React لمتجر إلكتروني، مبنية بـ Vite + React 19 + React Router 7، بالعربي RTL.
ترتبط بالباك إند (NestJS): <https://github.com/rama3awwad/e-commerce_platform>

## الصفحات

| المسار | الصفحة | من يراها |
|---|---|---|
| `/login` ، `/register` | الدخول وإنشاء حساب | الجميع |
| `/products` ، `/products/:id` | تصفح المنتجات وتفاصيلها + بحث + أقسام | أي مستخدم مسجل |
| `/cart` | السلة وإنشاء الطلب | العميل |
| `/orders` ، `/orders/:id` | طلباتي + تفاصيل الطلب + إلغاء | العميل |
| `/notifications` | الإشعارات + تحديد كمقروء + عدّاد غير مقروء بالـ Navbar | أي مستخدم مسجل |
| `/admin/products` | إدارة المنتجات: إضافة مع صورة (multipart)، تعديل، حذف، تعديل المخزون | المسؤول |
| `/admin/orders` | إدارة الطلبات: كل الطلبات + تغيير الحالة PENDING→CONFIRMED→SHIPPED→DELIVERED | المسؤول |
| `/admin/categories` | إدارة الأقسام: إضافة/تعديل/حذف | المسؤول |
| `/admin/users` | إدارة المستخدمين: بحث، إنشاء (وحدها تنشئ ADMIN)، تغيير الدور، تعطيل، حذف | المسؤول |

حسابات الـ seed للتجربة (كلمة المرور `Admin@123`):

- مسؤول: `admin@store.com` أو `admin`
- عميل: `customer@test.com` أو `testcustomer`

## التشغيل محلياً

```bash
npm install
npm run dev        # http://localhost:5173
```

عنوان الـ API يُقرأ من `.env`:

```
VITE_API_URL=http://localhost:3000
```

## التشغيل بـ Docker

1) شغّل الباك أولاً (من ريبو الباك):

```bash
docker compose up --build
```

2) ثم شغّل الفرونت من هذا المجلد:

```bash
docker compose up --build
```

- الواجهة: <http://localhost:5173>
- الـ API: <http://localhost:3000/api/docs> (Swagger)
- `VITE_API_URL` يتحدد وقت البناء (build-arg) وافتراضه `http://localhost:3000`،
  والمتصفح يطلب الـ API مباشرة من منفذ الباك المنشور، فلا حاجة لشبكة مشتركة بين الكونتينرين.

## الفحوصات

```bash
npm run lint    # eslint — 0 أخطاء
npm test        # node --test — اختبارات الأدوات المشتركة (status / errors)
npm run build   # بناء الإنتاج
```

## ملاحظات تقنية

- **أسماء المنتجات بالطلبات**: الأسماء تُجلب من `GET /products/:id` وتُخزَّن في كاش
  (`localStorage`). إذا وقعت خدمة المستودع ورجع الطلب 503، تُعرض آخر أسماء معروفة
  بدل كلمة "منتج".
- **تغيير حالة الطلب للمسؤول**: عبر `PATCH /orders/:id/status` فقط — زر الإلغاء
  للمسؤول يستخدم نفس المسار (إذ `POST /orders/:id/cancel` لصاحب الطلب فقط)،
  والواجهة تعرض التحولات المسموحة فقط حسب قواعد الباك.
- **loading بدون setState داخل useEffect**: الـ loading مُشتقّ من مفتاح الاستعلام
  (`queryKey`) لتتوافق مع قاعدة `react-hooks/set-state-in-effect` في React 19.
- **الإشعارات**: عدّاد غير المقروء يُحدَّث عند التنقل بين الصفحات وكل 30 ثانية،
  وبشكل فوري بعد تحديد إشعار كمقروء.
