import React, { useEffect, useState, useCallback } from "react";
import { api } from "./api.js";

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export default function App() {
  const [products, setProducts] = useState([]);
  const [trending, setTrending] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadTrending = useCallback(() => {
    api.trending().then((d) => setTrending(d.trending || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .products()
      .then((d) => setProducts(Array.isArray(d) ? d : []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
    loadTrending();
  }, [loadTrending]);

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
        <button className="cart-btn" onClick={() => setCartOpen(true)}>
          Cart
          {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
        </button>
      </header>

      <section className="hero">
        <p className="eyebrow">Polyglot demo store</p>
        <h1>Things worth keeping on your desk.</h1>
        <p className="sub">
          A small catalog served by four services in four languages. Browse, and
          watch what's trending update as you look around.
        </p>
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
