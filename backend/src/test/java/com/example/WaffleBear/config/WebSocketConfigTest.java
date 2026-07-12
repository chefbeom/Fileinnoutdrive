package com.example.WaffleBear.config;

import com.example.WaffleBear.chat.ChatRoomService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.utils.JwtUtil;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.security.core.Authentication;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WebSocketConfigTest {

    private final JwtUtil jwtUtil = mock(JwtUtil.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final WebSocketConfig config = new WebSocketConfig(
            mock(ChatRoomService.class),
            jwtUtil,
            mock(UserPostRepository.class),
            userRepository
    );

    @Test
    void rejectsRefreshTokenDuringStompConnect() {
        StompHeaderAccessor accessor = connectAccessor("refresh-token");
        when(jwtUtil.getCategory("refresh-token")).thenReturn("refresh");

        assertThatThrownBy(() -> config.authenticate(accessor))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Invalid websocket access token");
        verify(jwtUtil, never()).getUserIdx("refresh-token");
    }

    @Test
    void rejectsBlockedUserDuringStompConnect() {
        StompHeaderAccessor accessor = connectAccessor("access-token");
        when(jwtUtil.getCategory("access-token")).thenReturn("access");
        when(jwtUtil.getUserIdx("access-token")).thenReturn(7L);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(false, UserAccountStatus.SUSPENDED)));

        assertThatThrownBy(() -> config.authenticate(accessor))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Invalid websocket access token");
        verify(jwtUtil, never()).getEmail("access-token");
    }

    @Test
    void acceptsActiveUserWithAccessTokenDuringStompConnect() {
        StompHeaderAccessor accessor = connectAccessor("access-token");
        when(jwtUtil.getCategory("access-token")).thenReturn("access");
        when(jwtUtil.getUserIdx("access-token")).thenReturn(7L);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(true, UserAccountStatus.ACTIVE)));
        when(jwtUtil.getEmail("access-token")).thenReturn("user@example.com");
        when(jwtUtil.getRole("access-token")).thenReturn("ROLE_USER");

        Authentication authentication = config.authenticate(accessor);

        assertThat(authentication.getPrincipal()).isInstanceOf(AuthUserDetails.class);
        AuthUserDetails user = (AuthUserDetails) authentication.getPrincipal();
        assertThat(user.getIdx()).isEqualTo(7L);
        assertThat(user.getEmail()).isEqualTo("user@example.com");
        assertThat(user.getRole()).isEqualTo("ROLE_USER");
    }

    private static User user(boolean enabled, UserAccountStatus status) {
        return User.builder()
                .idx(7L)
                .email("user@example.com")
                .role("ROLE_USER")
                .enable(enabled)
                .accountStatus(status)
                .build();
    }

    private static StompHeaderAccessor connectAccessor(String token) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.CONNECT);
        accessor.addNativeHeader("Authorization", "Bearer " + token);
        return accessor;
    }
}