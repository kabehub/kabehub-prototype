export type TopicFileHeader = {
  version: "v1";
  topicId: string;
  topicKey: string;
  revision: number;
};

export type DecodedTopicFile =
  | { hasHeader: true; topicId: string; topicKey: string; revision: number; contentMd: string }
  | { hasHeader: false; contentMd: string };

export class TopicFileHeaderError extends Error {}

export function encodeTopicFile(topic: { id: string; topic_key: string; revision: number; content_md: string }): string {
  return `<!-- kabehub-topic:v1 ${JSON.stringify({ topic_id: topic.id, topic_key: topic.topic_key, revision: topic.revision })} -->\n${topic.content_md}`;
}

export function decodeTopicFile(raw: string): DecodedTopicFile {
  const input = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const newline = input.indexOf("\n");
  const firstLine = (newline < 0 ? input : input.slice(0, newline)).replace(/\r$/, "");
  if (!firstLine.startsWith("<!-- kabehub-topic:")) return { hasHeader: false, contentMd: input };

  const match = /^<!-- kabehub-topic:v1 (\{.*\}) -->$/.exec(firstLine);
  if (!match || newline < 0) throw new TopicFileHeaderError("Invalid topic file header");
  let header: unknown;
  try {
    header = JSON.parse(match[1]);
  } catch {
    throw new TopicFileHeaderError("Invalid topic file header");
  }
  if (!header || typeof header !== "object") throw new TopicFileHeaderError("Invalid topic file header");
  const fields = header as Record<string, unknown>;
  if (typeof fields.topic_id !== "string" || !fields.topic_id.trim() ||
      typeof fields.topic_key !== "string" || !fields.topic_key.trim() ||
      typeof fields.revision !== "number" || !Number.isSafeInteger(fields.revision) || fields.revision <= 0) {
    throw new TopicFileHeaderError("Invalid topic file header");
  }
  return { hasHeader: true, topicId: fields.topic_id, topicKey: fields.topic_key, revision: fields.revision, contentMd: input.slice(newline + 1) };
}

export function deriveTopicKeyFromFilename(filename: string): string {
  return filename.trim().replace(/\.(?:md|txt)$/i, "").trim();
}
