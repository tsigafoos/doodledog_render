from fastapi import FastAPI, Request, Form, HTTPException, Depends, status
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from typing import Optional

app = FastAPI()

# Mount static files directory for CSS/JS/images
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="templates")

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# In-memory user storage (replace with a database in production)
users = {}

# Sample project data (this could come from a database in a real application)
projects = [
    {"name": "Sample Workflow Process", "type": "Flowchart", "modified_date": "2025-04-10 17:30:25"},
    {"name": "Sample Logo Design", "type": "Vector", "modified_date": "2025-04-05 09:45:32"},
    {"name": "Sample Marketing Brochure", "type": "Page Layout", "modified_date": "2025-03-30 12:18:45"}
]

# Dependency to get the current user from the session cookie
def get_current_user(request: Request) -> Optional[dict]:
    username = request.cookies.get("username")
    if username and username in users:
        return {"username": username}
    return None

@app.get("/", response_class=HTMLResponse)
@app.get("/home", response_class=HTMLResponse)
async def read_root(request: Request, user: Optional[dict] = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, user: Optional[dict] = Depends(get_current_user)):
    if not user:
        return RedirectResponse(url="/login", status_code=status.HTTP_303_SEE_OTHER)
    return templates.TemplateResponse("dashboard.html", {"request": request, "projects": projects, "user": user})

@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, user: Optional[dict] = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    return templates.TemplateResponse("login.html", {"request": request})

@app.post("/login", response_class=HTMLResponse)
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    user = users.get(username)
    if not user or not pwd_context.verify(password, user["password"]):
        return templates.TemplateResponse("login.html", {"request": request, "error": "Invalid username or password"})
    
    # Create a response and set a cookie for the session
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(key="username", value=username)
    return response

@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request, user: Optional[dict] = Depends(get_current_user)):
    if user:
        return RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    return templates.TemplateResponse("register.html", {"request": request})

@app.post("/register", response_class=HTMLResponse)
async def register(request: Request, username: str = Form(...), email: str = Form(...), password: str = Form(...)):
    if username in users:
        return templates.TemplateResponse("register.html", {"request": request, "error": "Username already exists"})
    
    # Hash the password and store the user
    hashed_password = pwd_context.hash(password)
    users[username] = {"username": username, "email": email, "password": hashed_password}
    
    # Log the user in by setting a cookie
    response = RedirectResponse(url="/dashboard", status_code=status.HTTP_303_SEE_OTHER)
    response.set_cookie(key="username", value=username)
    return response

@app.get("/logout", response_class=HTMLResponse)
async def logout():
    response = RedirectResponse(url="/", status_code=status.HTTP_303_SEE_OTHER)
    response.delete_cookie(key="username")
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)