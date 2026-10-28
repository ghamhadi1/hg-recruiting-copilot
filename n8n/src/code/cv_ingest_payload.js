// Joins chunks with their embeddings into one payload for hg_ingest_cv (dedup + replace logic lives in SQL).
const prev = $('Profile & Chunks').first().json;
const emb = $input.first().json;
const vectors = (emb.data || []).slice().sort((a, b) => a.index - b.index).map(d => d.embedding);
if (vectors.length !== prev.chunks.length) {
  throw new Error('Embedding count mismatch for ' + prev.file_name + ': ' + JSON.stringify(emb).slice(0, 200));
}
return [{
  json: {
    p: {
      file_name: prev.file_name,
      file_type: prev.ext,
      raw_text: prev.text,
      extraction_method: prev.method,
      profile: prev.profile,
      chunks: prev.chunks.map((c, i) => ({ content: c, embedding: vectors[i] }))
    }
  }
}];
