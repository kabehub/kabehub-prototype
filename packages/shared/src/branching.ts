import { Message } from "./types";
import { generateMessageSummary } from "./stringUtils";

export const getOrderNo = (m: Message) =>
  typeof m.message_number === "number" ? m.message_number : null;

export const compareMessagesForDisplay = (a: Message, b: Message) => {
  const aOrder = getOrderNo(a);
  const bOrder = getOrderNo(b);
  if (aOrder != null && bOrder != null && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aOrder != null && bOrder == null) return -1;
  if (aOrder == null && bOrder != null) return 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
};

export const getAnchorKey = (m: Message) => {
  const orderNo = getOrderNo(m);
  return orderNo != null ? `no:${orderNo}` : `id:${m.id}`;
};

export type ChainBlock = {
  branchRootIds: Set<string>;
  chainRootId: string;
  attachPointId: string | null;
};

export type BranchLane = {
  branchRootId: string;
  branchIndex: number;
  isCurrent: boolean;
  isOnPath: boolean;
  label: string;
};

export function buildMessageById(messages: Message[]): Record<string, Message> {
  return messages.reduce<Record<string, Message>>((acc, msg) => {
    acc[msg.id] = msg;
    return acc;
  }, {});
}

export function buildChainBlocksByRootAnchor(
  orderedMessages: Message[],
  messageById: Record<string, Message> = buildMessageById(orderedMessages)
): Record<string, ChainBlock> {
  const rootUserMessages = orderedMessages.filter(
    (msg) => msg.role === "user" && msg.branch_root_id === msg.id
  );

  return rootUserMessages.reduce<Record<string, ChainBlock>>((acc, msg) => {
    let chainRoot = msg;
    const visited = new Set<string>();

    while (chainRoot.parent_id && !visited.has(chainRoot.id)) {
      visited.add(chainRoot.id);
      const parent = messageById[chainRoot.parent_id];
      if (!parent || parent.role !== "user" || parent.branch_root_id !== parent.id) break;
      chainRoot = parent;
    }

    const chainRootAnchorKey = getAnchorKey(chainRoot);
    if (!acc[chainRootAnchorKey]) {
      acc[chainRootAnchorKey] = {
        branchRootIds: new Set<string>(),
        chainRootId: chainRoot.id,
        attachPointId: chainRoot.parent_id ?? null,
      };
    }
    acc[chainRootAnchorKey].branchRootIds.add(msg.id);
    return acc;
  }, {});
}

export function resolveCurrentLaneKey(
  chain: ChainBlock,
  orderedMessages: Message[]
): string | null {
  const activeCandidates = orderedMessages.filter((msg) =>
    msg.is_active !== false &&
    msg.role === "user" &&
    msg.provider !== "memo" &&
    msg.branch_root_id != null &&
    chain.branchRootIds.has(msg.branch_root_id) &&
    msg.branch_index != null
  );

  const currentMsg = activeCandidates.reduce<Message | null>((current, msg) => {
    if (!current) return msg;
    const currentOrder = getOrderNo(current) ?? Number.NEGATIVE_INFINITY;
    const msgOrder = getOrderNo(msg) ?? Number.NEGATIVE_INFINITY;
    if (msgOrder !== currentOrder) return msgOrder > currentOrder ? msg : current;
    return compareMessagesForDisplay(msg, current) > 0 ? msg : current;
  }, null);

  if (!currentMsg || !currentMsg.branch_root_id || currentMsg.branch_index == null) return null;
  return `${currentMsg.branch_root_id}:${currentMsg.branch_index}`;
}

export function buildCurrentLaneKeyByBranchRootId(
  chainBlocksByRootAnchor: Record<string, ChainBlock>,
  orderedMessages: Message[]
): Record<string, string | null> {
  return Object.values(chainBlocksByRootAnchor).reduce<Record<string, string | null>>(
    (acc, chain) => {
      const currentLaneKey = resolveCurrentLaneKey(chain, orderedMessages);
      if (!currentLaneKey) return acc;
      chain.branchRootIds.forEach((branchRootId) => {
        acc[branchRootId] = currentLaneKey;
      });
      return acc;
    },
    {}
  );
}

export function resolveBranchBlockAnchor(
  currentLaneKey: string,
  visibleMessages: Message[]
): Message | null {
  return visibleMessages.find((msg) =>
    msg.role === "user" &&
    msg.provider !== "memo" &&
    msg.branch_root_id != null &&
    msg.branch_index != null &&
    `${msg.branch_root_id}:${msg.branch_index}` === currentLaneKey
  ) ?? null;
}

export function buildBranchLanes(
  branchRootIds: Set<string>,
  currentLaneKey: string,
  orderedMessages: Message[],
  messageById: Record<string, Message> = buildMessageById(orderedMessages)
): BranchLane[] {
  return Array.from(branchRootIds).flatMap<BranchLane>((branchRootId) => {
    const groupsByBranchIndex = orderedMessages
      .filter((msg) => msg.branch_root_id === branchRootId && msg.branch_index != null)
      .reduce<Record<number, Message[]>>((groups, msg) => {
        const branchIndex = msg.branch_index ?? 0;
        if (!groups[branchIndex]) groups[branchIndex] = [];
        groups[branchIndex].push(msg);
        return groups;
      }, {});

    return Object.entries(groupsByBranchIndex).map<BranchLane>(([branchIndexKey, group]) => {
      const branchIndex = Number(branchIndexKey);
      const labelMsg = group.find((msg) => msg.role === "user" && msg.provider !== "memo");
      const laneKey = `${branchRootId}:${branchIndex}`;

      return {
        branchRootId,
        branchIndex,
        isCurrent: laneKey === currentLaneKey,
        isOnPath: group.some((msg) => msg.is_active !== false),
        label: labelMsg
          ? generateMessageSummary(typeof labelMsg.content === "string" ? labelMsg.content : "")
          : "(このまま継続)",
      };
    });
  }).sort((a, b) => {
    const aRoot = messageById[a.branchRootId];
    const bRoot = messageById[b.branchRootId];
    const aOrder = aRoot ? getOrderNo(aRoot) : null;
    const bOrder = bRoot ? getOrderNo(bRoot) : null;
    if (aOrder != null && bOrder != null && aOrder !== bOrder) return aOrder - bOrder;
    if (a.branchRootId !== b.branchRootId) return a.branchRootId.localeCompare(b.branchRootId);
    if (a.branchIndex !== b.branchIndex) return a.branchIndex - b.branchIndex;
    return Number(b.isCurrent) - Number(a.isCurrent);
  });
}
