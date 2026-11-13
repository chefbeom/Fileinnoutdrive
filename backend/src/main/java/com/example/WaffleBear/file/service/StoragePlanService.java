package com.example.WaffleBear.file.service;

import com.example.WaffleBear.administrator.storage.StorageAnalyticsConfig;
import com.example.WaffleBear.administrator.storage.StorageAnalyticsConfigRepository;
import com.example.WaffleBear.order.model.Order;
import com.example.WaffleBear.order.repository.OrderRepository;
import com.example.WaffleBear.storageshare.model.SharedStorageMember;
import com.example.WaffleBear.storageshare.model.StorageGrant;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.MemberStatus;
import com.example.WaffleBear.storageshare.model.StorageShareEnums.SharedStorageStatus;
import com.example.WaffleBear.storageshare.repository.SharedStorageMemberRepository;
import com.example.WaffleBear.storageshare.repository.StorageGrantRepository;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

@Service
@RequiredArgsConstructor
public class StoragePlanService {
    private static final String DEFAULT_ADMIN_EMAIL = "administrator@administrator.adm";
    private static final Long CONFIG_ID = 1L;
    private static final String MAX_UPLOAD_FILE_BYTES_REDIS_KEY = "wafflebear:settings:max-upload-file-bytes";

    public static final long GIGABYTE = 1024L * 1024 * 1024;
    public static final long TERABYTE = 1024L * GIGABYTE;
    public static final long FREE_STORAGE_BYTES = 20L * GIGABYTE;
    public static final long PLUS_STORAGE_BYTES = 500L * GIGABYTE;
    public static final long PREMIUM_STORAGE_BYTES = 1L * TERABYTE;
    public static final long ADMIN_STORAGE_BYTES = 10L * TERABYTE;

    private static final long STANDARD_MAX_UPLOAD_FILE_BYTES = 5L * GIGABYTE;
    private static final long PREMIUM_MAX_UPLOAD_FILE_BYTES = 20L * GIGABYTE;
    public static final long ADMIN_MAX_UPLOAD_FILE_BYTES = 20L * GIGABYTE;
    private static final int FREE_MAX_UPLOAD_COUNT = 30;
    private static final int STANDARD_MAX_UPLOAD_COUNT = 100;
    private static final int PREMIUM_MAX_UPLOAD_COUNT = 300;
    private static final int ADMIN_MAX_UPLOAD_COUNT = 500;

    private static final String CATEGORY_MEMBERSHIP = "MEMBERSHIP";
    private static final String CATEGORY_STORAGE = "STORAGE";
    private static final String CATEGORY_INTERNAL = "INTERNAL";

