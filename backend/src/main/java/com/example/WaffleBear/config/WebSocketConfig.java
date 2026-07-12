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

                if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
                    authorizeSubscription(accessor);
                }

                return message;
            }
        });
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
            String role = jwtUtil.getRole(token);
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
        Authentication auth = (Authentication) accessor.getUser();

        if (destination != null && destination.startsWith("/sub/chat/room/")) {
            Long roomId = Long.parseLong(destination.replace("/sub/chat/room/", ""));
            AuthUserDetails user = requireUser(auth);
            if (!chatRoomService.isMember(roomId, user.getIdx())) {
                throw new RuntimeException("No chat room access");
            }
        }

        if (destination != null && destination.startsWith("/sub/workspace/assets/")) {
            Long workspaceId = Long.parseLong(destination.replace("/sub/workspace/assets/", ""));
            AuthUserDetails user = requireUser(auth);
            if (userPostRepository.findByUser_IdxAndWorkspace_Idx(user.getIdx(), workspaceId).isEmpty()) {
                throw new RuntimeException("No workspace access");
            }
        }

        if (destination != null && destination.startsWith("/sub/workspace/comments/")) {
            Long workspaceId = Long.parseLong(destination.replace("/sub/workspace/comments/", ""));
            AuthUserDetails user = requireUser(auth);
            if (userPostRepository.findByUser_IdxAndWorkspace_Idx(user.getIdx(), workspaceId).isEmpty()) {
                throw new RuntimeException("No workspace access");
            }
        }
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