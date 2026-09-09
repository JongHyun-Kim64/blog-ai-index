import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_catalog import parse_post

class CatalogTests(unittest.TestCase):
    def test_article_category_beats_global_menu(self):
        html = '''<meta property="og:title" content="UART TX">
        <nav><a href="/category/wrong">wrong (13)</a></nav>
        <div class="contents_style"><p>This is the actual article explanation with enough content for the excerpt.</p></div>
        <div class="current-category-name"><a href="/category/RTL/UART">RTL/UART</a></div>'''
        post = parse_post(html,96)
        self.assertEqual(post["category"],"RTL/UART")
        self.assertEqual(post["categoryPath"],"/category/RTL/UART")
        self.assertEqual(post["title"],"UART TX")
        self.assertEqual(post["url"],"https://semicon-circuit.tistory.com/96")

    def test_protected_and_unavailable_pages_are_excluded(self):
        self.assertIsNone(parse_post('<form class="protected_form"><input type="password"></form>',1))

    def test_intro_with_previous_link_is_not_discarded(self):
        intro = "이번 글에서는 Transformer의 Matrix Multiplication과 Attention 연산을 바탕으로 LLM Inference의 흐름을 설명합니다."
        html = '<div class="contents_style"><p>' + intro + '<br>이전 글: <a href="/123">이전 제목</a></p><p>' + "중간 설명입니다. " * 12 + '</p></div>'
        post = parse_post(html, 124)
        self.assertTrue(post["excerpt"].startswith(intro))
        self.assertNotIn("이전 글", post["excerpt"])

    def test_previous_article_context_is_omitted(self):
        current = "이번 글에서는 Transformer의 Matrix Multiplication과 Attention 연산을 바탕으로 LLM Inference의 흐름을 설명합니다."
        html = '<div class="contents_style"><p>이전 글에서는 HBM을 설명했습니다. ' + current + '</p></div>'
        self.assertEqual(parse_post(html, 124)["excerpt"], current)

    def test_long_excerpt_has_explicit_ellipsis(self):
        html = '<div class="contents_style"><p>' + "Matrix Multiplication 원리를 설명합니다. " * 20 + '</p></div>'
        excerpt = parse_post(html, 124)["excerpt"]
        self.assertLessEqual(len(excerpt), 161)
        self.assertTrue(excerpt.endswith("…"))

if __name__ == "__main__":
    unittest.main()
