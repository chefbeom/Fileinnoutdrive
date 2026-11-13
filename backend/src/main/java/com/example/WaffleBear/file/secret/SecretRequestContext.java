package com.example.WaffleBear.file.secret;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.Arrays;
import java.util.List;

@Component
public class SecretRequestContext {

    public static final String HEADER_VAULT_TOKEN = "X-FileInNOut-Vault-Token";
    public static final String HEADER_SECRET_TOKENS = "X-FileInNOut-Secret-Tokens";

    public String getVaultToken() {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return null;
        }
        String raw = request.getHeader(HEADER_VAULT_TOKEN);
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.trim();
    }

    public List<String> getFolderTokens() {
        HttpServletRequest request = currentRequest();
        if (request == null) {
            return List.of();
        }
        String raw = request.getHeader(HEADER_SECRET_TOKENS);
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(token -> !token.isEmpty())
                .distinct()
                .toList();
    }

    private HttpServletRequest currentRequest() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs instanceof ServletRequestAttributes servletAttrs) {
            return servletAttrs.getRequest();
        }
        return null;
    }
}
