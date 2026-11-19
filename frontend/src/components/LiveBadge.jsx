import { useSyncExternalStore } from "react";
import { getRealtimeState, subscribeRealtimeState } from "../api/realtime";

const labels = {
  connected: "مباشر",
  connecting: "جاري الاتصال...",
  disconnected: "غير متصل",
  error: "فشل الاتصال",
};

// مؤشر حالة الاتصال اللحظي
function LiveBadge() {
  const state = useSyncExternalStore(subscribeRealtimeState, getRealtimeState);
  return (
    <span className={"live-badge live-" + state.status} title={state.error || ""}>
      <span className="live-dot"></span>
      {labels[state.status] || state.status}
      {state.error ? " (" + state.error + ")" : ""}
    </span>
  );
}

export default LiveBadge;