package com.example.WaffleBear.common.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import static com.example.WaffleBear.common.model.BaseResponseStatus.SUCCESS;

@Getter
@Setter
@AllArgsConstructor
public class BaseResponse<T> {
    private Boolean success;
    private Integer code;
    private String message;
    private T result;

    public static <T> BaseResponse<T> success(T result) {
        return new BaseResponse<>(
                SUCCESS.isSuccess(),
                SUCCESS.getCode(),
                SUCCESS.getMessage(),
                result
        );
    }

    public static <T> BaseResponse<T> fail(BaseResponseStatus status) {
        return new BaseResponse<>(
                status.isSuccess(),
                status.getCode(),
                status.getMessage(),
                null
        );
    }

    public static <T> BaseResponse<T> fail(BaseResponseStatus status, T result) {
        return new BaseResponse<>(
                status.isSuccess(),
                status.getCode(),
                status.getMessage(),
                result
        );
    }

    public static <T> BaseResponse<T> failWithMessage(BaseResponseStatus status, String customMessage) {
        String resolvedMessage = (customMessage != null && !customMessage.isBlank())
                ? customMessage
                : status.getMessage();
        return new BaseResponse<>(
                status.isSuccess(),
                status.getCode(),
                resolvedMessage,
                null
        );
    }
}
