// Receives {file_name, mime_type, data_base64} and turns it into an n8n binary file.
const body = $('Webhook').first().json.body || {};
const fileName = String(body.file_name || 'unnamed').replace(/[\\/]/g, '_').slice(0, 200);
const b64 = String(body.data_base64 || '').replace(/^data:[^,]*,/, '').replace(/\s/g, '');
const ext = fileName.indexOf('.') === -1 ? '' : fileName.split('.').pop().toLowerCase();
const mimeMap = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
const mime = body.mime_type || mimeMap[ext] || 'application/octet-stream';
const size = Math.floor(b64.length * 3 / 4);

const json = { file_name: fileName, ext: b64 ? ext : 'missing', mime: mime, size: size, source: body.source || 'upload' };
if (size > 15 * 1024 * 1024) json.ext = 'too_big';
if (json.ext === 'pdf') json.b64 = b64; // kept for the OCR fallback
const binary = b64 ? { data: { data: b64, mimeType: mime, fileName: fileName, fileExtension: ext } } : {};
return [{ json: json, binary: binary }];
