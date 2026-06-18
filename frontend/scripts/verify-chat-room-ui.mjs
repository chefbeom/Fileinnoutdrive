import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const chat = readFileSync(new URL('../src/components/Chat.vue', import.meta.url), 'utf8')
const room = readFileSync(new URL('../src/components/ChatRoom.vue', import.meta.url), 'utf8')

assert.match(chat, /const chatRoomRefreshKey = ref\(0\)/, 'chat parent must track a refresh key for active room participant sync')
assert.match(chat, /chatRoomRefreshKey\.value \+= 1/, 'chat parent must refresh the active room after create or invite completion')
assert.match(chat, /:participants-refresh-key="chatRoomRefreshKey"/, 'chat parent must pass participant refresh key to ChatRoom')
assert.match(chat, /@open-invite="handleInviteFromHeader"/, 'ChatRoom invite event must open the existing invite modal')

assert.match(room, /participantsRefreshKey/, 'ChatRoom must accept participant refresh signals')
assert.match(room, /api\.get\(`\/chatRoom\/\$\{props\.room\.id\}\/participants`\)/, 'ChatRoom must fetch invited participants for the active room')
assert.match(room, /const openParticipantsPanel = async \(\) =>/, 'ChatRoom must expose the participant panel')
assert.match(room, /\$emit\('open-invite'\)/, 'ChatRoom must emit invite actions to the parent modal')

assert.match(room, /const getReadersForMessage = \(message = \{\}\) =>/, 'ChatRoom must compute read people per message')
assert.match(room, /lastReadMessageId/, 'ChatRoom must use participant lastReadMessageId for read state')
assert.match(room, /updateParticipantReadState\(data\.userIdx, data\.lastReadMessageId\)/, 'READ_UPDATE events must update participant read state')
assert.match(room, /const getMessageUnreadCount = \(message = \{\}\) =>/, 'ChatRoom must compute unread counts from participant state')

assert.match(room, /const shouldShowDateDivider = \(index\) =>/, 'ChatRoom must render date separators for message history')
assert.match(room, /formatMessageDate\(msg\.time\)/, 'ChatRoom date separator must render a localized message date')
assert.match(room, /formatTime\(msg\.time\)/, 'ChatRoom must render message-level timestamps')

console.log('chat room UI verification passed')
