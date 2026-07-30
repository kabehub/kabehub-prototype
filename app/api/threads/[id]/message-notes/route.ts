import { createThreadResourceHandlers } from "@/lib/threadResourceCrud";

const handlers = createThreadResourceHandlers({
  table: "message_notes",
  orderBy: { column: "created_at", ascending: true },
  addExplicitUserFilterOnGet: false,
  buildInsert: ({ threadId, userId, body }) => ({
    ok: true,
    payload: {
      message_id: body.messageId,
      thread_id: threadId,
      content: body.content,
      user_id: userId,
    },
  }),
});
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
