// Decides: is there enough text? If not and it is a PDF, try OCR (scanned CV).
const f = Object.assign({}, $('Prepare File').first().json);
delete f.b64;
const j = $input.first().json;
const text = String(j.text || '').replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const letters = (text.match(/[A-Za-z؀-ۿ]/g) || []).length;
const readable = letters >= 150;
return [{
  json: Object.assign(f, {
    text: text,
    method: j.method || 'text',
    letters: letters,
    readable: readable,
    needs_ocr: !readable && f.ext === 'pdf',
    reason: readable ? '' : (j.reason || 'No readable text found in the file')
  })
}];
