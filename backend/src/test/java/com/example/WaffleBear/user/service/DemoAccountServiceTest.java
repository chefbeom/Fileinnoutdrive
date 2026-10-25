package com.example.WaffleBear.user.service;

import com.example.WaffleBear.file.service.FileUpDownloadMinioService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.TokenDto;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import com.example.WaffleBear.workspace.service.PostService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DemoAccountServiceTest {

    private static final String DEMO_EMAIL = "demo@fileinnout.local";

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserPostRepository userPostRepository;

    @Mock
    private FileUpDownloadMinioService fileUpDownloadMinioService;

    @Mock
    private PostService postService;

    @Mock
    private AuthService authService;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private DemoAccountService demoAccountService;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(demoAccountService, "enabled", true);
        ReflectionTestUtils.setField(demoAccountService, "demoEmail", DEMO_EMAIL);
        ReflectionTestUtils.setField(demoAccountService, "demoName", "FileInNOut 체험 계정");
    }

    @Test
    void demoLoginResetsDataRevokesPreviousTokensAndIssuesNewTokens() {
        User demoUser = demoUser();
        TokenDto.AuthTokenResponse expected = new TokenDto.AuthTokenResponse("access", "refresh");
        when(userRepository.findByEmail(DEMO_EMAIL)).thenReturn(Optional.of(demoUser));
        when(userRepository.save(demoUser)).thenReturn(demoUser);
        when(userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(11L)).thenReturn(List.of());
        when(authService.issueTokens(11L, DEMO_EMAIL, DEMO_EMAIL, "FileInNOut 체험 계정", "ROLE_USER"))
                .thenReturn(expected);

        TokenDto.AuthTokenResponse actual = demoAccountService.loginAndReset();

        assertEquals(expected, actual);
        verify(fileUpDownloadMinioService).resetOwnedData(11L);
        verify(authService).logoutAllByEmail(DEMO_EMAIL);
        verify(authService).issueTokens(11L, DEMO_EMAIL, DEMO_EMAIL, "FileInNOut 체험 계정", "ROLE_USER");
    }

    @Test
    void demoLogoutResetsOwnedDataAndInvalidatesSessions() {
        when(userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(11L)).thenReturn(List.of());
        AuthUserDetails principal = AuthUserDetails.builder()
                .idx(11L)
                .email(DEMO_EMAIL)
                .role("ROLE_USER")
                .enable(true)
                .build();

        demoAccountService.resetAfterLogout(principal);

        verify(fileUpDownloadMinioService).resetOwnedData(11L);
        verify(authService).logoutAllByEmail(DEMO_EMAIL);
    }

    private static User demoUser() {
        return User.builder()
                .idx(11L)
                .email(DEMO_EMAIL)
                .name("FileInNOut 체험 계정")
                .password("generated-password")
                .enable(true)
                .role("ROLE_USER")
                .build();
    }
}