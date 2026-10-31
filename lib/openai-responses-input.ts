export type ResponsesImageBlock = { source: { media_type: string; data: string } };
export type ResponsesContentPart =
  | { type: "input_image"; image_url: string }
  | { type: "input_text"; text: string };
export type ResponsesInputMessage = { role: string; content: string | ResponsesContentPart[] };

export function buildResponsesInput({ systemPrompt, messages, imageBlocks = [] }: {
  systemPrompt?: string;
  messages: { role: string; content: string }[];
  imageBlocks?: ResponsesImageBlock[];
}): ResponsesInputMessage[] {
  const input: ResponsesInputMessage[] = [];
  const system = systemPrompt?.trim();
  if (system) input.push({ role: "system", content: system });
  input.push(...messages.map((message, index) => ({
    role: message.role,
    content: index === messages.length - 1 && message.role === "user" && imageBlocks.length
      ? [
          ...imageBlocks.map(image => ({ type: "input_image" as const, image_url: `data:${image.source.media_type};base64,${image.source.data}` })),
          { type: "input_text" as const, text: message.content },
        ]
      : message.content,
  })));
  return input;
}
