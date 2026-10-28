// Posts the search answer back to the channel where /find was typed.
const cmd = $('Verify Command').first().json;
const r = $input.first().json || {};
let body;
if (r.error || !r.ok) {
  body = { response_type: 'ephemeral', replace_original: false,
    text: '⚠️ Search failed: ' + String((r.error && (r.error.message || r.error)) || 'unknown error').slice(0, 300) };
} else {
  body = { response_type: 'in_channel', replace_original: false, text: r.text, blocks: r.blocks };
}
return [{ json: { url: cmd.response_url, body: body } }];
