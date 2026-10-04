"""Pure tests for transfer group allocation (no DB)."""

from datetime import date, datetime
from decimal import Decimal

from app.utils.transfer_groups import AllocRow, allocate

D = Decimal


def _row(rid: str, amount: str, d: date = date(2024, 1, 1), created=None):
    return AllocRow(id=rid, amount=D(amount), date=d, created_at=created)


def _members(n: int, amount: str = "900.00") -> list[AllocRow]:
    return [_row(f"m{i}", amount, date(2024, 1, 2 + i)) for i in range(n)]


def test_anchor_larger_keeps_remainder():
    result = allocate(_row("a", "5000.00"), _members(5))
    assert result["a"] == D("500.00")
    assert all(result[f"m{i}"] == D("0.00") for i in range(5))


def test_members_larger_remainder_goes_to_oldest_member():
    result = allocate(_row("a", "4000.00"), _members(5))
    assert result["a"] == D("0.00")
    assert result["m0"] == D("500.00")
    assert [result[f"m{i}"] for i in range(1, 5)] == [D("0.00")] * 4


def test_remainder_fills_members_in_order():
    # 1500 left over across three 900s: 900, 600, 0.
    result = allocate(_row("a", "1200.00"), _members(3))
    assert [result["m0"], result["m1"], result["m2"]] == [
        D("900.00"),
        D("600.00"),
        D("0.00"),
    ]


def test_equal_totals_fully_offset():
    result = allocate(_row("a", "100.00"), [_row("m", "100.00")])
    assert result == {"a": D("0.00"), "m": D("0.00")}


def test_date_tie_broken_by_created_at_then_id():
    d = date(2024, 1, 5)
    later = _row("aaa", "50.00", d, datetime(2024, 1, 5, 12))
    earlier = _row("zzz", "50.00", d, datetime(2024, 1, 5, 9))
    result = allocate(_row("a", "50.00"), [later, earlier])
    assert result["zzz"] == D("50.00")
    assert result["aaa"] == D("0.00")

    same_time = datetime(2024, 1, 5, 9)
    b = _row("b", "50.00", d, same_time)
    c = _row("c", "50.00", d, same_time)
    result = allocate(_row("a", "50.00"), [c, b])
    assert result["b"] == D("50.00")
    assert result["c"] == D("0.00")


def test_cents():
    members = [_row(f"m{i}", "33.37", date(2024, 1, 2 + i)) for i in range(3)]
    result = allocate(_row("a", "100.10"), members)
    assert result["a"] == D("0.00")
    assert result["m0"] == D("0.01")
    assert result["m1"] == D("0.00")


def test_member_input_order_is_irrelevant():
    members = _members(3)
    forward = allocate(_row("a", "1200.00"), members)
    backward = allocate(_row("a", "1200.00"), list(reversed(members)))
    assert forward == backward
