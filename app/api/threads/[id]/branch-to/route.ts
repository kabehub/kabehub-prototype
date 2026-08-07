import { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { requireRouteUser } from '@/lib/supabase/route-auth'
import {
  buildChainBlocksByRootAnchor,
  buildCurrentLaneKeyByBranchRootId,
  buildMessageById,
  compareMessagesForDisplay,
} from '@/lib/branching'
import { Message } from '@/types'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req)
  if (!auth.ok) return auth.response
  const { user, supabase, finalizeJson } = auth

  const { anchorMessageId } = await req.json().catch(() => ({ anchorMessageId: null }))
  if (!anchorMessageId || typeof anchorMessageId !== 'string') {
    return finalizeJson({ error: 'anchorMessageId is required' }, { status: 400 })
  }

  const sourceThreadId = params.id

  // このAPIは本人所有スレッド専用。公開スレッドの複製は /api/share/[token]/fork を使うこと
  const { data: sourceThread, error: threadError } = await supabase
    .from('threads')
    .select('*')
    .eq('id', sourceThreadId)
    .eq('user_id', user.id)
    .single()

  if (threadError || !sourceThread) {
    return finalizeJson({ error: 'Thread not found' }, { status: 404 })
  }

  const { data: sourceMessages, error: messagesError } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', sourceThreadId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (messagesError) {
    return finalizeJson({ error: 'Failed to fetch messages' }, { status: 500 })
  }

  const orderedMessages = [...((sourceMessages ?? []) as Message[])].sort(compareMessagesForDisplay)
  const messageById = buildMessageById(orderedMessages)
  const dbActiveMessages = orderedMessages.filter((msg) => msg.is_active !== false)
  const chainBlocksByRootAnchor = buildChainBlocksByRootAnchor(orderedMessages, messageById)
  const currentLaneKeyByBranchRootId = buildCurrentLaneKeyByBranchRootId(
    chainBlocksByRootAnchor,
    orderedMessages
  )
  const visibleMessages = dbActiveMessages.filter((msg) => {
    if (!msg.branch_root_id || msg.branch_index == null) return true

    const currentLaneKey = currentLaneKeyByBranchRootId[msg.branch_root_id]
    if (!currentLaneKey) return true

    const laneKey = `${msg.branch_root_id}:${msg.branch_index}`
    return laneKey === currentLaneKey
  })

  const anchorIndex = visibleMessages.findIndex((msg) => msg.id === anchorMessageId)
  if (anchorIndex === -1) {
    return finalizeJson({ error: 'Anchor message not found' }, { status: 404 })
  }

  const targetMessages = visibleMessages
    .slice(0, anchorIndex + 1)
    .filter((msg) => msg.provider !== 'memo')

  const { data: newThread, error: newThreadError } = await supabase
    .from('threads')
    .insert({
      title: `分岐・${sourceThread.title}`,
      user_id: user.id,
      system_prompt: sourceThread.system_prompt,
      folder_name: sourceThread.folder_name,
      forked_from_id: sourceThread.id,
      roleplay_mode: false,
      rp_char_name: null,
      rp_char_icon_url: null,
    })
    .select()
    .single()

  if (newThreadError || !newThread) {
    return finalizeJson({ error: 'Failed to create thread' }, { status: 500 })
  }

  if (targetMessages.length > 0) {
    const idMap = new Map<string, string>()
    const newMessages = targetMessages.map((message, index) => {
      const newId = uuidv4()
      idMap.set(message.id, newId)

      return {
        id: newId,
        thread_id: newThread.id,
        user_id: user.id,
        role: message.role,
        content: message.content,
        provider: message.provider,
        model_id: message.model_id ?? null,
        input_tokens: (message as any).input_tokens ?? null,
        output_tokens: (message as any).output_tokens ?? null,
        is_hidden: message.is_hidden ?? false,
        parent_id: index === 0 ? null : idMap.get(targetMessages[index - 1].id) ?? null,
        branch_root_id: null,
        branch_index: null,
        branch_id: null,
        is_active: true,
        message_number: index + 1,
        skip_learning: true,
        metadata: {
          copied_from_message_id: message.id,
          copied_from_thread_id: sourceThread.id,
          copied_by: 'branch_to',
          ...(message.provider === 'image_gen' ? { image_deleted: true } : {}),
        },
      }
    })

    const { error: insertError } = await supabase
      .from('messages')
      .insert(newMessages)

    if (insertError) {
      const { error: compensationError } = await supabase
        .from('threads')
        .delete()
        .eq('id', newThread.id)
      if (compensationError) {
        console.error('[db-compensation-failed]', {
          route: 'threads-branch-to',
          operation: 'delete-created-thread',
          table: 'threads',
          errorCode: compensationError.code,
        })
      }
      return finalizeJson({ error: 'Failed to copy messages' }, { status: 500 })
    }
  }

  return finalizeJson({ thread: newThread })
}
