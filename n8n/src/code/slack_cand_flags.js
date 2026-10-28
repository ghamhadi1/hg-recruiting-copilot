// Decides whether this click should create GHL records + start outreach (first approval only).
const d = $input.first().json;
return [{ json: Object.assign({}, d, { start: !!(d.ok && !d.already && d.decision === 'approve') }) }];
