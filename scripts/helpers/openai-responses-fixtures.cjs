// All payloads here are synthetic, built from Rui's Phase 2a event specification.
// No measured SSE files were present. IDs, text, URLs, usage and ordering below
// are invented public examples; they are not evidence of model/API behavior.
const usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 30, cache_write_tokens: 10 } };
const annotation = { type: 'url_citation', url: 'https://www.example.com/page?utm_source=openai', title: 'Public example' };
const delta = (text = '回答 日本語', item_id = 'message-one', content_index = 0) => ({ type: 'response.output_text.delta', delta: text, item_id, content_index });
const search = (phase = 'in_progress') => ({ type: `response.web_search_call.${phase}` });
const added = (value = annotation) => ({ type: 'response.output_text.annotation.added', annotation: value });
const output = (annotations = [annotation]) => [
  { type: 'reasoning', summary: [{ text: 'PRIVATE_REASONING' }] },
  { type: 'web_search_call', action: { sources: [{ url: 'https://uncited.example/', title: 'PRIVATE_UNCITED' }] } },
  { type: 'message', content: [{ type: 'output_text', text: 'FINAL_TEXT_MUST_NOT_REPLACE_DELTAS', annotations }] },
];
const terminal = (kind = 'completed', reason, extra = {}) => ({ type: `response.${kind}`, response: { usage, output: output(), ...(reason ? { incomplete_details: { reason } } : {}), ...extra } });
const answer = () => [search(), { type: 'response.output_item.added', item: { type: 'reasoning' } }, delta(), added(), terminal()];
module.exports = { usage, annotation, delta, search, added, output, terminal, answer };
