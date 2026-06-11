package com.example.WaffleBear.administrator;

import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdministratorBootstrapTest {

    @Mock
    private UserRepository userRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Test
    void createsConfiguredAdditionalAdministrators() {
        AdministratorBootstrap bootstrap = bootstrap(
                "admin@fileinnout.local",
                "Administrator",
                "ROLE_ADMIN",
                "admin-password",
                "ops@fileinnout.local|OpsAdmin|ops-password; audit@fileinnout.local|audit-password"
        );

        when(userRepository.findByEmail(anyString())).thenReturn(Optional.empty());

        bootstrap.run(null);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository, times(3)).save(captor.capture());

        List<User> savedUsers = captor.getAllValues();
        assertAdmin(savedUsers.get(0), "admin@fileinnout.local", "Administrator", "admin-password");
        assertAdmin(savedUsers.get(1), "ops@fileinnout.local", "OpsAdmin", "ops-password");
        assertAdmin(savedUsers.get(2), "audit@fileinnout.local", "audit", "audit-password");
    }

    @Test
    void updatesExistingAdditionalAdministrator() {
        User existing = User.builder()
                .email("ops@fileinnout.local")
                .name("OldName")
                .password(passwordEncoder.encode("old-password"))
                .enable(false)
                .role("ROLE_USER")
                .accountStatus(UserAccountStatus.SUSPENDED)
                .build();

        AdministratorBootstrap bootstrap = bootstrap(
                "admin@fileinnout.local",
                "Administrator",
                "ROLE_ADMIN",
                "admin-password",
                "ops@fileinnout.local|OpsAdmin|ops-password"
        );

        when(userRepository.findByEmail("admin@fileinnout.local")).thenReturn(Optional.empty());
        when(userRepository.findByEmail("ops@fileinnout.local")).thenReturn(Optional.of(existing));

        bootstrap.run(null);

        assertThat(existing.getName()).isEqualTo("OpsAdmin");
        assertThat(existing.getEnable()).isTrue();
        assertThat(existing.getRole()).isEqualTo("ROLE_ADMIN");
        assertThat(existing.getAccountStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        assertThat(passwordEncoder.matches("ops-password", existing.getPassword())).isTrue();
    }

    @Test
    void rejectsMalformedAdditionalAdministratorConfig() {
        AdministratorBootstrap bootstrap = bootstrap(
                "admin@fileinnout.local",
                "Administrator",
                "ROLE_ADMIN",
                "admin-password",
                "broken-entry-without-password"
        );

        when(userRepository.findByEmail("admin@fileinnout.local")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> bootstrap.run(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("ADMIN_ADDITIONAL_USERS");
    }

    private AdministratorBootstrap bootstrap(
            String email,
            String name,
            String role,
            String password,
            String additionalUsers
    ) {
        AdministratorBootstrap bootstrap = new AdministratorBootstrap(userRepository, passwordEncoder);
        ReflectionTestUtils.setField(bootstrap, "ADMIN_EMAIL", email);
        ReflectionTestUtils.setField(bootstrap, "ADMIN_NAME", name);
        ReflectionTestUtils.setField(bootstrap, "ADMIN_ROLE", role);
        ReflectionTestUtils.setField(bootstrap, "ADMIN_PASSWORD", password);
        ReflectionTestUtils.setField(bootstrap, "ADMIN_ADDITIONAL_USERS", additionalUsers);
        return bootstrap;
    }

    private void assertAdmin(User user, String email, String name, String password) {
        assertThat(user.getEmail()).isEqualTo(email);
        assertThat(user.getName()).isEqualTo(name);
        assertThat(user.getEnable()).isTrue();
        assertThat(user.getRole()).isEqualTo("ROLE_ADMIN");
        assertThat(user.getAccountStatus()).isEqualTo(UserAccountStatus.ACTIVE);
        assertThat(passwordEncoder.matches(password, user.getPassword())).isTrue();
    }
}
