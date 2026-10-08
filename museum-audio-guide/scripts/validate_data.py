#!/usr/bin/env python3
"""Check the seed data and translations for broken links and missing fields.

Usage: python3 scripts/validate_data.py
Exits non-zero if anything is wrong.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LANGS = ["en", "fr", "de", "zh-Hant", "zh-Hans", "nl", "uk", "ar", "fa", "es", "it", "pt", "ja", "ko"]
TYPES = {"art_movement", "world_event", "tech", "literature"}
STATUS = "draft, needs fact-check"

errors = []


def load(rel):
    return json.loads((ROOT / rel).read_text(encoding="utf-8"))


def text_field(rec, field, where):
    v = rec.get(field)
    if not isinstance(v, dict) or not v.get("text"):
        errors.append(f"{where}: '{field}' must be {{text, status}}")
    elif v.get("status") != STATUS:
        errors.append(f"{where}: '{field}.status' must be '{STATUS}'")


museums = load("data/museums.json")
paintings = load("data/paintings.json")
events = load("data/timeline_events.json")
p_ids = {p["id"] for p in paintings}
e_ids = {e["id"] for e in events}

for m in museums:
    for f in ("name", "city", "description"):
        text_field(m, f, f"museum {m['id']}")
    for pid in m["paintings"]:
        if pid not in p_ids:
            errors.append(f"museum {m['id']}: unknown painting {pid}")

numbers = set()
for p in paintings:
    w = f"painting {p['id']}"
    for f in ("title", "quick_take", "real_collection"):
        text_field(p, f, w)
    if p["number"] in numbers:
        errors.append(f"{w}: duplicate number {p['number']}")
    numbers.add(p["number"])
    if not 3 <= len(p["why_then"]) <= 5:
        errors.append(f"{w}: why_then should have 3-5 items, has {len(p['why_then'])}")
    for eid in p["why_then"]:
        if eid not in e_ids:
            errors.append(f"{w}: unknown event {eid}")
    n = len([s for s in p["quick_take"]["text"].split(". ") if s.strip()])
    if not 3 <= n <= 4:
        errors.append(f"{w}: quick_take should be 3-4 sentences, looks like {n}")

for e in events:
    w = f"event {e['id']}"
    for f in ("title", "short_text"):
        text_field(e, f, w)
    if e["type"] not in TYPES:
        errors.append(f"{w}: bad type {e['type']}")
    for pid in e["related_paintings"]:
        if pid not in p_ids:
            errors.append(f"{w}: unknown painting {pid}")
    # related_paintings must mirror the paintings' why_then lists exactly
    expected = sorted(p["id"] for p in paintings if e["id"] in p["why_then"])
    if sorted(e["related_paintings"]) != expected:
        errors.append(f"{w}: related_paintings {sorted(e['related_paintings'])} != why_then backlinks {expected}")

en_ui = set(load("i18n/en.json")["ui"])
for lang in LANGS:
    path = ROOT / "i18n" / f"{lang}.json"
    if not path.exists():
        errors.append(f"i18n/{lang}.json missing")
        continue
    d = json.loads(path.read_text(encoding="utf-8"))
    missing = en_ui - set(d.get("ui", {}))
    if missing:
        errors.append(f"i18n/{lang}.json: missing ui keys {sorted(missing)}")
    if lang == "en":
        continue
    c = d.get("content", {})
    for pid in p_ids:
        for f in ("title", "quick_take", "real_collection"):
            if not c.get("painting", {}).get(pid, {}).get(f):
                errors.append(f"i18n/{lang}.json: painting {pid}.{f} missing")
    for eid in e_ids:
        for f in ("title", "short_text"):
            if not c.get("event", {}).get(eid, {}).get(f):
                errors.append(f"i18n/{lang}.json: event {eid}.{f} missing")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print(f"OK: {len(museums)} museums, {len(paintings)} paintings, {len(events)} events, {len(LANGS)} languages")
