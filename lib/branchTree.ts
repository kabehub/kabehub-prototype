import { Message } from "@/types";
import {
  buildChainBlocksByRootAnchor,
  buildMessageById,
  compareMessagesForDisplay,
} from "@/lib/branching";

export const SYNTHETIC_ROOT_ID = "__root__";

export type DisplayParentIdMap = Record<string, string | null>;
export type ChildrenOfMap = Record<string, Message[]>;

export type TreeNodeLayout = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  message: Message;
  isCurrentLane: boolean;
  isCommon: boolean;
};

export type TreeEdge = {
  fromId: string;
  toId: string;
};

const isTreeMessage = (msg: Message) => msg.provider !== "memo";

const normalizeParentId = (
  parentId: string | null | undefined,
  messageById: Record<string, Message>
) => {
  if (!parentId) return SYNTHETIC_ROOT_ID;
  const parent = messageById[parentId];
  if (!parent || !isTreeMessage(parent)) return SYNTHETIC_ROOT_ID;
  return parentId;
};

export function getTreeMessages(messages: Message[]): Message[] {
  return messages.filter(isTreeMessage).sort(compareMessagesForDisplay);
}

export function buildDisplayParentIdMap(messages: Message[]): DisplayParentIdMap {
  const treeMessages = getTreeMessages(messages);
  const messageById = buildMessageById(treeMessages);
  const displayParentIdById = treeMessages.reduce<DisplayParentIdMap>((acc, msg) => {
    acc[msg.id] = normalizeParentId(msg.parent_id, messageById);
    return acc;
  }, {});

  const chainBlocksByRootAnchor = buildChainBlocksByRootAnchor(treeMessages, messageById);

  Object.values(chainBlocksByRootAnchor).forEach((chain) => {
    const attachPointId = normalizeParentId(chain.attachPointId, messageById);

    chain.branchRootIds.forEach((branchRootId) => {
      const groupsByBranchIndex = treeMessages
        .filter((msg) => msg.branch_root_id === branchRootId && msg.branch_index != null)
        .reduce<Record<number, Message[]>>((acc, msg) => {
          const branchIndex = msg.branch_index ?? 0;
          if (!acc[branchIndex]) acc[branchIndex] = [];
          acc[branchIndex].push(msg);
          return acc;
        }, {});

      Object.values(groupsByBranchIndex).forEach((laneMessages) => {
        const laneHead = [...laneMessages].sort(compareMessagesForDisplay)[0];
        if (laneHead) {
          displayParentIdById[laneHead.id] = attachPointId;
        }
      });
    });
  });

  return displayParentIdById;
}

export function buildChildrenOf(
  messages: Message[],
  displayParentIdById: DisplayParentIdMap = buildDisplayParentIdMap(messages)
): ChildrenOfMap {
  const treeMessages = getTreeMessages(messages);
  const childrenOf = treeMessages.reduce<ChildrenOfMap>((acc, msg) => {
    const parentId = displayParentIdById[msg.id] ?? SYNTHETIC_ROOT_ID;
    if (!acc[parentId]) acc[parentId] = [];
    acc[parentId].push(msg);
    return acc;
  }, {});

  Object.values(childrenOf).forEach((children) => {
    children.sort(compareMessagesForDisplay);
  });

  return childrenOf;
}

export function computeTreeLayout(
  messages: Message[],
  currentLaneKeyByBranchRootId: Record<string, string | null>
): { nodes: TreeNodeLayout[]; edges: TreeEdge[] } {
  const treeMessages = getTreeMessages(messages);
  const messageById = buildMessageById(treeMessages);
  const displayParentIdById = buildDisplayParentIdMap(treeMessages);
  const childrenOf = buildChildrenOf(treeMessages, displayParentIdById);
  const chainBlocksByRootAnchor = buildChainBlocksByRootAnchor(treeMessages, messageById);
  const branchRootIdsInChains = new Set<string>();
  Object.values(chainBlocksByRootAnchor).forEach((chain) => {
    chain.branchRootIds.forEach((branchRootId) => branchRootIdsInChains.add(branchRootId));
  });

  const widthMemo = new Map<string, number>();
  const width = (id: string, visited: Set<string> = new Set()): number => {
    if (widthMemo.has(id)) return widthMemo.get(id) ?? 1;
    if (visited.has(id)) return 1;
    visited.add(id);

    const children = childrenOf[id] ?? [];
    const result = children.length === 0
      ? 1
      : children.length === 1
        ? width(children[0].id, new Set(visited))
        : children.reduce((sum, child) => sum + width(child.id, new Set(visited)), 0);

    widthMemo.set(id, result);
    return result;
  };

  const nodes: TreeNodeLayout[] = [];
  const edges: TreeEdge[] = [];
  const placed = new Set<string>();

  const placeNode = (
    msg: Message,
    centerX: number,
    depth: number,
    visited: Set<string> = new Set()
  ) => {
    if (visited.has(msg.id) || placed.has(msg.id)) return;
    visited.add(msg.id);
    placed.add(msg.id);

    const branchRootId = msg.branch_root_id ?? null;
    const laneKey = branchRootId != null && msg.branch_index != null
      ? `${branchRootId}:${msg.branch_index}`
      : null;
    const currentLaneKey = branchRootId != null
      ? currentLaneKeyByBranchRootId[branchRootId]
      : null;
    const isCommon = !branchRootId || !branchRootIdsInChains.has(branchRootId);

    nodes.push({
      id: msg.id,
      x: centerX,
      y: depth,
      width: width(msg.id),
      depth,
      message: msg,
      isCurrentLane: !!laneKey && laneKey === currentLaneKey,
      isCommon,
    });

    const children = childrenOf[msg.id] ?? [];
    if (children.length === 0) return;
    if (children.length === 1) {
      const child = children[0];
      edges.push({ fromId: msg.id, toId: child.id });
      placeNode(child, centerX, depth + 1, new Set(visited));
      return;
    }

    let cursor = centerX - width(msg.id) / 2;
    children.forEach((child) => {
      const childWidth = width(child.id);
      const childCenterX = cursor + childWidth / 2;
      edges.push({ fromId: msg.id, toId: child.id });
      placeNode(child, childCenterX, depth + 1, new Set(visited));
      cursor += childWidth;
    });
  };

  const roots = childrenOf[SYNTHETIC_ROOT_ID] ?? [];
  let cursor = 0;
  roots.forEach((root) => {
    const rootWidth = width(root.id);
    placeNode(root, cursor + rootWidth / 2, 0);
    cursor += rootWidth;
  });

  nodes.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.x !== b.x) return a.x - b.x;
    return compareMessagesForDisplay(a.message, b.message);
  });

  edges.sort((a, b) => {
    const aTo = messageById[a.toId];
    const bTo = messageById[b.toId];
    if (aTo && bTo) return compareMessagesForDisplay(aTo, bTo);
    return a.toId.localeCompare(b.toId);
  });

  return { nodes, edges };
}
