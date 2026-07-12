package com.example.WaffleBear.file.service;

import com.example.WaffleBear.order.model.Order;
import com.example.WaffleBear.order.repository.OrderRepository;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoragePlanServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private StoragePlanService storagePlanService;

    @Test
    void resolvesMultipleUserQuotasWithOneOrderQuery() {
        User freeUser = user(1L, "free@example.com", "ROLE_USER");
        User plusUser = user(2L, "plus@example.com", "ROLE_USER");
        User administrator = user(3L, "admin@example.com", "ROLE_ADMIN");

        Order membership = activeOrder(plusUser, "PLUS", "MEMBERSHIP");
        Order addOn = activeOrder(plusUser, "ADDON_20GB", "STORAGE");
        when(orderRepository.findAllByUser_IdxIn(anyCollection()))
                .thenReturn(List.of(membership, addOn));

        Map<Long, StoragePlanService.StorageQuota> quotas = storagePlanService.resolveQuotas(
                List.of(freeUser, plusUser, administrator)
        );

        assertEquals(StoragePlanService.FREE_STORAGE_BYTES, quotas.get(1L).totalQuotaBytes());
        assertEquals("PLUS", quotas.get(2L).planCode());
        assertEquals(
                StoragePlanService.PLUS_STORAGE_BYTES + (20L * StoragePlanService.GIGABYTE),
                quotas.get(2L).totalQuotaBytes()
        );
        assertEquals(StoragePlanService.ADMIN_STORAGE_BYTES, quotas.get(3L).totalQuotaBytes());

        @SuppressWarnings("unchecked")
        ArgumentCaptor<Collection<Long>> userIds = ArgumentCaptor.forClass(Collection.class);
        verify(orderRepository).findAllByUser_IdxIn(userIds.capture());
        assertEquals(Set.of(1L, 2L), Set.copyOf(userIds.getValue()));
        verify(orderRepository, never()).findAllByUser_Idx(anyLong());
    }

    @Test
    void skipsOrderQueryWhenOnlyAdministratorsAreRequested() {
        User administrator = user(7L, "admin@example.com", "ROLE_ADMIN");

        Map<Long, StoragePlanService.StorageQuota> quotas =
                storagePlanService.resolveQuotas(List.of(administrator));

        assertEquals(StoragePlanService.ADMIN_STORAGE_BYTES, quotas.get(7L).totalQuotaBytes());
        verifyNoInteractions(orderRepository);
    }

    private static User user(Long idx, String email, String role) {
        return User.builder()
                .idx(idx)
                .email(email)
                .name(email)
                .role(role)
                .build();
    }

    private static Order activeOrder(User user, String productCode, String category) {
        return Order.builder()
                .orderId("order-" + productCode)
                .paymentId("payment-" + productCode)
                .user(user)
                .productCode(productCode)
                .productCategory(category)
                .expiresAt(LocalDateTime.now().plusDays(1))
                .build();
    }
}