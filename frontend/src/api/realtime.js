// اتصال WebSocket واحد مشترك بين كل الصفحات، عبر Soketi (خادم WebSocket مستضاف ذاتياً بحاوية مستقلة).
// المتصفح يتصل بـ Soketi مباشرة، وقبل أي اشتراك بقناة خاصة يسأل الـ API (POST /realtime/auth) هل مسموح له.
// الصلاحيات تُفحص على السيرفر فقط: قناة الأدمن للمسؤول، وقناة الطلب لصاحبه.
import Pusher from "pusher-js";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || "app-key";
const PUSHER_HOST = import.meta.env.VITE_PUSHER_HOST || "localhost";
const PUSHER_PORT = Number(import.meta.env.VITE_PUSHER_PORT || 6001);

export const ADMIN_CHANNEL = "private-admin.orders";
export const orderChannelName = (orderId) => "private-order." + orderId;

let pusher = null;
let currentToken = null;
let state = { status: "disconnected", error: "" };
const stateListeners = new Set();
const eventHandlers = new Map(); // اسم الحدث -> مجموعة دوال
const subscriptions = new Set(); // اشتراكات القنوات: تُعاد عند كل اتصال جديد
const authErrors = new Map(); // اسم القناة -> سبب رفض السيرفر (code/message)

function setState(patch) {
  state = { ...state, ...patch };
  stateListeners.forEach((listener) => listener());
}

// تفويض القناة عبر الـ API الخاص بنا (يرجع { auth } عند القبول، و403 عند الرفض)
function authorizeChannel({ socketId, channelName }, callback) {
  fetch(API_URL + "/api/v1/realtime/auth", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + currentToken,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ socket_id: socketId, channel_name: channelName }),
  })
    .then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        authErrors.delete(channelName);
        callback(null, body);
      } else {
        authErrors.set(channelName, { code: body.code || "FORBIDDEN", message: body.message || "رفض السيرفر الاشتراك" });
        callback(new Error(body.message || "Subscription refused"), null);
      }
    })
    .catch((err) => callback(err, null));
}

// أي حدث (غير أحداث pusher: الداخلية) يصل لقناة نشترك بها نوزعه على من يستمع له
function forward(eventName, data) {
  if (eventName.startsWith("pusher:")) return;
  const handlers = eventHandlers.get(eventName);
  if (handlers) handlers.forEach((handler) => handler(data));
}

function attach(sub) {
  if (!pusher) return;
  const channel = pusher.subscribe(sub.channelName);
  sub.channel = channel;
  if (!channel.forwarding) {
    channel.forwarding = true;
    channel.bind_global(forward);
  }
  sub.onOk = () => sub.onAck && sub.onAck({ ok: true });
  sub.onError = () =>
    sub.onAck &&
    sub.onAck({ ok: false, ...(authErrors.get(sub.channelName) || { code: "SUBSCRIPTION_ERROR", message: "تعذر الاشتراك بالقناة" }) });
  channel.bind("pusher:subscription_succeeded", sub.onOk);
  channel.bind("pusher:subscription_error", sub.onError);
  if (channel.subscribed) setTimeout(sub.onOk, 0); // مشترك أصلاً: لا يُطلق Pusher الحدث ثانية
}

function detach(sub) {
  if (sub.channel) {
    sub.channel.unbind("pusher:subscription_succeeded", sub.onOk);
    sub.channel.unbind("pusher:subscription_error", sub.onError);
    const stillUsed = [...subscriptions].some((s) => s.channelName === sub.channelName);
    if (pusher && !stillUsed) pusher.unsubscribe(sub.channelName);
    sub.channel = null;
  }
}

export function connectRealtime(token) {
  disconnectRealtime();
  if (!token) return;
  currentToken = token;
  pusher = new Pusher(PUSHER_KEY, {
    cluster: "mt1", // مطلوب من المكتبة شكلياً، Soketi يتجاهله
    wsHost: PUSHER_HOST,
    wsPort: PUSHER_PORT,
    wssPort: PUSHER_PORT,
    forceTLS: false,
    enabledTransports: ["ws", "wss"],
    disableStats: true,
    channelAuthorization: { customHandler: authorizeChannel },
  });
  setState({ status: "connecting", error: "" });

  pusher.connection.bind("state_change", ({ current }) => {
    if (current === "connected") setState({ status: "connected", error: "" });
    else if (current === "connecting" || current === "initialized") setState({ status: "connecting" });
    else if (current === "unavailable" || current === "failed") setState({ status: "error", error: "الخادم غير متاح" });
    else setState({ status: "disconnected" });
  });
  pusher.connection.bind("error", () => setState({ status: "error", error: "فشل الاتصال" }));

  // الاشتراكات التي طلبتها الصفحات قبل أن يجهز الاتصال
  subscriptions.forEach(attach);
}

export function disconnectRealtime() {
  if (pusher) {
    subscriptions.forEach((sub) => { sub.channel = null; });
    pusher.disconnect();
    pusher = null;
  }
  currentToken = null;
  authErrors.clear();
  setState({ status: "disconnected", error: "" });
}

// الاستماع لحدث من السيرفر. يرجع دالة لإلغاء الاستماع.
export function onRealtime(event, handler) {
  if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
  eventHandlers.get(event).add(handler);
  return () => eventHandlers.get(event).delete(handler);
}

// الاشتراك بقناة (يُعاد تلقائياً بعد إعادة الاتصال). onAck يستلم { ok, code, message }.
function watch(channelName, onAck) {
  const sub = { channelName, onAck, channel: null };
  subscriptions.add(sub);
  attach(sub);
  return () => {
    subscriptions.delete(sub);
    detach(sub);
  };
}

export function watchAdminOrders(onAck) {
  return watch(ADMIN_CHANNEL, onAck);
}

export function watchOrder(orderId, onAck) {
  return watch(orderChannelName(orderId), onAck);
}

// طلب لمرة واحدة مع انتظار الرد (للصفحة التجريبية): subscribe:admin أو subscribe:order
export function requestRealtime(event, payload) {
  return new Promise((resolve) => {
    if (!pusher || state.status !== "connected") {
      resolve({ ok: false, code: "NOT_CONNECTED", message: "غير متصل بالسيرفر" });
      return;
    }
    const channelName = event === "subscribe:admin" ? ADMIN_CHANNEL : orderChannelName(payload && payload.orderId);
    const stop = watch(channelName, (res) => {
      resolve(res);
      if (!res.ok) stop(); // القناة المرفوضة ما نتركها معلّقة
    });
  });
}

export function subscribeRealtimeState(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function getRealtimeState() {
  return state;
}