"""Build a private, title-only review sheet for a Youdao folder export."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

from import_youdao_export import note_title


DATE_TITLE = re.compile(r"(?<!\d)(?:19|20)\d{2}[.\-/年]?(?:0?[1-9]|1[0-2])[.\-/月]?(?:[0-2]?\d|3[01])(?!\d)")


def safe_csv_cell(value: str) -> str:
    # Spreadsheet programs may interpret imported titles as formulas.
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value


def build_review(archive: Path) -> dict:
    manifest = json.loads((archive / "manifest.json").read_text(encoding="utf-8"))
    blank = set(manifest["blank_pdfs"])
    rows: list[dict[str, str]] = []
    counts: Counter[str] = Counter()
    for item in manifest["inventory"]:
        if item["role"] != "note":
            continue
        path = Path(item["path"])
        if path.suffix.lower() != ".pdf":
            status = "非PDF，原件已保存，尚未转成可搜索正文"
        elif item["path"] in blank and item["dream_candidate"]:
            status = "梦境候选，PDF无可提取文字，需人工核对"
        elif item["dream_candidate"] and "梦" in path.name:
            status = "梦境候选，标题含梦"
        elif item["dream_candidate"]:
            status = "梦境候选，仅因位于旧梦目录，需核对"
        elif DATE_TITLE.search(note_title(path)):
            status = "未选入，标题含日期，需核对是否为梦"
        else:
            status = "未选入，保留于完整笔记索引"
        rows.append({"状态": status, "标题": safe_csv_cell(note_title(path)), "原路径": safe_csv_cell(item["path"])})
        counts[status] += 1
    for title in manifest["failed_in_youdao_export"]:
        status = "有道导出失败，已接受此缺口" if manifest.get("failed_note_recovery") == "accepted_missing" else "有道导出失败，等待手动补录"
        rows.append({"状态": status, "标题": safe_csv_cell(title), "原路径": ""})
        counts[status] += 1
    out = archive / "review.csv"
    with out.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["状态", "标题", "原路径"])
        writer.writeheader()
        writer.writerows(rows)
    return {"review_rows": len(rows), "status_counts": dict(counts), "review_file": str(out)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build_review(args.archive), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
