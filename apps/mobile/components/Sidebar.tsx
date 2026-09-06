"use client";

import type { User } from "@supabase/supabase-js";
import type { Thread } from "@kabehub/shared";

export interface SidebarProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void | Promise<void>;
  onSearch: (
    query: string,
    target: "title" | "message" | "both"
  ) => void | Promise<void>;
  isSearching: boolean;
  user: User;
  onLogout: () => void | Promise<void>;
  onUpdateFolder: (
    threadId: string,
    folderName: string | null
  ) => void | Promise<void>;
  onNewThreadInFolder: (folderName: string) => void | Promise<void>;
  isMobileOverlay?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar(_props: SidebarProps) {
  return (
    <aside className="chat-stub-sidebar" aria-label="会話一覧">
      会話一覧は14-Bで実装されます
    </aside>
  );
}
