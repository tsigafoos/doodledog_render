from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import asyncpg
from typing import Optional
import os
from fastapi_users import FastAPIUsers, models
from fastapi_users.authentication import CookieTransport, AuthenticationBackend
from fastapi_users.authentication import JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from fastapi_users.db import SQLAlchemyBaseUserTable
from sqlalchemy import String, Column  # Import Column here
from sqlalchemy.orm import DeclarativeBase

# Initialize FastAPI app
app = FastAPI()

# Mount static files directory for CSS/JS/images
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="templates")

# PostgreSQL configuration
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set. Please set it to your PostgreSQL database URL.")

if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# SQLAlchemy setup for fastapi-users
class Base(DeclarativeBase):
    pass

class User(SQLAlchemyBaseUserTable[int], Base):
    username = Column(String, unique=True, nullable=False)  # Use Column directly

engine = create_async_engine(DATABASE_URL)
async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Create tables on startup
@app.on_event("startup")
async def startup_event():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Initialize projects table using asyncpg
    await init_projects_db()

# FastAPI-Users setup
cookie_transport = CookieTransport(cookie_max_age=604800)  # 7 days

SECRET = os.getenv("SECRET_KEY", "flynnrebelsniperhankpreston")

if not SECRET:
    raise ValueError("SECRET_KEY environment variable is not set. Please set it for JWT authentication.")

def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=SECRET, lifetime_seconds=604800)

auth_backend = AuthenticationBackend(
    name="jwt",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, int](
    lambda: SQLAlchemyUserDatabase(User, async_session_maker),
    [auth_backend],
)

# Helper to get the current user
current_active_user = fastapi_users.current_user(active=True)

# Initialize projects table using asyncpg
async def init_projects_db():
    conn = await asyncpg.connect(DATABASE_URL)
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            modified_date TEXT NOT NULL,
            user_id INTEGER
        )
    """)
    count = await conn.fetchval("SELECT COUNT(*) FROM projects")
    if count == 0:
        sample_projects = [
            ("Sample Workflow Process", "Flowchart", "2025-04-10"),
            ("Sample Logo Design", "Vector", "2025-04-05"),
            ("Sample Marketing Brochure", "Page Layout", "2025-03-30")
        ]
        for name, project_type, modified_date in sample_projects:
            await conn.execute(
                "INSERT INTO projects (name, type, modified_date, user_id) VALUES ($1, $2, $3, NULL)",
                name, project_type, modified_date
            )
    await conn.close()

# Helper function to get projects for a user
async def get_projects(user_id: Optional[int] = None):
    conn = await asyncpg.connect(DATABASE_URL)
    if user_id:
        projects = await conn.fetch(
            "SELECT name, type, modified_date FROM projects WHERE user_id = $1", user_id
        )
    else:
        projects = await conn.fetch(
            "SELECT name, type, modified_date FROM projects WHERE user_id IS NULL"
        )
    await conn.close()
    return [{"name": p["name"], "type": p["type"], "modified_date": p["modified_date"]} for p in projects]

# Root route (Dashboard) - Only for authenticated users
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request, user: User = Depends(current_active_user)):
    projects = await get_projects(user_id=user.id)
    if not projects:  # Fallback to sample projects
        projects = await get_projects(user_id=None)
    return templates.TemplateResponse("index.html", {"request": request, "projects": projects, "username": user.username})

# Registration page
@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

# Login page
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# Include fastapi-users routers
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
    tags=["auth"],
)

app.include_router(
    fastapi_users.get_register_router(),
    prefix="/auth",
    tags=["auth"],
)

app.include_router(
    fastapi_users.get_users_router(),
    prefix="/users",
    tags=["users"],
)

# Logout route
@app.get("/logout", response_class=RedirectResponse)
async def logout(request: Request, response: RedirectResponse):
    response = RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(cookie_transport.cookie_name)
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)