package com.example.WaffleBear.administrator;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class SocialLoginSettingsServiceTest {

    @Test
    void togglesSocialLoginVisibilityInMemoryWhenRedisUnavailable() {
        @SuppressWarnings("unchecked")
        ObjectProvider<StringRedisTemplate> provider = mock(ObjectProvider.class);
        SocialLoginSettingsService service = new SocialLoginSettingsService(provider, false);

        assertFalse(service.isSocialLoginVisible());

        assertTrue(service.setSocialLoginVisible(true));
        assertTrue(service.isSocialLoginVisible());

        assertFalse(service.setSocialLoginVisible(false));
        assertFalse(service.isSocialLoginVisible());
    }
}
