"""Prepare faithful prose review copies; never changes a live article."""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from bs4 import BeautifulSoup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    args = parser.parse_args()
    root = args.input.resolve()
    output = root / 'prose'
    output.mkdir(exist_ok=True)
    records = []
    for source in sorted(root.glob('post-*.html'), key=lambda p: int(p.stem.split('-')[1]), reverse=True):
        pid = int(source.stem.split('-')[1])
        raw = source.read_bytes()
        soup = BeautifulSoup(raw.decode('utf-8'), 'html.parser')
        body = soup.select_one('.tt_article_useless_p_margin, .contents_style')
        if not body:
            continue
        title = soup.select_one('h1.title_post')
        title = title.get_text(' ', strip=True) if title else str(pid)
        colors = Counter()
        hard_colors = []
        for el in body.select('[style],font[color]'):
            if el.find_parent(['pre', 'code', 'svg']):
                continue
            style = el.get('style', '')
            match = re.search(r'(?:^|;)\s*color\s*:\s*([^;]+)', style, re.I)
            color = match[1].strip() if match else el.get('color')
            if color and el.get_text(strip=True):
                colors[color] += 1
                if '!important' in color:
                    hard_colors.append({'color': color, 'text': el.get_text(' ',strip=True)[:160]})
        for el in body.select('script,style'):
            el.decompose()
        for el in body.select('pre'):
            el.replace_with(soup.new_string(f'\n[Code block: {len(el.get_text().splitlines())} lines; preserved in original]\n'))
        for figure in body.select('figure'):
            caption = figure.select_one('figcaption')
            img = figure.select_one('img')
            text = caption.get_text(' ', strip=True) if caption else (img.get('alt','') if img else '')
            figure.replace_with(soup.new_string(f'\n[Image: {text or "no caption"}]\n'))
        for heading in body.select('h1,h2,h3,h4,h5,h6'):
            heading.insert_before(soup.new_string('\n' + '#' * int(heading.name[1]) + ' '))
        prose = '\n'.join(line.strip() for line in body.get_text('\n').splitlines() if line.strip())
        text = f'# /{pid} {title}\n\nSource: https://semicon-circuit.tistory.com/{pid}\n\n{prose}\n'
        (output / f'{pid}.md').write_text(text, encoding='utf-8')
        records.append({'id':pid,'title':title,'chars':len(prose),'inline_colors':dict(colors),
                        'important_colors':hard_colors,'source_sha256':hashlib.sha256(raw).hexdigest(),
                        'prose_file':f'prose/{pid}.md'})
    (root/'editorial-inventory.json').write_text(json.dumps(records, ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'posts':len(records),'prose_chars':sum(r['chars'] for r in records),
                      'posts_with_inline_color':[r['id'] for r in records if r['inline_colors']],
                      'important_color_posts':[r['id'] for r in records if r['important_colors']]},ensure_ascii=False))


if __name__ == '__main__':
    main()
