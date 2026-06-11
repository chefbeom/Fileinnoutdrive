package com.example.WaffleBear.administrator;

import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class AdministratorBootstrap implements ApplicationRunner {

    @Value("${admin.email}") private String ADMIN_EMAIL;
    @Value("${admin.name}") private String ADMIN_NAME;
    @Value("${admin.role}") private String ADMIN_ROLE;
    @Value("${admin.password}") private String ADMIN_PASSWORD;
    @Value("${admin.additional-users:}") private String ADMIN_ADDITIONAL_USERS;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(ApplicationArguments args) {
        upsertAdmin(ADMIN_EMAIL, ADMIN_NAME, ADMIN_ROLE, ADMIN_PASSWORD);
        parseAdditionalAdmins(ADMIN_ADDITIONAL_USERS)
                .forEach(admin -> upsertAdmin(admin.email(), admin.name(), ADMIN_ROLE, admin.password()));
    }

    private void upsertAdmin(String email, String name, String role, String password) {
        String resolvedEmail = required(email, "admin email");
        String resolvedPassword = required(password, "admin password");
        String resolvedName = defaultIfBlank(name, defaultName(resolvedEmail));
        String resolvedRole = defaultIfBlank(role, "ROLE_ADMIN");

        User admin = userRepository.findByEmail(resolvedEmail)
                .orElseGet(() -> User.builder()
                        .email(resolvedEmail)
                        .name(resolvedName)
                        .enable(true)
                        .role(resolvedRole)
                        .accountStatus(UserAccountStatus.ACTIVE)
                        .build());

        admin.setEmail(resolvedEmail);
        admin.setName(resolvedName);
        admin.setEnable(true);
        admin.setRole(resolvedRole);
        admin.setAccountStatus(UserAccountStatus.ACTIVE);

        if (shouldResetPassword(admin.getPassword(), resolvedPassword)) {
            admin.setPassword(passwordEncoder.encode(resolvedPassword));
        }

        userRepository.save(admin);
    }

    private List<AdditionalAdmin> parseAdditionalAdmins(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }

        return Arrays.stream(value.split(";"))
                .map(String::trim)
                .filter(entry -> !entry.isBlank())
                .map(this::parseAdditionalAdmin)
                .toList();
    }

    private AdditionalAdmin parseAdditionalAdmin(String entry) {
        String[] parts = entry.split("\\|", -1);
        if (parts.length != 2 && parts.length != 3) {
            throw new IllegalArgumentException(
                    "ADMIN_ADDITIONAL_USERS entries must be email|password or email|name|password"
            );
        }

        String email = required(parts[0], "additional admin email");
        String name;
        String password;
        if (parts.length == 2) {
            name = defaultName(email);
            password = required(parts[1], "additional admin password");
        } else {
            name = defaultIfBlank(parts[1], defaultName(email));
            password = required(parts[2], "additional admin password");
        }
        return new AdditionalAdmin(email, name, password);
    }

    private boolean shouldResetPassword(String storedPassword, String configuredPassword) {
        if (storedPassword == null || storedPassword.isBlank()) {
            return true;
        }

        try {
            return !passwordEncoder.matches(configuredPassword, storedPassword);
        } catch (IllegalArgumentException exception) {
            // Legacy plain-text or unknown encoded passwords should be replaced
            // with the configured administrator password on startup.
            return true;
        }
    }

    private String required(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " must be configured");
        }
        return value.trim();
    }

    private String defaultIfBlank(String value, String defaultValue) {
        if (value == null || value.isBlank()) {
            return defaultValue;
        }
        return value.trim();
    }

    private String defaultName(String email) {
        int atIndex = email.indexOf('@');
        if (atIndex > 0) {
            return email.substring(0, atIndex);
        }
        return email.toLowerCase(Locale.ROOT);
    }

    private record AdditionalAdmin(String email, String name, String password) {
    }
}
