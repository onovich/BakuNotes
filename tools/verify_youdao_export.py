"""Verify a copied Youdao folder export and its derived JSONL indexes."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from import_youdao_export import is_dream_candidate


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify(directory: Path) -> dict:
    directory = directory.resolve()
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("source_kind") != "youdao-folder-export":
        raise ValueError("Unsupported archive kind")
    problems: list[str] = []
    inventory = manifest["inventory"]
    note_items = [item for item in inventory if item["role"] == "note"]
    if len(inventory) != manifest["source_file_count"]:
        problems.append("Source file count differs from inventory")
    if len(note_items) != manifest["exported_note_file_count"]:
        problems.append("Note file count differs from inventory")
    root = (directory / "raw").resolve()
    for item in inventory:
        path = (root / item["path"]).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            problems.append(f"Missing or unsafe raw file: {item['path']}")
        elif path.stat().st_size != item["bytes"] or sha256(path) != item["sha256"]:
            problems.append(f"Raw file checksum mismatch: {item['path']}")

    collections = {}
    for name in ("notes", "dreams"):
        path = directory / f"{name}.jsonl"
        if not path.is_file() or sha256(path) != manifest[f"{name}_sha256"]:
            problems.append(f"{name}.jsonl missing or checksum mismatch")
            collections[name] = []
            continue
        records = []
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                problems.append(f"{name}.jsonl line {number} is invalid JSON")
                continue
            if not all(isinstance(record.get(key), str) for key in ("id", "title", "body")):
                problems.append(f"{name}.jsonl line {number} is missing id, title, or body")
            records.append(record)
        ids = [record.get("id") for record in records]
        if len(ids) != len(set(ids)):
            problems.append(f"{name}.jsonl has duplicate ids")
        collections[name] = records

    notes = collections["notes"]
    dreams = collections["dreams"]
    pdf_items = {item["path"]: item for item in note_items if item["path"].lower().endswith(".pdf")}
    expected_dream_paths = {path for path in pdf_items if is_dream_candidate(Path(path))}
    note_paths = {record.get("source", {}).get("path") for record in notes}
    dream_paths = {record.get("source", {}).get("path") for record in dreams}
    if len(notes) != manifest["pdf_extracted_count"]:
        problems.append("Extracted PDF count differs from manifest")
    if len(dreams) != manifest["dream_candidate_count"]:
        problems.append("Dream candidate count differs from manifest")
    if note_paths != set(pdf_items) - {error["path"] for error in manifest["extraction_errors"]}:
        problems.append("PDF index does not match raw PDF inventory")
    if dream_paths != expected_dream_paths - {error["path"] for error in manifest["extraction_errors"]}:
        problems.append("Dream candidate selection does not match raw inventory")
    for record in notes:
        source = record.get("source", {})
        item = pdf_items.get(source.get("path"))
        if item is None or source.get("sha256") != item["sha256"]:
            problems.append(f"PDF source checksum not recorded correctly: {source.get('path')}")

    return {
        "source_file_count": len(inventory),
        "exported_note_file_count": len(note_items),
        "indexed_pdf_count": len(notes),
        "dream_candidate_count": len(dreams),
        "blank_dream_candidate_count": len(manifest["candidate_with_no_text"]),
        "integrity_ok": not problems,
        "problems": problems,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = verify(args.archive)
    except Exception as exc:
        print(f"Verification failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["integrity_ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
