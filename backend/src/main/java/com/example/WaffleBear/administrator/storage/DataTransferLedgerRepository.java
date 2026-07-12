package com.example.WaffleBear.administrator.storage;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface DataTransferLedgerRepository extends JpaRepository<DataTransferLedger, Long> {
    @Query("""
            select ledger.user.idx as userIdx,
                   ledger.direction as direction,
                   ledger.source as source,
                   ledger.status as status,
                   sum(ledger.bytes) as totalBytes,
                   count(ledger.id) as eventCount
            from DataTransferLedger ledger
            where (:startedAt is null or ledger.createdAt >= :startedAt)
              and ledger.bytes > 0
            group by ledger.user.idx, ledger.direction, ledger.source, ledger.status
            """)
    List<TransferAggregate> aggregateByUserAndTransfer(@Param("startedAt") LocalDateTime startedAt);
}