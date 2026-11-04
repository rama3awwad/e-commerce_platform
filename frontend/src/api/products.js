import api from "./client";

// كاش أسماء المنتجات: بالذاكرة وبـ localStorage حتى يضل الاسم موجود
// حتى لو خدمة المستودع وقعت ورجعت GET /products/:id خطأ 503
const CACHE_KEY = "productNames";

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage ممتلئ أو محظور: تجاهل، الكاش بالذاكرة يضل شغال
  }
}

const nameCache = loadCache();

function remember(id, name) {
  nameCache[id] = name;
}

// نخزن أسماء قائمة منتجات كاملة (بنجيبها بصفحات المنتجات)
export function cacheProducts(products) {
  if (!Array.isArray(products)) return;
  let changed = false;
  products.forEach((p) => {
    if (p && p.id && p.name && nameCache[p.id] !== p.name) {
      nameCache[p.id] = p.name;
      changed = true;
    }
  });
  if (changed) saveCache(nameCache);
}

// نجيب أسماء المنتجات المطلوبة، وإذا فشل الجلب نرجع آخر اسم معروف
export async function loadProductNames(ids) {
  const missing = ids.filter((id) => !(id in nameCache));

  await Promise.all(
    missing.map(async (id) => {
      try {
        const res = await api.get("/products/" + id);
        remember(id, res.data.data.name);
      } catch (err) {
        // 404 يعني المنتج محذوف نهائياً
        if (err.response && err.response.status === 404) {
          remember(id, "منتج محذوف");
        }
        // أي خطأ ثاني (مثل 503 لما المستودع واقع): بنبقى على آخر اسم محفوظ
      }
    })
  );

  if (missing.length > 0) {
    saveCache(nameCache);
  }

  const names = {};
  ids.forEach((id) => {
    names[id] = nameCache[id] || "منتج";
  });
  return names;
}
