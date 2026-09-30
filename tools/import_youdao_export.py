"""Copy a Youdao folder export, index its PDFs, and select dream candidates.

The source directory is read only. Output contains private note text and must
stay outside version control. Selection is deliberately a reviewable heuristic.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from collections import Counter
from pathlib import Path

from pypdf import PdfReader


EXTRA_EXPORT_FILE = "导出失败文档解决方案_2026-09-30.txt"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_attachment(relative: Path) -> bool:
    return any(part.endswith(".note.attach") for part in relative.parts[:-1])


def is_dream_candidate(relative: Path) -> bool:
    return "旧梦" in relative.parts[:-1] or "梦" in relative.name


def note_title(relative: Path) -> str:
    name = relative.name
    if name.endswith(".note.pdf"):
        return name[: -len(".note.pdf")]
    return relative.stem


def extract_pdf(path: Path) -> tuple[str, int]:
    reader = PdfReader(str(path), strict=False)
    if reader.is_encrypted:
        if reader.decrypt("") == 0:
            raise ValueError("PDF is encrypted")
    text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text).strip()
    return text, len(reader.pages)


def write_jsonl(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")


def import_export(source: Path, output: Path, failed_notes: list[str] | None = None) -> dict:
    source = source.resolve()
    output = output.resolve()
    if not source.is_dir():
        raise NotADirectoryError(source)
    if output == source or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("Source and output directories must not overlap")
    if output.exists() and any(output.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {output}")
    files = sorted((p for p in source.rglob("*") if p.is_file()), key=lambda p: p.relative_to(source).as_posix())
    output.mkdir(parents=True, exist_ok=True)
    raw = output / "raw"
    raw.mkdir()
    inventory: list[dict] = []
    notes: list[dict] = []
    dreams: list[dict] = []
    errors: list[dict] = []
    format_counts: Counter[str] = Counter()
    blank_pdfs: list[str] = []
    candidate_with_no_text: list[str] = []

    for original in files:
        relative = original.relative_to(source)
        target = raw / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, target)
        original_hash = sha256(original)
        copied_hash = sha256(target)
        if original_hash != copied_hash:
            raise IOError(f"Copy verification failed: {relative.as_posix()}")
        attachment = is_attachment(relative)
        export_extra = relative.name == EXTRA_EXPORT_FILE and relative.parent == Path(".")
        note_file = not attachment and not export_extra
        candidate = note_file and relative.name.lower().endswith(".pdf") and is_dream_candidate(relative)
        suffix = relative.suffix.lower()
        if note_file:
            format_counts[suffix] += 1
        item = {
            "path": relative.as_posix(),
            "sha256": copied_hash,
            "bytes": target.stat().st_size,
            "role": "attachment" if attachment else "export_extra" if export_extra else "note",
            "dream_candidate": candidate,
        }
        inventory.append(item)

        if not note_file or suffix != ".pdf":
            continue
        try:
            body, page_count = extract_pdf(target)
        except Exception as exc:
            errors.append({"path": relative.as_posix(), "error": f"{type(exc).__name__}: {exc}"})
            continue
        if not body:
            blank_pdfs.append(relative.as_posix())
            if candidate:
                candidate_with_no_text.append(relative.as_posix())
        record = {
            "id": hashlib.sha256(("youdao-folder-export\0" + relative.as_posix()).encode("utf-8")).hexdigest()[:32],
            "title": note_title(relative),
            "body": body,
            "dream_date": None,
            "recorded_at": None,
            "source_created_at": None,
            "source_updated_at": None,
            "tags": [],
            "source": {
                "system": "youdao-folder-export",
                "path": relative.as_posix(),
                "sha256": copied_hash,
                "page_count": page_count,
            },
            "attachments": [],
        }
        notes.append(record)
        if candidate:
            dreams.append(record)

    write_jsonl(output / "notes.jsonl", notes)
    write_jsonl(output / "dreams.jsonl", dreams)
    manifest = {
        "schema_version": 1,
        "source_kind": "youdao-folder-export",
        "inventory": inventory,
        "source_file_count": len(files),
        "exported_note_file_count": sum(item["role"] == "note" for item in inventory),
        "format_counts": dict(sorted(format_counts.items())),
        "pdf_extracted_count": len(notes),
        "dream_candidate_count": len(dreams),
        "dream_candidate_rule": "PDF under a 旧梦 directory, or PDF filename containing 梦",
        "non_pdf_note_count": sum(count for ext, count in format_counts.items() if ext != ".pdf"),
        "blank_pdf_count": len(blank_pdfs),
        "blank_pdfs": blank_pdfs,
        "candidate_with_no_text": candidate_with_no_text,
        "extraction_errors": errors,
        "failed_in_youdao_export": failed_notes or [],
        "failed_note_recovery": "pending manual export" if failed_notes else "not_supplied",
        "notes_sha256": sha256(output / "notes.jsonl"),
        "dreams_sha256": sha256(output / "dreams.jsonl"),
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {key: value for key, value in manifest.items() if key not in {"inventory", "blank_pdfs", "candidate_with_no_text"}}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Completed Youdao export directory")
    parser.add_argument("--output", type=Path, required=True, help="New private archive directory")
    parser.add_argument("--failed-note", action="append", default=[], help="Failed export filename; repeat as needed")
    args = parser.parse_args()
    try:
        result = import_export(args.input, args.output, args.failed_note)
    except Exception as exc:
        print(f"Import failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
