// All calls go to /api (same origin). Nginx (prod) or Vite (dev) forwards
// /api to the gateway. In Kubernetes, the Ingress does this routing.
const j = (r) => r.json();

export const api = {
  products: () => fetch("/api/products").then(j),
  product: (id) => fetch(`/api/products/${id}`).then(j),
  trending: () => fetch("/api/trending").then(j),
  placeOrder: (items) =>
    fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }).then(j),
  healthAll: () => fetch("/api/health/all").then(j),
};
