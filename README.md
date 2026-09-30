# BakuNotes

[简体中文](README.zh-CN.md)

BakuNotes (梦貘手记) is a local-first dream journal for writing down dreams, finding older entries, and keeping an independent backup. It also converts notes from supported export formats into BakuNotes records. The Expo project shares its code between the web and iOS.

![BakuNotes illustrated journal and search interface](docs/social-preview.png)

> **Current status:** Local writing, search, JSONL import/export, and ENEX conversion are implemented. Other note formats are planned. Encrypted Supabase sync is present in code but has not been verified across real devices. There is no hosted web release or signed iPhone build yet.

## Try it locally

Requires Node.js and npm. A cloud account is not needed for local use.

```sh
cd app
npm ci
npm run web
```

Create a dream, add a title or date when you want, and search the library by title or body. Entries save to the current device. Use **Export backup** to download a JSONL copy and **Import records** to restore a backup or import converted notes without duplicating matching IDs.

## Convert notes from ENEX

The first supported source format is ENEX, used by 印象笔记. Export the file in the source application; BakuNotes does not perform that export. The converter reads an existing file, leaves it unchanged, and writes BakuNotes JSONL plus a manifest and a preserved source copy.

```sh
python tools/convert_enex.py --input "path/to/notes.enex" --output "private/enex-conversion"
python tools/verify_conversion.py --archive "private/enex-conversion"
```

The output directory must be empty. Review `dreams.jsonl` before importing it in the app: every note in the supplied ENEX is converted, whether or not it describes a dream. The converter saves attachment files and metadata, while the app currently imports text records and metadata only; it does not bring attachment files into the journal. [Conversion details](CONVERSION.md) describe the record format and future format categories. The [印象笔记 help center](https://help.yinxiang.com/hc/articles/63067) documents ENEX export in its own client.

## Privacy and backups

The device cache and exported JSONL backups are **plaintext**. Keep backups in a protected location and test that you can restore them. Cloud sync encrypts record fields on the client before upload, but its real-device behavior still needs validation; see [cloud setup](CLOUD_SETUP.md). Personal source files belong in the Git-ignored `archive/` or `private/` directories and are not part of this repository.

## Project files

- `app/` — Expo / React Native journal, local storage, backup import/export, and encrypted sync code.
- `tools/` — converters for existing note exports and conversion verification.
- `supabase/schema.sql` — database tables and row-level security rules for encrypted records.
- [Architecture](ARCHITECTURE.md), [roadmap](PLAN.md), and [domain terms](CONTEXT.md) — design and next steps.
- [iPhone build requirements](IOS_BUILD.md) — conditions for a signed installable build.

## Checks

Run from the repository root:

```sh
cd app
npm run lint
npx tsc --noEmit
npx expo export --platform web
cd ..
python -m unittest discover -s tools -p 'test_*.py'
```

The repository currently has no project-wide open-source license.
