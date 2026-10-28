// Anything that is not PDF/DOCX ends up here and is flagged (never silently skipped).
const f = $('Prepare File').first().json;
const why = {
  missing: 'The upload contained no file data',
  too_big: 'File is larger than 15 MB'
}[f.ext] || ('Unsupported file type ".' + (f.ext || '?') + '" (send PDF or DOCX)');
return [{ json: { text: '', method: 'none', reason: why } }];
