package com.example.WaffleBear.chat.model.dto;

import com.example.WaffleBear.chat.model.entity.ChatParticipants;
import com.example.WaffleBear.chat.model.entity.ChatRooms;
import com.example.WaffleBear.user.model.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;

import java.time.LocalDateTime;

public class ChatParticipantsDto {
    @Getter
    @Builder
    @AllArgsConstructor
    public static class Response {
        private Long id;
        private Long userIdx;
        private String nickname;
        private String email;
        private String customRoomName;
        private LocalDateTime joinedAt;
        private Long lastReadMessageId;
        private boolean isFavorite;
        private boolean isMe;

        // Entity -> DTO 변환
        public static Response from(ChatParticipants participant) {
            return from(participant, null);
        }

        public static Response from(ChatParticipants participant, Long currentUserIdx) {
            Long userIdx = participant.getUsers().getIdx();
            return Response.builder()
                    .id(participant.getIdx())
                    .userIdx(userIdx) // User 엔티티의 ID
                    .nickname(participant.getUsers().getName())
                    .email(participant.getUsers().getEmail())
                    .customRoomName(participant.getCustomRoomName())
                    .joinedAt(participant.getJoinedAt())
                    .lastReadMessageId(participant.getLastReadMessageId())
                    .isFavorite(participant.isFavorite())
                    .isMe(currentUserIdx != null && currentUserIdx.equals(userIdx))
                    .build();
        }
    }

    public static class Create {
        public static ChatParticipants toEntity(ChatRooms room, User user) {
            return ChatParticipants.builder()
                    .chatRooms(room)
                    .users(user)
                    .joinedAt(LocalDateTime.now())
                    .lastReadMessageId(0L)
                    .isFavorite(false)
                    .build();
        }
    }
}
