"use client";

import type { KeyboardEvent } from "react";

export type ProjectSettingsTab = "instructions" | "reference" | "memory";

const tabs: { id: ProjectSettingsTab; label: string }[] = [
  { id: "instructions", label: "指示" },
  { id: "reference", label: "参照" },
  { id: "memory", label: "Memory" },
];

interface ProjectSettingsTabsProps {
  activeTab: ProjectSettingsTab;
  onChange: (tab: ProjectSettingsTab) => void;
}

export default function ProjectSettingsTabs({ activeTab, onChange }: ProjectSettingsTabsProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft": nextIndex = (index + tabs.length - 1) % tabs.length; break;
      case "ArrowRight": nextIndex = (index + 1) % tabs.length; break;
      case "Home": nextIndex = 0; break;
      case "End": nextIndex = tabs.length - 1; break;
      default: return;
    }
    event.preventDefault();
    const nextTab = tabs[nextIndex].id;
    onChange(nextTab);
    document.getElementById(`project-settings-tab-${nextTab}`)?.focus();
  };

  return (
    <div role="tablist" aria-label="Project設定" style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", marginBottom: "16px" }}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`project-settings-tab-${tab.id}`}
          aria-selected={activeTab === tab.id}
          aria-controls={`project-settings-panel-${tab.id}`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          style={{ padding: "8px 12px", border: "none", borderBottom: `2px solid ${activeTab === tab.id ? "#7c3aed" : "transparent"}`, background: "none", color: activeTab === tab.id ? "#7c3aed" : "var(--ink-muted)", fontSize: "13px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
