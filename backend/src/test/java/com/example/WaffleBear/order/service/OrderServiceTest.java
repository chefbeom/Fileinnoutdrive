package com.example.WaffleBear.order.service;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.file.service.StoragePlanService;
import com.example.WaffleBear.order.model.Order;
import com.example.WaffleBear.order.model.dto.OrderDto;
import com.example.WaffleBear.order.repository.OrderRepository;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import io.portone.sdk.server.payment.PaidPayment;
import io.portone.sdk.server.payment.PaymentAmount;
import io.portone.sdk.server.payment.PaymentClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private ObjectProvider<PaymentClient> paymentClientProvider;

    @Mock
    private StoragePlanService storagePlanService;

    @Mock
    private PaymentClient paymentClient;

    private OrderService orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderService(orderRepository, userRepository, paymentClientProvider, storagePlanService);
    }

    @Test
    void verifyAndCompleteOrderRejectsReusedPaymentId() {
        Order order = Order.builder()
                .orderId("order-1")
                .user(User.builder().idx(1L).email("user@example.com").build())
                .productCode("PLUS")
                .amount(BigDecimal.valueOf(9900))
                .build();
        when(orderRepository.findByOrderId("order-1")).thenReturn(Optional.of(order));
        when(orderRepository.existsByPaymentIdAndOrderIdNot("pay-dup", "order-1")).thenReturn(true);

        assertThrows(
                BaseException.class,
                () -> orderService.verifyAndCompleteOrder("user@example.com", new OrderDto.OrderVerifyRequest("pay-dup", "order-1"))
        );
    }

    @Test
    void verifyAndCompleteOrderRejectsMismatchedPaidAmount() {
        Order order = Order.builder()
                .orderId("order-1")
                .user(User.builder().idx(1L).email("user@example.com").build())
                .productCode("PLUS")
                .amount(BigDecimal.valueOf(9900))
                .build();
        PaidPayment paidPayment = mock(PaidPayment.class);
        PaymentAmount amount = mock(PaymentAmount.class);
        when(amount.getTotal()).thenReturn(100L);
        when(paidPayment.getAmount()).thenReturn(amount);

        when(orderRepository.findByOrderId("order-1")).thenReturn(Optional.of(order));
        when(orderRepository.existsByPaymentIdAndOrderIdNot("pay-1", "order-1")).thenReturn(false);
        when(paymentClientProvider.getIfAvailable()).thenReturn(paymentClient);
        when(paymentClient.getPayment("pay-1")).thenReturn(CompletableFuture.completedFuture(paidPayment));

        assertThrows(
                BaseException.class,
                () -> orderService.verifyAndCompleteOrder("user@example.com", new OrderDto.OrderVerifyRequest("pay-1", "order-1"))
        );
    }

    @Test
    void verifyAndCompleteOrderSucceedsWhenPaidPaymentMatchesOrderAmount() {
        Order order = Order.builder()
                .orderId("order-1")
                .user(User.builder().idx(1L).email("user@example.com").build())
                .productCode("PLUS")
                .amount(BigDecimal.valueOf(9900))
                .build();
        PaidPayment paidPayment = mock(PaidPayment.class);
        PaymentAmount amount = mock(PaymentAmount.class);
        when(amount.getTotal()).thenReturn(9900L);
        when(paidPayment.getAmount()).thenReturn(amount);

        when(orderRepository.findByOrderId("order-1")).thenReturn(Optional.of(order));
        when(orderRepository.existsByPaymentIdAndOrderIdNot("pay-ok", "order-1")).thenReturn(false);
        when(paymentClientProvider.getIfAvailable()).thenReturn(paymentClient);
        when(paymentClient.getPayment("pay-ok")).thenReturn(CompletableFuture.completedFuture(paidPayment));

        orderService.verifyAndCompleteOrder("user@example.com", new OrderDto.OrderVerifyRequest("pay-ok", "order-1"));

        assertEquals("pay-ok", order.getPaymentId());
        verify(orderRepository).save(order);
    }
}
