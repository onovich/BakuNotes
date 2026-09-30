# Note conversion into BakuNotes

BakuNotes accepts files **already exported by the source note application**. It does not log in to that application, trigger an export, or replace its own export feature. The first converter accepts ENEX files from 印象笔记; its [help center](https://help.yinxiang.com/hc/articles/63067) describes that source format.

## Supported inputs

| Category | Input | Status |
| --- | --- | --- |
| Structured note archive | ENEX (`.enex`) | Implemented and covered by a synthetic conversion test |
| Markdown or HTML folder | Exported files and assets | Planned; no converter yet |
| Plain text or tabular export | TXT, CSV, JSON variants | Planned; each source needs a documented field mapping |
| PDF or scanned pages | PDF and images | Planned separately; OCR and content review are required when text cannot be extracted |

“Planned” does not mean arbitrary files of that extension can already be imported. Add a converter only after a representative source export and its metadata rules are understood.

## ENEX workflow

Run from the repository root with Python. Choose a new or empty destination under an ignored private directory:

```sh
python tools/convert_enex.py --input "path/to/notes.enex" --output "private/enex-conversion"
python tools/verify_conversion.py --archive "private/enex-conversion"
```

The converter does not modify the input. It writes `raw/` (a source copy), `dreams.jsonl` (one converted note per line), `attachments/` (extracted files), and `manifest.json` (counts, checksums, errors). The output is plaintext and must stay outside Git. Select `dreams.jsonl` and `manifest.json` together in **Import records**. The app checks their matching record count and checksum, lists conversion failures and duplicate IDs, and starts with no converted notes selected. A standalone JSONL backup can also be previewed and restored; without a manifest, conversion failures cannot be shown. Every note in the selected ENEX is converted; the tool does not decide whether it is a dream.

## Common record contract

Converters produce UTF-8 JSONL records with stable `id`, `title`, `body`, nullable `dream_date`, nullable `recorded_at`, separate `source_created_at` and `source_updated_at`, `tags`, `source`, and `attachments`. The source object identifies the input format and enough original metadata to trace the record. A note's creation date is never silently treated as the date of the dream.

The app currently reads title, body, dates, tags, source metadata, and attachment metadata from this JSONL. Attachment binaries remain in the private conversion output; the journal does not display or sync them yet. Its JSONL backup export preserves the metadata, but it is not an attachment-file backup.

Future format converters should meet this same contract, report unconverted items explicitly, use stable IDs across repeated runs, and keep source-specific parsing inside the converter. Conversion and the source application's export are separate steps.
