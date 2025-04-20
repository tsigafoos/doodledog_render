import os
from sqlmodel import SQLModel, create_engine, Session
from typing import Annotated
from fastapi import Depends
from dotenv import load_dotenv

load_dotenv()
# Get the secret URL from environment variables
SECRET_KEY = os.getenv("SECRET_KEY")
# Get the database URL from environment variables (set by Render)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://twogooddogs:lTKCoPFz0bDhbI0OlKmCgIot0FjhMDNK@dpg-d01sbhje5dus73bhbpqg-a/doodledog_db")

# Create the database engine
connect_args = {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

# Function to create the database and tables
def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

# Dependency to get a database session
def get_session():
    with Session(engine) as session:
        yield session

SessionDep = Annotated[Session, Depends(get_session)]