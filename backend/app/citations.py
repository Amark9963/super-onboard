"""Deterministic citation checks against stored source blocks.

A citation is *verifiable* when the claimed block belongs to the extracted source version and the
quote can be located in that block's captured text. This never fuzzy-matches and never invents a
page, cell or timecode: anchors always come from the block's own parsed locator. A verified quote
does not prove the rule is current, correct, or customer-approved.
"""

import re
import unicodedata
from dataclasses import dataclass

MIN_QUOTE_CHARS = 8
_PUNCTUATION = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-"})


@dataclass(frozen=True)
class Verdict:
    state: str  # exact | normalized | invalid
    notes: str | None = None
    start: int | None = None
    end: int | None = None
    verified_text: str | None = None

    @property
    def valid(self) -> bool:
        return self.state in {"exact", "normalized"}


def _normalize_with_map(text: str) -> tuple[str, list[int]]:
    """Casefold, unify quotes/dashes and collapse whitespace, mapping each output char to input."""
    out, index_map = [], []
    previous_space = True  # drops leading whitespace
    for position, char in enumerate(text):
        for piece in unicodedata.normalize("NFKC", char).translate(_PUNCTUATION).casefold():
            if piece.isspace():
                if previous_space:
                    continue
                piece = " "
            previous_space = piece == " "
            out.append(piece)
            index_map.append(position)
    while out and out[-1] == " ":
        out.pop()
        index_map.pop()
    return "".join(out), index_map


def verify_quote(block_text: str, quote: str) -> Verdict:
    quote_stripped = quote.strip()
    if (
        len(re.sub(r"\s", "", quote_stripped)) < MIN_QUOTE_CHARS
        and quote_stripped != block_text.strip()
    ):
        return Verdict("invalid", "quote_too_short_to_verify")
    position = block_text.find(quote_stripped)
    if position >= 0:
        end = position + len(quote_stripped)
        return Verdict("exact", None, position, end, block_text[position:end])
    haystack, index_map = _normalize_with_map(block_text)
    needle, _ = _normalize_with_map(quote_stripped)
    if needle:
        found = haystack.find(needle)
        if found >= 0:
            start = index_map[found]
            end = index_map[found + len(needle) - 1] + 1
            return Verdict(
                "normalized",
                "Matched after ignoring case, whitespace and typographic punctuation",
                start,
                end,
                block_text[start:end],
            )
    return Verdict("invalid", "quote_not_found_in_block")


@dataclass(frozen=True)
class CitationResult:
    block_id: str
    claimed_quote: str
    verdict: Verdict


def check_citations(citations, blocks_by_id: dict[str, str]) -> list[CitationResult]:
    """`blocks_by_id` must contain only blocks of the extracted source version in this project."""
    results = []
    for citation in citations:
        text = blocks_by_id.get(citation.block_id)
        if text is None:
            verdict = Verdict("invalid", "block_not_in_extracted_source_version")
        else:
            verdict = verify_quote(text, citation.quoted_text)
        results.append(CitationResult(citation.block_id, citation.quoted_text, verdict))
    return results


def evidence_status(results: list[CitationResult]) -> str:
    """verified: every citation checks out. flagged: some fail. unverifiable: none check out."""
    valid = sum(r.verdict.valid for r in results)
    if results and valid == len(results):
        return "verified"
    return "flagged" if valid else "unverifiable"
