package com.example.WaffleBear.user.service;

import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.model.UserDto;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class OAuth2UserService extends DefaultOAuth2UserService {
    private final UserRepository userRepository;

    @Override
    @Transactional
    public OAuth2User loadUser(OAuth2UserRequest userRequest) throws OAuth2AuthenticationException {
        OAuth2User oAuth2User = super.loadUser(userRequest);
        String provider = userRequest.getClientRegistration().getRegistrationId();

        UserDto.OAuth dto;
        try {
            dto = UserDto.OAuth.from(oAuth2User.getAttributes(), provider);
        } catch (IllegalArgumentException e) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("unsupported_oauth2_provider"),
                    e.getMessage(),
                    e
            );
        }

        Optional<User> result = userRepository.findByEmail(dto.email());
        User user = result.orElseGet(() -> userRepository.save(dto.toEntity()));

        if (!Boolean.TRUE.equals(user.getEnable())
                || (user.getAccountStatus() != null && user.getAccountStatus() != UserAccountStatus.ACTIVE)) {
            throw new OAuth2AuthenticationException(
                    new OAuth2Error("oauth2_user_disabled"),
                    "OAuth2 user account is disabled"
            );
        }

        if ((user.getName() == null || user.getName().isBlank()) && dto.name() != null && !dto.name().isBlank()) {
            user.setName(dto.name());
        }

        return AuthUserDetails.from(user);
    }
}
