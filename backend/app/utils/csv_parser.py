"""
CSV parsing and merging utilities.

Ports legacy/helpers/csvParser.js — handles CSV text parsing, column
mapping with auto-categorization, and expense merge/deduplication.
"""

import secrets
import time
from datetime import datetime

from app.utils.category_matcher import find_similar_category


def parse_csv_line(line: str) -> list[str]:
    """Parse a single CSV line handling quoted fields and embedded commas."""
    fields: list[str] = []
    current = ""
    in_quotes = False
    i = 0
    chars = line

    while i < len(chars):
        ch = chars[i]
        if ch == '"':
            if in_quotes and i + 1 < len(chars) and chars[i + 1] == '"':
                current += '"'
                i += 2
                continue
            in_quotes = not in_quotes
        elif ch == "," and not in_quotes:
            fields.append(current.strip())
            current = ""
        else:
            current += ch
        i += 1

    fields.append(current.strip())
    return fields


def _generate_id() -> str:
    return f"{int(time.time() * 1000)}_{secrets.token_hex(8)}"


def parse_csv(
    csv_text: str,
    file_name: str | None = None,
    user_id: str | None = None,
) -> list[dict]:
    """Parse CSV text into transaction dicts (no column mapping).

    Assumes standard columns: Date, Description, Category, Amount.
    Skips header row and 'Payment' type rows.
    Amounts are stored as absolute values; sign determines type.
    """
    lines = [line.strip() for line in csv_text.strip().split("\n") if line.strip()]
    if len(lines) < 2:
        return []

    # Skip header
    rows = [parse_csv_line(line) for line in lines[1:]]
    now_iso = datetime.now().isoformat()
    transactions: list[dict] = []

    for fields in rows:
        if len(fields) < 4:
            continue

        # Check for Payment type (5th column if present)
        if len(fields) >= 5 and fields[4].strip().lower() == "payment":
            continue

        date_str = fields[0].strip()
        description = fields[1].strip()
        category = fields[2].strip() or "Uncategorized"
        try:
            raw_amount = float(fields[3].strip().replace(",", ""))
        except ValueError, IndexError:
            continue

        amount = abs(raw_amount)
        txn_type = "income" if raw_amount >= 0 else "expense"

        if amount == 0:
            continue

        transactions.append(
            {
                "id": _generate_id(),
                "date": date_str,
                "description": description,
                "category": category,
                "amount": amount,
                "type": txn_type,
                "user": user_id,
                "labels": [],
                "metadata": {
                    "sourceName": file_name or "CSV Import",
                    "importedAt": now_iso,
                },
                "transferInfo": None,
                "excludedFromCalculations": False,
            }
        )

    return transactions


def merge_expenses(existing: list[dict], new_expenses: list[dict]) -> dict:
    """Merge new expenses with existing, deduplicating by date+description+amount+type.

    Returns dict with:
    - merged: all unique transactions sorted by date descending
    - added: only the new ones that weren't duplicates
    """
    seen: set[tuple] = set()
    merged: list[dict] = []

    # Add existing first
    for e in existing:
        key = (
            str(e["date"]),
            e["description"],
            float(e["amount"]),
            e["type"],
        )
        seen.add(key)
        merged.append(e)

    # Add new if not duplicate
    added: list[dict] = []
    for e in new_expenses:
        key = (
            str(e["date"]),
            e["description"],
            float(e["amount"]),
            e["type"],
        )
        if key not in seen:
            seen.add(key)
            merged.append(e)
            added.append(e)

    # Sort by date descending
    merged.sort(key=lambda x: str(x["date"]), reverse=True)

    return {"merged": merged, "added": added}


def parse_csv_with_mapping(
    csv_text: str,
    mapping: dict,
    user_id: str,
    existing_transactions: list[dict] | None = None,
) -> dict:
    """Parse CSV using a column mapping configuration.

    Args:
        csv_text: Raw CSV content
        mapping: Dict with keys: id, name, flipIncomeExpense, mappings (list of
                 {csvColumn, standardColumn} where standardColumn is one of
                 'Transaction Date', 'Description', 'Category', 'Amount', 'Ignore')
        user_id: User ID to assign to transactions
        existing_transactions: Existing transactions for auto-category matching

    Returns dict with:
    - expenses: list of transaction dicts
    - autoFilledCategories: list of {row, description, suggestedCategory}
    """
    lines = [line.strip() for line in csv_text.strip().split("\n") if line.strip()]
    if len(lines) < 2:
        return {"expenses": [], "autoFilledCategories": []}

    header = parse_csv_line(lines[0])
    rows = [parse_csv_line(line) for line in lines[1:]]

    # Build column index map from mapping
    column_map: dict[str, int] = {}
    for m in mapping.get("mappings", []):
        csv_col = m["csvColumn"]
        std_col = m["standardColumn"]
        if std_col == "Ignore":
            continue
        if csv_col in header:
            column_map[std_col] = header.index(csv_col)

    flip = mapping.get("flipIncomeExpense", False)
    source_name = mapping.get("name", "CSV Import")
    source_id = mapping.get("id")
    now_iso = datetime.now().isoformat()

    expenses: list[dict] = []
    auto_filled: list[dict] = []

    for row_idx, fields in enumerate(rows):
        # Extract values via mapping
        date_str = _get_field(fields, column_map, "Transaction Date")
        description = _get_field(fields, column_map, "Description")
        category = _get_field(fields, column_map, "Category")
        amount_str = _get_field(fields, column_map, "Amount")

        # Skip rows missing required fields
        if not date_str or not description:
            continue

        try:
            raw_amount = float(amount_str.replace(",", "")) if amount_str else 0
        except ValueError:
            continue

        amount = abs(raw_amount)
        if amount == 0:
            continue

        # Determine type (negative = expense by default)
        txn_type = "expense" if raw_amount < 0 else "income"
        if flip:
            txn_type = "income" if txn_type == "expense" else "expense"

        # Auto-fill category if missing
        if not category and existing_transactions:
            suggested = find_similar_category(description, existing_transactions)
            if suggested:
                category = suggested
                auto_filled.append(
                    {
                        "row": row_idx + 1,
                        "description": description,
                        "suggestedCategory": suggested,
                    }
                )

        expenses.append(
            {
                "id": _generate_id(),
                "date": date_str,
                "description": description,
                "category": category or "Uncategorized",
                "amount": amount,
                "type": txn_type,
                "user": user_id,
                "labels": [],
                "metadata": {
                    "sourceName": source_name,
                    "sourceId": source_id,
                    "importedAt": now_iso,
                },
                "transferInfo": None,
                "excludedFromCalculations": False,
            }
        )

    return {"expenses": expenses, "autoFilledCategories": auto_filled}


def _get_field(
    fields: list[str], column_map: dict[str, int], standard_column: str
) -> str:
    """Get a field value from a CSV row using the column mapping."""
    idx = column_map.get(standard_column)
    if idx is not None and idx < len(fields):
        return fields[idx].strip()
    return ""
