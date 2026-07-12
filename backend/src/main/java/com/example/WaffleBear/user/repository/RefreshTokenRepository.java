package com.example.WaffleBear.user.repository;
import com.example.WaffleBear.user.model.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
    Optional<RefreshToken> findByEmail(String email);
    Optional<RefreshToken> findFirstByTokenHashOrderByIdDesc(String tokenHash);
    List<RefreshToken> findAllByTokenHash(String tokenHash);
    List<RefreshToken> findAllByOrderByIdDesc();
    List<RefreshToken> findAllByEmailOrderByIdDesc(String email);
    void deleteByEmail(String email);
    void deleteByTokenHash(String tokenHash);
    void deleteByExpiryDateBefore(LocalDateTime now);
}