    // 구매 가능한 플랜 정보
    private static final Map<String, ProductDefinition> PRODUCT_DEFINITIONS = Map.ofEntries(
            Map.entry("FREE", new ProductDefinition(
                    "FREE",
                    "기본 20GB",
                    "기본 멤버십",
                    CATEGORY_MEMBERSHIP,
                    FREE_STORAGE_BYTES,
                    BigDecimal.ZERO,
                    0,
                    false,
                    false,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    FREE_MAX_UPLOAD_COUNT
            )),
            Map.entry("PLUS", new ProductDefinition(
                    "PLUS",
                    "플러스 500GB",
                    "플러스 멤버십",
                    CATEGORY_MEMBERSHIP,
                    PLUS_STORAGE_BYTES,
                    new BigDecimal("129000"),
                    1,
                    true,
                    true,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    STANDARD_MAX_UPLOAD_COUNT
            )),
            Map.entry("PREMIUM", new ProductDefinition(
                    "PREMIUM",
                    "프리미엄 1TB",
                    "프리미엄 멤버십",
                    CATEGORY_MEMBERSHIP,
                    PREMIUM_STORAGE_BYTES,
                    new BigDecimal("229000"),
                    1,
                    true,
                    true,
                    PREMIUM_MAX_UPLOAD_FILE_BYTES,
                    PREMIUM_MAX_UPLOAD_COUNT
            )),
            Map.entry("ADDON_20GB", new ProductDefinition(
                    "ADDON_20GB",
                    "추가 20GB",
                    "추가 저장용량",
                    CATEGORY_STORAGE,
                    20L * GIGABYTE,
                    new BigDecimal("24000"),
                    1,
                    false,
                    false,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    STANDARD_MAX_UPLOAD_COUNT
            )),
            Map.entry("ADDON_40GB", new ProductDefinition(
                    "ADDON_40GB",
                    "추가 40GB",
                    "추가 저장용량",
                    CATEGORY_STORAGE,
                    40L * GIGABYTE,
                    new BigDecimal("43000"),
                    1,
                    false,
                    false,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    STANDARD_MAX_UPLOAD_COUNT
            )),
            Map.entry("ADDON_80GB", new ProductDefinition(
                    "ADDON_80GB",
                    "추가 80GB",
                    "추가 저장용량",
                    CATEGORY_STORAGE,
                    80L * GIGABYTE,
                    new BigDecimal("79000"),
                    1,
                    false,
                    false,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    STANDARD_MAX_UPLOAD_COUNT
            )),
            Map.entry("ADDON_100GB", new ProductDefinition(
                    "ADDON_100GB",
                    "추가 100GB",
                    "추가 저장용량",
                    CATEGORY_STORAGE,
                    100L * GIGABYTE,
                    new BigDecimal("94000"),
                    1,
                    false,
                    false,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    STANDARD_MAX_UPLOAD_COUNT
            )),
            Map.entry("ADDON_1TB", new ProductDefinition(
                    "ADDON_1TB",
                    "추가 1TB",
                    "추가 저장용량",
                    CATEGORY_STORAGE,
                    1L * TERABYTE,
                    new BigDecimal("249000"),
                    1,
                    false,
                    false,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    STANDARD_MAX_UPLOAD_COUNT
            )),
            Map.entry("ADDON_5TB", new ProductDefinition(
                    "ADDON_5TB",
                    "추가 5TB",
                    "추가 저장용량",
                    CATEGORY_STORAGE,
                    5L * TERABYTE,
                    new BigDecimal("890000"),
                    1,
                    false,
                    false,
                    STANDARD_MAX_UPLOAD_FILE_BYTES,
                    STANDARD_MAX_UPLOAD_COUNT
            )),
            Map.entry("ADMIN", new ProductDefinition(
                    "ADMIN",
                    "관리자 10TB",
                    "관리자",
                    CATEGORY_INTERNAL,
                    ADMIN_STORAGE_BYTES,
                    BigDecimal.ZERO,
                    0,
                    true,
                    true,
                    ADMIN_MAX_UPLOAD_FILE_BYTES,
                    ADMIN_MAX_UPLOAD_COUNT
            ))
    );

    private final OrderRepository orderRepository;
    private final UserRepository userRepository;

    @Autowired(required = false)
    private StorageAnalyticsConfigRepository storageAnalyticsConfigRepository;

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @Autowired(required = false)
    private StorageGrantRepository storageGrantRepository;

    @Autowired(required = false)
    private SharedStorageMemberRepository sharedStorageMemberRepository;

    private final AtomicLong configuredMaxUploadFileBytes = new AtomicLong(-1L);

    @Value("${app.demo.enabled:true}")
    private boolean demoEnabled;

    @Value("${app.demo.email:demo@fileinnout.local}")
    private String demoEmail;

    @Value("${app.demo.storage-quota-bytes:104857600}")
    private long demoStorageQuotaBytes;

    @Value("${app.demo.max-upload-file-bytes:10485760}")
    private long demoMaxUploadFileBytes;

    @Value("${app.demo.max-upload-count:20}")
    private int demoMaxUploadCount;

    public long getConfiguredMaxUploadFileBytes() {
        long cached = configuredMaxUploadFileBytes.get();
        if (cached > 0L) {
            return cached;
        }

        if (storageAnalyticsConfigRepository != null) {
            try {
                StorageAnalyticsConfig config = storageAnalyticsConfigRepository.findById(CONFIG_ID).orElse(null);
                if (config != null && config.getMaxUploadFileBytes() != null && config.getMaxUploadFileBytes() > 0L) {
                    long dbBytes = config.getMaxUploadFileBytes();
                    configuredMaxUploadFileBytes.set(dbBytes);
                    return dbBytes;
                }
            } catch (Exception ignored) {
            }
        }

        if (stringRedisTemplate != null) {
            try {
                String raw = stringRedisTemplate.opsForValue().get(MAX_UPLOAD_FILE_BYTES_REDIS_KEY);
                if (raw != null && !raw.isBlank()) {
                    long parsed = Long.parseLong(raw.trim());
                    if (parsed > 0L) {
                        configuredMaxUploadFileBytes.set(parsed);
                        return parsed;
                    }
                }
            } catch (Exception ignored) {
            }
        }

        return ADMIN_MAX_UPLOAD_FILE_BYTES;
    }

