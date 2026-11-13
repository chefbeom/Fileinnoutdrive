package com.example.WaffleBear.config.Filter;

import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.utils.JwtUtil;
import io.jsonwebtoken.ExpiredJwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.io.PrintWriter;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@RequiredArgsConstructor
public class JwtFilter extends OncePerRequestFilter {
    private static final long USER_SNAPSHOT_TTL_MS = 3_000L;
    private static final int USER_SNAPSHOT_MAX_ENTRIES = 2_048;

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;
    private final Map<Long, CachedUserSnapshot> userSnapshotCache = new ConcurrentHashMap<>();

    private record CachedUserSnapshot(
            String name,
            String role,
            Boolean enable,
            UserAccountStatus accountStatus,
            long expiresAtMs
    ) {
        boolean isExpired(long nowMs) {
            return nowMs >= expiresAtMs;
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/login")
                || path.startsWith("/error")
                || path.startsWith("/actuator/health")
                || path.startsWith("/auth/demo-login")
                || path.startsWith("/auth/reissue")
                || path.startsWith("/auth/logout")
                || path.startsWith("/auth/oauth2/providers")
                || path.startsWith("/user/signup")
                || path.startsWith("/user/verify")
                || path.startsWith("/oauth2")
                || path.startsWith("/login/oauth2");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {

        // 1. 헤더에서 Authorization 키를 찾음
        String authorization = request.getHeader("ATOKEN");
        if (authorization == null || authorization.isBlank()) {
            authorization = request.getHeader("Authorization");
        }

        // 2. Authorization 헤더가 없거나 Bearer 접두사가 아니면 검증 종료 (다음 필터로)
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        // 3. "Bearer " 부분을 제거하고 순수 토큰 문자열만 추출
        String token = authorization.substring("Bearer ".length()).trim();
        if (token.isEmpty()) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "invalid token");
            return;
        }

        // 4. 토큰 소멸 시간 검증
        try {
            jwtUtil.isExpired(token);
        } catch (ExpiredJwtException e) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "access token expired");
            return;
        } catch (io.jsonwebtoken.JwtException | IllegalArgumentException e) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "invalid token");
            return;
        }

        // 5. 토큰 카테고리 검증 (access 토큰이 맞는지)
        String category = jwtUtil.getCategory(token);
        if (!"access".equals(category)) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "invalid token category");
            return;
        }

        Long idx = jwtUtil.getUserIdx(token);
        CachedUserSnapshot userSnapshot = resolveUserSnapshot(idx);
        if (userSnapshot == null || !Boolean.TRUE.equals(userSnapshot.enable()) || userSnapshot.accountStatus() != UserAccountStatus.ACTIVE) {
            writeError(response, HttpServletResponse.SC_FORBIDDEN, "user access blocked");
            return;
        }

        String email = jwtUtil.getEmail(token);
        String role = userSnapshot.role();
        String id = jwtUtil.getId(token);
        if (id == null || id.isBlank()) {
            id = email;
        }

        AuthUserDetails user = AuthUserDetails.builder()
                .idx(idx)
                .id(id)
                .email(email)
                .role(role)
                .name(userSnapshot.name())
                .enable(userSnapshot.enable())
                .accountStatus(userSnapshot.accountStatus())
                .build();

        Authentication authentication = new UsernamePasswordAuthenticationToken(
                user,
                null,
                List.of(new SimpleGrantedAuthority(role))
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        // 다음 필터로 요청 전달
        filterChain.doFilter(request, response);
    }

    private CachedUserSnapshot resolveUserSnapshot(Long idx) {
        if (idx == null) {
            return null;
        }

        long nowMs = System.currentTimeMillis();
        CachedUserSnapshot cached = userSnapshotCache.get(idx);
        if (cached != null && !cached.isExpired(nowMs)) {
            return cached;
        }

        User userEntity = userRepository.findById(idx).orElse(null);
        if (userEntity == null) {
            userSnapshotCache.remove(idx);
            return null;
        }

        String resolvedRole = resolveRole(userEntity);
        UserAccountStatus status = resolveStatus(userEntity);
        if (!Boolean.TRUE.equals(userEntity.getEnable()) || status != UserAccountStatus.ACTIVE) {
            userSnapshotCache.remove(idx);
            return new CachedUserSnapshot(userEntity.getName(), resolvedRole, userEntity.getEnable(), status, 0L);
        }

        if (userSnapshotCache.size() > USER_SNAPSHOT_MAX_ENTRIES) {
            userSnapshotCache.entrySet().removeIf(entry -> entry.getValue().isExpired(nowMs));
        }

        CachedUserSnapshot snapshot = new CachedUserSnapshot(
                userEntity.getName(),
                resolvedRole,
                userEntity.getEnable(),
                status,
                nowMs + USER_SNAPSHOT_TTL_MS
        );
        userSnapshotCache.put(idx, snapshot);
        return snapshot;
    }

    private String resolveRole(User user) {
        String role = user.getRole();
        return (role == null || role.isBlank()) ? "ROLE_USER" : role.trim();
    }

    private UserAccountStatus resolveStatus(User user) {
        return user.getAccountStatus() == null ? UserAccountStatus.ACTIVE : user.getAccountStatus();
    }

    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json;charset=UTF-8");
        PrintWriter writer = response.getWriter();
        writer.print("{\"error\": \"" + message + "\"}");
    }
}
