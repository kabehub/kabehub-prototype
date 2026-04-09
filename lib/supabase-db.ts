import { SupabaseClient } from "@supabase/supabase-js";
import { Thread, Message, ThreadNote, MessageNote, Draft } from "@/types";

// ── Thread CRUD ──────────────────────────────────────────────
export async function getThreads(supabase: SupabaseClient, userId: string): Promise<Thread[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function getThread(supabase: SupabaseClient, id: string): Promise<Thread | null> {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function createThread(
  supabase: SupabaseClient,
  id: string,
  firstMessage: string,
  userId: string
): Promise<Thread> {
  const title = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? "…" : "");
  const { data, error } = await supabase
    .from("threads")
    .insert({ id, title, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteThread(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("threads").delete().eq("id", id);
  if (error) throw error;
}

// ── Message CRUD ─────────────────────────────────────────────
export async function getMessages(supabase: SupabaseClient, threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addMessage(
  supabase: SupabaseClient,
  message: Message,
  userId: string
): Promise<Message> {
  const { id, thread_id, role, content, provider } = message;
  const { data, error } = await supabase
    .from("messages")
    .insert({ id, thread_id, role, content, provider, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── ThreadNote CRUD ──────────────────────────────────────────
export async function getNotes(supabase: SupabaseClient, threadId: string): Promise<ThreadNote[]> {
  const { data, error } = await supabase
    .from("thread_notes")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addNote(
  supabase: SupabaseClient,
  threadId: string,
  content: string,
  userId: string
): Promise<ThreadNote> {
  const { data, error } = await supabase
    .from("thread_notes")
    .insert({ thread_id: threadId, content, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(
  supabase: SupabaseClient,
  id: string,
  content: string
): Promise<ThreadNote> {
  const { data, error } = await supabase
    .from("thread_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("thread_notes").delete().eq("id", id);
  if (error) throw error;
}

// ── MessageNote CRUD ─────────────────────────────────────────
export async function getMessageNotes(supabase: SupabaseClient, threadId: string): Promise<MessageNote[]> {
  const { data, error } = await supabase
    .from("message_notes")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addMessageNote(
  supabase: SupabaseClient,
  messageId: string,
  threadId: string,
  content: string,
  userId: string
): Promise<MessageNote> {
  const { data, error } = await supabase
    .from("message_notes")
    .insert({ message_id: messageId, thread_id: threadId, content, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMessageNote(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("message_notes").delete().eq("id", id);
  if (error) throw error;
}

// ── Draft CRUD ───────────────────────────────────────────────
export async function getDrafts(supabase: SupabaseClient, threadId: string): Promise<Draft[]> {
  const { data, error } = await supabase
    .from("drafts")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addDraft(
  supabase: SupabaseClient,
  threadId: string,
  content: string,
  userId: string
): Promise<Draft> {
  const { data, error } = await supabase
    .from("drafts")
    .insert({ thread_id: threadId, content, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDraft(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("drafts").delete().eq("id", id);
  if (error) throw error;
}