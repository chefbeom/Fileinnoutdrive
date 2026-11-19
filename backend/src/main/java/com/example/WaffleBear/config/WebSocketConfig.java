package com.example.WaffleBear.config;

import com.example.WaffleBear.chat.ChatRoomService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.utils.JwtUtil;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import java.util.List;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    @Value("${app.frontend-url}")
    private String frontendUrl;

    private final ChatRoomService chatRoomService;
    private final JwtUtil jwtUtil;
    private final UserPostRepository userPostRepository;
    private final UserRepository userRepository;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws-stomp")
                .setAllowedOrigins(frontendUrl)
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/sub");
        registry.setApplicationDestinationPrefixes("/pub");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new ChannelInterceptor() {
            @Override
            public Message<?> preSend(Message<?> message, MessageChannel channel) {
                StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
                if (accessor == null || accessor.getCommand() == null) {
                    return message;
                }

                if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                    accessor.setUser(authenticate(accessor));
                }

                authorizeInboundMessage(accessor);

                return message;
            }
        });
    }

    void authorizeInboundMessage(StompHeaderAccessor accessor) {
        if (accessor == null || accessor.getCommand() == null) {
            return;
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscription(accessor);
        }

        if (StompCommand.SEND.equals(accessor.getCommand())) {
            requireUser((Authentication) accessor.getUser());
        }
    }

    Authentication authenticate(StompHeaderAccessor accessor) {
        String token = accessor.getFirstNativeHeader("ATOKEN");
        if (token == null || token.isBlank()) {
            token = accessor.getFirstNativeHeader("Authorization");
        }
        if (token == null || token.isBlank()) {
            throw new RuntimeException("Missing websocket access token");
        }
        if (token.startsWith("Bearer ")) {
            token = token.substring("Bearer ".length());
        }

        try {
            if (!"access".equals(jwtUtil.getCategory(token))) {
                throw new IllegalArgumentException("Invalid websocket token category");
            }
            Long idx = jwtUtil.getUserIdx(token);
            User userEntity = userRepository.findById(idx)
                    .orElseThrow(() -> new IllegalArgumentException("Websocket user not found"));
            if (!Boolean.TRUE.equals(userEntity.getEnable())
                    || resolveStatus(userEntity) != UserAccountStatus.ACTIVE) {
                throw new IllegalArgumentException("Websocket user access blocked");
            }
            String email = jwtUtil.getEmail(token);
            String tokenRole = jwtUtil.getRole(token);
            String role = resolveRole(userEntity, tokenRole);
            AuthUserDetails user = AuthUserDetails.builder()
                    .idx(idx)
                    .email(email)
                    .role(role)
                    .build();
            return new UsernamePasswordAuthenticationToken(
                    user,
                    null,
                    List.of(new SimpleGrantedAuthority(role))
            );
        } catch (Exception exception) {
            throw new RuntimeException("Invalid websocket access token");
        }
    }

    private void authorizeSubscription(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || destination.isBlank()) {
            throw new RuntimeException("Missing subscription destination");
        }
        Authentication auth = (Authentication) accessor.getUser();
        AuthUserDetails user = requireUser(auth);

        if (destination.startsWith("/sub/chat/room/")) {
            Long roomId = parseDestinationTargetId(destination, "/sub/chat/room/");
            if (!chatRoomService.isMember(roomId, user.getIdx())) {
                throw new RuntimeException("No chat room access");
            }
        }

        if (destination.startsWith("/sub/workspace/assets/")) {
            Long workspaceId = parseDestinationTargetId(destination, "/sub/workspace/assets/");
            if (userPostRepository.findByUser_IdxAndWorkspace_Idx(user.getIdx(), workspaceId).isEmpty()) {
                throw new RuntimeException("No workspace access");
            }
        }

        if (destination.startsWith("/sub/workspace/comments/")) {
            Long workspaceId = parseDestinationTargetId(destination, "/sub/workspace/comments/");
            if (userPostRepository.findByUser_IdxAndWorkspace_Idx(user.getIdx(), workspaceId).isEmpty()) {
                throw new RuntimeException("No workspace access");
            }
        }
    }

    private Long parseDestinationTargetId(String destination, String prefix) {
        String rawId = destination.substring(prefix.length()).trim();
        if (!rawId.matches("^[0-9]+$")) {
            throw new RuntimeException("Invalid subscription target id");
        }
        return Long.parseLong(rawId);
    }

    private String resolveRole(User userEntity, String fallbackRole) {
        if (userEntity != null && userEntity.getRole() != null && !userEntity.getRole().isBlank()) {
            return userEntity.getRole().trim();
        }
        return (fallbackRole != null && !fallbackRole.isBlank()) ? fallbackRole.trim() : "ROLE_USER";
    }

    private AuthUserDetails requireUser(Authentication auth) {
        if (auth != null && auth.getPrincipal() instanceof AuthUserDetails user) {
            return user;
        }
        throw new RuntimeException("Unauthenticated websocket user");
    }

    private UserAccountStatus resolveStatus(User user) {
        return user.getAccountStatus() == null ? UserAccountStatus.ACTIVE : user.getAccountStatus();
    }
}