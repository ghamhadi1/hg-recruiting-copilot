// Scanned / image-only PDF: send the PDF to the OpenAI vision model and ask for a transcription.
const j = $input.first().json;
const cfg = $('Config').first().json;
const b64 = $('Prepare File').first().json.b64;
return [{
  json: Object.assign({}, j, {
    openai_body: {
      model: cfg.openai_model,
      temperature: 0,
      messages: [{
        role: 'user',
        content: [
          { type: 'file', file: { filename: j.file_name, file_data: 'data:application/pdf;base64,' + b64 } },
          { type: 'text', text: 'This is a CV (resume), probably a scanned image. Transcribe ALL of its text exactly as written, ' +
            'line by line, as plain text. Do not summarise, translate or add anything. ' +
            'If the pages contain no readable CV text, reply with exactly: UNREADABLE' }
        ]
      }]
    }
  })
}];
