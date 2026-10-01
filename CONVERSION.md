# Note conversion into BakuNotes

BakuNotes accepts files **already exported by the source note application**. It does not log in to that application, trigger an export, or replace its own export feature. The first converter accepts ENEX files from 印象笔记; its [help center](https://help.yinxiang.com/hc/articles/63067) describes that source format.

## Supported inputs

| Category | Input | Status |
| --- | --- | --- |
| Structured note archive | ENEX (`.enex`) | Implemented and covered by a synthetic conversion test |
| Individual text notes | UTF-8 TXT, MD, MARKDOWN files | Direct app import implemented; one file per note |
| Markdown or HTML folder | Exported files and assets | Folder/asset conversion planned; individual Markdown files can be imported |
| Tabular or structured text export | CSV, JSON variants | Planned; each source needs a documented field mapping |
| PDF or scanned pages | PDF and images | Deferred; text extraction and OCR are outside the current text-first roadmap |

“Planned” does not mean arbitrary files of that extension can already be imported. Add a converter only after a representative source export and its metadata rules are understood.

## Direct text import

Select one or more UTF-8 `.txt`, `.md`, or `.markdown` files in **Import records**, separately from JSONL and manifests. Each nonempty file becomes one selectable entry, initially unselected. Empty content, null characters or the replacement character U+FFFD stop the whole preview with the filename in the error; check the encoding and resave as UTF-8. No records are saved at that stage.

The filename without its extension becomes the title. The body keeps its content, including Markdown headings and front matter as literal text; only an initial UTF-8 BOM is removed and line endings are normalized to LF. Tags, attachments and front-matter fields are not parsed. Images and linked files are not loaded.

### Confirming timestamps

Dates stay unknown until you explicitly adopt a candidate. The preview offers file creation time only when supplied, file modification time when available, the current import time, and manual input. The current document picker does not supply original file creation time. File modification metadata can change during export or copying, and some providers substitute the current time when it is unavailable; it is not proof of when the note was written.

The first and last nonempty body lines are checked for explicit dates. Candidates appear only when detected. Supported forms include year-first dates with hyphens, slashes or dots, Chinese numeric dates and times, compact `YYYYMMDD`, fullwidth digits, and optional hours/minutes/seconds with an explicit zone. Year-last forms such as `01/10/2026` show both valid day/month and month/day interpretations for confirmation. Multiple dates on a boundary line are separate candidates. Relative dates, missing years and unsupported prose are not guessed. A one-line note is checked once.

Choose the source and the destination: dream date, original note recording time, or both. Manual input appears when selected; invalid or ambiguous manual dates must be corrected before import. Date-only values remain date-only; timestamps without a zone retain that absence. Adopting a dream date uses the stated calendar day without converting time zones. The body is unchanged.

Select all, clear and invert selection exclude duplicates. Apply a batch rule to selected entries, then adjust individual entries as needed. Each file uses its own matching candidate; missing or ambiguous matches require an individual choice or an explicit decision to keep the time unknown. No alternate timestamp is silently substituted. JSONL backups preserve `imported_at`, source file times and `source.time_selection` (chosen source, value and destination). Import time records the actual confirmation time separately from the time adopted by the user. These choices do not change the stable record ID.

IDs are stable hashes of format, exact filename and normalized body. Repeated import detects identical input, including after editing the imported journal entry; changing the source filename or body creates a separate record rather than updating the earlier one. Source metadata stores the filename and body checksum, and survives JSONL backup and restore. Keep original files separately; direct import does not create a source-file copy.

## ENEX workflow

Run from the repository root with Python. Choose a new or empty destination under an ignored private directory:

```sh
python tools/convert_enex.py --input "path/to/notes.enex" --output "private/enex-conversion"
python tools/verify_conversion.py --archive "private/enex-conversion"
```

The converter does not modify the input. It writes `raw/` (a source copy), `dreams.jsonl` (one converted note per line), `attachments/` (extracted files), and `manifest.json` (counts, checksums, errors). The output is plaintext and must stay outside Git. Select `dreams.jsonl` and `manifest.json` together in **Import records**. The app checks their matching record count and checksum, lists conversion failures and duplicate IDs, and starts with no converted notes selected. A standalone JSONL backup can also be previewed and restored; without a manifest, conversion failures cannot be shown. Every note in the selected ENEX is converted; the tool does not decide whether it is a dream.

## Body text

`body` is editable, UTF-8 **basic Markdown source** inside each JSONL record. JSONL carries the ID, dates, tags, and provenance; it does not require a rich-text document or one `.md` file per note. Ordinary paragraphs remain ordinary text, so older minimally formatted dream notes need no special formatting pass.

The ENEX converter keeps line breaks, headings, bullet items, emphasis, and link targets when present. It does not try to reproduce fonts, colors, tables, page layout, or embedded media. The app currently edits and displays Markdown source as text; it has no rendered Markdown preview. Readable content and reliable metadata take priority over visual fidelity.

## Common record contract

Converters produce UTF-8 JSONL records with stable `id`, `title`, `body`, nullable `dream_date`, nullable `recorded_at`, separate `source_created_at` and `source_updated_at`, `tags`, `source`, and `attachments`. The source object identifies the input format and enough original metadata to trace the record. A note's creation date is never silently treated as the date of the dream.

The app currently reads title, body, dates, tags, source metadata, and attachment metadata from this JSONL. Attachment binaries remain in the private conversion output; the journal does not display or sync them yet. Its JSONL backup export preserves the metadata, but it is not an attachment-file backup.

Future format converters should meet this same contract, report unconverted items explicitly, use stable IDs across repeated runs, and keep source-specific parsing inside the converter. Conversion and the source application's export are separate steps.
