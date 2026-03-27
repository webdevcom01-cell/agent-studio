"""
SQLAlchemy models — Deal Flow Agent
Uses pgvector for semantic similarity search on deal embeddings.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Text, Float, DateTime, Enum, ForeignKey, JSON, Boolean
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
import enum

from backend.database.connection import Base


# ── Enums ────────────────────────────────────────────────────────────────────

class DealStatus(str, enum.Enum):
    SCREENING    = "screening"
    FINANCIAL    = "financial_review"
    RISK         = "risk_assessment"
    COMPETITIVE  = "competitive_analysis"
    LEGAL        = "legal_review"
    APPROVED     = "approved"
    REJECTED     = "rejected"
    ON_HOLD      = "on_hold"


class AgentType(str, enum.Enum):
    SCREENING    = "screening"
    FINANCIAL    = "financial"
    RISK         = "risk"
    COMPETITIVE  = "competitive"
    LEGAL        = "legal"


class AgentRunStatus(str, enum.Enum):
    PENDING    = "pending"
    RUNNING    = "running"
    COMPLETED  = "completed"
    FAILED     = "failed"


# ── Models ────────────────────────────────────────────────────────────────────

class Company(Base):
    """Target company being evaluated for M&A."""
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name:           Mapped[str]           = mapped_column(String(255), nullable=False, index=True)
    domain:         Mapped[Optional[str]] = mapped_column(String(255))
    description:    Mapped[Optional[str]] = mapped_column(Text)
    industry:       Mapped[Optional[str]] = mapped_column(String(128))
    country:        Mapped[Optional[str]] = mapped_column(String(64))
    founded_year:   Mapped[Optional[int]] = mapped_column()
    employee_count: Mapped[Optional[int]] = mapped_column()
    linkedin_url:   Mapped[Optional[str]] = mapped_column(String(512))
    crunchbase_url: Mapped[Optional[str]] = mapped_column(String(512))
    # Enriched data from APIs (raw JSON)
    linkedin_data:   Mapped[Optional[dict]] = mapped_column(JSON)
    crunchbase_data: Mapped[Optional[dict]] = mapped_column(JSON)
    # pgvector embedding for semantic search
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(1536))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    deals: Mapped[list["Deal"]] = relationship(back_populates="company")


class Deal(Base):
    """An M&A deal under evaluation."""
    __tablename__ = "deals"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    company_id: Mapped[str]           = mapped_column(ForeignKey("companies.id"), nullable=False)
    deal_name:  Mapped[str]           = mapped_column(String(512), nullable=False)
    deal_type:  Mapped[Optional[str]] = mapped_column(String(64))   # acquisition | merger | minority_stake
    status:     Mapped[DealStatus]    = mapped_column(Enum(DealStatus), default=DealStatus.SCREENING)
    # Financials
    deal_value_usd:   Mapped[Optional[float]] = mapped_column(Float)
    revenue_usd:      Mapped[Optional[float]] = mapped_column(Float)
    ebitda_usd:       Mapped[Optional[float]] = mapped_column(Float)
    ev_ebitda:        Mapped[Optional[float]] = mapped_column(Float)
    irr_target:       Mapped[Optional[float]] = mapped_column(Float)
    # Overall scores (0–100) set by agents
    screening_score:   Mapped[Optional[float]] = mapped_column(Float)
    financial_score:   Mapped[Optional[float]] = mapped_column(Float)
    risk_score:        Mapped[Optional[float]] = mapped_column(Float)
    competitive_score: Mapped[Optional[float]] = mapped_column(Float)
    legal_score:       Mapped[Optional[float]] = mapped_column(Float)
    overall_score:     Mapped[Optional[float]] = mapped_column(Float)
    # Metadata
    notes:      Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime]      = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime]      = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company:    Mapped["Company"]      = relationship(back_populates="deals")
    agent_runs: Mapped[list["AgentRun"]] = relationship(back_populates="deal")
    memos:      Mapped[list["InvestmentMemo"]] = relationship(back_populates="deal")


class AgentRun(Base):
    """Result of running one specialized agent on a deal."""
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    deal_id:    Mapped[str]            = mapped_column(ForeignKey("deals.id"), nullable=False)
    agent_type: Mapped[AgentType]      = mapped_column(Enum(AgentType), nullable=False)
    status:     Mapped[AgentRunStatus] = mapped_column(Enum(AgentRunStatus), default=AgentRunStatus.PENDING)
    score:      Mapped[Optional[float]]  = mapped_column(Float)
    # Full structured output from the agent
    analysis:      Mapped[Optional[dict]] = mapped_column(JSON)
    raw_response:  Mapped[Optional[str]]  = mapped_column(Text)
    error_message: Mapped[Optional[str]]  = mapped_column(Text)
    # Token usage
    input_tokens:  Mapped[Optional[int]] = mapped_column()
    output_tokens: Mapped[Optional[int]] = mapped_column()
    duration_ms:   Mapped[Optional[int]] = mapped_column()
    started_at:    Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at:  Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at:    Mapped[datetime]           = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped["Deal"] = relationship(back_populates="agent_runs")


class InvestmentMemo(Base):
    """Generated investment memorandum for a deal."""
    __tablename__ = "investment_memos"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    deal_id:       Mapped[str]           = mapped_column(ForeignKey("deals.id"), nullable=False)
    title:         Mapped[str]           = mapped_column(String(512), nullable=False)
    markdown_body: Mapped[Optional[str]] = mapped_column(Text)
    html_body:     Mapped[Optional[str]] = mapped_column(Text)
    executive_summary: Mapped[Optional[str]] = mapped_column(Text)
    recommendation:    Mapped[Optional[str]] = mapped_column(String(32))   # BUY | HOLD | PASS
    is_final:     Mapped[bool]      = mapped_column(Boolean, default=False)
    created_at:   Mapped[datetime]  = mapped_column(DateTime, default=datetime.utcnow)

    deal: Mapped["Deal"] = relationship(back_populates="memos")
