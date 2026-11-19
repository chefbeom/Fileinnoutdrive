package com.example.WaffleBear.user.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.email.EmailVerify;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.email.EmailVerifyService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.repository.PostRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceSecurityTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private EmailVerifyRepository emailVerifyRepository;
    @Mock
    private EmailVerifyService emailVerifyService;
    @Mock
    private PostRepository postRepository;

    @InjectMocks
    private UserService userService;

    @BeforeEach
    void wireOptionalDependencies() {
        ReflectionTestUtils.setField(userService, "postRepository", postRepository);
    }

    @Test
    void signupRejectsShortPasswords() {
        UserDto.SignupReq shortPasswordReq = new UserDto.SignupReq("user@example.com", "User", "1234567");

        assertThatThrownBy(() -> userService.signup(shortPasswordReq))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.PASSWORD_POLICY_INVALID);
    }

    @Test
    void verifyEmailRejectsWorkspaceInviteUuidToken() {
        when(postRepository.findByUUID("workspace-uuid")).thenReturn(Optional.of(Post.builder().idx(1L).UUID("workspace-uuid").build()));

        assertThatThrownBy(() -> userService.verifyEmail("workspace-uuid"))
                .isInstanceOf(RuntimeException.class)
                .hasMessage("invalid verify token");

        verify(emailVerifyRepository, never()).findByToken(any());
        verify(userRepository, never()).save(any());
    }

    @Test
    void verifyEmailPersistsEnabledUserAndDeletesVerificationToken() {
        User user = User.builder().idx(5L).email("member@example.com").enable(false).build();
        EmailVerify token = new EmailVerify("verify-token-123", "member@example.com");

        when(postRepository.findByUUID("verify-token-123")).thenReturn(Optional.empty());
        when(emailVerifyRepository.findByToken("verify-token-123")).thenReturn(Optional.of(token));
        when(userRepository.findByEmail("member@example.com")).thenReturn(Optional.of(user));

        userService.verifyEmail("verify-token-123");

        assertThat(user.getEnable()).isTrue();
        verify(userRepository).save(user);
        verify(emailVerifyRepository).delete(token);
    }
}
