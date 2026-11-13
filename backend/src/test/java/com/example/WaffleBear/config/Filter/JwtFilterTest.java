package com.example.WaffleBear.config.Filter;

import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.utils.JwtUtil;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JwtFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void malformedEmptyBearerTokenReturnsUnauthorizedInsteadOfThrowing() throws Exception {
        String key = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("wafflebear-jwt-filter-unit-test-key-32b!".getBytes(StandardCharsets.UTF_8));
        JwtUtil jwtUtil = new JwtUtil(key);
        UserRepository userRepository = mock(UserRepository.class);
        JwtFilter filter = new JwtFilter(jwtUtil, userRepository);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/file/list");
        request.addHeader("Authorization", "Bearer   ");
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        assertThat(response.getStatus()).isEqualTo(401);
    }

    @Test
    void usesDatabaseRoleInsteadOfStaleJwtRoleClaim() throws Exception {
        String key = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("wafflebear-jwt-filter-unit-test-key-32b!".getBytes(StandardCharsets.UTF_8));
        JwtUtil jwtUtil = new JwtUtil(key);
        UserRepository userRepository = mock(UserRepository.class);
        JwtFilter filter = new JwtFilter(jwtUtil, userRepository);

        String token = jwtUtil.createToken("access", 5L, "admin@test.local", "admin@test.local", "Admin", "ROLE_ADMIN", 60_000L);
        User demotedUser = User.builder()
                .idx(5L)
                .email("admin@test.local")
                .name("Admin")
                .role("ROLE_USER")
                .enable(true)
                .accountStatus(UserAccountStatus.ACTIVE)
                .build();
        when(userRepository.findById(5L)).thenReturn(Optional.of(demotedUser));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/administrator/dashboard");
        request.addHeader("Authorization", "Bearer " + token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(request, response, chain);

        verify(chain).doFilter(request, response);
        var auth = SecurityContextHolder.getContext().getAuthentication();
        assertThat(auth).isNotNull();
        assertThat(auth.getAuthorities()).extracting("authority").containsExactly("ROLE_USER");
        assertThat(((AuthUserDetails) auth.getPrincipal()).getRole()).isEqualTo("ROLE_USER");
    }
}
