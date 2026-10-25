package com.example.WaffleBear.user.service;

import com.example.WaffleBear.file.service.FileUpDownloadMinioService;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import com.example.WaffleBear.workspace.service.PostService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DemoAccountService {
    private final UserRepository userRepository;
    private final UserPostRepository userPostRepository;
    private final FileUpDownloadMinioService fileUpDownloadMinioService;
    private final PostService postService;
    private final AuthService authService;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.demo.enabled:true}")
    private boolean enabled;

    @Value("${app.demo.email:demo@fileinnout.local}")
    private String demoEmail;

    @Value("${app.demo.name:FileInNOut 체험 계정}")
    private String demoName;

    @Transactional
    public synchronized TokenDto.AuthTokenResponse loginAndReset() {
        requireEnabled();
        User user = ensureDemoUser();
        resetDemoData(user.getIdx());
        authService.logoutAllByEmail(user.getEmail());
        return authService.issueTokens(user.getIdx(), user.getEmail(), user.getEmail(), user.getName(), user.getRole());
    }

    @Transactional
    public synchronized void resetAfterLogout(AuthUserDetails userDetails) {
        if (userDetails == null || !isDemoEmail(userDetails.getEmail())) {
            return;
        }
        resetDemoData(userDetails.getIdx());
        authService.logoutAllByEmail(userDetails.getEmail());
    }

    @Transactional
    public User ensureDemoUser() {
        requireEnabled();
        User user = userRepository.findByEmail(normalizedDemoEmail())
                .orElseGet(() -> User.builder()
                        .email(normalizedDemoEmail())
                        .name(resolvedDemoName())
                        .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                        .enable(true)
                        .role("ROLE_USER")
                        .accountStatus(UserAccountStatus.ACTIVE)
                        .build());

        user.setEmail(normalizedDemoEmail());
        user.setName(resolvedDemoName());
        user.setEnable(true);
        user.setRole("ROLE_USER");
        user.setAccountStatus(UserAccountStatus.ACTIVE);
        if (user.getPassword() == null || user.getPassword().isBlank()) {
            user.setPassword(passwordEncoder.encode(UUID.randomUUID().toString()));
        }
        return userRepository.save(user);
    }

    public boolean isEnabled() {
        return enabled;
    }

    public boolean isDemoEmail(String email) {
        return enabled && email != null && normalizedDemoEmail().equalsIgnoreCase(email.trim());
    }

    private void resetDemoData(Long userIdx) {
        if (userIdx == null || userIdx <= 0L) {
            return;
        }

        fileUpDownloadMinioService.resetOwnedData(userIdx);
        for (UserPost relation : userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(userIdx)) {
            if (relation.getWorkspace() == null || relation.getWorkspace().getIdx() == null) {
                continue;
            }
            if (AccessRole.ADMIN.equals(relation.getLevel())) {
                postService.delete(relation.getWorkspace().getIdx(), userIdx);
            } else {
                postService.list_delete(relation.getWorkspace().getIdx(), userIdx);
            }
        }
    }

    private void requireEnabled() {
        if (!enabled) {
            throw new IllegalStateException("데모 계정이 비활성화되어 있습니다.");
        }
    }

    private String normalizedDemoEmail() {
        return demoEmail == null || demoEmail.isBlank() ? "demo@fileinnout.local" : demoEmail.trim();
    }

    private String resolvedDemoName() {
        return demoName == null || demoName.isBlank() ? "FileInNOut 체험 계정" : demoName.trim();
    }
}