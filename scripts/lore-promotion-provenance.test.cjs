const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { installTsLoader } = require("./testBootstrap.cjs");
installTsLoader();
const { parsePromotionMetadata, formatProvenanceLabel, loreCardElementId, parseLoreHash, getLorePromotionPresentation } = require(path.join(__dirname, "..", "lib", "lore", "promotion-provenance.ts"));

const metadata = { source_topic_id: "11111111-1111-4111-8111-111111111111", source_project_id: "22222222-2222-4222-8222-222222222222", source_topic_key: "topic", source_revision: 3 };
const provenance = { lore_id: "abc", ...metadata, project_name: "Project" };

test("promotion metadata validates all contract fields", () => {
  assert.deepEqual(parsePromotionMetadata(metadata), metadata);
  assert.deepEqual(parsePromotionMetadata({ ...metadata, source_topic_id: metadata.source_topic_id.toUpperCase() }), { ...metadata, source_topic_id: metadata.source_topic_id.toUpperCase() });
  for (const key of Object.keys(metadata)) {
    const missing = { ...metadata }; delete missing[key];
    assert.equal(parsePromotionMetadata(missing), null, key);
  }
  for (const key of ["source_topic_id", "source_project_id", "source_topic_key", "source_revision"]) {
    assert.equal(parsePromotionMetadata({ ...metadata, [key]: {} }), null, key);
  }
  for (const key of ["source_topic_id", "source_project_id"]) assert.equal(parsePromotionMetadata({ ...metadata, [key]: "bad" }), null);
  assert.equal(parsePromotionMetadata({ ...metadata, source_topic_key: "   " }), null);
  for (const value of [0, -1, 1.5, "3", NaN]) assert.equal(parsePromotionMetadata({ ...metadata, source_revision: value }), null);
  for (const value of [null, [], "text"]) assert.equal(parsePromotionMetadata(value), null);
});

test("labels, hashes and badge presentation", () => {
  assert.equal(formatProvenanceLabel(provenance), "Project / topic rev.3");
  assert.equal(formatProvenanceLabel({ ...provenance, project_name: null }), "削除済みProject / topic rev.3");
  assert.equal(loreCardElementId("abc"), "lore-abc");
  assert.equal(parseLoreHash("#lore-abc%201"), "abc 1");
  for (const hash of ["", "#lore-", "#lore-%GG", "#other-abc"]) assert.equal(parseLoreHash(hash), null);
  assert.deepEqual(getLorePromotionPresentation({ sourceMessageId: null, extractionVersion: null, provenance }), { showManualAdded: false, showEdited: false, provenanceLabel: "Project / topic rev.3" });
  assert.equal(getLorePromotionPresentation({ sourceMessageId: null, extractionVersion: "user_edited", provenance }).showEdited, true);
  assert.deepEqual(getLorePromotionPresentation({ sourceMessageId: null, extractionVersion: "user_edited" }), { showManualAdded: true, showEdited: false, provenanceLabel: null });
  assert.equal(getLorePromotionPresentation({ sourceMessageId: "message", extractionVersion: null }).showManualAdded, false);
});
