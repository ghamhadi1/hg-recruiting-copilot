// Result of the OCR attempt. Still no text → it will be flagged as unreadable.
const prev = Object.assign({}, $('Check Text').first().json);
const r = $input.first().json || {};
let text = '';
let reason = '';
if (r.error) {
  reason = 'OCR failed: ' + String(r.error.message || JSON.stringify(r.error)).slice(0, 200);
} else {
  text = String((((r.choices || [])[0] || {}).message || {}).content || '').trim();
}
if (/^\W*UNREADABLE\W*$/i.test(text)) {
  reason = 'Scanned file has no readable CV text (OCR found nothing)';
  text = '';
}
const letters = (text.match(/[A-Za-z؀-ۿ]/g) || []).length;
if (!reason && letters < 150) reason = 'Too little text even after OCR (' + letters + ' letters)';
return [{
  json: Object.assign(prev, {
    text: letters >= 150 ? text : '',
    method: 'ocr',
    letters: letters,
    readable: letters >= 150 && !reason,
    reason: reason
  })
}];