    public long updateConfiguredMaxUploadFileBytes(long maxUploadFileBytes) {
        long safeBytes = Math.max(1L, maxUploadFileBytes);
        configuredMaxUploadFileBytes.set(safeBytes);

        if (storageAnalyticsConfigRepository != null) {
            try {
                StorageAnalyticsConfig config = storageAnalyticsConfigRepository.findById(CONFIG_ID)
                        .orElseGet(() -> StorageAnalyticsConfig.builder()
                                .id(CONFIG_ID)
                                .providerCapacityBytes(StorageAnalyticsConfig.DEFAULT_PROVIDER_CAPACITY_BYTES)
                                .maxUploadFileBytes(safeBytes)
                                .build());
                config.changeMaxUploadFileBytes(safeBytes);
                storageAnalyticsConfigRepository.save(config);
            } catch (Exception ignored) {
            }
        }

        if (stringRedisTemplate != null) {
            try {
                stringRedisTemplate.opsForValue().set(MAX_UPLOAD_FILE_BYTES_REDIS_KEY, Long.toString(safeBytes));
            } catch (Exception ignored) {
            }
        }

        return safeBytes;
    }

    public ProductDefinition requireProduct(String productCode) {
        ProductDefinition product = resolveProduct(productCode);
        if (product == null || CATEGORY_INTERNAL.equals(product.category())) {
            throw new IllegalArgumentException("unknown product code");
        }
        ensureMembershipPurchaseAllowed(product);
        return product;
    }

    public ProductDefinition resolveProduct(String productCode) {
        if (productCode == null || productCode.isBlank()) {
            return PRODUCT_DEFINITIONS.get("FREE");
        }
        return PRODUCT_DEFINITIONS.get(normalizeProductCode(productCode));
    }

    // 사용자의 idx가 널이거나, 0보다 작을 경우
    public StorageQuota resolveQuota(Long userIdx) {
        if (userIdx == null || userIdx <= 0) {
            return toQuota(PRODUCT_DEFINITIONS.get("FREE"), 0L);
        }

        User user = userRepository.findById(userIdx).orElse(null);
        return resolveQuota(user);
    }

    public StorageQuota resolveQuota(User user) {
        StorageQuota ownQuota = resolveOwnPlanQuota(user);
        if (user == null || user.getIdx() == null || user.getIdx() <= 0L || isDemoAccount(user)) {
            return ownQuota;
        }

        CapacityAdjustment adjustment = resolveCapacityAdjustment(user.getIdx(), LocalDateTime.now());
        return applyCapacityAdjustment(ownQuota, adjustment);
    }

    public StorageQuota resolveOwnPlanQuota(Long userIdx) {
        if (userIdx == null || userIdx <= 0) {
            return toQuota(PRODUCT_DEFINITIONS.get("FREE"), 0L);
        }
        User user = userRepository.findById(userIdx).orElse(null);
        return resolveOwnPlanQuota(user);
    }

    public StorageQuota resolveOwnPlanQuota(User user) {
        if (user == null) {
            return toQuota(PRODUCT_DEFINITIONS.get("FREE"), 0L);
        }

        if (isDemoAccount(user)) {
            return demoQuota();
        }

        if (isAdministrator(user)) {
            return toQuota(PRODUCT_DEFINITIONS.get("ADMIN"), 0L);
        }

        List<Order> orders = orderRepository.findAllByUser_Idx(user.getIdx());
        return resolveQuotaFromOrders(orders, LocalDateTime.now());
    }

