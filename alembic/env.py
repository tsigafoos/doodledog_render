from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context
from database import engine
from models import User, Organization, OrganizationMember, Project, Asset
from sqlmodel import SQLModel

config = context.config
fileConfig(config.config_file_name)
connectable = engine

with connectable.connect() as connection:
    context.configure(
        connection=connection,
        target_metadata=SQLModel.metadata,
        include_schemas=True
    )
    with context.begin_transaction():
        context.run_migrations()