"""
Category matching via description similarity.

Ports legacy/helpers/categoryMatcher.js — Jaccard similarity + substring
matching + merchant recognition for auto-categorizing imported transactions.
"""

KNOWN_MERCHANTS = [
    "amazon",
    "walmart",
    "target",
    "costco",
    "starbucks",
    "mcdonalds",
    "uber",
    "lyft",
    "netflix",
    "spotify",
    "apple",
    "google",
    "venmo",
    "paypal",
    "chase",
    "wells fargo",
    "bank of america",
]


def calculate_description_similarity(desc1: str, desc2: str) -> float:
    """Calculate similarity between two transaction descriptions.

    Scoring components (weighted):
    - Jaccard word similarity: 40%
    - Substring/prefix matching: 30%
    - Known merchant matching: 30%

    Returns float 0.0–1.0.
    """
    d1 = desc1.strip().lower()
    d2 = desc2.strip().lower()

    if d1 == d2:
        return 1.0

    # Jaccard similarity on words > 2 chars
    words1 = {w for w in d1.split() if len(w) > 2}
    words2 = {w for w in d2.split() if len(w) > 2}

    if not words1 and not words2:
        return 1.0

    if not words1 or not words2:
        jaccard = 0.0
    else:
        intersection = words1 & words2
        union = words1 | words2
        jaccard = len(intersection) / len(union)

    # Substring scoring — word prefix/suffix matches
    substring_score = 0.0
    if words1 and words2:
        matches = 0
        total = len(words1)
        for w1 in words1:
            for w2 in words2:
                if w1.startswith(w2) or w2.startswith(w1):
                    matches += 1
                    break
                if w1.endswith(w2) or w2.endswith(w1):
                    matches += 0.5
                    break
        substring_score = matches / total if total > 0 else 0.0

    # Merchant matching
    merchant_score = 0.0
    for merchant in KNOWN_MERCHANTS:
        if merchant in d1 and merchant in d2:
            merchant_score = 1.0
            break

    final = jaccard * 0.4 + substring_score * 0.3 + merchant_score * 0.3
    return min(final, 1.0)


def find_similar_category(
    description: str,
    existing_transactions: list[dict],
    max_results: int = 100,
) -> str | None:
    """Find the best matching category for a description based on existing transactions.

    Filters to top max_results recent transactions with non-null categories,
    calculates similarity, groups by category, and returns the best match
    if the weighted score exceeds 0.4.
    """
    candidates = [t for t in existing_transactions if t.get("category") is not None][
        :max_results
    ]

    if not candidates:
        return None

    # Calculate similarity for each candidate
    matches = []
    for t in candidates:
        similarity = calculate_description_similarity(description, t["description"])
        if similarity > 0.3:
            matches.append({"category": t["category"], "similarity": similarity})

    if not matches:
        return None

    # Group by category, score by (avg_similarity * 0.7 + max_similarity * 0.3)
    category_scores: dict[str, list[float]] = {}
    for m in matches:
        category_scores.setdefault(m["category"], []).append(m["similarity"])

    best_category = None
    best_score = 0.0
    for category, scores in category_scores.items():
        avg_sim = sum(scores) / len(scores)
        max_sim = max(scores)
        weighted = avg_sim * 0.7 + max_sim * 0.3
        if weighted > best_score:
            best_score = weighted
            best_category = category

    if best_score > 0.4:
        return best_category
    return None