    public CapacityAdjustment resolveCapacityAdjustment(Long userIdx, LocalDateTime now) {
        if (userIdx == null || userIdx <= 0L) {
            return CapacityAdjustment.ZERO;
        }
        LocalDateTime referenceTime = now == null ? LocalDateTime.now() : now;
        long grantedOut = 0L;
        long grantedIn = 0L;
        long sharedContribution = 0L;

        if (storageGrantRepository != null) {
            try {
                grantedOut = storageGrantRepository.findAllByGranter_IdxOrderByCreatedAtDesc(userIdx).stream()
                        .filter(grant -> grant != null && grant.isOpenAt(referenceTime))
                        .mapToLong(StorageGrant::safeBytes)
                        .sum();
                grantedIn = storageGrantRepository.findAllByRecipient_IdxOrderByCreatedAtDesc(userIdx).stream()
                        .filter(grant -> grant != null && grant.isEffectiveAt(referenceTime))
                        .mapToLong(StorageGrant::safeBytes)
                        .sum();
            } catch (Exception ignored) {
            }
        }

        if (sharedStorageMemberRepository != null) {
            try {
                sharedContribution = sharedStorageMemberRepository.findAllByUser_IdxAndStatus(userIdx, MemberStatus.ACTIVE).stream()
                        .filter(member -> member != null
                                && member.getStorage() != null
                                && member.getStorage().getStatus() == SharedStorageStatus.ACTIVE)
                        .mapToLong(SharedStorageMember::safeContributionBytes)
                        .sum();
            } catch (Exception ignored) {
            }
        }

        return new CapacityAdjustment(grantedIn, grantedOut, sharedContribution);
    }

    private StorageQuota applyCapacityAdjustment(StorageQuota ownQuota, CapacityAdjustment adjustment) {
        if (ownQuota == null || adjustment == null || adjustment.isZero()) {
            return ownQuota;
        }

        long adjustedTotal = Math.max(
                0L,
                ownQuota.totalQuotaBytes()
                        + adjustment.grantedInBytes()
                        - adjustment.grantedOutBytes()
                        - adjustment.sharedStorageContributionBytes()
        );

        StringBuilder labelBuilder = new StringBuilder(ownQuota.planLabel());
        if (adjustment.grantedInBytes() > 0L) {
            labelBuilder.append(" + 공유받음 ").append(formatQuota(adjustment.grantedInBytes()));
        }
        if (adjustment.grantedOutBytes() > 0L) {
            labelBuilder.append(" - 공유중 ").append(formatQuota(adjustment.grantedOutBytes()));
        }
        if (adjustment.sharedStorageContributionBytes() > 0L) {
            labelBuilder.append(" - 공유저장소 ").append(formatQuota(adjustment.sharedStorageContributionBytes()));
        }

        return new StorageQuota(
                ownQuota.planCode(),
                ownQuota.membershipLabel(),
                labelBuilder.toString(),
                ownQuota.baseQuotaBytes(),
                ownQuota.addonQuotaBytes(),
                adjustedTotal,
                ownQuota.shareEnabled(),
                ownQuota.fileLockEnabled(),
                ownQuota.maxUploadFileBytes(),
                ownQuota.maxUploadCount()
        );
    }

    public Map<Long, StorageQuota> resolveQuotas(List<User> users) {
        if (users == null || users.isEmpty()) {
            return Map.of();
        }

        Map<Long, User> usersById = new LinkedHashMap<>();
        for (User user : users) {
            if (user != null && user.getIdx() != null && user.getIdx() > 0L) {
                usersById.putIfAbsent(user.getIdx(), user);
            }
        }
        if (usersById.isEmpty()) {
            return Map.of();
        }

        List<Long> regularUserIds = usersById.values().stream()
                .filter(user -> !isDemoAccount(user))
                .filter(user -> !isAdministrator(user))
                .map(User::getIdx)
                .toList();

        Map<Long, List<Order>> ordersByUser = new HashMap<>();
        if (!regularUserIds.isEmpty()) {
            for (Order order : orderRepository.findAllByUser_IdxIn(regularUserIds)) {
                Long userIdx = order == null || order.getUser() == null
                        ? null
                        : order.getUser().getIdx();
                if (userIdx != null) {
                    ordersByUser.computeIfAbsent(userIdx, ignored -> new ArrayList<>())
                            .add(order);
                }
            }
        }

        LocalDateTime now = LocalDateTime.now();
        Map<Long, CapacityAdjustment> adjustmentsByUser = resolveBulkCapacityAdjustments(usersById.keySet(), now);
        Map<Long, StorageQuota> quotasByUser = new LinkedHashMap<>();
        usersById.forEach((userIdx, user) -> {
            StorageQuota ownQuota = isDemoAccount(user)
                    ? demoQuota()
                    : isAdministrator(user)
                            ? toQuota(PRODUCT_DEFINITIONS.get("ADMIN"), 0L)
                            : resolveQuotaFromOrders(ordersByUser.getOrDefault(userIdx, List.of()), now);
            StorageQuota effectiveQuota = isDemoAccount(user)
                    ? ownQuota
                    : applyCapacityAdjustment(ownQuota, adjustmentsByUser.getOrDefault(userIdx, CapacityAdjustment.ZERO));
            quotasByUser.put(userIdx, effectiveQuota);
        });
        return Map.copyOf(quotasByUser);
    }

