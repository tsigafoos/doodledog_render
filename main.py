from fastapi import FastAPI, Request, Form, HTTPException, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlmodel import select
from typing import Annotated
from database import create_db_and_tables, SessionDep, engine
from models import User

app = FastAPI()
templates = Jinja2Templates(directory="templates")

# Initialize database and tables on startup
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# Homepage (index.html)
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Register page (register.html)
@app.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})

# Register a new user
@app.post("/register", response_class=HTMLResponse)
async def register(
    request: Request,
    username: Annotated[str, Form()],
    email: Annotated[str, Form()],
    password: Annotated[str, Form()],
    session: SessionDep
):
    # Check if username or email already exists
    existing_user = session.exec(select(User).where(User.username == username)).first()
    if existing_user:
        return templates.TemplateResponse(
            "register.html",
            {"request": request, "error": "Username already exists"}
        )
    
    existing_email = session.exec(select(User).where(User.email == email)).first()
    if existing_email:
        return templates.TemplateResponse(
            "register.html",
            {"request": request, "error": "Email already exists"}
        )

    # Create new user
    new_user = User(username=username, email=email, password=password)
    session.add(new_user)
    session.commit()
    session.refresh(new_user)
    
    return RedirectResponse(url="/dashboard", status_code=303)

# Login page (login.html)
@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

# Login user
@app.post("/login", response_class=HTMLResponse)
async def login(
    request: Request,
    username: Annotated[str, Form()],
    password: Annotated[str, Form()],
    session: SessionDep
):
    # Find user in the database
    user = session.exec(select(User).where(User.username == username)).first()
    
    if not user or user.password != password:
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "error": "Invalid username or password"}
        )
    
    # Simulate session by storing user info (in a real app, use proper sessions)
    request.session["user"] = {"username": user.username}
    return RedirectResponse(url="/dashboard", status_code=303)

# Logout
@app.get("/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=303)

# Dashboard (for authenticated users)
@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request, session: SessionDep):
    if "user" not in request.session:
        return RedirectResponse(url="/login", status_code=303)
    
    user = session.exec(
        select(User).where(User.username == request.session["user"]["username"])
    ).first()
    if not user:
        request.session.clear()
        return RedirectResponse(url="/login", status_code=303)
    
    projects = [
        {"name": "Logo Redesign", "type": "Vector", "modified_date": "2025-04-10"},
        {"name": "Poster Draft", "type": "Drawing", "modified_date": "2025-04-09"},
        {"name": "Wireframe Sketch", "type": "Diagram", "modified_date": "2025-04-08"}
    ]
    
    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "user": user, "projects": projects}
    )


#Internal
#postgresql://twogooddogs:lTKCoPFz0bDhbI0OlKmCgIot0FjhMDNK@dpg-d01sbhje5dus73bhbpqg-a/doodledog_db

#External
#postgresql://twogooddogs:lTKCoPFz0bDhbI0OlKmCgIot0FjhMDNK@dpg-d01sbhje5dus73bhbpqg-a.virginia-postgres.render.com/doodledog_db

#if __name__ == "__main__":
#    import uvicorn
#    uvicorn.run(app, host="0.0.0.0", port=8000)