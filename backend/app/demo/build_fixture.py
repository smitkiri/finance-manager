"""
Developer tool: generates backend/app/demo/fixture.json from hand-curated
patterns. Run once and commit the JSON output. Re-run any time the
patterns change.

Usage:
    cd backend && uv run python -m app.demo.build_fixture
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

# Deterministic random for reproducible fixture
random.seed(20260517)

ANCHOR = date(2026, 5, 17)
FIXTURE_START = ANCHOR - timedelta(days=1095)

OUTPUT_PATH = Path(__file__).parent / "fixture.json"


# ---------- IDs (stable across rebuilds so transfer pairs survive) ----------

HOUSEHOLD_DEMO = "household-demo"

USER_DEMO = "demo-user"
USER_ALICE = "user-alice"
USER_BEN = "user-ben"

# Shared argon2 hash so demo users log in with the same password.
DEMO_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$"
    "esabfbTKNdXoPf3L35IbHQ$Fqd1ZaErhocYmf5G9LtX9Jh4kd66DGtUjEEzIr0/nAk"
)

ACCT_ALICE_CHECKING = "acct-alice-checking"
ACCT_ALICE_SAVINGS = "acct-alice-savings"
ACCT_BEN_CHECKING = "acct-ben-checking"
ACCT_JOINT_CARD = "acct-joint-card"
ACCT_401K = "acct-401k"

SRC_CHASE = "src-chase"
SRC_AMEX = "src-amex"
SRC_CAPONE = "src-capone"


# ---------- Categories ----------

CATEGORIES = [
    "Housing",
    "Groceries",
    "Restaurants",
    "Transportation",
    "Utilities",
    "Entertainment",
    "Subscriptions",
    "Healthcare",
    "Salary",
    "Refunds",
    "Transfers",
    "Travel",
]


# ---------- Users / accounts / sources ----------

HOUSEHOLDS = [
    {"id": HOUSEHOLD_DEMO, "name": "Demo Household"},
]

INVITATIONS: list[dict] = []

USERS = [
    {
        "id": USER_DEMO,
        "name": "Demo",
        "email": "demo@tally.local",
        "password_hash": DEMO_PASSWORD_HASH,
    },
    {
        "id": USER_ALICE,
        "name": "Alice Chen",
        "email": "alice@demo.tally.local",
        "password_hash": DEMO_PASSWORD_HASH,
    },
    {
        "id": USER_BEN,
        "name": "Ben Reyes",
        "email": "ben@demo.tally.local",
        "password_hash": DEMO_PASSWORD_HASH,
    },
]

ACCOUNTS = [
    {
        "id": ACCT_ALICE_CHECKING,
        "user_id": USER_ALICE,
        "name": "Alice Checking",
        "type": "asset",
        "teller_account_id": None,
        "teller_enrollment_id": None,
    },
    {
        "id": ACCT_ALICE_SAVINGS,
        "user_id": USER_ALICE,
        "name": "Alice Savings",
        "type": "asset",
        "teller_account_id": None,
        "teller_enrollment_id": None,
    },
    {
        "id": ACCT_BEN_CHECKING,
        "user_id": USER_BEN,
        "name": "Ben Checking",
        "type": "asset",
        "teller_account_id": None,
        "teller_enrollment_id": None,
    },
    {
        "id": ACCT_JOINT_CARD,
        "user_id": USER_ALICE,
        "name": "Joint Credit",
        "type": "liability",
        "teller_account_id": None,
        "teller_enrollment_id": None,
    },
    {
        "id": ACCT_401K,
        "user_id": USER_ALICE,
        "name": "Alice 401k",
        "type": "asset",
        "teller_account_id": None,
        "teller_enrollment_id": None,
    },
]

SOURCES = [
    {
        "id": SRC_CHASE,
        "name": "Chase Checking CSV",
        "mappings": [],
        "flip_income_expense": False,
    },
    {
        "id": SRC_AMEX,
        "name": "Amex Statement",
        "mappings": [],
        "flip_income_expense": False,
    },
    {
        "id": SRC_CAPONE,
        "name": "Capital One CSV",
        "mappings": [],
        "flip_income_expense": False,
    },
]


# ---------- Transaction helpers ----------


@dataclass
class Txn:
    id: str
    date: date
    description: str
    category: str
    amount: Decimal
    type: str  # "expense" | "income"
    user_id: str
    labels: list
    metadata: dict
    transfer_info: dict | None = None
    excluded: bool = False

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "description": self.description,
            "category": self.category,
            "amount": float(self.amount),
            "type": self.type,
            "user_id": self.user_id,
            "labels": self.labels,
            "metadata": self.metadata,
            "transfer_info": self.transfer_info,
            "excluded_from_calculations": self.excluded,
        }


_seq = 0


def next_id(prefix: str) -> str:
    global _seq
    _seq += 1
    return f"{prefix}-{_seq:05d}"


def iter_months(start: date, end: date):
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        yield date(y, m, 1)
        m += 1
        if m == 13:
            m = 1
            y += 1


def first_or_clamp(year: int, month: int, day: int) -> date:
    """Return date(year, month, day) clamped to last-of-month."""
    next_first = date(year + (month // 12), (month % 12) + 1, 1)
    last = (next_first - timedelta(days=1)).day
    return date(year, month, min(day, last))


# ---------- Recurring patterns ----------

txns: list[Txn] = []


def add_monthly(
    desc, amount, category, type_, user_id, day_of_month, source_id, account_id
):
    for first in iter_months(FIXTURE_START, ANCHOR):
        d = first_or_clamp(first.year, first.month, day_of_month)
        if d > ANCHOR or d < FIXTURE_START:
            continue
        txns.append(
            Txn(
                id=next_id("txn"),
                date=d,
                description=desc,
                category=category,
                amount=Decimal(str(amount)),
                type=type_,
                user_id=user_id,
                labels=[],
                metadata={"sourceId": source_id, "accountId": account_id},
            )
        )


def add_annual(
    desc, amount, category, type_, user_id, month, day, source_id, account_id
):
    """Add one charge per year on the given month/day, within FIXTURE_START..ANCHOR."""
    for year in range(FIXTURE_START.year, ANCHOR.year + 1):
        d = first_or_clamp(year, month, day)
        if d > ANCHOR or d < FIXTURE_START:
            continue
        txns.append(
            Txn(
                id=next_id("txn"),
                date=d,
                description=desc,
                category=category,
                amount=Decimal(str(amount)),
                type=type_,
                user_id=user_id,
                labels=[],
                metadata={"sourceId": source_id, "accountId": account_id},
            )
        )


def add_quarterly(
    desc, amount, category, type_, user_id, start: date, source_id, account_id
):
    """Add a charge every ~91 days starting from `start`, within range."""
    d = start
    while d <= ANCHOR:
        if d >= FIXTURE_START:
            txns.append(
                Txn(
                    id=next_id("txn"),
                    date=d,
                    description=desc,
                    category=category,
                    amount=Decimal(str(amount)),
                    type=type_,
                    user_id=user_id,
                    labels=[],
                    metadata={"sourceId": source_id, "accountId": account_id},
                )
            )
        d += timedelta(days=91)


def add_monthly_jittered(
    desc,
    low,
    high,
    category,
    type_,
    user_id,
    day_lo,
    day_hi,
    source_id,
    account_id,
):
    for first in iter_months(FIXTURE_START, ANCHOR):
        day = random.randint(day_lo, day_hi)
        d = first_or_clamp(first.year, first.month, day)
        if d > ANCHOR or d < FIXTURE_START:
            continue
        amt = round(random.uniform(low, high), 2)
        txns.append(
            Txn(
                id=next_id("txn"),
                date=d,
                description=desc,
                category=category,
                amount=Decimal(str(amt)),
                type=type_,
                user_id=user_id,
                labels=[],
                metadata={"sourceId": source_id, "accountId": account_id},
            )
        )


# Monthly fixed
add_monthly(
    "Rent payment",
    2800.00,
    "Housing",
    "expense",
    USER_ALICE,
    1,
    SRC_CHASE,
    ACCT_ALICE_CHECKING,
)
# Netflix: $15.99 for most of the history, $17.99 starting 90 days before ANCHOR.
# Demonstrates the "price went up" banner on the Subscriptions page.
NETFLIX_HIKE_DATE = ANCHOR - timedelta(days=90)
for first in iter_months(FIXTURE_START, ANCHOR):
    d = first_or_clamp(first.year, first.month, 5)
    if not (FIXTURE_START <= d <= ANCHOR):
        continue
    amt = Decimal("17.99") if d >= NETFLIX_HIKE_DATE else Decimal("15.99")
    txns.append(
        Txn(
            id=next_id("txn"),
            date=d,
            description="Netflix",
            category="Subscriptions",
            amount=amt,
            type="expense",
            user_id=USER_ALICE,
            labels=[],
            metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
        )
    )
add_monthly(
    "Spotify",
    11.99,
    "Subscriptions",
    "expense",
    USER_BEN,
    8,
    SRC_AMEX,
    ACCT_JOINT_CARD,
)
add_monthly(
    "Gym membership",
    45.00,
    "Healthcare",
    "expense",
    USER_ALICE,
    15,
    SRC_AMEX,
    ACCT_JOINT_CARD,
)
add_monthly(
    "Internet",
    75.00,
    "Utilities",
    "expense",
    USER_ALICE,
    28,
    SRC_CHASE,
    ACCT_ALICE_CHECKING,
)

# Monthly jittered
add_monthly_jittered(
    "Electric bill",
    90.00,
    130.00,
    "Utilities",
    "expense",
    USER_ALICE,
    18,
    22,
    SRC_CHASE,
    ACCT_ALICE_CHECKING,
)

# Annual: Costco membership renewal
add_annual(
    "Costco membership",
    65.00,
    "Shopping",
    "expense",
    USER_ALICE,
    month=4,
    day=12,
    source_id=SRC_AMEX,
    account_id=ACCT_JOINT_CARD,
)

# Quarterly: tax-prep service
add_quarterly(
    "Quarterly tax prep",
    120.00,
    "Professional services",
    "expense",
    USER_ALICE,
    start=FIXTURE_START + timedelta(days=20),
    source_id=SRC_CHASE,
    account_id=ACCT_ALICE_CHECKING,
)

# A subscription the user appears to have cancelled — 4 monthly charges,
# then a 60+ day gap so detection flips it to possibly_cancelled.
HBO_LAST = ANCHOR - timedelta(days=60)
for i in range(4):
    d = HBO_LAST - timedelta(days=30 * (3 - i))
    if d < FIXTURE_START:
        continue
    txns.append(
        Txn(
            id=next_id("txn"),
            date=d,
            description="HBO Max",
            category="Subscriptions",
            amount=Decimal("15.99"),
            type="expense",
            user_id=USER_BEN,
            labels=[],
            metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
        )
    )


# Biweekly salaries (opposite cycles)
def add_biweekly(
    desc, amount, category, type_, user_id, start: date, source_id, account_id
):
    d = start
    while d <= ANCHOR:
        if d >= FIXTURE_START:
            txns.append(
                Txn(
                    id=next_id("txn"),
                    date=d,
                    description=desc,
                    category=category,
                    amount=Decimal(str(amount)),
                    type=type_,
                    user_id=user_id,
                    labels=[],
                    metadata={"sourceId": source_id, "accountId": account_id},
                )
            )
        d += timedelta(days=14)


# Pick two Fridays 7 days apart for opposite cycles
ALICE_FIRST_PAYDAY = FIXTURE_START + timedelta(days=(4 - FIXTURE_START.weekday()) % 7)
BEN_FIRST_PAYDAY = ALICE_FIRST_PAYDAY + timedelta(days=7)
add_biweekly(
    "Salary - Alice",
    3400.00,
    "Salary",
    "income",
    USER_ALICE,
    ALICE_FIRST_PAYDAY,
    SRC_CHASE,
    ACCT_ALICE_CHECKING,
)
add_biweekly(
    "Salary - Ben",
    2950.00,
    "Salary",
    "income",
    USER_BEN,
    BEN_FIRST_PAYDAY,
    SRC_CAPONE,
    ACCT_BEN_CHECKING,
)

# Weekly-ish: groceries (3-5x/month, $40-$180)
GROCERY_STORES = ["Whole Foods", "Trader Joe's", "Safeway", "Costco"]
for first in iter_months(FIXTURE_START, ANCHOR):
    count = random.randint(3, 5)
    for _ in range(count):
        day = random.randint(1, 28)
        d = first_or_clamp(first.year, first.month, day)
        if d > ANCHOR:
            continue
        amt = round(random.uniform(40, 180), 2)
        txns.append(
            Txn(
                id=next_id("txn"),
                date=d,
                description=random.choice(GROCERY_STORES),
                category="Groceries",
                amount=Decimal(str(amt)),
                type="expense",
                user_id=random.choice([USER_ALICE, USER_BEN]),
                labels=[],
                metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
            )
        )

# Gas (2x/month)
GAS_VENDORS = ["Shell", "Chevron", "76", "Costco Gas"]
for first in iter_months(FIXTURE_START, ANCHOR):
    for _ in range(2):
        day = random.randint(1, 28)
        d = first_or_clamp(first.year, first.month, day)
        if d > ANCHOR:
            continue
        amt = round(random.uniform(30, 70), 2)
        txns.append(
            Txn(
                id=next_id("txn"),
                date=d,
                description=random.choice(GAS_VENDORS),
                category="Transportation",
                amount=Decimal(str(amt)),
                type="expense",
                user_id=random.choice([USER_ALICE, USER_BEN]),
                labels=[],
                metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
            )
        )

# Restaurants (4-8x/month)
RESTAURANTS = [
    "Sushi-Ya",
    "Pho 75",
    "Olive Garden",
    "Local Bistro",
    "Chipotle",
    "Starbucks",
    "Blue Bottle",
    "Thai Place",
]
for first in iter_months(FIXTURE_START, ANCHOR):
    count = random.randint(4, 8)
    for _ in range(count):
        day = random.randint(1, 28)
        d = first_or_clamp(first.year, first.month, day)
        if d > ANCHOR:
            continue
        amt = round(random.uniform(15, 90), 2)
        txns.append(
            Txn(
                id=next_id("txn"),
                date=d,
                description=random.choice(RESTAURANTS),
                category="Restaurants",
                amount=Decimal(str(amt)),
                type="expense",
                user_id=random.choice([USER_ALICE, USER_BEN]),
                labels=[],
                metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
            )
        )

# ---------- Realistic income/expense variance ----------
# Creates negative-savings months (Nov/Dec from holiday spending, occasional
# car repair) and huge-savings months (Dec bonuses, March tax refund).


def years_in_range():
    """Yield every calendar year that the fixture period touches."""
    yield from range(FIXTURE_START.year, ANCHOR.year + 1)


def safe_add(t: Txn):
    """Append a txn only if its date falls inside the fixture window."""
    if FIXTURE_START <= t.date <= ANCHOR:
        txns.append(t)


for year in years_in_range():
    # Year-end bonuses, mid-December — the "huge savings" months
    bonus_date = date(year, 12, 15)
    safe_add(
        Txn(
            id=next_id("txn"),
            date=bonus_date,
            description="Year-end bonus",
            category="Salary",
            amount=Decimal("8500.00"),
            type="income",
            user_id=USER_ALICE,
            labels=[],
            metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_CHECKING},
        )
    )
    safe_add(
        Txn(
            id=next_id("txn"),
            date=bonus_date,
            description="Year-end bonus",
            category="Salary",
            amount=Decimal("4200.00"),
            type="income",
            user_id=USER_BEN,
            labels=[],
            metadata={"sourceId": SRC_CAPONE, "accountId": ACCT_BEN_CHECKING},
        )
    )

    # Federal tax refund, mid-March — the other "huge savings" month
    refund_date = date(year, 3, 18)
    safe_add(
        Txn(
            id=next_id("txn"),
            date=refund_date,
            description="Federal tax refund",
            category="Refunds",
            amount=Decimal(str(round(random.uniform(2200, 3600), 2))),
            type="income",
            user_id=USER_ALICE,
            labels=[],
            metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_CHECKING},
        )
    )

    # Holiday gift cluster, late Nov - late Dec — pushes Dec into negative
    # savings even though the bonus lands the same month (some years).
    GIFT_RECIPIENTS = [
        "Mom",
        "Dad",
        "Sister",
        "Brother",
        "Niece",
        "Nephew",
        "Ben",
        "Alice",
        "Friend",
        "Coworker",
    ]
    gift_count = random.randint(9, 13)
    for _ in range(gift_count):
        month = random.choice([11, 11, 12, 12, 12])  # Dec weighted
        day = random.randint(15, 27)
        try:
            d = date(year, month, day)
        except ValueError:
            continue
        amt = round(random.uniform(80, 450), 2)
        safe_add(
            Txn(
                id=next_id("txn"),
                date=d,
                description=f"Gift - {random.choice(GIFT_RECIPIENTS)}",
                category="Entertainment",
                amount=Decimal(str(amt)),
                type="expense",
                user_id=random.choice([USER_ALICE, USER_BEN]),
                labels=["holiday-gifts"],
                metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
            )
        )

    # Thanksgiving travel — late November
    safe_add(
        Txn(
            id=next_id("txn"),
            date=date(year, 11, 22),
            description="Flight - Thanksgiving",
            category="Travel",
            amount=Decimal(str(round(random.uniform(380, 720), 2))),
            type="expense",
            user_id=USER_ALICE,
            labels=[],
            metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
        )
    )

    # Car insurance — twice a year, lumpy premium payments
    for month in (1, 7):
        safe_add(
            Txn(
                id=next_id("txn"),
                date=date(year, month, 12),
                description="Car insurance - 6mo premium",
                category="Transportation",
                amount=Decimal("780.00"),
                type="expense",
                user_id=USER_ALICE,
                labels=[],
                metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_CHECKING},
            )
        )

    # Car repair, ~70% of years — random month, large expense
    if random.random() < 0.7:
        month = random.randint(2, 10)
        day = random.randint(5, 25)
        try:
            d = date(year, month, day)
        except ValueError:
            d = date(year, month, 15)
        safe_add(
            Txn(
                id=next_id("txn"),
                date=d,
                description="Auto repair shop",
                category="Transportation",
                amount=Decimal(str(round(random.uniform(450, 1850), 2))),
                type="expense",
                user_id=random.choice([USER_ALICE, USER_BEN]),
                labels=[],
                metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
            )
        )

    # Medical bill, ~50% of years
    if random.random() < 0.5:
        month = random.randint(2, 11)
        day = random.randint(5, 25)
        try:
            d = date(year, month, day)
        except ValueError:
            d = date(year, month, 15)
        safe_add(
            Txn(
                id=next_id("txn"),
                date=d,
                description="Specialist visit copay",
                category="Healthcare",
                amount=Decimal(str(round(random.uniform(280, 1200), 2))),
                type="expense",
                user_id=random.choice([USER_ALICE, USER_BEN]),
                labels=[],
                metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
            )
        )

    # Major one-off expense per year — large enough to push the month into
    # negative savings even with both salaries landing. Falls outside the
    # bonus (Dec) and refund (Mar) months so the bonus highs stay clean.
    BIG_EVENTS = [
        ("Dental implant - out of pocket", "Healthcare", 8000, 14000),
        ("Auto repair - transmission rebuild", "Transportation", 7500, 13000),
        ("HVAC replacement", "Housing", 12000, 18000),
        ("Hospital bill - procedure", "Healthcare", 14000, 22000),
        ("Furniture - new sofa & bedroom", "Housing", 9000, 15000),
        ("Used car purchase", "Transportation", 16000, 24000),
        ("Wedding deposit", "Entertainment", 10000, 16000),
        ("Roof repair", "Housing", 8000, 15000),
        ("Engagement ring", "Entertainment", 7500, 14000),
    ]
    # Restrict candidate months to ones that actually fall inside the fixture
    # window for this year. Avoid Mar/Nov/Dec so bonuses/refunds stay clean.
    candidate_months = []
    for m in (2, 4, 5, 6, 7, 8, 9, 10):
        if date(year, m, 15) >= FIXTURE_START and date(year, m, 15) <= ANCHOR:
            candidate_months.append(m)
    if candidate_months:
        desc, cat, lo, hi = random.choice(BIG_EVENTS)
        big_month = random.choice(candidate_months)
        big_day = random.randint(8, 24)
        try:
            big_date = date(year, big_month, big_day)
        except ValueError:
            big_date = date(year, big_month, 15)
        safe_add(
            Txn(
                id=next_id("txn"),
                date=big_date,
                description=desc,
                category=cat,
                amount=Decimal(str(round(random.uniform(lo, hi), 2))),
                type="expense",
                user_id=random.choice([USER_ALICE, USER_BEN]),
                labels=[],
                metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_CHECKING},
            )
        )


# ---------- Feature showcases ----------

# Vacation cluster 2024 (label vacation-2024)
VAC_2024_START = ANCHOR - timedelta(days=380)
for offset, (desc, cat, amt) in enumerate(
    [
        ("Flight - SFO to JFK", "Travel", 420.00),
        ("Hotel - Manhattan", "Travel", 850.00),
        ("Broadway Show", "Entertainment", 220.00),
        ("Dinner - Carbone", "Restaurants", 180.00),
        ("Uber - Times Square", "Transportation", 35.00),
    ]
):
    txns.append(
        Txn(
            id=next_id("txn"),
            date=VAC_2024_START + timedelta(days=offset),
            description=desc,
            category=cat,
            amount=Decimal(str(amt)),
            type="expense",
            user_id=USER_ALICE,
            labels=["vacation-2024"],
            metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
        )
    )

# Vacation cluster 2025 (label vacation-2025)
VAC_2025_START = ANCHOR - timedelta(days=70)
for offset, (desc, cat, amt) in enumerate(
    [
        ("Flight - SFO to MAUI", "Travel", 640.00),
        ("Hotel - Wailea", "Travel", 1120.00),
        ("Snorkel tour", "Entertainment", 95.00),
        ("Luau dinner", "Restaurants", 150.00),
        ("Car rental", "Transportation", 280.00),
    ]
):
    txns.append(
        Txn(
            id=next_id("txn"),
            date=VAC_2025_START + timedelta(days=offset),
            description=desc,
            category=cat,
            amount=Decimal(str(amt)),
            type="expense",
            user_id=USER_ALICE,
            labels=["vacation-2025"],
            metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
        )
    )

# Work-lunch labeled cluster
WORK_LUNCH_START = ANCHOR - timedelta(days=200)
for offset in range(5):
    txns.append(
        Txn(
            id=next_id("txn"),
            date=WORK_LUNCH_START + timedelta(days=offset * 7),
            description=f"Lunch with client #{offset + 1}",
            category="Restaurants",
            amount=Decimal("42.50"),
            type="expense",
            user_id=USER_BEN,
            labels=["work-lunch"],
            metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
        )
    )

# Excluded transactions (reimbursable)
for offset, desc in enumerate(
    ["Reimbursable conference dinner", "Reimbursable Uber to client site"]
):
    txns.append(
        Txn(
            id=next_id("txn"),
            date=ANCHOR - timedelta(days=30 + offset * 14),
            description=desc,
            category="Restaurants",
            amount=Decimal("85.00") if offset == 0 else Decimal("28.50"),
            type="expense",
            user_id=USER_BEN,
            labels=[],
            metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
            excluded=True,
        )
    )

# Transfer pair 1: self-transfer Alice checking -> Alice savings
TID_1 = "transfer-self-1"
d1 = ANCHOR - timedelta(days=45)
txns.append(
    Txn(
        id=next_id("txn"),
        date=d1,
        description="Transfer to Savings",
        category="Transfers",
        amount=Decimal("500.00"),
        type="expense",
        user_id=USER_ALICE,
        labels=[],
        metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_CHECKING},
        transfer_info={
            "isTransfer": True,
            "transferId": TID_1,
            "transferType": "self",
            "excludedFromCalculations": True,
            "userOverride": False,
        },
    )
)
txns.append(
    Txn(
        id=next_id("txn"),
        date=d1,
        description="Transfer from Checking",
        category="Transfers",
        amount=Decimal("500.00"),
        type="income",
        user_id=USER_ALICE,
        labels=[],
        metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_SAVINGS},
        transfer_info={
            "isTransfer": True,
            "transferId": TID_1,
            "transferType": "self",
            "excludedFromCalculations": True,
            "userOverride": False,
        },
    )
)

# Transfer pair 2: user-to-user Ben -> Alice
TID_2 = "transfer-user-1"
d2 = ANCHOR - timedelta(days=90)
txns.append(
    Txn(
        id=next_id("txn"),
        date=d2,
        description="Venmo to Alice (rent share)",
        category="Transfers",
        amount=Decimal("1000.00"),
        type="expense",
        user_id=USER_BEN,
        labels=[],
        metadata={"sourceId": SRC_CAPONE, "accountId": ACCT_BEN_CHECKING},
        transfer_info={
            "isTransfer": True,
            "transferId": TID_2,
            "transferType": "user",
            "excludedFromCalculations": True,
            "userOverride": False,
        },
    )
)
txns.append(
    Txn(
        id=next_id("txn"),
        date=d2,
        description="Venmo from Ben (rent share)",
        category="Transfers",
        amount=Decimal("1000.00"),
        type="income",
        user_id=USER_ALICE,
        labels=[],
        metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_CHECKING},
        transfer_info={
            "isTransfer": True,
            "transferId": TID_2,
            "transferType": "user",
            "excludedFromCalculations": True,
            "userOverride": False,
        },
    )
)

# Transfer pair 3: credit-card payment
TID_3 = "transfer-self-2"
d3 = ANCHOR - timedelta(days=15)
txns.append(
    Txn(
        id=next_id("txn"),
        date=d3,
        description="Credit card payment",
        category="Transfers",
        amount=Decimal("1850.00"),
        type="expense",
        user_id=USER_ALICE,
        labels=[],
        metadata={"sourceId": SRC_CHASE, "accountId": ACCT_ALICE_CHECKING},
        transfer_info={
            "isTransfer": True,
            "transferId": TID_3,
            "transferType": "self",
            "excludedFromCalculations": True,
            "userOverride": False,
        },
    )
)
txns.append(
    Txn(
        id=next_id("txn"),
        date=d3,
        description="Payment received - thank you",
        category="Transfers",
        amount=Decimal("1850.00"),
        type="income",
        user_id=USER_ALICE,
        labels=[],
        metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
        transfer_info={
            "isTransfer": True,
            "transferId": TID_3,
            "transferType": "self",
            "excludedFromCalculations": True,
            "userOverride": False,
        },
    )
)

# Force latest transaction to land on ANCHOR
txns.append(
    Txn(
        id=next_id("txn"),
        date=ANCHOR,
        description="Coffee",
        category="Restaurants",
        amount=Decimal("5.75"),
        type="expense",
        user_id=USER_ALICE,
        labels=[],
        metadata={"sourceId": SRC_AMEX, "accountId": ACCT_JOINT_CARD},
    )
)


# ---------- Account balance snapshots (monthly) ----------

balances: list[dict] = []


def add_balances(account_id: str, start_balance: float, monthly_drift: float):
    bal = start_balance
    for first in iter_months(FIXTURE_START, ANCHOR):
        bal += round(random.uniform(-monthly_drift, monthly_drift), 2)
        balances.append(
            {
                "id": next_id("bal"),
                "account_id": account_id,
                "balance": round(bal, 2),
                "date": first.isoformat(),
                "note": None,
            }
        )
    # Final snapshot on ANCHOR
    balances.append(
        {
            "id": next_id("bal"),
            "account_id": account_id,
            "balance": round(bal, 2),
            "date": ANCHOR.isoformat(),
            "note": None,
        }
    )


add_balances(ACCT_ALICE_CHECKING, 8500.00, 800)
add_balances(ACCT_ALICE_SAVINGS, 22000.00, 400)
add_balances(ACCT_BEN_CHECKING, 5200.00, 600)
add_balances(ACCT_JOINT_CARD, -1800.00, 500)
add_balances(ACCT_401K, 48000.00, 1200)


# ---------- Dashboards ----------

DASH_OVERVIEW = "dash-overview"
DASH_INCOME = "dash-income"

dashboards = [
    {
        "id": DASH_OVERVIEW,
        "name": "Spending Overview",
        "is_default": True,
        "date_range_start": (ANCHOR - timedelta(days=180)).isoformat(),
        "date_range_end": ANCHOR.isoformat(),
    },
    {
        "id": DASH_INCOME,
        "name": "Income vs Expenses",
        "is_default": False,
        "date_range_start": (ANCHOR - timedelta(days=365)).isoformat(),
        "date_range_end": ANCHOR.isoformat(),
    },
]

dashboard_panels = [
    {
        "id": "panel-1",
        "dashboard_id": DASH_OVERVIEW,
        "title": "Spending by Category",
        "chart_type": "bar",
        "filter_type": "both",
        "filter_categories": [],
        "filter_regex": None,
        "filter_groups": [],
        "series_mode": "two_series",
        "net_orientation": None,
        "legend_options": None,
        "panel_order": 0,
    },
    {
        "id": "panel-2",
        "dashboard_id": DASH_OVERVIEW,
        "title": "Monthly Trend",
        "chart_type": "line",
        "filter_type": "both",
        "filter_categories": [],
        "filter_regex": None,
        "filter_groups": [],
        "series_mode": "two_series",
        "net_orientation": None,
        "legend_options": None,
        "panel_order": 1,
    },
    {
        "id": "panel-3",
        "dashboard_id": DASH_OVERVIEW,
        "title": "Restaurants",
        "chart_type": "line",
        "filter_type": "expense",
        "filter_categories": ["Restaurants"],
        "filter_regex": None,
        "filter_groups": [],
        "series_mode": "net_amount",
        "net_orientation": "expense_positive",
        "legend_options": None,
        "panel_order": 2,
    },
    {
        "id": "panel-4",
        "dashboard_id": DASH_OVERVIEW,
        "title": "Subscriptions",
        "chart_type": "bar",
        "filter_type": "expense",
        "filter_categories": ["Subscriptions"],
        "filter_regex": None,
        "filter_groups": [],
        "series_mode": "net_amount",
        "net_orientation": "expense_positive",
        "legend_options": None,
        "panel_order": 3,
    },
    {
        "id": "panel-5",
        "dashboard_id": DASH_INCOME,
        "title": "Income vs Expenses Monthly",
        "chart_type": "bar",
        "filter_type": "both",
        "filter_categories": [],
        "filter_regex": None,
        "filter_groups": [],
        "series_mode": "two_series",
        "net_orientation": None,
        "legend_options": None,
        "panel_order": 0,
    },
    {
        "id": "panel-6",
        "dashboard_id": DASH_INCOME,
        "title": "Net Amount Over Time",
        "chart_type": "line",
        "filter_type": "both",
        "filter_categories": [],
        "filter_regex": None,
        "filter_groups": [],
        "series_mode": "net_amount",
        "net_orientation": "expense_positive",
        "legend_options": None,
        "panel_order": 1,
    },
]


# ---------- Reports ----------

reports = [
    {
        "id": "rpt-12mo-by-cat",
        "name": "Last 12 months by category",
        "description": "Spending grouped by category for the trailing year.",
        "filters": {
            "dateRange": {
                "start": (ANCHOR - timedelta(days=365)).isoformat(),
                "end": ANCHOR.isoformat(),
            },
            "types": ["expense"],
        },
    },
]


# ---------- Saved date ranges ----------

date_ranges = [
    {
        "start_date": (ANCHOR - timedelta(days=30)).isoformat(),
        "end_date": ANCHOR.isoformat(),
    },
    {
        "start_date": date(ANCHOR.year, 1, 1).isoformat(),
        "end_date": ANCHOR.isoformat(),
    },
]


# ---------- Emit ----------


def main():
    categories = [{"name": c} for c in CATEGORIES]
    fixture = {
        "households": HOUSEHOLDS,
        "invitations": INVITATIONS,
        "users": USERS,
        "categories": categories,
        "sources": SOURCES,
        "metadata": [],
        "date_ranges": date_ranges,
        "reports": reports,
        "transactions": [t.to_dict() for t in txns],
        "accounts": ACCOUNTS,
        "account_balances": balances,
        "dashboards": dashboards,
        "dashboard_panels": dashboard_panels,
    }
    OUTPUT_PATH.write_text(json.dumps(fixture, indent=2, sort_keys=False))
    print(f"Wrote {OUTPUT_PATH} ({len(txns)} transactions)")


if __name__ == "__main__":
    main()
