package com.example.WaffleBear.user.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.email.EmailVerifyService;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @InjectMocks
    private UserService userService;

    @Test
    void signupRejectsShortPasswords() {
        UserDto.SignupReq shortPasswordReq = new UserDto.SignupReq("user@example.com", "User", "1234567");

        assertThatThrownBy(() -> userService.signup(shortPasswordReq))
                .isInstanceOf(BaseException.class)
                .extracting("status")
                .isEqualTo(BaseResponseStatus.PASSWORD_POLICY_INVALID);
    }
}
