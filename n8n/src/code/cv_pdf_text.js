// Output of "Extract from File (PDF)". A broken PDF arrives here as an error item (node continues on error).
const j = $input.first().json || {};
const err = j.error ? (j.error.message || String(j.error)) : '';
return [{ json: { text: j.text || '', method: 'text', reason: err ? 'PDF could not be opened: ' + err.slice(0, 150) : '' } }];
