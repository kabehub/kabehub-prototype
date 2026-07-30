import { v4 as uuidv4 } from "uuid";
import { createThreadResourceHandlers } from "@/lib/threadResourceCrud";

const handlers = createThreadResourceHandlers({
  table: "drafts",
  orderBy: { column: "created_at", ascending: false },
  addExplicitUserFilterOnGet: true,
  buildInsert: ({ threadId, userId, body }) => {
    if (!body.content?.trim()) {
      return { ok: false, error: "Content is required" };
    }
    return {
      ok: true,
      payload: {
        id: uuidv4(),
        thread_id: threadId,
        user_id: userId,
        content: body.content.trim(),
      },
    };
  },
});
export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
