// "Request changes" opens a small form in Slack where the recruiter types what to fix.
const a = $input.first().json;
return [{ json: { body: {
  trigger_id: a.trigger_id,
  view: {
    type: 'modal', callback_id: 'jd_feedback',
    private_metadata: JSON.stringify({ role_id: a.role_id }),
    title: { type: 'plain_text', text: 'Request JD changes' },
    submit: { type: 'plain_text', text: 'Rewrite JD' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [{
      type: 'input', block_id: 'feedback_block',
      label: { type: 'plain_text', text: 'What should change?' },
      element: { type: 'plain_text_input', action_id: 'feedback', multiline: true,
        placeholder: { type: 'plain_text', text: 'e.g. Make Arabic a must-have. Budget is $2,000-2,600.' } }
    }]
  }
} } }];
