import importlib.util
import math
import pathlib
import unittest
from unittest.mock import Mock, patch

from bs4 import BeautifulSoup


SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "build_index.py"
SPEC = importlib.util.spec_from_file_location("build_index", SCRIPT)
build_index = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_index)


class BuildIndexTests(unittest.TestCase):
    def test_get_post_entries_reads_lastmod_and_filters_non_posts(self):
        response = Mock()
        response.text = """<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://semicon-circuit.tistory.com/122</loc><lastmod>2026-08-22T23:06:09+09:00</lastmod></url>
          <url><loc>https://semicon-circuit.tistory.com/m/121</loc><lastmod>2026-08-21T00:00:00+09:00</lastmod></url>
          <url><loc>https://semicon-circuit.tistory.com/category/Test</loc></url>
          <url><loc>https://example.com/999</loc></url>
        </urlset>"""
        response.raise_for_status.return_value = None

        with patch.object(build_index.requests, "get", return_value=response):
            entries = build_index.get_post_entries("https://semicon-circuit.tistory.com")

        self.assertEqual(entries, [{
            "id": 122,
            "url": "https://semicon-circuit.tistory.com/122",
            "lastmod": "2026-08-22T23:06:09+09:00",
        }])

    def test_cached_post_is_stale_compares_lastmod(self):
        cached = {"_lastmod": "2026-08-20T10:00:00+09:00"}
        self.assertFalse(build_index.cached_post_is_stale(
            cached, "2026-08-20T10:00:00+09:00"
        ))
        self.assertTrue(build_index.cached_post_is_stale(
            cached, "2026-08-21T10:00:00+09:00"
        ))

    def test_legacy_cache_only_refreshes_changes_after_index_generation(self):
        generated = "2026-08-20T16:31:33+00:00"
        self.assertFalse(build_index.cached_post_is_stale(
            {"title": "기존 글"}, "2026-08-20T20:00:00+09:00", generated
        ))
        self.assertTrue(build_index.cached_post_is_stale(
            {"title": "수정 글"}, "2026-08-22T20:00:00+09:00", generated
        ))

    def test_quantized_embedding_preserves_direction(self):
        quantized = build_index.quantize_embedding([3.0, 4.0, 0.0])
        self.assertEqual(len(quantized), 3)
        self.assertEqual(quantized[2], 0)
        cosine = (quantized[0] * 3 + quantized[1] * 4) / (
            math.sqrt(sum(x * x for x in quantized)) * 5
        )
        self.assertGreater(cosine, 0.999)

    def test_extract_chunks_uses_heading_boundaries(self):
        soup = BeautifulSoup(
            """
            <article>
              <h2>설계 배경</h2>
              <p>이 문단은 Systolic Array 구조와 데이터 재사용 방식을 충분한 길이로 설명합니다.</p>
              <h2>Timing Violation 분석</h2>
              <p>이 문단은 Critical Path와 Slack 측정 결과를 바탕으로 Timing Violation을 분석합니다.</p>
            </article>
            """,
            "html.parser",
        )
        chunks = build_index.extract_chunks(soup.article, "")
        self.assertEqual([chunk["heading"] for chunk in chunks], [
            "설계 배경",
            "Timing Violation 분석",
        ])
        self.assertIn("Critical Path", chunks[1]["text"])

    def test_extract_chunks_falls_back_to_plain_text(self):
        soup = BeautifulSoup("<article><span>본문 요소가 없는 문서</span></article>", "html.parser")
        fallback = "Fallback content " * 10
        chunks = build_index.extract_chunks(soup.article, fallback, target_chars=80)
        self.assertGreaterEqual(len(chunks), 1)
        self.assertEqual(chunks[0]["heading"], "본문")


if __name__ == "__main__":
    unittest.main()
