"""
Wipes the database and reseeds it from app/demo/fixture.json,
shifting all dates so the latest transaction lands on today.

Invoked by the Coolify scheduled job:
    python -m app.demo.reset

Refuses to run unless FINANCE_MANAGER_DEMO_MODE=true.
"""

from __future__ import annotations

import asyncio
import logging
import sys

from app.config import settings

logger = logging.getLogger("demo.reset")
logging.basicConfig(level=logging.INFO, format="%(message)s")


async def reset_demo() -> None:
    if not settings.finance_manager_demo_mode:
        logger.error("refusing to run: demo mode is not enabled")
        sys.exit(2)
    # wipe + reseed implemented in later tasks
    logger.info("demo reset: not yet implemented")


if __name__ == "__main__":
    asyncio.run(reset_demo())
