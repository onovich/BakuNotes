import json
import tempfile
import unittest
from pathlib import Path

from convert_enex import NoteTextParser, convert_enex
from verify_conversion import verify_conversion


SAMPLE = '''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="20260930T010000Z" application="Evernote" version="10">
  <note>
    <title>海边的梦</title>
    <content><![CDATA[<?xml version="1.0" encoding="UTF-8"?><en-note>我在海边。<div>第二行 &amp; 灯塔。</div><div>醒来时还记得。</div></en-note>]]></content>
    <created>20260929T230000Z</created>
    <updated>20260930T000000Z</updated>
    <tag>海</tag>
  </note>
  <note>
    <title>飞行</title>
    <content><![CDATA[<en-note>飞过城市。<en-media hash="900150983cd24fb0d6963f7d28e17f72" type="text/plain"/></en-note>]]></content>
    <resource><data encoding="base64">YWJj</data><mime>text/plain</mime><resource-attributes><file-name>线索.txt</file-name></resource-attributes></resource>
  </note>
</en-export>'''


class ConvertEnexTest(unittest.TestCase):
    def test_keeps_only_basic_markdown_structure(self):
        parser = NoteTextParser()
        parser.feed('<en-note><h2>夜里</h2><div>先是<strong>一盏灯</strong>。</div>'
                    '<ul><li>海边</li><li><em>回家</em></li></ul>'
                    '<div>看<a href="https://example.com/sky">天空</a></div></en-note>')
        self.assertEqual(parser.text(), '## 夜里\n先是**一盏灯**。\n- 海边\n- *回家*\n看[天空](https://example.com/sky)')

    def test_preserves_source_and_converts_chinese_text_and_attachment(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "export.enex"
            destination = Path(temp) / "result"
            source.write_text(SAMPLE, encoding="utf-8")
            manifest = convert_enex(source, destination)
            records = [json.loads(line) for line in (destination / "dreams.jsonl").read_text(encoding="utf-8").splitlines()]

            self.assertEqual(manifest["source_note_count"], 2)
            self.assertEqual(manifest["converted_count"], 2)
            self.assertEqual(manifest["error_count"], 0)
            self.assertEqual((destination / "raw" / source.name).read_bytes(), source.read_bytes())
            self.assertEqual(records[0]["body"], "我在海边。\n第二行 & 灯塔。\n醒来时还记得。")
            self.assertIsNone(records[0]["dream_date"])
            self.assertIsNone(records[0]["recorded_at"])
            self.assertEqual(records[0]["source"]["system"], "enex")
            self.assertEqual(records[0]["source_created_at"], "2026-09-29T23:00:00+00:00")
            self.assertEqual(records[0]["tags"], ["海"])
            self.assertIn("[附件:线索.txt]", records[1]["body"])
            self.assertEqual((destination / records[1]["attachments"][0]["path"]).read_bytes(), b"abc")
            self.assertTrue(verify_conversion(destination)["integrity_ok"])
            (destination / records[1]["attachments"][0]["path"]).write_bytes(b"changed")
            self.assertFalse(verify_conversion(destination)["integrity_ok"])

    def test_reports_failed_notes_and_reuses_stable_ids(self):
        broken = '''<note><title>Broken resource</title><content><![CDATA[<en-note>text</en-note>]]></content>
        <resource><data>x</data></resource></note>'''
        source_text = SAMPLE.replace("</en-export>", broken + "</en-export>")
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "export.enex"
            source.write_text(source_text, encoding="utf-8")
            original = source.read_bytes()
            first = Path(temp) / "first"
            second = Path(temp) / "second"
            first_manifest = convert_enex(source, first)
            second_manifest = convert_enex(source, second)
            first_records = [json.loads(line) for line in (first / "dreams.jsonl").read_text(encoding="utf-8").splitlines()]
            second_records = [json.loads(line) for line in (second / "dreams.jsonl").read_text(encoding="utf-8").splitlines()]

            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(first_manifest["source_note_count"], 3)
            self.assertEqual(first_manifest["converted_count"], 2)
            self.assertEqual(first_manifest["error_count"], 1)
            self.assertEqual(first_manifest["errors"][0]["note_index"], 3)
            self.assertEqual([item["id"] for item in first_records], [item["id"] for item in second_records])
            self.assertEqual(first_manifest["archive_sha256"], second_manifest["archive_sha256"])
            self.assertTrue(verify_conversion(first)["integrity_ok"])


if __name__ == "__main__":
    unittest.main()
