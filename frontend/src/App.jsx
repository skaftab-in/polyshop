import React, { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

// Static metadata for services the gateway doesn't report on itself
// (frontend can't ping its own pod from inside the browser — if this
// code is running at all, the frontend is up).
const SERVICE_META = {
  frontend: { label: "frontend", tech: "React / Nginx" },
  gateway: { label: "gateway", tech: "Node / Express" },
  catalog: { label: "catalog", tech: "Java / Spring Boot" },
  insights: { label: "insights", tech: "Python / FastAPI" },
};
const SERVICE_ORDER = ["frontend", "gateway", "catalog", "insights"];

export default function App() {
  const [products, setProducts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState({});
  const [lastChecked, setLastChecked] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    category: "",
    emoji: "",
    price: "",
    description: "",
  });
  const [addError, setAddError] = useState(null);
  const [addBusy, setAddBusy] = useState(false);

  const loadProducts = useCallback(() => {
    return api
      .products()
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setProducts([]));
  }, []);

  const loadTrending = useCallback(() => {
    api.trending().then((d) => setTrending(d.trending || [])).catch(() => {});
  }, []);

  // Poll the gateway's aggregated health endpoint so the status board
  // reflects reality within a few seconds of a pod going away (e.g. you
  // ran `kubectl delete deployment catalog` to see what breaks).
  const refreshStatus = useCallback(() => {
    api
      .healthAll()
      .then((d) => {
        const byService = { frontend: "up" };
        (d.services || []).forEach((s) => {
          byService[s.service] = s.status;
        });
        setStatuses(byService);
        setLastChecked(new Date());
      })
      .catch(() => {
        // Can't even reach the gateway itself: gateway is down, and since
        // catalog/insights are only checked THROUGH the gateway, they're
        // unknown rather than confirmed up or down.
        setStatuses({ frontend: "up", gateway: "down" });
        setLastChecked(new Date());
      });
  }, []);

  useEffect(() => {
    loadProducts().finally(() => setLoading(false));
    loadTrending();
    refreshStatus();
    const id = setInterval(refreshStatus, 5000);
    return () => clearInterval(id);
  }, [loadProducts, loadTrending, refreshStatus]);

  const submitProduct = (e) => {
    e.preventDefault();
    const priceCents = Math.round(parseFloat(addForm.price) * 100);
    if (!addForm.name.trim()) {
      setAddError("Name is required");
      return;
    }
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setAddError("Enter a valid price");
      return;
    }

    setAddBusy(true);
    setAddError(null);
    api
      .addProduct({
        name: addForm.name.trim(),
        category: addForm.category.trim() || "Misc",
        emoji: addForm.emoji.trim() || "\u{1F4E6}",
        priceCents,
        description: addForm.description.trim(),
      })
      .then((res) => {
        if (res.error) {
          setAddError(res.error);
          return;
        }
        setToast(`Added ${res.name} to the catalog`);
        setTimeout(() => setToast(null), 2200);
        setAddForm({ name: "", category: "", emoji: "", price: "", description: "" });
        setAddOpen(false);
        loadProducts();
      })
      .catch(() => setAddError("Could not reach catalog"))
      .finally(() => setAddBusy(false));
  };

  // Opening a product records a view in insights (via the gateway),
  // so the trending strip reflects real interest. Refresh it after a moment.
  const openProduct = (id) => {
    api.product(id).then((p) => {
      setSelected(p);
      setTimeout(loadTrending, 400);
    });
  };

  const addToCart = (product) => {
    setCart((c) => {
      const found = c.find((i) => i.id === product.id);
      if (found) {
        return c.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...c, { ...product, qty: 1 }];
    });
    setToast(`Added ${product.name}`);
    setTimeout(() => setToast(null), 1600);
  };

  const changeQty = (id, delta) =>
    setCart((c) =>
      c
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );

  const cartCount = cart.reduce((n, i) => n + i.qty, 0);
  const cartTotal = cart.reduce((n, i) => n + i.priceCents * i.qty, 0);

  const placeOrder = () => {
    const items = cart.map((i) => ({ productId: i.id, quantity: i.qty }));
    api.placeOrder(items).then((res) => {
      if (res.orderId) {
        setToast(`Order #${res.orderId} placed. Total ${money(res.totalCents)}`);
        setCart([]);
        setCartOpen(false);
      } else {
        setToast(res.error || "Order failed");
      }
      setTimeout(() => setToast(null), 2600);
    });
  };

  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <span className="brand-mark">◆</span> PolyShop
        </div>
        <div className="nav-actions">
          <button className="add-product-btn" onClick={() => setAddOpen(true)}>
            + Add product
          </button>
          <button className="cart-btn" onClick={() => setCartOpen(true)}>
            Cart
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </button>
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Polyglot demo store</p>
        <h1>Things worth keeping on your desk.</h1>
        <p className="sub">
          A small catalog served by four services in four languages. Browse, and
          watch what's trending update as you look around.
        </p>
      </section>

      <section className="status-board">
        <div className="status-head">
          <span className="status-title">Service status</span>
          {lastChecked && (
            <span className="status-time">
              checked {lastChecked.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="status-row">
          {SERVICE_ORDER.map((key) => {
            const meta = SERVICE_META[key];
            const status = statuses[key] || "checking";
            return (
              <div key={key} className={`status-card status-${status}`}>
                <span className="status-dot" />
                <div className="status-info">
                  <span className="status-name">{meta.label}</span>
                  <span className="status-tech">{meta.tech}</span>
                </div>
                <span className="status-label">{status}</span>
              </div>
            );
          })}
        </div>
      </section>

      {trending.length > 0 && (
        <section className="trending">
          <div className="trending-head">
            <span className="flame">▲</span> Trending right now
          </div>
          <div className="trending-row">
            {trending.map((p) => (
              <button key={p.id} className="trend-card" onClick={() => openProduct(p.id)}>
                <span className="trend-emoji">{p.emoji}</span>
                <span className="trend-name">{p.name}</span>
                <span className="trend-views">{p.views} views</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <main className="grid">
        {loading && <p className="muted">Loading catalog…</p>}
        {!loading && products.length === 0 && (
          <p className="muted">Catalog is empty. Is the catalog service running?</p>
        )}
        {products.map((p) => (
          <article key={p.id} className="card">
            <button className="card-visual" onClick={() => openProduct(p.id)}>
              <span className="card-emoji">{p.emoji}</span>
            </button>
            <div className="card-body">
              <span className="card-cat">{p.category}</span>
              <h3 className="card-name" onClick={() => openProduct(p.id)}>
                {p.name}
              </h3>
              <div className="card-foot">
                <span className="price">{money(p.priceCents)}</span>
                <button className="add" onClick={() => addToCart(p)}>
                  Add
                </button>
              </div>
            </div>
          </article>
        ))}
      </main>

      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}>
              ✕
            </button>
            <div className="modal-visual">
              <span>{selected.emoji}</span>
            </div>
            <span className="card-cat">{selected.category}</span>
            <h2>{selected.name}</h2>
            <p className="modal-desc">{selected.description}</p>
            <div className="modal-foot">
              <span className="price big">{money(selected.priceCents)}</span>
              <button
                className="add primary"
                onClick={() => {
                  addToCart(selected);
                  setSelected(null);
                }}
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="overlay" onClick={() => setAddOpen(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitProduct}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setAddOpen(false)}
            >
              ✕
            </button>
            <h2>Add a product</h2>
            <p className="modal-desc">
              Goes straight into catalog's Postgres table via the gateway.
            </p>

            <div className="form-row">
              <label>Name</label>
              <input
                value={addForm.name}
                onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                placeholder="Nimbus Notebook"
              />
            </div>
            <div className="form-row two">
              <div>
                <label>Category</label>
                <input
                  value={addForm.category}
                  onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  placeholder="Tech"
                />
              </div>
              <div>
                <label>Emoji</label>
                <input
                  value={addForm.emoji}
                  onChange={(e) => setAddForm({ ...addForm, emoji: e.target.value })}
                  placeholder="📓"
                />
              </div>
            </div>
            <div className="form-row">
              <label>Price (USD)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={addForm.price}
                onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                placeholder="24.00"
              />
            </div>
            <div className="form-row">
              <label>Description</label>
              <textarea
                value={addForm.description}
                onChange={(e) =>
                  setAddForm({ ...addForm, description: e.target.value })
                }
                placeholder="A short description shown in the product modal."
                rows={2}
              />
            </div>

            {addError && <p className="form-error">{addError}</p>}

            <div className="modal-foot">
              <span />
              <button className="add primary" type="submit" disabled={addBusy}>
                {addBusy ? "Adding…" : "Add product"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={`drawer ${cartOpen ? "open" : ""}`}>
        <div className="drawer-head">
          <h3>Your cart</h3>
          <button className="modal-close" onClick={() => setCartOpen(false)}>
            ✕
          </button>
        </div>
        {cart.length === 0 ? (
          <p className="muted drawer-empty">Nothing here yet. Add something you like.</p>
        ) : (
          <>
            <div className="drawer-items">
              {cart.map((i) => (
                <div key={i.id} className="drawer-item">
                  <span className="di-emoji">{i.emoji}</span>
                  <div className="di-main">
                    <span className="di-name">{i.name}</span>
                    <span className="di-price">{money(i.priceCents)}</span>
                  </div>
                  <div className="qty">
                    <button onClick={() => changeQty(i.id, -1)}>−</button>
                    <span>{i.qty}</span>
                    <button onClick={() => changeQty(i.id, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="drawer-foot">
              <div className="total-row">
                <span>Total</span>
                <span className="price big">{money(cartTotal)}</span>
              </div>
              <button className="add primary full" onClick={placeOrder}>
                Place order
              </button>
            </div>
          </>
        )}
      </div>
      {cartOpen && <div className="scrim" onClick={() => setCartOpen(false)} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
