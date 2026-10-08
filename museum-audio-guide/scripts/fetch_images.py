#!/usr/bin/env python3
"""Download public-domain painting images from Wikimedia Commons and record their
source and license in data/image_credits.json.

Only uses the Python standard library. Needs internet access to commons.wikimedia.org
and upload.wikimedia.org.

Usage:
  python3 scripts/fetch_images.py                 # search Commons using the queries in data/paintings.json
  python3 scripts/fetch_images.py --dry-run       # show what it would pick, download nothing
  python3 scripts/fetch_images.py --file car="File:Some exact name.jpg"   # force a specific Commons file

The license is copied from the file's Commons metadata, not guessed. Files whose
license does not look public domain are skipped. Search can still pick the wrong
picture (a detail, a study, a photo of the gallery wall), so ALWAYS open the
printed Commons page and check it before you rely on it.
"""
import argparse
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://commons.wikimedia.org/w/api.php"
UA = "WhyThenMuseumGuideDemo/0.1 (concept demo; local script)"
WIDTH = 1280
PD_PATTERN = re.compile(r"public domain|^pd\b|^pd-|cc0", re.I)


def api(params):
    params = dict(params, format="json", formatversion="2")
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def strip_html(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def file_info(titles):
    data = api({
        "action": "query", "titles": "|".join(titles), "prop": "imageinfo",
        "iiprop": "url|extmetadata|size|mime", "iiurlwidth": WIDTH,
    })
    out = []
    for page in data.get("query", {}).get("pages", []):
        if page.get("missing") or not page.get("imageinfo"):
            continue
        ii = page["imageinfo"][0]
        meta = ii.get("extmetadata", {})
        get = lambda k: strip_html(meta.get(k, {}).get("value"))
        out.append({
            "title": page["title"],
            "mime": ii.get("mime"),
            "width": ii.get("width"),
            "thumb_url": ii.get("thumburl") or ii.get("url"),
            "source_url": ii.get("descriptionurl"),
            "license": get("LicenseShortName"),
            "license_url": get("LicenseUrl") or None,
            "author": get("Artist"),
            "credit": get("Credit"),
        })
    return out


def search(query, limit=8):
    data = api({"action": "query", "list": "search", "srsearch": query,
                "srnamespace": "6", "srlimit": str(limit)})
    return [hit["title"] for hit in data.get("query", {}).get("search", [])]


def pick(painting, forced):
    if forced:
        infos = file_info([forced])
        return infos[0] if infos else None
    for q in painting["image"]["commons_queries"]:
        titles = search(q)
        if not titles:
            continue
        infos = {i["title"]: i for i in file_info(titles)}
        for t in titles:  # keep search ranking
            i = infos.get(t)
            if i and i["mime"] in ("image/jpeg", "image/png") and PD_PATTERN.search(i["license"] or ""):
                return i
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--file", action="append", default=[], help='painting_id="File:Name.jpg"')
    args = ap.parse_args()
    forced = dict(f.split("=", 1) for f in args.file)

    paintings = json.loads((ROOT / "data/paintings.json").read_text(encoding="utf-8"))
    credits_path = ROOT / "data/image_credits.json"
    credits = json.loads(credits_path.read_text(encoding="utf-8")) if credits_path.exists() else {}

    for p in paintings:
        try:
            info = pick(p, forced.get(p["id"]))
        except Exception as e:  # network errors etc.
            print(f"[{p['id']}] ERROR: {e}")
            continue
        if not info:
            print(f"[{p['id']}] no public-domain match found; pass --file {p['id']}=\"File:...\"")
            continue
        if not PD_PATTERN.search(info["license"] or ""):
            print(f"[{p['id']}] WARNING: license is '{info['license']}', not public domain. Skipped.")
            continue
        ext = ".png" if info["mime"] == "image/png" else ".jpg"
        rel = f"images/{p['id']}{ext}"
        print(f"[{p['id']}] {info['title']}\n    license: {info['license']}\n    check:   {info['source_url']}")
        if args.dry_run:
            continue
        req = urllib.request.Request(info["thumb_url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            (ROOT / rel).write_bytes(r.read())
        credits[p["id"]] = {
            "file": rel,
            "commons_title": info["title"],
            "source_url": info["source_url"],
            "license": info["license"],
            "license_url": info["license_url"],
            "author": info["author"],
            "credit": info["credit"],
            "status": "license read from Commons metadata; not yet checked by a person",
        }

    if not args.dry_run:
        credits_path.write_text(json.dumps(credits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote {credits_path.relative_to(ROOT)}. Open each 'check' link and confirm the picture and license.")


if __name__ == "__main__":
    sys.exit(main())
