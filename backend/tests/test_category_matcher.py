from app.utils.category_matcher import (
    calculate_description_similarity,
    find_similar_category,
)


class TestCalculateDescriptionSimilarity:
    def test_exact_match(self):
        assert calculate_description_similarity("Amazon", "Amazon") == 1.0

    def test_case_insensitive_exact(self):
        assert calculate_description_similarity("amazon", "AMAZON") == 1.0

    def test_completely_different(self):
        score = calculate_description_similarity("Amazon Prime", "Rent Payment")
        assert score < 0.3

    def test_partial_word_overlap(self):
        score = calculate_description_similarity(
            "Amazon Prime Video", "Amazon Web Services"
        )
        assert 0.3 < score < 0.9

    def test_empty_strings(self):
        assert calculate_description_similarity("", "") == 1.0

    def test_merchant_match(self):
        """Known merchants like 'amazon', 'walmart' get a bonus."""
        score = calculate_description_similarity(
            "AMAZON.COM PURCHASE", "Amazon Prime Membership"
        )
        assert score > 0.4

    def test_substring_match(self):
        score = calculate_description_similarity("Starbucks Coffee", "Starbucks")
        assert score > 0.4


class TestFindSimilarCategory:
    def test_exact_description_match(self):
        existing = [
            {
                "description": "Amazon Prime",
                "category": "Shopping",
                "date": "2024-01-01",
            },
            {
                "description": "Netflix",
                "category": "Entertainment",
                "date": "2024-01-02",
            },
        ]
        result = find_similar_category("Amazon Prime", existing)
        assert result == "Shopping"

    def test_similar_description_match(self):
        existing = [
            {
                "description": "Starbucks Coffee #123",
                "category": "Food",
                "date": "2024-01-01",
            },
            {
                "description": "Starbucks Coffee #456",
                "category": "Food",
                "date": "2024-01-02",
            },
            {
                "description": "Rent Payment",
                "category": "Housing",
                "date": "2024-01-03",
            },
        ]
        result = find_similar_category("Starbucks Coffee #789", existing)
        assert result == "Food"

    def test_no_match_returns_none(self):
        existing = [
            {
                "description": "Amazon Prime",
                "category": "Shopping",
                "date": "2024-01-01",
            },
        ]
        result = find_similar_category("Completely Different Transaction", existing)
        assert result is None

    def test_empty_existing(self):
        result = find_similar_category("Amazon", [])
        assert result is None

    def test_null_categories_skipped(self):
        existing = [
            {"description": "Amazon", "category": None, "date": "2024-01-01"},
            {
                "description": "Amazon Prime",
                "category": "Shopping",
                "date": "2024-01-02",
            },
        ]
        result = find_similar_category("Amazon Marketplace", existing)
        assert result == "Shopping"

    def test_max_results_limits_candidates(self):
        """Only considers the most recent 100 transactions."""
        existing = [
            {
                "description": f"Transaction {i}",
                "category": f"Cat{i}",
                "date": f"2024-01-{i + 1:02d}",
            }
            for i in range(150)
        ]
        # Should not error even with >100 transactions
        result = find_similar_category("Transaction 1", existing)
        assert result is not None

    def test_best_category_by_weighted_score(self):
        """When multiple categories match, picks highest weighted score."""
        existing = [
            {
                "description": "Amazon Purchase",
                "category": "Shopping",
                "date": "2024-01-01",
            },
            {
                "description": "Amazon Purchase",
                "category": "Shopping",
                "date": "2024-01-02",
            },
            {
                "description": "Amazon Video",
                "category": "Entertainment",
                "date": "2024-01-03",
            },
        ]
        result = find_similar_category("Amazon Purchase Order", existing)
        assert result == "Shopping"
