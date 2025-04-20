from fastapi import FastAPI, Request, Form, HTTPException, Depends, status
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from typing import Optional, Annotated
from sqlmodel import select, Session
from database import create_db_and_tables, SessionDep, get_session  # Added get_session
from models import User
from pydantic import BaseModel, EmailStr, validator
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi.security import OAuth2PasswordBearer
from slowapi import Limiter
from slowapi.util import get_remote_address
import secrets

app = FastAPI()

# Mount static files directory for CSS/JS/images
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="templates")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT configuration
SECRET_KEY = secrets.token_urlsafe(32)  # Generate a secure key; store in .env
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# OAuth2 scheme for JWT
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

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

# Dependency to get the current user from JWT
async def get_current_user(token: str = Depends(oauth2_scheme), session: SessionDep = Depends(get_session)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = session.exec(select(User).where(User.username == username)).first()
    if user is None:
        raise credentials_exception
    return user

# Generate CSRF token
def generate_csrf_token():
    return secrets.token_urlsafe(32)

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
    
    # Create JWT token
    access_token = create_access_token(data={"sub": user.username})
    
    # Set secure cookie with JWT
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        secure=True,  # Requires HTTPS
        samesite="strict",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )
    return response

@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request, user: Optional[User] = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    csrf_token = generate_csrf_token()
    response = templates.TemplateResponse("register.html", {"request": request, "csrf_token": csrf_token})
    response.set_cookie(key="csrf_token", value=csrf_token, httponly=True, secure=True, samesite="strict")
    return response

@app.post("/register", response_class=HTMLResponse)
@limiter.limit("5/minute")
async def register(request: Request, session: SessionDep, username: str = Form(...), email: str = Form(...), password: str = Form(...), csrf_token: str = Form(...)):
    # Verify CSRF token
    stored_csrf_token = request.cookies.get("csrf_token")
    if not stored_csrf_token or stored_csrf_token != csrf_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token")

    try:
        user_input = UserRegister(username=username, email=email, password=password)
    except ValueError as e:
        return templates.TemplateResponse("register.html", {"request": request, "error": str(e), "csrf_token": generate_csrf_token()})

    # Check if username or email already exists
    existing_user = session.exec(select(User).where(User.username == user_input.username)).first()
    if existing_user:
        return templates.TemplateResponse("register.html", {"request": request, "error": "Username already exists", "csrf_token": generate_csrf_token()})
    
    existing_email = session.exec(select(User).where(User.email == user_input.email)).first()
    if existing_email:
        return templates.TemplateResponse("register.html", {"request": request, "error": "Email already exists", "csrf_token": generate_csrf_token()})
    
    # Hash the password and store the user
    hashed_password = pwd_context.hash(user_input.password)
    new_user = User(username=user_input.username, email=user_input.email, password=hashed_password)
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    
    # Create JWT token
    access_token = create_access_token(data={"sub": new_user.username})
    
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

@app.get("/logout", response_class=HTMLResponse)
async def logout():
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(key="access_token")
    response.delete_cookie(key="csrf_token")
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)