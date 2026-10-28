from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api import router as api_router
from app.auth import router as auth_router
from app.customer import router as customer_router
from app.db import engine
from app.middleware import RequestBoundary
from app.outputs import router as outputs_router
from app.public import router as public_router
from app.review import router as review_router

app = FastAPI(title="Super Onboard", version="0.1.0")
app.add_middleware(RequestBoundary)
app.include_router(auth_router)
app.include_router(api_router)
app.include_router(review_router)
app.include_router(customer_router)
app.include_router(outputs_router)
app.include_router(public_router)


@app.get("/health/live")
def live():
    return {"status": "ok", "milestone": 4}


@app.get("/health/ready")
def ready():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT version_num FROM alembic_version"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database or migrations unavailable") from None
    return {"status": "ready"}