    private Map<Long, CapacityAdjustment> resolveBulkCapacityAdjustments(java.util.Collection<Long> userIds, LocalDateTime now) {
        if (userIds == null || userIds.isEmpty() || (storageGrantRepository == null && sharedStorageMemberRepository == null)) {
            return Map.of();
        }

        Map<Long, Long> grantedOutByUser = new HashMap<>();
        Map<Long, Long> grantedInByUser = new HashMap<>();
        Map<Long, Long> sharedContributionByUser = new HashMap<>();

        if (storageGrantRepository != null) {
            try {
                for (StorageGrant grant : storageGrantRepository.findAllByGranter_IdxIn(userIds)) {
                    if (grant != null && grant.getGranter() != null && grant.isOpenAt(now)) {
                        grantedOutByUser.merge(grant.getGranter().getIdx(), grant.safeBytes(), Long::sum);
                    }
                }
                for (StorageGrant grant : storageGrantRepository.findAllByRecipient_IdxIn(userIds)) {
                    if (grant != null && grant.getRecipient() != null && grant.isEffectiveAt(now)) {
                        grantedInByUser.merge(grant.getRecipient().getIdx(), grant.safeBytes(), Long::sum);
                    }
                }
            } catch (Exception ignored) {
            }
        }

        if (sharedStorageMemberRepository != null) {
            try {
                for (SharedStorageMember member : sharedStorageMemberRepository.findAllByUser_IdxInAndStatus(userIds, MemberStatus.ACTIVE)) {
                    if (member != null
                            && member.getUser() != null
                            && member.getStorage() != null
                            && member.getStorage().getStatus() == SharedStorageStatus.ACTIVE) {
                        sharedContributionByUser.merge(member.getUser().getIdx(), member.safeContributionBytes(), Long::sum);
                    }
                }
            } catch (Exception ignored) {
            }
        }

        Map<Long, CapacityAdjustment> result = new HashMap<>();
        for (Long userId : userIds) {
            result.put(userId, new CapacityAdjustment(
                    grantedInByUser.getOrDefault(userId, 0L),
                    grantedOutByUser.getOrDefault(userId, 0L),
                    sharedContributionByUser.getOrDefault(userId, 0L)
            ));
        }
        return result;
    }

