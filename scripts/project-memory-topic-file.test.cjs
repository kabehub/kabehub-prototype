const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { installTsLoader } = require("./testBootstrap.cjs");

installTsLoader();
const { encodeTopicFile, decodeTopicFile, deriveTopicKeyFromFilename, TopicFileHeaderError } =
  require(path.join(__dirname, "..", "lib", "project-memory", "topic-file.ts"));

const topic = { id: "topic-1", topic_key: "overview", revision: 5, content_md: "" };

test("topic file round trips exact content including CRLF and Unicode", () => {
  for (const content of ["", "\nfirst\n", "末尾に改行\n", "日本語 😀", "line1\r\nline2\r\n", "LF\nCRLF\r\nlast"]) {
    const encoded = encodeTopicFile({ ...topic, content_md: content });
    assert.equal(encoded, `<!-- kabehub-topic:v1 {"topic_id":"topic-1","topic_key":"overview","revision":5} -->\n${content}`);
    assert.deepEqual(decodeTopicFile(encoded), { hasHeader: true, topicId: "topic-1", topicKey: "overview", revision: 5, contentMd: content });
    assert.equal(decodeTopicFile(`\uFEFF${encoded}`).contentMd, content);
  }
  assert.equal(decodeTopicFile(encodeTopicFile(topic).replace(" -->\n", " -->\r\n")).contentMd, "");
});

test("headerless file retains its content after optional leading BOM", () => {
  assert.deepEqual(decodeTopicFile("plain\r\ntext"), { hasHeader: false, contentMd: "plain\r\ntext" });
  assert.deepEqual(decodeTopicFile("\uFEFFplain\r\ntext"), { hasHeader: false, contentMd: "plain\r\ntext" });
});

test("broken topic headers fail closed", () => {
  const headers = [
    "<!-- kabehub-topic:v1 {broken} -->",
    '<!-- kabehub-topic:v2 {"topic_id":"a","topic_key":"b","revision":1} -->',
    ...["topic_id", "topic_key"].map((field) => `<!-- kabehub-topic:v1 ${JSON.stringify({ topic_id: "a", topic_key: "b", revision: 1, [field]: "" })} -->`),
    ...[0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1].map((revision) => `<!-- kabehub-topic:v1 ${JSON.stringify({ topic_id: "a", topic_key: "b", revision })} -->`),
  ];
  for (const header of headers) assert.throws(() => decodeTopicFile(`${header}\ncontent`), TopicFileHeaderError);
  assert.throws(() => decodeTopicFile("<!-- kabehub-topic:v1 broken -->\ncontent"), TopicFileHeaderError);
  assert.throws(() => decodeTopicFile("<!-- kabehub-topic:v1 {} -->"), TopicFileHeaderError);
  assert.throws(() => decodeTopicFile('<!-- kabehub-topic:v1 {"topic_id":"a","topic_key":"b","revision":1} -->'), TopicFileHeaderError);
});

test("filename derives a trimmed topic key", () => {
  assert.equal(deriveTopicKeyFromFilename(" overview.md"), "overview");
  assert.equal(deriveTopicKeyFromFilename("notes.TXT "), "notes");
  assert.equal(deriveTopicKeyFromFilename("notes.txt"), "notes");
  assert.equal(deriveTopicKeyFromFilename("   "), "");
});
