from app.utils.transfer_detection import (
    calculate_transfer_confidence,
    detect_transfers,
    is_transfer_pair,
)


def _make_txn(id, date, description, amount, type, user, source_id="manual"):
    return {
        "id": id,
        "date": date,
        "description": description,
        "amount": abs(amount),
        "type": type,
        "user": user,
        "metadata": {"sourceId": source_id} if source_id != "manual" else {},
        "labels": [],
        "transferInfo": None,
        "excludedFromCalculations": False,
    }


class TestIsTransferPair:
    def test_valid_cross_source_pair(self):
        t1 = _make_txn("a", "2024-01-15", "Transfer", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-15", "Transfer", 100, "income", "alice", "src2")
        assert is_transfer_pair(t1, t2) is True

    def test_same_source_same_user_rejected(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-15", "Y", 100, "income", "alice", "src1")
        assert is_transfer_pair(t1, t2) is False

    def test_same_type_rejected(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-15", "Y", 100, "expense", "bob", "src2")
        assert is_transfer_pair(t1, t2) is False

    def test_different_amounts_rejected(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-15", "Y", 200, "income", "alice", "src2")
        assert is_transfer_pair(t1, t2) is False

    def test_dates_too_far_apart_rejected(self):
        t1 = _make_txn("a", "2024-01-10", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-20", "Y", 100, "income", "alice", "src2")
        assert is_transfer_pair(t1, t2) is False

    def test_cross_user_same_source_valid(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-15", "Y", 100, "income", "bob", "src1")
        assert is_transfer_pair(t1, t2) is True

    def test_four_day_boundary_accepted(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-19", "Y", 100, "income", "alice", "src2")
        assert is_transfer_pair(t1, t2) is True

    def test_five_day_gap_rejected(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-20", "Y", 100, "income", "alice", "src2")
        assert is_transfer_pair(t1, t2) is False


class TestCalculateTransferConfidence:
    def test_same_day_exact_amount(self):
        t1 = _make_txn(
            "a", "2024-01-15", "Transfer out", 100, "expense", "alice", "src1"
        )
        t2 = _make_txn("b", "2024-01-15", "Transfer in", 100, "income", "alice", "src2")
        conf = calculate_transfer_confidence(t1, t2)
        # 0.5 base + 0.4 amount + 0.2 same day + 0.1 "transfer" keyword = 1.0 (capped)
        assert conf == 1.0

    def test_different_amounts_returns_zero(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-15", "Y", 200, "income", "alice", "src2")
        assert calculate_transfer_confidence(t1, t2) == 0

    def test_one_day_apart_no_keywords(self):
        t1 = _make_txn("a", "2024-01-15", "Payment", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-16", "Deposit", 100, "income", "alice", "src2")
        conf = calculate_transfer_confidence(t1, t2)
        # 0.5 + 0.4 + 0.15 = 1.05 → capped at 1.0
        assert conf == 1.0

    def test_three_days_apart(self):
        t1 = _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-18", "Y", 100, "income", "alice", "src2")
        conf = calculate_transfer_confidence(t1, t2)
        # 0.5 + 0.4 + 0.05 = 0.95
        assert round(conf, 2) == 0.95

    def test_move_keyword_adds_confidence(self):
        t1 = _make_txn("a", "2024-01-15", "Move funds", 100, "expense", "alice", "src1")
        t2 = _make_txn("b", "2024-01-18", "Deposit", 100, "income", "alice", "src2")
        conf = calculate_transfer_confidence(t1, t2)
        # 0.5 + 0.4 + 0.05 + 0.05 = 1.0
        assert conf == 1.0


class TestDetectTransfers:
    def test_cross_source_transfer_detected(self):
        txns = [
            _make_txn(
                "a", "2024-01-15", "Transfer out", 100, "expense", "alice", "src1"
            ),
            _make_txn("b", "2024-01-15", "Transfer in", 100, "income", "alice", "src2"),
            _make_txn("c", "2024-01-20", "Groceries", 50, "expense", "alice", "src1"),
        ]
        result = detect_transfers(txns)
        assert len(result["transfers"]) == 1
        transfer = result["transfers"][0]
        assert transfer["debit"]["id"] == "a"
        assert transfer["credit"]["id"] == "b"

    def test_cross_user_transfer_detected(self):
        txns = [
            _make_txn("a", "2024-01-15", "Send money", 100, "expense", "alice", "src1"),
            _make_txn("b", "2024-01-15", "Received", 100, "income", "bob", "src1"),
        ]
        result = detect_transfers(txns)
        assert len(result["transfers"]) == 1

    def test_updated_transactions_have_transfer_info(self):
        txns = [
            _make_txn("a", "2024-01-15", "Transfer", 100, "expense", "alice", "src1"),
            _make_txn("b", "2024-01-15", "Transfer", 100, "income", "alice", "src2"),
        ]
        result = detect_transfers(txns)
        updated = {t["id"]: t for t in result["updatedTransactions"]}
        assert updated["a"]["transferInfo"]["isTransfer"] is True
        assert updated["b"]["transferInfo"]["isTransfer"] is True
        assert updated["a"]["transferInfo"]["transferType"] == "self"

    def test_no_double_matching(self):
        txns = [
            _make_txn("a", "2024-01-15", "X", 100, "expense", "alice", "src1"),
            _make_txn("b", "2024-01-15", "Y", 100, "income", "alice", "src2"),
            _make_txn("c", "2024-01-15", "Z", 100, "income", "alice", "src3"),
        ]
        result = detect_transfers(txns)
        # Only one pair should match — once "a" is matched, it can't match again
        assert len(result["transfers"]) == 1

    def test_empty_transactions(self):
        result = detect_transfers([])
        assert len(result["transfers"]) == 0
        assert len(result["updatedTransactions"]) == 0
