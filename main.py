from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.requests import Request

app = FastAPI()

# Mount static files directory for CSS/JS/images
app.mount("/static", StaticFiles(directory="static"), name="static")

# Set up Jinja2 templates
templates = Jinja2Templates(directory="templates")

# Sample project data (this could come from a database in a real application)
projects = [
    {"name": "Sample Workflow Process", "type": "Flowchart", "modified_date": "2025-04-10 17:30:25"},
    {"name": "Sample Logo Design", "type": "Vector", "modified_date": "2025-04-05 09:45:32"},
    {"name": "Sample Marketing Brochure", "type": "Page Layout", "modified_date": "2025-03-30 12:18:45"}
]

@app.get("/", response_class=HTMLResponse)
@app.get("/home", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/dashboard", response_class=HTMLResponse)
async def read_root(request: Request):
    # Pass the projects data to the template
    return templates.TemplateResponse("dashboard.html", {"request": request, "projects": projects})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)