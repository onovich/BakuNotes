# BakuNotes

[简体中文](README.zh-CN.md)

BakuNotes (梦貘手记) is a local-first dream journal for writing down dreams, finding older entries, and keeping an independent backup. Entries use plain text or basic Markdown, without rich-text layout. It also converts notes from supported export formats into BakuNotes records. The Expo project shares its code between the web and iOS.

![BakuNotes illustrated journal and search interface](docs/social-preview.png)

> **Current status:** Local writing, search, JSONL import/export with import preview, direct TXT/Markdown import, and ENEX conversion are implemented. Other note formats are planned. Encrypted Supabase sync is present in code but has not been verified across real devices. There is no hosted web release or signed iPhone build yet.

Daily journaling includes validated dates, editable tags and filters, sorting, recoverable trash, and persistent conflict-draft recovery for connected file libraries. Web users can import text folders recursively and save short raw audio clips. See [daily use and validation](docs/DAILY_USE.md) and [release preparation](docs/RELEASE.md). Real microphone, cloud and iPhone acceptance remains pending.

## Try it locally

Requires Node.js and npm. A cloud account is not needed for local use.

```sh
cd app
npm ci
npm run web
```

Create a dream, add a title or date when you want, and search the library by title or body. Entries save to the current device; the editor confirms completed saves and offers **Retry save** if storage fails. Use **Export backup** to download a JSONL copy. **Import records** previews entries before saving, lets you select them, and marks duplicate IDs.

## Import text files

For scripts and AI workflows, the [local file-library CLI](docs/CLI.md) and [stdio MCP server](docs/MCP.md) support creating/editing notes, import preview/commit, search, reading and backup verification. Writes require the current library revision and a request ID for safe retries. The [local web connection](docs/WEB_VAULT.md) lets the web app read and edit the same file library. Ordinary web sessions retain device storage.

In **Import records**, select one or more UTF-8 `.txt`, `.md`, or `.markdown` files. Each file becomes one entry: the filename supplies the title and the body stays as text or Markdown source. The preview supports select all and invert selection, plus individual or batch timestamp choices: available file times, detected first/last line dates, import time, or manual input. Choose whether to use the value as the dream date, original note recording time, or both; dates otherwise remain unknown. [Timestamp rules](CONVERSION.md#confirming-timestamps) explain ambiguous formats and missing metadata. Reimporting the same filename and body is marked as a duplicate; changing either creates a new record. Markdown front matter, images, and linked attachments are kept as text without special parsing or file import. Choose text files separately from JSONL backups and manifests.

## Convert notes from ENEX

The first supported source format is ENEX, used by 印象笔记. Export the file in the source application; BakuNotes does not perform that export. The converter reads an existing file, leaves it unchanged, and writes BakuNotes JSONL plus a manifest and a preserved source copy.

```sh
python tools/convert_enex.py --input "path/to/notes.enex" --output "private/enex-conversion"
python tools/verify_conversion.py --archive "private/enex-conversion"
```

The output directory must be empty. In **Import records**, select `dreams.jsonl` and `manifest.json` together. The app verifies that the report matches the records and shows conversion errors and duplicates. Converted notes start unselected; choose the ones to add to the journal. A standalone JSONL backup still imports, but it has no conversion error report.

Every note in the supplied ENEX is converted, whether or not it describes a dream. The converter keeps readable text and basic Markdown structure; it does not reproduce fonts or page layout. It saves attachment files and metadata, while the app currently imports text records and metadata only. [Conversion details](CONVERSION.md) describe the record format and future format categories. The [印象笔记 help center](https://help.yinxiang.com/hc/articles/63067) documents ENEX export in its own client.

## Privacy and backups

The device cache and exported JSONL backups are **plaintext**. Keep backups in a protected location and test that you can restore them. Cloud sync encrypts record fields on the client before upload, but its real-device behavior still needs validation; see [cloud setup](CLOUD_SETUP.md). Personal source files belong in the Git-ignored `archive/` or `private/` directories and are not part of this repository.

## Project files

- `app/` — Expo / React Native journal, local storage, backup import/export, and encrypted sync code.
- `tools/` — converters for existing note exports and conversion verification.
- `supabase/schema.sql` — database tables and row-level security rules for encrypted records.
- [Architecture](ARCHITECTURE.md), [roadmap](PLAN.md), and [domain terms](CONTEXT.md) — design and next steps.
- [iPhone build requirements](IOS_BUILD.md) — conditions for a signed installable build.

## Checks

Run from the repository root (the import contract test needs Node.js 24 or newer):

```sh
cd app
npm run lint
npx tsc --noEmit
npx expo export --platform web
node --experimental-strip-types --test tests/*.test.mjs
cd ..
python -m unittest discover -s tools -p 'test_*.py'
```

The repository currently has no project-wide open-source license.
