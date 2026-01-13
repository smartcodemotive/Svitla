from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Folder(Base):
    __tablename__ = "folders"
    __table_args__ = (UniqueConstraint("parent_id", "name", name="uq_folder_name_per_parent"),)

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship("Folder", remote_side=[id], backref="children", lazy="joined")
    files = relationship("File", back_populates="folder", cascade="all, delete-orphan")


class File(Base):
    __tablename__ = "files"
    __table_args__ = (UniqueConstraint("folder_id", "name", name="uq_file_name_per_folder"),)

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    stored_name = Column(String(255), nullable=False)
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    mime_type = Column(String(255), nullable=False)
    size = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    folder = relationship("Folder", back_populates="files")

