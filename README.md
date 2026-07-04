# PolyShop

A minimal polyglot microservices store, built to learn how a production-shaped
app is deployed on Kubernetes. Small on features, real on architecture.

## Architecture

```
Browser
  |
  v
Ingress (Traefik)        /      -> frontend (React)
                         /api   -> gateway  (Node/Express)
                                     |
                     +---------------+---------------+
                     v                               v
              catalog (Java/Spring)           insights (FastAPI/Python)
                     |                               |
                     v                               v
                 Postgres                          Redis
```

## Services

| Service    | Language            | Port | Job                                        | Data     |
|------------|---------------------|------|--------------------------------------------|----------|
| frontend   | React + Vite        | 80   | The UI. Talks only to the gateway.         | none     |
| gateway    | Node + Express      | 3000 | Backend-for-frontend. Routes + aggregates. | none     |
| catalog    | Java + Spring Boot  | 8080 | Products and orders. Transactional core.   | Postgres |
| insights   | Python + FastAPI    | 8000 | View counts and trending. Fast + light.    | Redis    |

Frontend, gateway, catalog, and insights are **stateless** (perfect for pods).
Postgres and Redis are **stateful** (in-cluster here for learning; RDS +
ElastiCache in real prod).

## API (through the gateway)

- `GET  /api/products`      list products
- `GET  /api/products/:id`  one product (also records a view in insights)
- `GET  /api/trending`      hot products, aggregated from insights + catalog
- `POST /api/orders`        place an order  `{ "items": [ { "productId": 1, "quantity": 2 } ] }`

## Run it locally (before Kubernetes)

```bash
docker compose up --build
# then open http://localhost:8090
```

Backend services are not published to the host on purpose. They reach each
other by service name over the internal network, exactly like in Kubernetes.

## Deploy to Kubernetes

Done in phases (see `k8s/`). Datastores first, then the app tier, then the
Ingress, then the HPA. Each manifest is built and explained as we go.
