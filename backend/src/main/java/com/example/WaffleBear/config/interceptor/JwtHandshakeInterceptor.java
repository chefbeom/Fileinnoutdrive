package com.example.WaffleBear.config.interceptor;

import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.service.AuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.jspecify.annotations.Nullable;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class JwtHandshakeInterceptor implements HandshakeInterceptor {

    private final AuthService authService;

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes
    ) {
        if (!(request instanceof ServletServerHttpRequest serverHttpRequest)) {
            return false;
        }

        HttpServletRequest httpReq = serverHttpRequest.getServletRequest();
        Cookie[] cookies = httpReq.getCookies();
        if (cookies == null) {
            return false;
        }

        for (Cookie cookie : cookies) {
            if (!"refresh".equals(cookie.getName())) {
                continue;
            }
            AuthUserDetails user = authService.resolveUserByRefreshToken(cookie.getValue());
            if (user == null || !user.isEnabled() || !user.isAccountNonLocked()) {
                return false;
            }

            String role = (user.getRole() == null || user.getRole().isBlank()) ? "ROLE_USER" : user.getRole();
            Authentication authentication = new UsernamePasswordAuthenticationToken(
                    user,
                    null,
                    List.of(new SimpleGrantedAuthority(role))
            );
            attributes.put("user", authentication);
            return true;
        }
        return false;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            @Nullable Exception exception
    ) {
    }
}