    private StorageQuota resolveQuotaFromOrders(List<Order> orders, LocalDateTime now) {
        List<Order> safeOrders = orders == null ? List.of() : orders;
        ProductDefinition membershipProduct = safeOrders.stream()
                .filter(this::isCompletedOrder)
                .filter(order -> CATEGORY_MEMBERSHIP.equals(resolveCategory(order)))
                .filter(order -> isActive(order, now))
                .sorted(Comparator
                        .comparing((Order order) -> resolveExpiry(order, now), Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Order::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Order::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::resolveProductFromOrder)
                .findFirst()
                .orElse(PRODUCT_DEFINITIONS.get("FREE"));

        long addonBytes = safeOrders.stream()
                .filter(this::isCompletedOrder)
                .filter(order -> CATEGORY_STORAGE.equals(resolveCategory(order)))
                .filter(order -> isActive(order, now))
                .mapToLong(this::resolveQuotaBytes)
                .sum();

        return toQuota(membershipProduct, addonBytes);
    }

    public LocalDateTime calculateExpiry(ProductDefinition product, LocalDateTime purchasedAt) {
        if (product == null || product.durationYears() <= 0) {
            return null;
        }

        LocalDateTime base = purchasedAt == null ? LocalDateTime.now() : purchasedAt;
        return base.plusYears(product.durationYears());
    }

    private StorageQuota toQuota(ProductDefinition membershipProduct, long addonBytes) {
        ProductDefinition safeProduct = membershipProduct == null ? PRODUCT_DEFINITIONS.get("FREE") : membershipProduct;
        long baseQuotaBytes = safeProduct.quotaBytes();
        long extraBytes = Math.max(0L, addonBytes);
        long totalQuotaBytes = baseQuotaBytes + extraBytes;
        String planLabel = safeProduct.displayName();

        if (extraBytes > 0) {
            planLabel = planLabel + " + 추가 " + formatQuota(extraBytes);
        }

        long maxUploadFileBytes = getConfiguredMaxUploadFileBytes();

        return new StorageQuota(
                safeProduct.code(),
                safeProduct.membershipLabel(),
                planLabel,
                baseQuotaBytes,
                extraBytes,
                totalQuotaBytes,
                safeProduct.shareEnabled(),
                safeProduct.fileLockEnabled(),
                maxUploadFileBytes,
                safeProduct.maxUploadCount()
        );
    }

    private boolean isDemoAccount(User user) {
        return demoEnabled
                && user != null
                && user.getEmail() != null
                && user.getEmail().trim().equalsIgnoreCase(normalizedDemoEmail());
    }

    private StorageQuota demoQuota() {
        long totalQuotaBytes = Math.max(1L, demoStorageQuotaBytes);
        return new StorageQuota(
                "PREMIUM",
                "프리미엄 체험",
                "프리미엄 체험 · 로그아웃 시 초기화",
                totalQuotaBytes,
                0L,
                totalQuotaBytes,
                true,
                true,
                Math.max(1L, demoMaxUploadFileBytes),
                Math.max(1, demoMaxUploadCount)
        );
    }

    private String normalizedDemoEmail() {
        return demoEmail == null || demoEmail.isBlank() ? "demo@fileinnout.local" : demoEmail.trim();
    }

    public boolean isAdministrator(Long userIdx) {
        if (userIdx == null || userIdx <= 0) {
            return false;
        }

        User user = userRepository.findById(userIdx).orElse(null);
        return isAdministrator(user);
    }

    public boolean isAdministrator(User user) {
        if (user == null) {
            return false;
        }

        String role = user.getRole();
        if (role != null && role.toUpperCase(Locale.ROOT).contains("ADMIN")) {
            return true;
        }

        String email = user.getEmail();
        return email != null && DEFAULT_ADMIN_EMAIL.equalsIgnoreCase(email.trim());
    }

    private boolean isCompletedOrder(Order order) {
        return order != null && order.getPaymentId() != null && !order.getPaymentId().isBlank();
    }

    private boolean isActive(Order order, LocalDateTime now) {
        LocalDateTime expiresAt = resolveExpiry(order, now);
        return expiresAt == null || !expiresAt.isBefore(now);
    }

    private LocalDateTime resolveExpiry(Order order, LocalDateTime now) {
        if (order == null) {
            return null;
        }

        if (order.getExpiresAt() != null) {
            return order.getExpiresAt();
        }

        ProductDefinition product = resolveProductFromOrder(order);
        if (product == null || product.durationYears() <= 0) {
            return null;
        }

        LocalDateTime purchasedAt = toLocalDateTime(order.getUpdatedAt());
        if (purchasedAt == null) {
            purchasedAt = toLocalDateTime(order.getCreatedAt());
        }

        if (purchasedAt == null) {
            return null;
        }

        return purchasedAt.plusYears(product.durationYears());
    }

    private String resolveCategory(Order order) {
        if (order == null) {
            return CATEGORY_MEMBERSHIP;
        }

        if (order.getProductCategory() != null && !order.getProductCategory().isBlank()) {
            return order.getProductCategory().trim().toUpperCase(Locale.ROOT);
        }

        ProductDefinition product = resolveProductFromOrder(order);
        return product != null ? product.category() : CATEGORY_MEMBERSHIP;
    }

    private long resolveQuotaBytes(Order order) {
        if (order == null) {
            return 0L;
        }

        if (order.getQuotaBytes() != null && order.getQuotaBytes() > 0) {
            return order.getQuotaBytes();
        }

        ProductDefinition product = resolveProductFromOrder(order);
        return product != null ? product.quotaBytes() : 0L;
    }

    private ProductDefinition resolveProductFromOrder(Order order) {
        if (order == null) {
            return PRODUCT_DEFINITIONS.get("FREE");
        }

        ProductDefinition product = resolveProduct(order.getProductCode());
        if (product != null) {
            return product;
        }

        String legacyPlanType = normalizeProductCode(order.getPlanType());
        return switch (legacyPlanType) {
            case "PLUS", "PRO", "PROFESSIONAL" -> PRODUCT_DEFINITIONS.get("PLUS");
            case "PREMIUM", "VIP", "ENTERPRISE" -> PRODUCT_DEFINITIONS.get("PREMIUM");
            default -> PRODUCT_DEFINITIONS.get("FREE");
        };
    }

    private void ensureMembershipPurchaseAllowed(ProductDefinition product) {
        if (product == null || !CATEGORY_MEMBERSHIP.equals(product.category())) {
            return;
        }

        ProductDefinition currentMembership = resolveAuthenticatedMembershipProduct();
        if (currentMembership == null) {
            return;
        }

        if (membershipRank(product.code()) < membershipRank(currentMembership.code())) {
            throw new IllegalArgumentException("lower membership purchase is blocked");
        }
    }

    private ProductDefinition resolveAuthenticatedMembershipProduct() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return null;
        }

