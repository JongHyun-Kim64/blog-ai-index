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

if __name__ == "__main__":
    unittest.main()
