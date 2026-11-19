package com.example.WaffleBear.user.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.email.EmailVerify;
import com.example.WaffleBear.email.EmailVerifyRepository;
import com.example.WaffleBear.email.EmailVerifyService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.repository.PostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@RequiredArgsConstructor
@Service
public class UserService implements UserDetailsService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailVerifyRepository emailVerifyRepository;
    private final EmailVerifyService emailVerifyService;

    @Autowired(required = false)
    private PostRepository postRepository;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${spring.mail.password:}")
    private String mailPassword;

    public UserDto.SignupRes signup(UserDto.SignupReq dto) {
        if (dto == null || dto.email() == null || dto.email().isBlank() || !dto.email().contains("@")) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (dto.password() == null || dto.password().length() < 8) {
            throw BaseException.from(BaseResponseStatus.PASSWORD_POLICY_INVALID);
        }
        if (userRepository.findByEmail(dto.email()).isPresent()) {
            throw BaseException.from(BaseResponseStatus.SIGNUP_DUPLICATE_EMAIL);
        }

        User user = dto.toEntity();
        user.setPassword(passwordEncoder.encode(dto.password()));

        if (isEmailVerificationEnabled()) {
            String token = UUID.randomUUID().toString();
            emailVerifyRepository.save(new EmailVerify(token, user.getEmail()));
            userRepository.save(user);
            emailVerifyService.sendVerificationEmail(user.getEmail(), token);
        } else {
            user.setEnable(true);
            userRepository.save(user);
        }

        return UserDto.SignupRes.from(user);
    }

    @Transactional
    public void verifyEmail(String token) {
        String normalizedToken = token == null ? "" : token.trim();
        if (normalizedToken.isEmpty()
                || (postRepository != null && postRepository.findByUUID(normalizedToken).isPresent())) {
            throw new RuntimeException("invalid verify token");
        }

        EmailVerify verificationToken = emailVerifyRepository.findByToken(normalizedToken)
                .orElseThrow(() -> new RuntimeException("invalid verify token"));

        if (verificationToken.getExpiryDate().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("expired verify token");
        }

        User user = userRepository.findByEmail(verificationToken.getEmail())
                .orElseThrow(() -> new RuntimeException("user not found"));

        user.setEnable(true);
        userRepository.save(user);
        emailVerifyRepository.delete(verificationToken);
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(username)
                .orElseThrow(() -> new UsernameNotFoundException("user not found"));

        if (!Boolean.TRUE.equals(user.getEnable()) && !isEmailVerificationEnabled()) {
            user.setEnable(true);
            user = userRepository.save(user);
        }

        return AuthUserDetails.from(user);
    }

    private boolean isEmailVerificationEnabled() {
        return mailUsername != null && !mailUsername.isBlank()
                && mailPassword != null && !mailPassword.isBlank();
    }
}
