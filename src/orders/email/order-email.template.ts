import { OrderCreatedEvent } from '../events/order-created.event';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function renderOrderCreatedEmail(e: OrderCreatedEvent) {
  const subject = `تم إنشاء طلبك رقم #${e.orderNumber}`;
  const lines = e.items.map((i) => `${i.name} × ${i.quantity} — ${(Number(i.unitPrice) * i.quantity).toFixed(2)} $`);
  const text = [`مرحباً،`, `تم إنشاء طلبك رقم #${e.orderNumber} بنجاح.`, '', ...lines, '', `الإجمالي: ${e.totalAmount} $`].join('\n');
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif">
<h2>تم إنشاء طلبك رقم #${e.orderNumber}</h2>
<ul>${e.items.map((i) => `<li>${esc(i.name)} × ${i.quantity} — ${(Number(i.unitPrice) * i.quantity).toFixed(2)} $</li>`).join('')}</ul>
<p><strong>الإجمالي: ${esc(e.totalAmount)} $</strong></p></div>`;
  return { subject, text, html };
}