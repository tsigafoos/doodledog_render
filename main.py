
#SECRET = os.getenv("SECRET_KEY", "flynnrebelsniperhankpreston")
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
from sqlalchemy import String, Column, Integer
from sqlalchemy.orm import DeclarativeBase
from pydantic import BaseModel, EmailStr

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

# Keep the original DATABASE_URL for asyncpg (should be postgresql://)
ASYNCPG_DATABASE_URL = DATABASE_URL

# Modify the DATABASE_URL for SQLAlchemy (needs postgresql+asyncpg://)
SQLALCHEMY_DATABASE_URL = DATABASE_URL
if SQLALCHEMY_DATABASE_URL.startswith("postgresql://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

# SQLAlchemy setup for fastapi-users
class Base(DeclarativeBase):
    pass

class User(SQLAlchemyBaseUserTable[int], Base):
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)

engine = create_async_engine(SQLALCHEMY_DATABASE_URL)
async_session_maker = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Create tables on startup
@app.on_event("startup")
async def startup_event():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Initialize projects table using asyncpg
    await init_projects_db()

# Define Pydantic schemas for fastapi-users
class UserRead(BaseModel):
    id: int
    email: EmailStr
    username: str
    is_active: bool = True
    is_superuser: bool = False
    is_verified: bool = False

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str

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

# Helper to get the current user (optional, to allow public access)
current_user_optional = fastapi_users.current_user(active=True, optional=True)

# Initialize projects table using asyncpg
async def init_projects_db():
    conn = await asyncpg.connect(ASYNCPG_DATABASE_URL)
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
    conn = await asyncpg.connect(ASYNCPG_DATABASE_URL)
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

# Root route (Dashboard) - Publicly accessible
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    # Get the current user (if logged in)
    user = await current_user_optional(request)
    
    # Fetch projects (user-specific if logged in, otherwise sample projects)
    if user:
        projects = await get_projects(user_id=user.id)
        if not projects:  # Fallback to sample projects if user has none
            projects = await get_projects(user_id=None)
    else:
        projects = await get_projects(user_id=None)  # Sample projects for unauthenticated users
    
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "projects": projects,
            "user": user  # Pass the user object (or None) to the template
        }
    )

# Registration page
@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

# Login page
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# Custom login route to handle redirect after successful login
@app.post("/auth/jwt/login", response_class=RedirectResponse, response_model=None)
async def login(response: RedirectResponse = Depends(auth_backend.login)):
    # The auth_backend.login dependency sets the JWT cookie
    # We just need to redirect to the dashboard
    return RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)

# Include fastapi-users routers (excluding the default login route)
app.include_router(
    fastapi_users.get_auth_router(auth_backend, requires_verification=False, include_login=False),
    prefix="/auth/jwt",
    tags=["auth"],
)

app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/auth",
    tags=["auth"],
)

app.include_router(
    fastapi_users.get_users_router(UserRead, UserCreate),
    prefix="/users",
    tags=["users"],
)

# Logout route
@app.get("/logout", response_class=RedirectResponse)
async def logout(request: Request, response: RedirectResponse):
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)  # Redirect to dashboard
    response.delete_cookie(cookie_transport.cookie_name)
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)