// اتصال WebSocket واحد (Socket.IO) مشترك بين كل الصفحات.
// السيرفر مستضاف ذاتياً: نفس منفذ الـ API (3000) والمسار /realtime، والتوكن يُرسل بالـ handshake.
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

let socket = null;
let state = { status: "disconnected", error: "" };
const stateListeners = new Set();
const eventHandlers = new Map(); // اسم الحدث -> مجموعة دوال
const subscriptions = new Set(); // اشتراكات القنوات: تُعاد عند كل اتصال/إعادة اتصال

function setState(patch) {
  state = { ...state, ...patch };
  stateListeners.forEach((listener) => listener());
}

function sendSubscription(sub) {
  if (socket && socket.connected) {
    socket.emit(sub.event, sub.payload, (res) => sub.onAck && sub.onAck(res));
  }
}

export function connectRealtime(token) {
  disconnectRealtime();
  if (!token) return;
  socket = io(API_URL + "/realtime", { auth: { token }, transports: ["websocket"] });
  setState({ status: "connecting", error: "" });

  socket.on("connect", () => {
    setState({ status: "connected", error: "" });
    // الـ rooms تضيع عند قطع الاتصال، فنشترك من جديد
    subscriptions.forEach(sendSubscription);
  });
  socket.on("disconnect", () => setState({ status: "disconnected" }));
  socket.on("connect_error", (err) => setState({ status: "error", error: err.message }));
  socket.onAny((event, ...args) => {
    const handlers = eventHandlers.get(event);
    if (handlers) handlers.forEach((handler) => handler(...args));
  });
}

export function disconnectRealtime() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  setState({ status: "disconnected", error: "" });
}

// الاستماع لحدث من السيرفر. يرجع دالة لإلغاء الاستماع.
export function onRealtime(event, handler) {
  if (!eventHandlers.has(event)) eventHandlers.set(event, new Set());
  eventHandlers.get(event).add(handler);
  return () => eventHandlers.get(event).delete(handler);
}

// الاشتراك بقناة (يُعاد تلقائياً بعد إعادة الاتصال). onAck يستلم رد السيرفر { ok, code, message }.
function watch(event, payload, onAck, leaveEvent) {
  const sub = { event, payload, onAck };
  subscriptions.add(sub);
  sendSubscription(sub);
  return () => {
    subscriptions.delete(sub);
    if (leaveEvent && socket && socket.connected) socket.emit(leaveEvent, payload);
  };
}

export function watchAdminOrders(onAck) {
  return watch("subscribe:admin", {}, onAck);
}

export function watchOrder(orderId, onAck) {
  return watch("subscribe:order", { orderId }, onAck, "unsubscribe:order");
}

// طلب لمرة واحدة مع انتظار الرد (للصفحة التجريبية)
export function requestRealtime(event, payload) {
  return new Promise((resolve) => {
    if (!socket || !socket.connected) {
      resolve({ ok: false, code: "NOT_CONNECTED", message: "غير متصل بالسيرفر" });
      return;
    }
    socket.emit(event, payload, resolve);
  });
}

export function subscribeRealtimeState(listener) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

export function getRealtimeState() {
  return state;
}