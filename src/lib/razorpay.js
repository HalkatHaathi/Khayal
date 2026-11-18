import { supabase } from './supabase';

let script;
const loadCheckout = () => script ||= new Promise((resolve, reject) => {
  if (window.Razorpay) return resolve();
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = resolve;
  s.onerror = () => { script = null; reject(new Error('Could not load the payment window. Check your connection and try again.')); };
  document.head.appendChild(s);
});

/** Calls the `pay` Edge Function. Its errors carry a message meant for the customer. */
async function call(body) {
  const { data, error } = await supabase.functions.invoke('pay', { body });
  if (error) {
    let msg; try { msg = (await error.context.json()).error; } catch { /* network failure: no body */ }
    throw new Error(msg || 'We could not reach the payment service. Please try again.');
  }
  return data;
}

/**
 * Opens Razorpay Checkout for a pending online order.
 * Resolves { status }: 'paid' (verified), 'refunded' (paid too late, money returned), 'dismissed' (closed the window), 'pending' (paid, confirmation still on its way).
 * The browser's word is never enough: 'paid' only comes back after the server re-checked the payment with Razorpay.
 */
export async function payOrder(orderId, phone) {
  const [o] = await Promise.all([call({ action: 'order', order_id: orderId, phone }), loadCheckout()]);
  return new Promise((resolve) => {
    let paying = false;
    const rz = new window.Razorpay({
      key: o.key, order_id: o.rzp_order_id, amount: o.amount, currency: o.currency, name: o.name, description: o.description, prefill: o.prefill, timeout: o.timeout,
      theme: { color: '#111111' }, modal: { confirm_close: true, ondismiss: () => { if (!paying) resolve({ status: 'dismissed' }); } },
      handler: async (r) => {
        paying = true; // the window closing after success must not read as "dismissed"
        try { resolve({ status: (await call({ action: 'verify', order_id: orderId, phone, ...r })).status }); }
        catch { resolve({ status: 'pending' }); } // the webhook will settle it even if this call failed
      },
    });
    rz.open();
  });
}
