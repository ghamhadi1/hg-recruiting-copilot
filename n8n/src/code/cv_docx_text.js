// A .docx is a zip. "Unzip DOCX" gave us its files; read word/document.xml and strip the XML.
const item = $input.first();
const bin = item.binary || {};
let key = null;
for (const k of Object.keys(bin)) {
  const name = String(bin[k].fileName || '').toLowerCase();
  const dir = String(bin[k].directory || '').toLowerCase();
  if (/(^|\/)document\.xml$/.test(name) && name.indexOf('glossary') === -1 && dir.indexOf('glossary') === -1) {
    key = k;
    if ((dir + '/' + name).indexOf('word') !== -1) break;
  }
}
if (!key) {
  const err = item.json && item.json.error ? ' (' + (item.json.error.message || item.json.error) + ')' : '';
  return [{ json: { text: '', method: 'text', reason: 'Not a valid Word file: word/document.xml missing' + err } }];
}
const buf = await this.helpers.getBinaryDataBuffer(0, key);
let xml = buf.toString('utf8');
xml = xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br[^>]*\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t');
const text = xml.replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
return [{ json: { text: text, method: 'text', reason: '' } }];
