package com.example.WaffleBear.chat;

import com.example.WaffleBear.chat.model.entity.ChatRooms;
import com.example.WaffleBear.config.stomp.ClusteredStompPublisher;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatRoomServicePermissionTest {

    @Mock
    ChatRoomRepository chatRoomRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    ParticipantsRepository participantsRepository;

    @Mock
    ChatMessageRepository chatMessageRepository;

    @Mock
    ClusteredStompPublisher stompPublisher;

    @Mock
    ChatPresenceService chatPresenceService;

    @Mock
    ChatListCacheService chatListCacheService;

    @InjectMocks
    ChatRoomService chatRoomService;

    @Test
    void nonMemberCannotInviteUsersByEmail() {
        ChatRooms room = ChatRooms.builder()
                .idx(10L)
                .title("Project Room")
                .build();

        when(chatRoomRepository.findById(10L)).thenReturn(Optional.of(room));
        when(participantsRepository.existsByChatRoomsIdxAndUsersIdx(10L, 99L)).thenReturn(false);

        assertThatThrownBy(() -> chatRoomService.inviteUsersByEmail(
                10L,
                99L,
                List.of("target@example.com")
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("접근 권한");

        verify(userRepository, never()).findAllByEmailIn(any());
    }

    @Test
    void nonMemberCannotExitChatRoom() {
        when(participantsRepository.existsByChatRoomsIdxAndUsersIdx(10L, 99L)).thenReturn(false);

        assertThatThrownBy(() -> chatRoomService.exit(10L, 99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("접근 권한");

        verify(participantsRepository, never()).deleteByChatRoomsIdxAndUsersIdx(10L, 99L);
        verify(chatRoomRepository, never()).deleteById(10L);
        verify(stompPublisher, never()).send(any(), any());
    }
}