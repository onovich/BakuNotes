# BakuNotes

[简体中文](README.zh-CN.md)

BakuNotes (梦貘手记) is a local-first dream journal prototype and a set of tools for preserving and reviewing Youdao note exports. The Expo app lets you write, search, import, and export entries on the web; the same source targets iOS.

![BakuNotes illustrated journal and search interface](docs/social-preview.png)

> **Privacy and maturity:** Keep real exports and dream text in the ignored `archive/` or `private/` directories. The app's device cache and JSONL exports are plaintext. Encrypted Supabase sync is implemented in code but has not been verified across real devices; no signed iPhone build or hosted web release is available yet. Back up your data independently before relying on the app.

## Try the journal locally

Requires Node.js and npm. Cloud configuration is optional for local use.

```sh
cd app
npm ci
npm run web
```

The web preview supports new entries, automatic local saving, title and body search, and JSONL import/export. Without [cloud setup](CLOUD_SETUP.md), entries stay on the current device.

## Preserve a Youdao folder export

The PDF workflow requires Python and `pypdf`. Choose an output directory that does not yet contain files; the input is read without modification.

```sh
python -m pip install pypdf
python tools/import_youdao_export.py --input "path/to/export" --output "archive/youdao-new"
python tools/verify_youdao_export.py --archive "archive/youdao-new"
python tools/build_youdao_review.py --archive "archive/youdao-new"
```

The tools copy the originals, record SHA-256 checksums, extract readable PDF text, and create a review sheet. `dreams.jsonl` contains **rule-selected candidates**, not a confirmed dream library. Review the candidates and missing text before importing them into the app. An [ENEX converter](tools/import_enex.py) and its [archive verifier](tools/verify_archive.py) are also included.

## Project map

- `app/` — Expo / React Native web and iOS source, with local storage and experimental encrypted sync.
- `tools/` — local export conversion, review, and integrity checks.
- `supabase/schema.sql` — tables and row-level security rules for encrypted records.
- `archive/` and `private/` — local data; excluded from Git.

Read the [architecture](ARCHITECTURE.md), [roadmap](PLAN.md), and [domain terms](CONTEXT.md) for the intended design. [Cloud setup](CLOUD_SETUP.md) and [iPhone build requirements](IOS_BUILD.md) describe work that still needs account-specific validation.

## Checks

```sh
cd app
npm run lint
npx tsc --noEmit
cd ..
python -m unittest discover -s tools -p 'test_*.py'
```

The repository currently has no project-wide open-source license.
