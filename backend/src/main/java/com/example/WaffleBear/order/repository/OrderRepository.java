package com.example.WaffleBear.order.repository;

import com.example.WaffleBear.order.model.Order;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByOrderId(String orderId);
    Optional<Order> findByPaymentId(String paymentId);
    boolean existsByPaymentIdAndOrderIdNot(String paymentId, String orderId);
    List<Order> findAllByUser_Idx(Long userIdx);
    void deleteAllByUser_Idx(Long userIdx);

    @EntityGraph(attributePaths = "user")
    List<Order> findAllByUser_IdxIn(Collection<Long> userIds);
}
