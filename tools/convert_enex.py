"""Convert an existing ENEX file into BakuNotes JSONL and preserve a source copy.

The source application performs the export. This tool makes no network calls and
never modifies the input file.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import mimetypes
import re
import shutil
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


BREAK_TAGS = {"br", "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "table", "blockquote"}


class NoteTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def break_line(self) -> None:
        if self.parts and not self.parts[-1].endswith("\n"):
            self.parts.append("\n")

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self.skip_depth += 1
        elif not self.skip_depth and tag in BREAK_TAGS:
            self.break_line()
        elif not self.skip_depth and tag == "en-media":
            attributes = dict(attrs)
            self.parts.append(f"[附件:{attributes.get('hash', '未知')}]")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self.skip_depth:
            self.skip_depth -= 1
        elif not self.skip_depth and tag in BREAK_TAGS:
            self.break_line()

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        value = html.unescape("".join(self.parts)).replace("\u00a0", " ")
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in value.splitlines()]
        return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def child_text(parent: ET.Element, name: str) -> str | None:
    element = parent.find(name)
    return element.text if element is not None else None


def enex_date(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc).isoformat()
    except ValueError:
        return value


def clean_filename(name: str) -> str:
    return re.sub(r"[^\w. -]", "_", name, flags=re.UNICODE).strip(" .") or "attachment"


def convert_note(note: ET.Element, source_name: str, index: int, attachment_dir: Path) -> dict:
    title = (child_text(note, "title") or "无标题").strip()
    content = child_text(note, "content") or ""
    parser = NoteTextParser()
    parser.feed(content)
    body = parser.text()
    created = enex_date(child_text(note, "created"))
    updated = enex_date(child_text(note, "updated"))
    tags = [tag.text.strip() for tag in note.findall("tag") if tag.text and tag.text.strip()]
    guid = child_text(note, "guid")
    identity = guid or f"{title}\0{created}\0{body}"
    note_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:32]
    attachments = []

    for resource_index, resource in enumerate(note.findall("resource"), 1):
        encoded = child_text(resource, "data")
        if not encoded:
            continue
        data = base64.b64decode(encoded, validate=False)
        md5 = hashlib.md5(data).hexdigest()  # ENEX en-media references use MD5.
        mime = child_text(resource, "mime") or "application/octet-stream"
        filename = child_text(resource, "resource-attributes/file-name")
        if not filename:
            filename = f"resource-{resource_index}{mimetypes.guess_extension(mime) or '.bin'}"
        relative = Path("attachments") / f"{note_id}-{md5[:12]}-{clean_filename(filename)}"
        target = attachment_dir.parent / relative
        target.write_bytes(data)
        attachments.append({"path": relative.as_posix(), "filename": filename, "mime": mime, "md5": md5, "sha256": hashlib.sha256(data).hexdigest()})
        body = body.replace(f"[附件:{md5}]", f"[附件:{filename}]")

    return {
        "id": note_id,
        "title": title,
        "body": body,
        "dream_date": None,
        "recorded_at": None,
        "source_created_at": created,
        "source_updated_at": updated,
        "tags": tags,
        "source": {"system": "enex", "export_file": source_name, "note_index": index, "guid": guid},
        "attachments": attachments,
    }


def convert_enex(input_path: Path, output_dir: Path) -> dict:
    if not input_path.is_file():
        raise FileNotFoundError(input_path)
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = output_dir / "raw"
    attachment_dir = output_dir / "attachments"
    raw_dir.mkdir()
    attachment_dir.mkdir()
    backup = raw_dir / input_path.name
    shutil.copy2(input_path, backup)
    source_sha = sha256(backup)
    raw_bytes = backup.read_bytes()
    # Standard ENEX files may reference Evernote's public DTD. It is not needed
    # to parse the document, so remove that one declaration without fetching it.
    xml_bytes = re.sub(
        rb"<!DOCTYPE\s+en-export\s+SYSTEM\s+[\"']https?://xml\.evernote\.com/pub/evernote-export\d+\.dtd[\"']\s*>",
        b"",
        raw_bytes,
        flags=re.IGNORECASE,
    )
    if b"<!DOCTYPE" in xml_bytes.upper() or b"<!ENTITY" in xml_bytes.upper():
        raise ValueError("ENEX contains an unsupported DOCTYPE or ENTITY declaration; preserved raw export, conversion stopped")
    root = ET.fromstring(xml_bytes)
    if root.tag != "en-export":
        raise ValueError(f"Expected <en-export>, got <{root.tag}>")

    errors = []
    seen: set[str] = set()
    records = []
    note_elements = root.findall("note")
    for index, note in enumerate(note_elements, 1):
        try:
            record = convert_note(note, input_path.name, index, attachment_dir)
            if record["id"] in seen:
                errors.append({"note_index": index, "title": record["title"], "error": "duplicate id"})
                continue
            seen.add(record["id"])
            records.append(record)
        except Exception as exc:
            errors.append({"note_index": index, "title": child_text(note, "title"), "error": str(exc)})

    archive = output_dir / "dreams.jsonl"
    with archive.open("w", encoding="utf-8", newline="\n") as stream:
        for record in records:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")

    manifest = {
        "format": "bakunotes-import-v1",
        "converted_at": datetime.now(timezone.utc).isoformat(),
        "source_file": input_path.name,
        "source_sha256": source_sha,
        "source_bytes": len(raw_bytes),
        "source_note_count": len(note_elements),
        "converted_count": len(records),
        "error_count": len(errors),
        "errors": errors,
        "archive_sha256": sha256(archive),
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    argument_parser = argparse.ArgumentParser(description=__doc__)
    argument_parser.add_argument("--input", type=Path, required=True, help="Path to an ENEX export")
    argument_parser.add_argument("--output", type=Path, required=True, help="Empty output directory")
    args = argument_parser.parse_args()
    try:
        manifest = convert_enex(args.input, args.output)
    except Exception as exc:
        print(f"Conversion failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({key: manifest[key] for key in ("source_note_count", "converted_count", "error_count", "source_sha256")}, ensure_ascii=False, indent=2))
    return 0 if not manifest["errors"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
