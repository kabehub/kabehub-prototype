import { supabase } from "./supabase";
import { Thread, Message, ThreadNote, MessageNote, Draft } from "@/types";
// ── Thread CRUD ──────────────────────────────────────────────
export async function getThreads(): Promise<Thread[]> {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getThread(id: string): Promise<Thread | null> {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data;
}

export async function createThread(id: string, firstMessage: string): Promise<Thread> {
  const title = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? "…" : "");
  const { data, error } = await supabase
    .from("threads")
    .insert({ id, title })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteThread(id: string): Promise<void> {
  const { error } = await supabase.from("threads").delete().eq("id", id);
  if (error) throw error;
}

// ── Message CRUD ─────────────────────────────────────────────
export async function getMessages(threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addMessage(message: Message): Promise<Message> {
  const { id, thread_id, role, content, provider } = message;  // ← provider追加
  const { data, error } = await supabase
    .from("messages")
    .insert({ id, thread_id, role, content, provider })  // ← provider追加
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── ThreadNote CRUD ──────────────────────────────────────────
export async function getNotes(threadId: string): Promise<ThreadNote[]> {
  const { data, error } = await supabase
    .from("thread_notes")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addNote(threadId: string, content: string): Promise<ThreadNote> {
  const { data, error } = await supabase
    .from("thread_notes")
    .insert({ thread_id: threadId, content })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(id: string, content: string): Promise<ThreadNote> {
  const { data, error } = await supabase
    .from("thread_notes")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase
    .from("thread_notes")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── MessageNote CRUD ─────────────────────────────────────────
export async function getMessageNotes(threadId: string): Promise<MessageNote[]> {
  const { data, error } = await supabase
    .from("message_notes")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addMessageNote(messageId: string, threadId: string, content: string): Promise<MessageNote> {
  const { data, error } = await supabase
    .from("message_notes")
    .insert({ message_id: messageId, thread_id: threadId, content })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMessageNote(id: string): Promise<void> {
  const { error } = await supabase
    .from("message_notes")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ── Draft CRUD ───────────────────────────────────────────────
export async function getDrafts(threadId: string): Promise<Draft[]> {
  const { data, error } = await supabase
    .from("drafts")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addDraft(threadId: string, content: string): Promise<Draft> {
  const { data, error } = await supabase
    .from("drafts")
    .insert({ thread_id: threadId, content })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase
    .from("drafts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}