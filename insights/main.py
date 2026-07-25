import os
import redis
from fastapi import FastAPI
from fastapi.responses import JSONResponse

# The insights service is the lightweight, fast one.
# Its whole job: count product views in Redis and report what's trending.
# Python + FastAPI is a good fit here: tiny, quick to start, easy to scale.

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

app = FastAPI(title="PolyShop Insights")

# decode_responses=True so Redis returns strings, not bytes
r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)

VIEW_KEY = "product:views"  # a Redis sorted set: member=productId, score=view count


@app.get("/health")
def health():
    # Used by Kubernetes readiness/liveness probes later.
    try:
        r.ping()
        return {"status": "ok", "redis": "connected"}
    except Exception:
        # Return 503 so a probe treats us as not-ready when Redis is down.
        return JSONResponse(status_code=503, content={"status": "degraded", "redis": "unreachable"})


@app.post("/view/{product_id}")
def record_view(product_id: int):
    # Increment this product's score in the sorted set by 1.
    new_count = r.zincrby(VIEW_KEY, 1, str(product_id))
    return {"productId": product_id, "views": int(new_count)}


@app.get("/trending")
def trending(limit: int = 4):
    # zrevrange returns members sorted by score, highest first.
    top = r.zrevrange(VIEW_KEY, 0, limit - 1, withscores=True)
    return {
        "trending": [
            {"productId": int(pid), "views": int(score)} for pid, score in top
        ]
    }
# ci trigger
# retry after rebase fix
