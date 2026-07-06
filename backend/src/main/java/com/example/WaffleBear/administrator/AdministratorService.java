package com.example.WaffleBear.administrator;

import com.example.WaffleBear.administrator.model.AdministratorDto;
import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.file.share.ShareAuditService;
import com.example.WaffleBear.file.share.model.ShareDto;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.RefreshToken;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.model.UserAccountStatus;
import com.example.WaffleBear.user.repository.RefreshTokenRepository;
import com.example.WaffleBear.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AdministratorService {

    private final UserRepository userRepository;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final StoragePlanService storagePlanService;
    private final ShareAuditService shareAuditService;

    public AdministratorDto.DashboardRes getDashboard(AuthUserDetails adminUser) {
        validateAdministrator(adminUser);

        List<User> users = userRepository.findAll(Sort.by(Sort.Order.desc("idx")));
        Map<Long, UserFileStat> statsByUserIdx = loadDashboardStatsByUser();

        long totalUsers = users.size();
        long activeUsers = users.stream().filter(this::isActiveAccount).count();
        long suspendedUsers = users.stream().filter(user -> resolveAccountStatus(user) == UserAccountStatus.SUSPENDED).count();
        long bannedUsers = users.stream().filter(user -> resolveAccountStatus(user) == UserAccountStatus.BANNED).count();

        long totalFileCount = statsByUserIdx.values().stream().mapToLong(UserFileStat::fileCount).sum();
        long totalFolderCount = statsByUserIdx.values().stream().mapToLong(UserFileStat::folderCount).sum();
        long totalUsedBytes = statsByUserIdx.values().stream().mapToLong(UserFileStat::usedBytes).sum();
        long totalQuotaBytes = users.stream().mapToLong(user -> resolvePlan(user).quotaBytes()).sum();

        List<AdministratorDto.UserRes> userResponses = users.stream()
                .map(user -> toUserResponse(user, statsByUserIdx.getOrDefault(user.getIdx(), UserFileStat.empty())))
                .toList();

        List<AdministratorDto.PlanStatRes> planStats = buildPlanStats(users, statsByUserIdx, totalUsers);

        return AdministratorDto.DashboardRes.builder()
                .summary(AdministratorDto.SummaryRes.builder()
                        .totalUserCount(totalUsers)
                        .activeUserCount(activeUsers)
                        .suspendedUserCount(suspendedUsers)
                        .bannedUserCount(bannedUsers)
                        .totalFileCount(totalFileCount)
                        .totalFolderCount(totalFolderCount)
                        .totalUsedBytes(totalUsedBytes)
                        .totalQuotaBytes(totalQuotaBytes)
                        .overallUsagePercent(toPercent(totalUsedBytes, totalQuotaBytes))
                        .build())
                .planStats(planStats)
                .users(userResponses)
                .build();
    }

    public List<ShareDto.ShareAuditRes> getShareAuditLogs(AuthUserDetails adminUser) {
        validateAdministrator(adminUser);
        return shareAuditService.listForAdministrator();
    }
    @Transactional
    public List<AdministratorDto.SessionRes> getSessions(AuthUserDetails adminUser) {
        validateAdministrator(adminUser);
        LocalDateTime now = LocalDateTime.now();
        refreshTokenRepository.deleteByExpiryDateBefore(now);

        List<RefreshToken> sessions = refreshTokenRepository.findAllByOrderByIdDesc();
        Map<String, User> usersByEmail = loadUsersByEmail(sessions.stream()
                .map(RefreshToken::getEmail)
                .filter(email -> email != null && !email.isBlank())
                .distinct()
                .toList());

        return sessions.stream()
                .map(session -> toSessionResponse(session, usersByEmail.get(session.getEmail()), now))
                .toList();
    }

    @Transactional
    public AdministratorDto.ForceLogoutRes forceLogoutSession(AuthUserDetails adminUser, Long sessionId) {
        validateAdministrator(adminUser);
        if (sessionId == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        return refreshTokenRepository.findById(sessionId)
                .map(session -> {
                    refreshTokenRepository.delete(session);
                    return AdministratorDto.ForceLogoutRes.builder().affectedCount(1).build();
                })
                .orElseGet(() -> AdministratorDto.ForceLogoutRes.builder().affectedCount(0).build());
    }

    @Transactional
    public AdministratorDto.ForceLogoutRes forceLogoutUserSessions(AuthUserDetails adminUser, Long userIdx) {
        validateAdministrator(adminUser);
        if (userIdx == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        User targetUser = userRepository.findById(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND));
        List<RefreshToken> sessions = refreshTokenRepository.findAllByEmailOrderByIdDesc(targetUser.getEmail());
        if (!sessions.isEmpty()) {
            refreshTokenRepository.deleteAll(sessions);
        }
        return AdministratorDto.ForceLogoutRes.builder()
                .affectedCount(sessions.size())
                .build();
    }
    @Transactional
    public AdministratorDto.UserRes updateUserStatus(
            AuthUserDetails adminUser,
            Long userIdx,
            AdministratorDto.StatusUpdateReq request
    ) {
        validateAdministrator(adminUser);

        if (userIdx == null || request == null || request.getAccountStatus() == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }

        User targetUser = userRepository.findById(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));

        if (isProtectedAdministrator(targetUser)) {
            throw new AccessDeniedException("administrator account cannot be modified");
        }

        UserAccountStatus targetStatus = parseAccountStatus(request.getAccountStatus());
        targetUser.setAccountStatus(targetStatus);
        userRepository.save(targetUser);

        if (targetStatus != UserAccountStatus.ACTIVE) {
          refreshTokenRepository.deleteByEmail(targetUser.getEmail());
        }

        UserFileStat stat = loadDashboardStat(targetUser.getIdx());
        return toUserResponse(targetUser, stat);
    }

    private void validateAdministrator(AuthUserDetails adminUser) {
        if (adminUser == null) {
            throw new AccessDeniedException("administrator only");
        }

        if (!isAdministrator(adminUser)) {
            throw new AccessDeniedException("administrator only");
        }
    }

    private boolean isProtectedAdministrator(User user) {
        return storagePlanService.isAdministrator(user);
    }

    private boolean isAdministrator(AuthUserDetails adminUser) {
        if (adminUser == null) {
            return false;
        }

        String role = adminUser.getRole();
        if (role != null && role.toUpperCase(Locale.ROOT).contains("ADMIN")) {
            return true;
        }

        String email = adminUser.getEmail();
        if (email == null || email.isBlank()) {
            email = adminUser.getId();
        }

        return storagePlanService.isAdministrator(
                User.builder()
                        .email(email)
                        .role(role)
                        .build()
        );
    }

    private UserAccountStatus parseAccountStatus(String value) {
        try {
            return UserAccountStatus.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (Exception exception) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private List<AdministratorDto.PlanStatRes> buildPlanStats(
            List<User> users,
            Map<Long, UserFileStat> statsByUserIdx,
            long totalUsers
    ) {
        Map<String, PlanAggregate> aggregates = new HashMap<>();

        for (User user : users) {
            StoragePlan plan = resolvePlan(user);
            UserFileStat stat = statsByUserIdx.getOrDefault(user.getIdx(), UserFileStat.empty());
            aggregates.computeIfAbsent(plan.code(), ignored -> new PlanAggregate(plan))
                    .add(stat.usedBytes());
        }

        return aggregates.values().stream()
                .map(aggregate -> aggregate.toResponse(totalUsers))
                .sorted(Comparator.comparing(AdministratorDto.PlanStatRes::getQuotaBytes).reversed())
                .toList();
    }

    private Map<Long, UserFileStat> loadDashboardStatsByUser() {
        Map<Long, UserFileStat> statsByUserIdx = new HashMap<>();
        fileUpDownloadRepository.aggregateDashboardStatsByUser(FileNodeType.FOLDER)
                .forEach(row -> {
                    Long userIdx = row.getUserIdx();
                    if (userIdx == null) {
                        return;
                    }

                    statsByUserIdx.put(userIdx, toUserFileStat(row));
                });
        return statsByUserIdx;
    }

    private UserFileStat loadDashboardStat(Long userIdx) {
        if (userIdx == null) {
            return UserFileStat.empty();
        }

        return fileUpDownloadRepository.aggregateDashboardStatsForUser(userIdx, FileNodeType.FOLDER)
                .map(this::toUserFileStat)
                .orElseGet(UserFileStat::empty);
    }

    private UserFileStat toUserFileStat(FileUpDownloadRepository.UserDashboardStatProjection row) {
        if (row == null) {
            return UserFileStat.empty();
        }

        return new UserFileStat(
                Math.max(0L, row.getFileCount() == null ? 0L : row.getFileCount()),
                Math.max(0L, row.getFolderCount() == null ? 0L : row.getFolderCount()),
                Math.max(0L, row.getUsedBytes() == null ? 0L : row.getUsedBytes()),
                Math.max(0L, row.getSharedFileCount() == null ? 0L : row.getSharedFileCount())
        );
    }

    private Map<String, User> loadUsersByEmail(List<String> emails) {
        Map<String, User> usersByEmail = new HashMap<>();
        if (emails == null || emails.isEmpty()) {
            return usersByEmail;
        }

        userRepository.findAllByEmailIn(emails).forEach(user -> {
            if (user.getEmail() != null) {
                usersByEmail.put(user.getEmail(), user);
            }
        });
        return usersByEmail;
    }

    private AdministratorDto.SessionRes toSessionResponse(RefreshToken session, User user, LocalDateTime now) {
        LocalDateTime expiresAt = session.getExpiryDate();
        return AdministratorDto.SessionRes.builder()
                .sessionId(session.getId())
                .email(session.getEmail())
                .userIdx(user != null ? user.getIdx() : null)
                .name(user != null ? user.getName() : null)
                .role(user != null ? user.getRole() : null)
                .accountStatus(user != null ? resolveAccountStatus(user).name() : null)
                .enabled(user != null && Boolean.TRUE.equals(user.getEnable()))
                .createdAt(session.getCreatedAt())
                .updatedAt(session.getUpdatedAt())
                .expiresAt(expiresAt)
                .expired(expiresAt != null && !expiresAt.isAfter(now))
                .build();
    }
    private AdministratorDto.UserRes toUserResponse(User user, UserFileStat stat) {
        StoragePlan plan = resolvePlan(user);
        return AdministratorDto.UserRes.builder()
                .idx(user.getIdx())
                .id(resolveUserId(user))
                .name(user.getName())
                .role(user.getRole())
                .accountStatus(resolveAccountStatus(user).name())
                .enabled(Boolean.TRUE.equals(user.getEnable()))
                .planCode(plan.code())
                .planLabel(plan.label())
                .usedBytes(stat.usedBytes())
                .quotaBytes(plan.quotaBytes())
                .usagePercent(toPercent(stat.usedBytes(), plan.quotaBytes()))
                .fileCount(stat.fileCount())
                .folderCount(stat.folderCount())
                .sharedFileCount(stat.sharedFileCount())
                .build();
    }

    private String resolveUserId(User user) {
        if (user == null) {
            return "";
        }

        return user.getEmail();
    }

    private UserAccountStatus resolveAccountStatus(User user) {
        return user.getAccountStatus() == null ? UserAccountStatus.ACTIVE : user.getAccountStatus();
    }

    private boolean isActiveAccount(User user) {
        return resolveAccountStatus(user) == UserAccountStatus.ACTIVE;
    }

    private double toPercent(long numerator, long denominator) {
        if (denominator <= 0) {
            return 0.0;
        }

        return Math.round((numerator * 10000.0) / denominator) / 100.0;
    }

    private StoragePlan resolvePlan(User user) {
        StoragePlanService.StorageQuota quota = storagePlanService.resolveQuota(user);
        return new StoragePlan(quota.planCode(), quota.planLabel(), quota.totalQuotaBytes());
    }

    private record StoragePlan(String code, String label, long quotaBytes) {
    }

    private record UserFileStat(long fileCount, long folderCount, long usedBytes, long sharedFileCount) {
        private static UserFileStat empty() {
            return new UserFileStat(0L, 0L, 0L, 0L);
        }
    }

    private static class PlanAggregate {
        private final StoragePlan plan;
        private long userCount;
        private long usedBytes;

        private PlanAggregate(StoragePlan plan) {
            this.plan = plan;
        }

        private void add(long userUsedBytes) {
            this.userCount += 1;
            this.usedBytes += userUsedBytes;
        }

        private AdministratorDto.PlanStatRes toResponse(long totalUsers) {
            long totalQuotaBytes = userCount * plan.quotaBytes();
            return AdministratorDto.PlanStatRes.builder()
                    .planCode(plan.code())
                    .planLabel(plan.label())
                    .userCount(userCount)
                    .userPercent(totalUsers <= 0 ? 0.0 : Math.round((userCount * 10000.0) / totalUsers) / 100.0)
                    .usedBytes(usedBytes)
                    .quotaBytes(totalQuotaBytes)
                    .usagePercent(totalQuotaBytes <= 0 ? 0.0 : Math.round((usedBytes * 10000.0) / totalQuotaBytes) / 100.0)
                    .build();
        }
    }
}
