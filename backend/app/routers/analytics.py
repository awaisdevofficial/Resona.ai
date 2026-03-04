from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.call import Call
from app.models.user import User


router = APIRouter()


@router.get("/summary")
async def get_summary(
    from_date: datetime = Query(
        default_factory=lambda: datetime.utcnow() - timedelta(days=30)
    ),
    to_date: datetime = Query(default_factory=datetime.utcnow),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    base = and_(Call.user_id == user.id, Call.created_at >= from_date, Call.created_at <= to_date)
    total = await db.scalar(select(func.count(Call.id)).where(base))
    completed = await db.scalar(
        select(func.count(Call.id)).where(base, Call.status == "completed")
    )
    avg_duration = await db.scalar(
        select(func.avg(Call.duration_seconds)).where(
            base, Call.duration_seconds.is_not(None)
        )
    )
    total_cost = await db.scalar(select(func.sum(Call.cost_cents)).where(base))
    minutes = await db.scalar(select(func.sum(Call.duration_seconds)).where(base))
    return {
        "total_calls": total or 0,
        "completed_calls": completed or 0,
        "success_rate": round((completed / total * 100) if total else 0, 1),
        "avg_duration_seconds": round(avg_duration or 0),
        "total_minutes": round((minutes or 0) / 60, 1),
        "total_cost_cents": total_cost or 0,
    }


@router.get("/calls-over-time")
async def calls_over_time(
    from_date: datetime = Query(
        default_factory=lambda: datetime.utcnow() - timedelta(days=30)
    ),
    to_date: datetime = Query(default_factory=datetime.utcnow),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.date(Call.created_at).label("date"), func.count(Call.id).label("count"))
        .where(and_(Call.user_id == user.id, Call.created_at >= from_date, Call.created_at <= to_date))
        .group_by(func.date(Call.created_at))
        .order_by(func.date(Call.created_at))
    )
    return [{"date": str(row.date), "count": row.count} for row in result]

