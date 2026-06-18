package com.example.WaffleBear.chat.model.dto;

import com.example.WaffleBear.chat.model.entity.ChatParticipants;
import com.example.WaffleBear.user.model.User;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class ChatParticipantsDtoTest {

    @Test
    void responseIncludesParticipantIdentityAndReadState() {
        LocalDateTime joinedAt = LocalDateTime.of(2026, 6, 18, 14, 30);
        User user = User.builder()
                .idx(7L)
                .name("김관리")
                .email("admin@fileinnout.local")
                .build();

        ChatParticipants participant = ChatParticipants.builder()
                .idx(11L)
                .users(user)
                .customRoomName("운영 채팅")
                .joinedAt(joinedAt)
                .lastReadMessageId(42L)
                .isFavorite(true)
                .build();

        ChatParticipantsDto.Response response = ChatParticipantsDto.Response.from(participant, 7L);

        assertThat(response.getId()).isEqualTo(11L);
        assertThat(response.getUserIdx()).isEqualTo(7L);
        assertThat(response.getNickname()).isEqualTo("김관리");
        assertThat(response.getEmail()).isEqualTo("admin@fileinnout.local");
        assertThat(response.getCustomRoomName()).isEqualTo("운영 채팅");
        assertThat(response.getJoinedAt()).isEqualTo(joinedAt);
        assertThat(response.getLastReadMessageId()).isEqualTo(42L);
        assertThat(response.isFavorite()).isTrue();
        assertThat(response.isMe()).isTrue();
    }

    @Test
    void responseMarksOtherParticipantsAsNotMe() {
        User user = User.builder()
                .idx(8L)
                .name("초대사용자")
                .email("guest@fileinnout.local")
                .build();

        ChatParticipants participant = ChatParticipants.builder()
                .idx(12L)
                .users(user)
                .lastReadMessageId(0L)
                .build();

        ChatParticipantsDto.Response response = ChatParticipantsDto.Response.from(participant, 7L);

        assertThat(response.getUserIdx()).isEqualTo(8L);
        assertThat(response.getLastReadMessageId()).isZero();
        assertThat(response.isMe()).isFalse();
    }
}
