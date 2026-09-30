import json
import tempfile
import unittest
from pathlib import Path

from import_enex import import_enex
from verify_archive import verify_archive


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


class ImportEnexTest(unittest.TestCase):
    def test_preserves_source_and_converts_chinese_text_and_attachment(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "export.enex"
            destination = Path(temp) / "result"
            source.write_text(SAMPLE, encoding="utf-8")
            manifest = import_enex(source, destination)
            records = [json.loads(line) for line in (destination / "dreams.jsonl").read_text(encoding="utf-8").splitlines()]

            self.assertEqual(manifest["source_note_count"], 2)
            self.assertEqual(manifest["converted_count"], 2)
            self.assertEqual(manifest["error_count"], 0)
            self.assertEqual((destination / "raw" / source.name).read_bytes(), source.read_bytes())
            self.assertEqual(records[0]["body"], "我在海边。\n第二行 & 灯塔。\n醒来时还记得。")
            self.assertIsNone(records[0]["dream_date"])
            self.assertEqual(records[0]["tags"], ["海"])
            self.assertIn("[附件:线索.txt]", records[1]["body"])
            self.assertEqual((destination / records[1]["attachments"][0]["path"]).read_bytes(), b"abc")
            self.assertTrue(verify_archive(destination)["integrity_ok"])
            (destination / records[1]["attachments"][0]["path"]).write_bytes(b"changed")
            self.assertFalse(verify_archive(destination)["integrity_ok"])


if __name__ == "__main__":
    unittest.main()
