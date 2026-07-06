package com.example.WaffleBear.chat;

import com.example.WaffleBear.config.sse.SseService;
import com.example.WaffleBear.config.stomp.ClusteredStompPublisher;
import com.example.WaffleBear.chat.model.dto.ChatMessagesDto;
import com.example.WaffleBear.feater.FeaterService;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.multipart.MultipartFile;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ChatMessageServicePermissionTest {

    @Mock
    SseService sseService;

    @Mock
    ChatMessageRepository chatMessageRepository;

    @Mock
    ChatRoomRepository chatRoomRepository;

    @Mock
    UserRepository userRepository;

    @Mock
    ParticipantsRepository participantsRepository;

    @Mock
    NotificationService notificationService;

    @Mock
    ChatRoomService chatRoomService;

    @Mock
    ClusteredStompPublisher stompPublisher;

    @Mock
    FeaterService featerService;

    @Mock
    ChatAttachmentStorageService chatAttachmentStorageService;

    @InjectMocks
    ChatMessageService chatMessageService;

    @Test
    void nonMemberCannotSendMessage() {
        when(participantsRepository.existsByChatRoomsIdxAndUsersIdx(10L, 99L)).thenReturn(false);

        assertThatThrownBy(() -> chatMessageService.saveMessage(10L, new ChatMessagesDto.Send(), 99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("접근 권한");

        verify(chatRoomRepository, never()).findByIdWithLock(10L);
    }

    @Test
    void nonMemberCannotUploadFile() {
        MultipartFile file = org.mockito.Mockito.mock(MultipartFile.class);
        when(participantsRepository.existsByChatRoomsIdxAndUsersIdx(10L, 99L)).thenReturn(false);

        assertThatThrownBy(() -> chatMessageService.uploadFile(10L, file, 99L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("접근 권한");

        verifyNoInteractions(chatAttachmentStorageService);
    }
}