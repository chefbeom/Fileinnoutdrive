package com.example.WaffleBear.file.share;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.share.model.FileShare;
import com.example.WaffleBear.file.share.model.FileSharePermission;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SharePolicyRulesTest {

    private final PasswordEncoder passwordEncoder = new PasswordEncoder() {
        @Override
        public String encode(CharSequence rawPassword) {
            return "encoded:" + rawPassword;
        }

        @Override
        public boolean matches(CharSequence rawPassword, String encodedPassword) {
            return ("encoded:" + rawPassword).equals(encodedPassword);
        }
    };

    @Test
    void resolvesPermissionFromExplicitPermissionList() {
        assertThat(SharePolicyRules.resolvePermission("READ", List.of("DOWNLOAD", "UPLOAD")))
                .isEqualTo(FileSharePermission.WRITE);
        assertThat(SharePolicyRules.resolvePermission("READ", List.of("UPLOAD")))
                .isEqualTo(FileSharePermission.UPLOAD);
        assertThat(SharePolicyRules.resolvePermission("READ", List.of("DOWNLOAD")))
                .isEqualTo(FileSharePermission.DOWNLOAD);
        assertThat(SharePolicyRules.resolvePermission("WRITE", List.of("bad-value")))
                .isEqualTo(FileSharePermission.READ);
    }

    @Test
    void resolvesPermissionFromLegacySingleValueWhenListIsEmpty() {
        assertThat(SharePolicyRules.resolvePermission("write", null)).isEqualTo(FileSharePermission.WRITE);
        assertThat(SharePolicyRules.resolvePermission("bad-value", List.of())).isEqualTo(FileSharePermission.READ);
    }

    @Test
    void resolvesSharePolicyAndEncodesPassword() {
        SharePolicyRules.SharePolicy policy = SharePolicyRules.resolveSharePolicy(
                LocalDateTime.now().plusDays(1),
                3,
                " secret ",
                passwordEncoder
        );

        assertThat(policy.downloadLimit()).isEqualTo(3);
        assertThat(policy.passwordHash()).isEqualTo("encoded:secret");
    }

    @Test
    void rejectsExpiredOrInvalidSharePolicyInputs() {
        assertThatThrownBy(() -> SharePolicyRules.resolveSharePolicy(
                LocalDateTime.now().minusSeconds(1),
                null,
                null,
                passwordEncoder
        )).isInstanceOf(BaseException.class);

        assertThatThrownBy(() -> SharePolicyRules.resolveSharePolicy(
                null,
                0,
                null,
                passwordEncoder
        )).isInstanceOf(BaseException.class);

        assertThatThrownBy(() -> SharePolicyRules.resolveSharePolicy(
                null,
                null,
                "x".repeat(129),
                passwordEncoder
        )).isInstanceOf(BaseException.class);
    }

    @Test
    void verifiesPasswordProtectedShare() {
        FileShare share = FileShare.builder()
                .passwordHash("encoded:secret")
                .build();

        SharePolicyRules.ensureSharePasswordSatisfied(share, " secret ", passwordEncoder);

        assertThatThrownBy(() -> SharePolicyRules.ensureSharePasswordSatisfied(share, "wrong", passwordEncoder))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void rejectsExpiredAndDownloadLimitReachedShare() {
        FileShare expired = FileShare.builder()
                .expiresAt(LocalDateTime.now().minusDays(1))
                .build();
        FileShare exhausted = FileShare.builder()
                .downloadLimit(2)
                .downloadCount(2)
                .build();

        assertThatThrownBy(() -> SharePolicyRules.ensureSharePolicyActive(expired))
                .isInstanceOf(BaseException.class);
        assertThatThrownBy(() -> SharePolicyRules.ensureShareDownloadAvailable(exhausted))
                .isInstanceOf(BaseException.class);
    }

    @Test
    void detectsTrackedSharedDownloadWhenPolicyRequiresIt() {
        assertThat(SharePolicyRules.requiresTrackedSharedDownload(FileShare.builder().build())).isFalse();
        assertThat(SharePolicyRules.requiresTrackedSharedDownload(FileShare.builder().downloadLimit(1).build())).isTrue();
        assertThat(SharePolicyRules.requiresTrackedSharedDownload(FileShare.builder().passwordHash("encoded:secret").build())).isTrue();
    }
}
