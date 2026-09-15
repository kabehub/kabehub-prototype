const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

const webSidebar = read("components/Sidebar.tsx");
const mobileSidebar = read("apps/mobile/components/Sidebar.tsx");
const webPage = read("app/page.tsx");
const mobilePage = read("apps/mobile/app/chat/page.tsx");
const novelSettingsPane = read("components/NovelSettingsPane.tsx");
const chatPanel = read("components/ChatPanel.tsx");

assert.doesNotMatch(webSidebar, /getUniqueFolderNames|existingFolders/);
assert.match(webSidebar, /function FolderPopover[\s\S]*?useState\(""\)/);
assert.match(webSidebar, /const trimmed = inputValue\.trim\(\);\s*if \(trimmed === ""\) return;/);
assert.match(webSidebar, /disabled=\{inputValue\.trim\(\) === ""\}/);
assert.match(webSidebar, /fetch\("\/api\/projects", \{[\s\S]*?method: "POST"/);
assert.match(webSidebar, /await onAssign\(data\.project_id\)/);
assert.match(webSidebar, /\{projectId && onNewThreadInFolder && \(/);
assert.match(webSidebar, /\{projectId && onEditProjectSettings && \(/);
assert.match(webSidebar, /\/api\/project-settings\?project_id=/);
assert.match(webSidebar, /project_id: projectSettingsModal\.projectId/);

assert.doesNotMatch(mobileSidebar, /getUniqueFolderNames|existingFolders|\bfetch\s*\(|apiClient/);
assert.match(mobileSidebar, /onCreateProject: \(name: string\) => Promise<string \| null>/);
assert.match(mobileSidebar, /function FolderPopover[\s\S]*?useState\(""\)/);
assert.match(mobileSidebar, /const trimmed = inputValue\.trim\(\);\s*if \(trimmed === ""\) return;/);
assert.match(mobileSidebar, /disabled=\{inputValue\.trim\(\) === ""\}/);
assert.match(mobileSidebar, /const projectId = await onCreateProject\(trimmed\)/);
assert.match(mobileSidebar, /await onAssign\(projectId\)/);
assert.match(mobileSidebar, /\{projectId && onNewThreadInFolder && \(/);

assert.doesNotMatch(webPage, /JSON\.stringify\(\{ folder_name:/);
assert.match(webPage, /JSON\.stringify\(\{ title: "新しい壁打ち", project_id: projectId \}\)/);
assert.match(webPage, /<NovelSettingsPane[\s\S]*?projectId=\{activeThread\?\.project_id \?\? null\}/);

assert.match(mobilePage, /apiClient\.request\("\/api\/projects", \{[\s\S]*?method: "POST"/);
assert.match(mobilePage, /onCreateProject=\{handleCreateProject\}/);
assert.doesNotMatch(mobilePage, /JSON\.stringify\(\{ folder_name:/);

assert.match(novelSettingsPane, /\/api\/lore\/chunks\?project_id=/);
assert.match(novelSettingsPane, /JSON\.stringify\(\{ projectId, chunks \}\)/);
assert.doesNotMatch(novelSettingsPane, /folderName|folder_name/);

assert.match(chatPanel, /\/api\/project-settings\?project_id=/);
assert.match(chatPanel, /\[thread\?\.project_id\]/);
assert.match(chatPanel, /フォルダの設定を継承中/);
assert.doesNotMatch(chatPanel, /フォルダ「\{thread\.folder_name\}」/);

console.log("ok - web and mobile UI use the Phase 2 project_id contract");
