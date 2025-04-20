from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, unique=True)
    email: str = Field(index=True, unique=True)
    password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = Field(default=None)
    organizations: List["OrganizationMember"] = Relationship(back_populates="user")
    projects: List["Project"] = Relationship(back_populates="owner")

class Organization(SQLModel, table=True):
    __tablename__ = "organizations"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    members: List["OrganizationMember"] = Relationship(back_populates="organization")
    projects: List["Project"] = Relationship(back_populates="organization")

class OrganizationMember(SQLModel, table=True):
    __tablename__ = "organization_members"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    organization_id: int = Field(foreign_key="organizations.id")
    role: str = Field(default="member")  # e.g., "admin", "editor", "member"
    joined_at: datetime = Field(default_factory=datetime.utcnow)
    user: User = Relationship(back_populates="organizations")
    organization: Organization = Relationship(back_populates="members")

class Project(SQLModel, table=True):
    __tablename__ = "projects"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    type: str  # e.g., "Flowchart", "Vector", "Page Layout"
    owner_id: int = Field(foreign_key="users.id")
    organization_id: Optional[int] = Field(default=None, foreign_key="organizations.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    modified_at: datetime = Field(default_factory=datetime.utcnow)
    owner: User = Relationship(back_populates="projects")
    organization: Optional[Organization] = Relationship(back_populates="projects")
    assets: List["Asset"] = Relationship(back_populates="project")

class Asset(SQLModel, table=True):
    __tablename__ = "assets"
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="projects.id")
    type: str  # e.g., "text", "bitmap", "vector"
    content: Optional[str] = Field(default=None)  # For text content
    file_path: Optional[str] = Field(default=None)  # For image/vector files
    created_at: datetime = Field(default_factory=datetime.utcnow)
    modified_at: datetime = Field(default_factory=datetime.utcnow)
    project: Project = Relationship(back_populates="assets")