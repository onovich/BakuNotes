"""Verify checksums, record count, IDs, and attachments of a converted archive."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_archive(directory: Path) -> dict:
    problems: list[str] = []
    manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
    raw = directory / "raw" / manifest["source_file"]
    archive = directory / "dreams.jsonl"
    if not raw.is_file() or sha256(raw) != manifest["source_sha256"]:
        problems.append("原始导出文件缺失或校验值不符")
    if not archive.is_file() or sha256(archive) != manifest["archive_sha256"]:
        problems.append("dreams.jsonl 缺失或校验值不符")

    records = []
    if archive.is_file():
        for number, line in enumerate(archive.read_text(encoding="utf-8").splitlines(), 1):
            try:
                record = json.loads(line)
                if not all(isinstance(record.get(key), str) for key in ("id", "title", "body")):
                    problems.append(f"第 {number} 行缺少 id、title 或 body")
                records.append(record)
            except json.JSONDecodeError:
                problems.append(f"第 {number} 行不是有效 JSON")
    ids = [record.get("id") for record in records]
    if len(ids) != len(set(ids)):
        problems.append("存在重复的记录 id")
    if len(records) != manifest["converted_count"]:
        problems.append("记录数量与 manifest 不符")
    if manifest["source_note_count"] != manifest["converted_count"] + manifest["error_count"]:
        problems.append("原始篇数与成功及失败篇数之和不符")

    root = directory.resolve()
    attachment_count = 0
    for record in records:
        for attachment in record.get("attachments", []):
            attachment_count += 1
            path = (directory / attachment["path"]).resolve()
            if not path.is_relative_to(root) or not path.is_file() or sha256(path) != attachment["sha256"]:
                problems.append(f"附件缺失或校验失败：{attachment.get('path')}")

    return {
        "source_note_count": manifest["source_note_count"],
        "converted_count": len(records),
        "error_count": manifest["error_count"],
        "attachment_count": attachment_count,
        "integrity_ok": not problems,
        "problems": problems,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = verify_archive(args.archive)
    except Exception as exc:
        print(f"Verification failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["integrity_ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
