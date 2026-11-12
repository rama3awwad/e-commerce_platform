import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const PASSWORD = __ENV.PERF_USER_PASSWORD || 'Perf@12345';
const warmup = __ENV.K6_WARMUP === 'true';
// K6_PROFILE=quick: نسخة قصيرة (~1 دقيقة) للعرض أمام المعيدة. full: ~4 دقائق للأرقام النهائية.
const quick = __ENV.K6_PROFILE === 'quick';
const stageDurations = warmup
  ? [{ duration: '30s', target: 1 }]
  : quick
  ? [
      { duration: '10s', target: 50 },
      { duration: '40s', target: 100 },
      { duration: '10s', target: 0 },
    ]
  : [
      { duration: '15s', target: 10 },
      { duration: '1m', target: 10 },
      { duration: '15s', target: 50 },
      { duration: '1m', target: 50 },
      { duration: '15s', target: 100 },
      { duration: '1m', target: 100 },
      { duration: '15s', target: 0 },
    ];

const endpointProfiles = {
  products: { vus: [4, 20, 40], endpoint: 'GET /products' },
  productDetail: { vus: [2, 10, 20], endpoint: 'GET /products/:id' },
  orders: { vus: [2, 10, 20], endpoint: 'GET /orders' },
  createOrder: { vus: [2, 10, 20], endpoint: 'POST /orders' },
};

const metrics = {
  products: createEndpointMetrics('products'),
  productDetail: createEndpointMetrics('product_detail'),
  orders: createEndpointMetrics('orders'),
  createOrder: createEndpointMetrics('create_order'),
};

function createEndpointMetrics(prefix) {
  return {
    duration: new Trend(`${prefix}_duration`, true),
    failed: new Rate(`${prefix}_failed`),
    requests: new Counter(`${prefix}_requests`),
    statuses: new Counter(`${prefix}_status_codes`),
    bytes: new Counter(`${prefix}_bytes_received`),
  };
}

function endpointScenario(endpoint, vus) {
  const stages = stageDurations.map((stage) => ({
    duration: stage.duration,
    target: warmup ? Math.round(vus / 10) : Math.round(stage.target * vus / 100),
  }));
  return {
    executor: 'ramping-vus',
    exec: endpoint,
    startVUs: 0,
    stages,
    gracefulRampDown: '10s',
    tags: { endpoint: endpointProfiles[endpoint].endpoint },
  };
}

const scenarios = {
  products: endpointScenario('products', endpointProfiles.products.vus[2]),
  productDetail: endpointScenario('productDetail', endpointProfiles.productDetail.vus[2]),
  orders: endpointScenario('orders', endpointProfiles.orders.vus[2]),
  createOrder: endpointScenario('createOrder', endpointProfiles.createOrder.vus[2]),
};

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    products_duration: ['p(95)<800'],
    product_detail_duration: ['p(95)<800'],
    orders_duration: ['p(95)<800'],
    create_order_duration: ['p(95)<800'],
    products_failed: ['rate<0.01'],
    product_detail_failed: ['rate<0.01'],
    orders_failed: ['rate<0.01'],
    create_order_failed: ['rate<0.01'],
  },
};

function authHeaders(token, endpoint) {
  return {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint, name: endpoint },
    timeout: '30s',
  };
}

function record(response, endpointMetrics, endpoint, expectedStatuses) {
  const success = expectedStatuses.includes(response.status);
  endpointMetrics.duration.add(response.timings.duration);
  endpointMetrics.failed.add(!success);
  endpointMetrics.requests.add(1);
  endpointMetrics.statuses.add(1, { status: String(response.status) });
  endpointMetrics.bytes.add(response.body ? response.body.length : 0);
  check(response, { [`${endpoint} returned expected status`]: () => success });
}

