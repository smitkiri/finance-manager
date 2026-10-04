from app.utils.csv_parser import (
    parse_csv,
    parse_csv_line,
    parse_csv_with_mapping,
)


class TestParseCsvLine:
    def test_simple_line(self):
        assert parse_csv_line("a,b,c") == ["a", "b", "c"]

    def test_quoted_field(self):
        assert parse_csv_line('"hello, world",b,c') == [
            "hello, world",
            "b",
            "c",
        ]

    def test_empty_fields(self):
        assert parse_csv_line("a,,c") == ["a", "", "c"]

    def test_whitespace_trimmed(self):
        assert parse_csv_line(" a , b , c ") == ["a", "b", "c"]

    def test_quoted_with_quotes_inside(self):
        assert parse_csv_line('"say ""hi""",b') == ['say "hi"', "b"]


class TestParseCsv:
    def test_basic_csv(self):
        csv_text = (
            "Date,Description,Category,Amount\n"
            "2024-01-15,Coffee Shop,Food,-4.50\n"
            "2024-01-16,Salary,Income,3000.00\n"
        )
        result = parse_csv(csv_text)
        assert len(result) == 2
        assert result[0]["description"] == "Coffee Shop"
        assert result[0]["amount"] == 4.50
        assert result[0]["type"] == "expense"
        assert result[1]["type"] == "income"
        assert result[1]["amount"] == 3000.00

    def test_skips_payment_type(self):
        csv_text = (
            "Date,Description,Category,Amount,Type\n"
            "2024-01-15,Coffee,Food,-4.50,\n"
            "2024-01-16,CC Payment,Payment,500.00,Payment\n"
        )
        result = parse_csv(csv_text)
        assert len(result) == 1

    def test_generates_unique_ids(self):
        csv_text = (
            "Date,Description,Category,Amount\n"
            "2024-01-15,Coffee,Food,-4.50\n"
            "2024-01-16,Tea,Food,-3.00\n"
        )
        result = parse_csv(csv_text)
        assert result[0]["id"] != result[1]["id"]

    def test_metadata_populated(self):
        csv_text = "Date,Description,Category,Amount\n2024-01-15,Coffee,Food,-4.50\n"
        result = parse_csv(csv_text, file_name="test.csv")
        assert result[0]["metadata"]["sourceName"] == "test.csv"
        assert "importedAt" in result[0]["metadata"]

    def test_negative_amount_is_expense(self):
        csv_text = "Date,Description,Category,Amount\n2024-01-15,Coffee,Food,-4.50\n"
        result = parse_csv(csv_text)
        assert result[0]["type"] == "expense"
        assert result[0]["amount"] == 4.50  # absolute value

    def test_positive_amount_is_income(self):
        csv_text = (
            "Date,Description,Category,Amount\n2024-01-15,Refund,Shopping,25.00\n"
        )
        result = parse_csv(csv_text)
        assert result[0]["type"] == "income"


class TestParseCsvWithMapping:
    def test_basic_mapping(self):
        csv_text = "Trans Date,Desc,Cat,Amt\n2024-01-15,Coffee Shop,Food,4.50\n"
        mapping = {
            "id": "src1",
            "name": "Test Bank",
            "flipIncomeExpense": False,
            "mappings": [
                {"csvColumn": "Trans Date", "standardColumn": "Transaction Date"},
                {"csvColumn": "Desc", "standardColumn": "Description"},
                {"csvColumn": "Cat", "standardColumn": "Category"},
                {"csvColumn": "Amt", "standardColumn": "Amount"},
            ],
        }
        result = parse_csv_with_mapping(csv_text, mapping, "user1")
        assert len(result["expenses"]) == 1
        assert result["expenses"][0]["description"] == "Coffee Shop"
        assert result["expenses"][0]["amount"] == 4.50

    def test_flip_income_expense(self):
        csv_text = "Date,Description,Category,Amount\n2024-01-15,Coffee,Food,-4.50\n"
        mapping = {
            "id": "src1",
            "name": "Test Bank",
            "flipIncomeExpense": True,
            "mappings": [
                {"csvColumn": "Date", "standardColumn": "Transaction Date"},
                {"csvColumn": "Description", "standardColumn": "Description"},
                {"csvColumn": "Category", "standardColumn": "Category"},
                {"csvColumn": "Amount", "standardColumn": "Amount"},
            ],
        }
        result = parse_csv_with_mapping(csv_text, mapping, "user1")
        # Normally negative = expense, but flipped = income
        assert result["expenses"][0]["type"] == "income"

    def test_ignore_column(self):
        csv_text = "Date,Extra,Description,Amount\n2024-01-15,junk,Coffee,-4.50\n"
        mapping = {
            "id": "src1",
            "name": "Test",
            "flipIncomeExpense": False,
            "mappings": [
                {"csvColumn": "Date", "standardColumn": "Transaction Date"},
                {"csvColumn": "Extra", "standardColumn": "Ignore"},
                {"csvColumn": "Description", "standardColumn": "Description"},
                {"csvColumn": "Amount", "standardColumn": "Amount"},
            ],
        }
        result = parse_csv_with_mapping(csv_text, mapping, "user1")
        assert result["expenses"][0]["description"] == "Coffee"

    def test_auto_fills_categories(self):
        csv_text = "Date,Description,Amount\n2024-01-15,Starbucks Coffee,-5.00\n"
        mapping = {
            "id": "src1",
            "name": "Test",
            "flipIncomeExpense": False,
            "mappings": [
                {"csvColumn": "Date", "standardColumn": "Transaction Date"},
                {"csvColumn": "Description", "standardColumn": "Description"},
                {"csvColumn": "Amount", "standardColumn": "Amount"},
            ],
        }
        existing = [
            {
                "description": "Starbucks Coffee Shop",
                "category": "Food & Drink",
                "date": "2024-01-01",
            },
        ]
        result = parse_csv_with_mapping(csv_text, mapping, "user1", existing)
        assert result["expenses"][0]["category"] == "Food & Drink"
        assert len(result["autoFilledCategories"]) == 1
        assert result["autoFilledCategories"][0]["suggestedCategory"] == "Food & Drink"

    def test_skips_rows_without_required_fields(self):
        csv_text = (
            "Date,Description,Amount\n"
            ",Coffee,-5.00\n"
            "2024-01-15,,-5.00\n"
            "2024-01-15,Coffee,0\n"
            "2024-01-15,Coffee,-5.00\n"
        )
        mapping = {
            "id": "src1",
            "name": "Test",
            "flipIncomeExpense": False,
            "mappings": [
                {"csvColumn": "Date", "standardColumn": "Transaction Date"},
                {"csvColumn": "Description", "standardColumn": "Description"},
                {"csvColumn": "Amount", "standardColumn": "Amount"},
            ],
        }
        result = parse_csv_with_mapping(csv_text, mapping, "user1")
        assert len(result["expenses"]) == 1
