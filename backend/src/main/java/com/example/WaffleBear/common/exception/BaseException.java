package com.example.WaffleBear.common.exception;


import com.example.WaffleBear.common.model.BaseResponseStatus;
import lombok.Getter;

@Getter
public class BaseException extends RuntimeException {
    private final BaseResponseStatus status;
    private final String customMessage;

    public BaseException(BaseResponseStatus status) {
        this(status, null);
    }

    public BaseException(BaseResponseStatus status, String customMessage) {
        super((customMessage != null && !customMessage.isBlank()) ? customMessage : status.getMessage());
        this.status = status;
        this.customMessage = (customMessage != null && !customMessage.isBlank()) ? customMessage.trim() : null;
    }

    public static BaseException from(BaseResponseStatus status) {
        return new BaseException(status);
    }

    public static BaseException from(BaseResponseStatus status, String customMessage) {
        return new BaseException(status, customMessage);
    }

    public String resolveMessage() {
        return this.customMessage != null ? this.customMessage : this.status.getMessage();
    }
}