        Object principal = authentication.getPrincipal();
        User user = null;

        if (principal instanceof AuthUserDetails authUserDetails && authUserDetails.getIdx() != null) {
            user = userRepository.findById(authUserDetails.getIdx()).orElse(null);
        }

        if (user == null) {
            String email = authentication.getName();
            if (email != null && !email.isBlank() && !"anonymousUser".equalsIgnoreCase(email)) {
                user = userRepository.findByEmail(email).orElse(null);
            }
        }

        if (user == null) {
            return null;
        }

        return PRODUCT_DEFINITIONS.getOrDefault(resolveQuota(user).planCode(), PRODUCT_DEFINITIONS.get("FREE"));
    }

    private int membershipRank(String productCode) {
        return switch (normalizeProductCode(productCode)) {
            case "PREMIUM", "ADMIN" -> 2;
            case "PLUS" -> 1;
            default -> 0;
        };
    }

    private String normalizeProductCode(String value) {
        return value == null ? "FREE" : value.trim().toUpperCase(Locale.ROOT);
    }

    private String formatQuota(long quotaBytes) {
        if (quotaBytes <= 0) {
            return "0GB";
        }

        if (quotaBytes % TERABYTE == 0) {
            return (quotaBytes / TERABYTE) + "TB";
        }

        if (quotaBytes % GIGABYTE == 0) {
            return (quotaBytes / GIGABYTE) + "GB";
        }

        double quotaInGigabytes = quotaBytes / (double) GIGABYTE;
        return String.format(Locale.ROOT, "%.1fGB", quotaInGigabytes);
    }

    private LocalDateTime toLocalDateTime(Date value) {
        if (value == null) {
            return null;
        }

        return value.toInstant()
                .atZone(ZoneId.systemDefault())
                .toLocalDateTime();
    }

    public record ProductDefinition(
            String code,
            String displayName,
            String membershipLabel,
            String category,
            long quotaBytes,
            BigDecimal amount,
            int durationYears,
            boolean fileLockEnabled,
            boolean shareEnabled,
            long maxUploadFileBytes,
            int maxUploadCount
    ) {
    }

    // 레코드 형식으로 자동적으로 자동으로 getter 메서드를 생성
    // 레코드는 불변객체로 setter가 없음
    public record StorageQuota(
            String planCode,
            String membershipLabel,
            String planLabel,
            long baseQuotaBytes,
            long addonQuotaBytes,
            long totalQuotaBytes,
            boolean shareEnabled,
            boolean fileLockEnabled,
            long maxUploadFileBytes,
            int maxUploadCount
    ) {
    }

    public record CapacityAdjustment(
            long grantedInBytes,
            long grantedOutBytes,
            long sharedStorageContributionBytes
    ) {
        public static final CapacityAdjustment ZERO = new CapacityAdjustment(0L, 0L, 0L);

        public boolean isZero() {
            return grantedInBytes == 0L && grantedOutBytes == 0L && sharedStorageContributionBytes == 0L;
        }
    }
}
