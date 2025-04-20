import os
from sqlmodel import SQLModel, create_engine, Session
from typing import Annotated
from fastapi import Depends

# Get the database URL from environment variables (set by Render)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/doodledog_db")

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