"""
LSC Analytics API — Python FastAPI Service

Handles computationally intensive analytics operations:
- Statistical experiment analysis (proper frequentist stats)
- ML-based lead scoring enhancement
- Attribution modeling
- Revenue forecasting
- Content performance regression analysis
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
from contextlib import asynccontextmanager

from routers import experiments, attribution, scoring, forecasting, content_intel


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("LSC Analytics API starting...")
    yield
    # Shutdown
    print("LSC Analytics API shutting down...")


app = FastAPI(
    title="LSC Revenue Analytics API",
    description="Statistical analysis and ML services for the organic growth platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(experiments.router,   prefix="/experiments",   tags=["experiments"])
app.include_router(attribution.router,   prefix="/attribution",   tags=["attribution"])
app.include_router(scoring.router,       prefix="/scoring",       tags=["scoring"])
app.include_router(forecasting.router,   prefix="/forecasting",   tags=["forecasting"])
app.include_router(content_intel.router, prefix="/content",       tags=["content"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "lsc-analytics-api"}


@app.get("/")
async def root():
    return {
        "service": "LSC Analytics API",
        "endpoints": [
            "/experiments/analyze",
            "/attribution/u-shaped",
            "/attribution/linear",
            "/scoring/enhance",
            "/forecasting/mrr",
            "/content/regression",
        ],
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("ANALYTICS_PORT", "8000")),
        reload=os.getenv("NODE_ENV") != "production",
        log_level="info",
    )