// التجهيز ليس جزءاً من القياس: إذا كانت خدمة لسا عم تقلع (أول نداء بطيء) نعيد المحاولة بدل ما يفشل الاختبار كله.
function withRetry(send, ok) {
  let response;
  for (let attempt = 1; attempt <= 6; attempt++) {
    response = send();
    if (ok(response)) return response;
    sleep(attempt * 2);
  }
  return response;
}

export function setup() {
  const heavyUserCount = Number(__ENV.PERF_HEAVY_USERS || 20);
  function loginUser(index) {
    const identifier = `perf-user-${String(index + 1).padStart(5, '0')}@perf.local`;
    const response = withRetry(() => http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ identifier, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, tags: { setup: 'login' } },
    ), (r) => r.status === 200);
    if (response.status !== 200 || !response.json('data.accessToken')) {
      throw new Error(`Load-test setup login failed for ${identifier}: HTTP ${response.status}`);
    }
    return { id: identifier, token: response.json('data.accessToken') };
  }
  const users = Array.from({ length: heavyUserCount }, (_, index) => loginUser(index));
  const writeUser = loginUser(heavyUserCount);

  // 100 منتج مختلف حتى يكون الاختبار واقعياً (وليس نفس المنتج دائماً في الكاش).
  const productResponse = withRetry(() => http.get(`${BASE_URL}/products?page=1&limit=100`, {
    headers: { Authorization: `Bearer ${users[0].token}` },
    tags: { setup: 'products' },
  }), (r) => r.status === 200);
  const products = productResponse.json('data.items');
  if (productResponse.status !== 200 || !Array.isArray(products) || products.length === 0) {
    throw new Error(`Load-test setup could not fetch active products: HTTP ${productResponse.status}`);
  }

  return {
    users,
    writeUser,
    products: products.map((product) => ({ id: product.id, categoryId: product.categoryId })),
  };
}

export function products(data) {
  const product = data.products[Math.floor(Math.random() * data.products.length)];
  const search = `searchterm${Math.floor(Math.random() * 100)}`;
  const url = `${BASE_URL}/products?page=1&limit=20&category=${product.categoryId}&search=${search}`;
  const response = http.get(url, authHeaders(data.users[__VU % data.users.length].token, endpointProfiles.products.endpoint));
  record(response, metrics.products, endpointProfiles.products.endpoint, [200]);
}

// كل VU يتصرف كمتصفح: يحفظ ETag لكل منتج ويرسله في If-None-Match.
// إذا لم يتغير المنتج يرد الخادم 304 بدون جسم. (إذا كان ETag معطلاً لا يوجد ETag فيبقى الرد 200.)
const etags = {};

export function productDetail(data) {
  const product = data.products[Math.floor(Math.random() * data.products.length)];
  const params = authHeaders(data.users[__VU % data.users.length].token, endpointProfiles.productDetail.endpoint);
  if (etags[product.id]) params.headers['If-None-Match'] = etags[product.id];
  const response = http.get(`${BASE_URL}/products/${product.id}`, params);
  if (response.headers.Etag) etags[product.id] = response.headers.Etag;
  record(response, metrics.productDetail, endpointProfiles.productDetail.endpoint, [200, 304]);
}

export function orders(data) {
  const user = data.users[__VU % data.users.length];
  const response = http.get(
    `${BASE_URL}/orders?page=1&limit=20`,
    authHeaders(user.token, endpointProfiles.orders.endpoint),
  );
  record(response, metrics.orders, endpointProfiles.orders.endpoint, [200]);
}

export function createOrder(data) {
  const user = data.writeUser;
  const product = data.products[Math.floor(Math.random() * data.products.length)];
  const response = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({ items: [{ productId: product.id, quantity: 1 }] }),
    {
      ...authHeaders(user.token, endpointProfiles.createOrder.endpoint),
      headers: {
        Authorization: `Bearer ${user.token}`,
        'Content-Type': 'application/json',
      },
    },
  );
  record(response, metrics.createOrder, endpointProfiles.createOrder.endpoint, [201]);
}

