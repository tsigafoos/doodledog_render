from fastapi import FastAPI, Request, Form, HTTPException, Depends, status
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from typing import Optional
from sqlmodel import select, Session
from database import create_db_and_tables, SessionDep
from models import User
from pydantic import BaseModel, EmailStr, validator
from jose import JWTError, jwt
from datetime import datetime, timedelta
from slowapi import Limiter
from slowapi.util import get_remote_address
from dotenv import load_dotenv
import secrets
import os

load_dotenv()
app = FastAPI()

# Mount static files directory for CSS/JS/images
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="templates")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY") or secrets.token_urlsafe(32)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# Pydantic models for input validation
class UserLogin(BaseModel):
    username: str
    password: str

    @validator("password")
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

    @validator("password")
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

# Sample project data (to be replaced with database)
projects = [
    {"name": "Sample Workflow Process", "type": "Flowchart", "modified_date": "2025-04-10 17:30:25"},
    {"name": "Sample Logo Design", "type": "Vector", "modified_date": "2025-04-05 09:45:32"},
    {"name": "Sample Marketing Brochure", "type": "Page Layout", "modified_date": "2025-03-30 12:18:45"}
]

# Initialize database and tables on startup
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# Create JWT token
def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Generate CSRF token
def generate_csrf_token():
    return secrets.token_urlsafe(32)

# Dependency to get the current user from cookie
async def get_current_user(request: Request, session: SessionDep):
    print(f"Cookies: {request.cookies}")  # Debug print
    token = request.cookies.get("access_token")
    print(f"Raw token from cookie: {token}")  # Debug print
    if token is None:
        return None
    if token.startswith("Bearer "):
        token = token[len("Bearer "):]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            print("No username in JWT payload")  # Debug print
            return None
    except JWTError as e:
        print(f"JWT decode error: {str(e)}")  # Debug print
        return None
    user = session.exec(select(User).where(User.username == username)).first()
    print(f"User from DB: {user.username if user else None}")  # Debug print
    return user

@app.get("/", response_class=HTMLResponse)
@app.get("/home", response_class=HTMLResponse)
async def read_root(request: Request, user: Optional[User] = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    csrf_token = generate_csrf_token()
    response = templates.TemplateResponse("index.html", {"request": request, "csrf_token": csrf_token})
    response.set_cookie(key="csrf_token", value=csrf_token, httponly=True, secure=True, samesite="strict")
    return response

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, user: Optional[User] = Depends(get_current_user)):
    print(f"Dashboard user: {user.username if user else None}")  # Debug print
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)
    csrf_token = generate_csrf_token()
    response = templates.TemplateResponse("dashboard.html", {"request": request, "projects": projects, "user": user, "csrf_token": csrf_token})
    response.set_cookie(key="csrf_token", value=csrf_token, httponly=True, secure=True, samesite="strict")
    return response

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, user: Optional[User] = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    csrf_token = generate_csrf_token()
    response = templates.TemplateResponse("login.html", {"request": request, "csrf_token": csrf_token})
    response.set_cookie(key="csrf_token", value=csrf_token, httponly=True, secure=True, samesite="strict")
    return response

@app.post("/login", response_class=HTMLResponse)
@limiter.limit("5/minute")
async def login(request: Request, session: SessionDep, username: str = Form(...), password: str = Form(...), csrf_token: str = Form(...)):
    # Verify CSRF token
    stored_csrf_token = request.cookies.get("csrf_token")
    if not stored_csrf_token or stored_csrf_token != csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")

    try:
        user_input = UserLogin(username=username, password=password)
    except ValueError as e:
        return templates.TemplateResponse("login.html", {"request": request, "error": str(e), "csrf_token": generate_csrf_token()})

    user = session.exec(select(User).where(User.username == user_input.username)).first()
    if not user or not pwd_context.verify(user_input.password, user.password):
        return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid username or password", "csrf_token": generate_csrf_token()})
    
    # Update last_login
    user.last_login = datetime.utcnow()
    session.add(user)
    session.commit()

    # Create JWT token
    access_token = create_access_token(data={"sub": user.username})
    
    # Set secure cookie with JWT
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    return response

@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request, user: Optional[User] = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    csrf_token = request.cookies.get("csrf_token") or generate_csrf_token()
    response = templates.TemplateResponse("register.html", {"request": request, "csrf_token": csrf_token})
    response.set_cookie(key="csrf_token", value=csrf_token, httponly=True, secure=True, samesite="strict")
    return response

@app.post("/register", response_class=HTMLResponse)
@limiter.limit("5/minute")
async def register(request: Request, session: SessionDep, username: str = Form(...), email: str = Form(...), password: str = Form(...), csrf_token: str = Form(...)):
    # Verify CSRF token
    stored_csrf_token = request.cookies.get("csrf_token")
    print(f"Form CSRF token: {csrf_token}, Cookie CSRF token: {stored_csrf_token}")  # Debug print
    if not stored_csrf_token or stored_csrf_token != csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")

    try:
        user_input = UserRegister(username=username, email=email, password=password)
    except ValueError as e:
        print(f"Validation error: {str(e)}")  # Debug print
        return templates.TemplateResponse("register.html", {"request": request, "error": str(e), "csrf_token": generate_csrf_token()})

    # Check if username or email already exists
    existing_user = session.exec(select(User).where(User.username == user_input.username)).first()
    if existing_user:
        print(f"Username {username} already exists")  # Debug print
        return templates.TemplateResponse("register.html", {"request": request, "error": "Username already exists", "csrf_token": generate_csrf_token()})
    
    existing_email = session.exec(select(User).where(User.email == user_input.email)).first()
    if existing_email:
        print(f"Email {email} already exists")  # Debug print
        return templates.TemplateResponse("register.html", {"request": request, "error": "Email already exists", "csrf_token": generate_csrf_token()})
    
    # Hash the password and store the user
    hashed_password = pwd_context.hash(user_input.password)
    new_user = User(username=user_input.username, email=user_input.email, password=hashed_password, created_at=datetime.utcnow())
    session.add(new_user)
    try:
        session.commit()
        session.refresh(new_user)
        print(f"User {new_user.username} saved successfully, ID: {new_user.id}")  # Debug print
    except Exception as e:
        session.rollback()
        print(f"Database error: {str(e)}")  # Debug print
        return templates.TemplateResponse("register.html", {"request": request, "error": "Failed to save user", "csrf_token": generate_csrf_token()})
    
    # Create JWT token
    access_token = create_access_token(data={"sub": new_user.username})
    print(f"JWT token created: {access_token}")  # Debug print
    
    # Set secure cookie with JWT
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    print("Access token cookie set")  # Debug print
    return response

@app.get("/logout", response_class=HTMLResponse)
async def logout():
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(key="access_token")
    response.delete_cookie(key="csrf_token")
    return response

@app.get("/drawing", response_class=HTMLResponse)
async def drawing_page(request: Request, user: Optional[User] = Depends(get_current_user)):
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)
    csrf_token = generate_csrf_token()
    response = templates.TemplateResponse("drawing.html", {"request": request, "user": user, "csrf_token": csrf_token})
    response.set_cookie(key="csrf_token", value=csrf_token, httponly=True, secure=True, samesite="strict")
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)