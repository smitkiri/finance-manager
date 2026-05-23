"""FastAPI dependency that extracts the householdId query param.

Phase A1 has no auth: any caller may supply any householdId. Phase A2 will
verify that the caller is a member of the requested household.
"""

from fastapi import HTTPException, Query


def require_household_id(
    household_id: str = Query(
        ...,
        alias="householdId",
        description="Household to scope data to",
    ),
) -> str:
    """Validate and return the householdId query param. Raises 400 if missing/empty."""
    if not household_id or not household_id.strip():
        raise HTTPException(status_code=400, detail="householdId is required")
    return household_id
