import importlib.util
import math
import pathlib
import unittest

from bs4 import BeautifulSoup


SCRIPT = pathlib.Path(__file__).parents[1] / "scripts" / "build_index.py"
SPEC = importlib.util.spec_from_file_location("build_index", SCRIPT)
build_index = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build_index)


class BuildIndexTests(unittest.TestCase):
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
