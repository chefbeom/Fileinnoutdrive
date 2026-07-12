package com.example.WaffleBear.administrator.storage;

public interface TransferAggregate {
    Long getUserIdx();

    DataTransferDirection getDirection();

    DataTransferSource getSource();

    DataTransferStatus getStatus();

    Long getTotalBytes();

    Long getEventCount();
}