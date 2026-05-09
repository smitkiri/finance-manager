"""Shared date parsing for CSV import and transfer detection.

Bank CSVs use a variety of date formats; existing transactions arrive
as `date` objects from the ORM. This helper normalizes both into a
`date` regardless of source.
"""

from datetime import date, datetime

_DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y", "%Y/%m/%d")


def parse_date(d: date | str) -> date:
    """Parse a date or date string into a date object.

    Accepts a date object, ISO 8601 (YYYY-MM-DD), or common US bank CSV
    formats (MM/DD/YYYY, MM-DD-YYYY, YYYY/MM/DD). Raises ValueError if
    the input string doesn't match any recognized format.
    """
    if isinstance(d, date):
        return d
    s = str(d).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {s!r}")
