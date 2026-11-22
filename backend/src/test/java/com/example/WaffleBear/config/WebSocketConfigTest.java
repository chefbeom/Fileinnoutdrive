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
    private final ChatRoomService chatRoomService = mock(ChatRoomService.class);
    private final WebSocketConfig config = new WebSocketConfig(
            chatRoomService,
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

    @Test
    void usesDatabaseRoleInsteadOfStaleJwtRoleClaimDuringStompConnect() {
        StompHeaderAccessor accessor = connectAccessor("access-token");
        when(jwtUtil.getCategory("access-token")).thenReturn("access");
        when(jwtUtil.getUserIdx("access-token")).thenReturn(7L);
        when(userRepository.findById(7L)).thenReturn(Optional.of(User.builder()
                .idx(7L)
                .email("user@example.com")
                .role("ROLE_USER")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build()));
        when(jwtUtil.getEmail("access-token")).thenReturn("user@example.com");
        when(jwtUtil.getRole("access-token")).thenReturn("ROLE_ADMIN");

        Authentication authentication = config.authenticate(accessor);

        AuthUserDetails user = (AuthUserDetails) authentication.getPrincipal();
        assertThat(user.getRole()).isEqualTo("ROLE_USER");
        assertThat(authentication.getAuthorities()).extracting("authority").containsExactly("ROLE_USER");
    }

    @Test
    void rejectsUnauthenticatedSubscribeAndSendAndNonMemberChatRoomSubscribe() {
        StompHeaderAccessor unauthSub = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        unauthSub.setDestination("/sub/game/openhexagon/lobby");
        assertThatThrownBy(() -> config.authorizeInboundMessage(unauthSub))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Unauthenticated websocket user");

        StompHeaderAccessor unauthSend = StompHeaderAccessor.create(StompCommand.SEND);
        unauthSend.setDestination("/pub/chat/10");
        assertThatThrownBy(() -> config.authorizeInboundMessage(unauthSend))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Unauthenticated websocket user");

        when(jwtUtil.getCategory("access-token")).thenReturn("access");
        when(jwtUtil.getUserIdx("access-token")).thenReturn(7L);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(true, UserAccountStatus.ACTIVE)));
        when(jwtUtil.getEmail("access-token")).thenReturn("user@example.com");
        when(jwtUtil.getRole("access-token")).thenReturn("ROLE_USER");
        Authentication auth = config.authenticate(connectAccessor("access-token"));

        StompHeaderAccessor nonMemberRoomSub = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        nonMemberRoomSub.setDestination("/sub/chat/room/10");
        nonMemberRoomSub.setUser(auth);
        when(chatRoomService.isMember(10L, 7L)).thenReturn(false);

        assertThatThrownBy(() -> config.authorizeInboundMessage(nonMemberRoomSub))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("No chat room access");
    }

    @Test
    void adminOnlyRejectsNonAdminStompConnectAndSubscriptionUsesExplicitAllowlist() {
        when(jwtUtil.getCategory("access-token")).thenReturn("access");
        when(jwtUtil.getUserIdx("access-token")).thenReturn(7L);
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(true, UserAccountStatus.ACTIVE)));
        when(jwtUtil.getEmail("access-token")).thenReturn("user@example.com");
        when(jwtUtil.getRole("access-token")).thenReturn("ROLE_USER");
        Authentication auth = config.authenticate(connectAccessor("access-token"));

        StompHeaderAccessor lobbySub = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        lobbySub.setDestination("/sub/game/openhexagon/lobby");
        lobbySub.setUser(auth);
        config.authorizeInboundMessage(lobbySub);

        StompHeaderAccessor rpsSub = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        rpsSub.setDestination("/sub/game/rps/room/room-1");
        rpsSub.setUser(auth);
        config.authorizeInboundMessage(rpsSub);

        StompHeaderAccessor unknownSub = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        unknownSub.setDestination("/sub/unknown/channel");
        unknownSub.setUser(auth);
        assertThatThrownBy(() -> config.authorizeInboundMessage(unknownSub))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Unsupported subscription destination");

        org.springframework.test.util.ReflectionTestUtils.setField(config, "adminOnly", true);
        assertThatThrownBy(() -> config.authenticate(connectAccessor("access-token")))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("Invalid websocket access token");
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