from fastapi import FastAPI, Request, Depends, HTTPException, Form, status
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi_sessions import SessionCookie, InMemoryBackend
from passlib.context import CryptContext

import asyncpg
from datetime import timedelta
from typing import Optional
import os

app = FastAPI()

# Mount static files directory for CSS/JS/images
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="templates")

# PostgreSQL connection pool
DATABASE_URL = os.getenv("DATABASE_URL")  # Provided by Render

async def init_db():
    conn = await asyncpg.connect(DATABASE_URL)
    # Create users table
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    """)
    # Create projects table
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            modified_date TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id)
        )
    """)
    # Insert sample projects if the table is empty (for demo purposes)
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

# Initialize the database on startup
@app.on_event("startup")
async def startup_event():
    await init_db()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Session management
SESSION_KEY = "session_id"
session_backend = InMemoryBackend()
session_cookie = SessionCookie(
    name="session",
    secret_key=os.getenv("SECRET_KEY", "your-secret-key"),
    backend=session_backend,
    max_age=timedelta(days=7)
)

# Dependency to get the current user
async def get_current_user(request: Request) -> Optional[dict]:
    session_id = request.cookies.get("session")
    if not session_id:
        return None
    session_data = await session_backend.read(session_id)
    return session_data if session_data else None

# Helper function to verify passwords
def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# Helper function to hash passwords
def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

# Helper function to get a user from the database
async def get_user(username: str):
    conn = await asyncpg.connect(DATABASE_URL)
    user = await conn.fetchrow("SELECT * FROM users WHERE username = $1", username)
    await conn.close()
    if user:
        return {"id": user["id"], "username": user["username"], "password_hash": user["password_hash"]}
    return None

# Helper function to get projects for a user (or all projects if user_id is None)
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
async def read_root(request: Request, user: Optional[dict] = Depends(get_current_user)):
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)
    # Fetch user-specific projects (or fallback to sample projects if user_id is NULL)
    user_data = await get_user(user["username"])
    projects = await get_projects(user_id=user_data["id"])
    if not projects:  # Fallback to sample projects
        projects = await get_projects(user_id=None)
    return templates.TemplateResponse("index.html", {"request": request, "projects": projects, "username": user["username"]})

# Registration page
@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

# Handle registration
@app.post("/register", response_class=HTMLResponse)
async def register(request: Request, username: str = Form(...), password: str = Form(...)):
    if await get_user(username):
        return templates.TemplateResponse("register.html", {"request": request, "error": "Username already exists"})
    
    password_hash = get_password_hash(password)
    conn = await asyncpg.connect(DATABASE_URL)
    await conn.execute("INSERT INTO users (username, password_hash) VALUES ($1, $2)", username, password_hash)
    await conn.close()

    return RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)

# Login page
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# Handle login
@app.post("/login", response_class=HTMLResponse)
async def login(request: Request, response: RedirectResponse, username: str = Form(...), password: str = Form(...)):
    user = await get_user(username)
    if not user or not verify_password(password, user["password_hash"]):
        return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid username or password"})
    
    session_data = {"username": username}
    session_id = await session_backend.create(session_data)
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    session_cookie.attach_to_response(response, session_id)
    return response

# Logout
@app.get("/logout", response_class=HTMLResponse)
async def logout(request: Request, response: RedirectResponse):
    session_id = request.cookies.get("session")
    if session_id:
        await session_backend.delete(session_id)
    response = RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)
    session_cookie.delete_from_response(response)
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)