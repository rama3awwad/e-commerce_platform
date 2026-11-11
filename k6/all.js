import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const PASSWORD = __ENV.PERF_USER_PASSWORD || 'Perf@12345';
const warmup = __ENV.K6_WARMUP === 'true';
const queryCountRun = __ENV.K6_QUERY_COUNT === 'true';
const stageDurations = warmup
  ? [{ duration: '30s', target: 1 }]
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

const scenarios = queryCountRun
  ? {
      queryCounts: {
        executor: 'constant-vus',
        exec: 'queryCounts',
        vus: 1,
        duration: '1m',
        gracefulStop: '10s',
      },
    }
  : {
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

export function setup() {
  const heavyUserCount = Number(__ENV.PERF_HEAVY_USERS || 20);
  function loginUser(index) {
    const identifier = `perf-user-${String(index + 1).padStart(5, '0')}@perf.local`;
    const response = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ identifier, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' }, tags: { setup: 'login' } },
    );
    if (response.status !== 200 || !response.json('data.accessToken')) {
      throw new Error(`Load-test setup login failed for ${identifier}: HTTP ${response.status}`);
    }
    return { id: identifier, token: response.json('data.accessToken') };
  }
  const users = Array.from({ length: heavyUserCount }, (_, index) => loginUser(index));
  const writeUser = loginUser(heavyUserCount);

  const productResponse = http.get(`${BASE_URL}/products?page=1&limit=1`, {
    headers: { Authorization: `Bearer ${users[0].token}` },
    tags: { setup: 'products' },
  });
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

export function productDetail(data) {
  const product = data.products[Math.floor(Math.random() * data.products.length)];
  const response = http.get(
    `${BASE_URL}/products/${product.id}`,
    authHeaders(data.users[__VU % data.users.length].token, endpointProfiles.productDetail.endpoint),
  );
  record(response, metrics.productDetail, endpointProfiles.productDetail.endpoint, [200]);
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

export function queryCounts(data) {
  const endpointFunctions = [products, productDetail, orders, createOrder];
  endpointFunctions[__ITER % endpointFunctions.length](data);
}
