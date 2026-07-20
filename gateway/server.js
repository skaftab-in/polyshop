// The gateway is the single API the frontend talks to (the BFF pattern).
// It never holds data. It routes and aggregates calls to the backend services.
// This is the file that shows how services find each other by NAME inside a cluster:
// it calls http://catalog:8080 and http://insights:8000, and Kubernetes DNS resolves them.

const express = require("express");
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Service addresses come from env vars so the same code works locally and in k8s.
// Locally (docker-compose) these resolve to the compose service names.
// In Kubernetes they resolve to the Service names via CoreDNS.
const CATALOG_URL = process.env.CATALOG_URL || "http://localhost:8080";
const INSIGHTS_URL = process.env.INSIGHTS_URL || "http://localhost:8000";

// Node 18+ has fetch built in, no extra library needed.

// --- health ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "gateway" });
});

// Ping one service's health endpoint with a short timeout so a dead/deleted
// pod fails fast instead of hanging the whole /api/health/all request.
async function pingHealth(name, url, timeoutMs = 2500) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return {
      service: name,
      status: r.ok ? "up" : "down",
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      service: name,
      status: "down",
      latencyMs: Date.now() - started,
      error: err.name === "AbortError" ? "timeout" : "unreachable",
    };
  }
}

// --- aggregated status board for the frontend's "system status" section ---
// Every service is checked in parallel. Delete a k8s Deployment and its
// entry flips to "down" within one poll cycle.
app.get("/api/health/all", async (req, res) => {
  const [catalog, insights] = await Promise.all([
    pingHealth("catalog", `${CATALOG_URL}/actuator/health`),
    pingHealth("insights", `${INSIGHTS_URL}/health`),
  ]);

  res.json({
    checkedAt: new Date().toISOString(),
    services: [
      { service: "gateway", status: "up", latencyMs: 0 },
      catalog,
      insights,
    ],
  });
});

// --- list all products (straight passthrough to catalog) ---
app.get("/api/products", async (req, res) => {
  try {
    const r = await fetch(`${CATALOG_URL}/products`);
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: "catalog service unreachable" });
  }
});

// --- add a new product (passthrough to catalog, which writes to Postgres) ---
app.post("/api/products", async (req, res) => {
  try {
    const r = await fetch(`${CATALOG_URL}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "catalog service unreachable" });
  }
});

// --- one product: fetch from catalog AND record a view in insights ---
app.get("/api/products/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const r = await fetch(`${CATALOG_URL}/products/${id}`);
    if (r.status === 404) return res.status(404).json({ error: "product not found" });
    const product = await r.json();

    // Fire-and-forget: tell insights this product was viewed.
    // We don't await it or fail the request if insights is down.
    fetch(`${INSIGHTS_URL}/view/${id}`, { method: "POST" }).catch(() => {});

    res.json(product);
  } catch (err) {
    res.status(502).json({ error: "catalog service unreachable" });
  }
});

// --- place an order (passthrough to catalog, which writes to Postgres) ---
app.post("/api/orders", async (req, res) => {
  try {
    const r = await fetch(`${CATALOG_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    res.status(502).json({ error: "catalog service unreachable" });
  }
});

// --- trending: the real aggregation demo ---
// Ask insights WHICH products are hot, then ask catalog for their full details.
// Two services, one combined response. This is what a BFF is for.
app.get("/api/trending", async (req, res) => {
  try {
    const tr = await fetch(`${INSIGHTS_URL}/trending`);
    const { trending } = await tr.json();

    // For each trending id, pull the product detail from catalog.
    const detailed = await Promise.all(
      trending.map(async (t) => {
        try {
          const pr = await fetch(`${CATALOG_URL}/products/${t.productId}`);
          if (!pr.ok) return null;
          const product = await pr.json();
          return { ...product, views: t.views };
        } catch {
          return null;
        }
      })
    );

    res.json({ trending: detailed.filter(Boolean) });
  } catch (err) {
    res.status(502).json({ error: "insights service unreachable" });
  }
});

app.listen(PORT, () => {
  console.log(`gateway listening on ${PORT}`);
  console.log(`  catalog  -> ${CATALOG_URL}`);
  console.log(`  insights -> ${INSIGHTS_URL}`);
});
