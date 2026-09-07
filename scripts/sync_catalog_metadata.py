"""Correct existing AI index metadata using the public catalog; preserve AI content."""
import json
from pathlib import Path

def sync(folder=Path("docs")):
    catalog = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    by_id = {p["id"]: p for p in catalog["posts"]}
    for name in ("index.json", "index.cache.json"):
        path = folder / name
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        changed = 0
        for post in data.get("posts", []):
            source = by_id.get(post["id"])
            if not source:
                continue
            for key in ("title", "category", "tags", "date"):
                if source.get(key) and post.get(key) != source[key]:
                    post[key] = source[key]
                    changed += 1
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=1 if name=="index.json" else None), encoding="utf-8")
        print(f"{name}: {changed} metadata fields corrected; summaries and embeddings retained")

if __name__ == "__main__":
    sync()
