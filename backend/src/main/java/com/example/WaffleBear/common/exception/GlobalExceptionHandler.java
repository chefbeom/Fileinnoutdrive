package com.example.WaffleBear.common.exception;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<BaseResponse<Map<String, String>>> handleValidationException(MethodArgumentNotValidException e) {
        Map<String, String> errors = new HashMap<>();

        for (FieldError error : e.getBindingResult().getFieldErrors()) {
            errors.put(error.getField(), error.getDefaultMessage());
        }

        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                BaseResponse.fail(BaseResponseStatus.REQUEST_ERROR, errors)
        );
    }

    @ExceptionHandler(BaseException.class)
    public ResponseEntity<BaseResponse<Void>> handleException(BaseException e) {
        BaseResponseStatus status = e.getStatus();
        HttpStatus httpStatus = statusCodeMapper(status);
        BaseResponse<Void> response = BaseResponse.fail(status);

        return ResponseEntity
                .status(httpStatus)
                .body(response);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<BaseResponse<Void>> handleIllegalArgumentException(IllegalArgumentException e) {
        log.warn("Bad request rejected: {}", e.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(BaseResponse.fail(BaseResponseStatus.REQUEST_ERROR));
    }


    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<BaseResponse<Void>> handleNoResourceFoundException(NoResourceFoundException e) {
        log.warn("Resource not found: {}", e.getResourcePath());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(BaseResponse.fail(BaseResponseStatus.REQUEST_ERROR));
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<BaseResponse<Void>> handleGeneralException(Exception e) {
        log.error("Unhandled application exception", e);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(BaseResponse.fail(BaseResponseStatus.FAIL));
    }

    private HttpStatus statusCodeMapper(BaseResponseStatus status) {
        int errorCode = status.getCode();

        if (errorCode >= 5000 && errorCode < 6000) {
            return HttpStatus.INTERNAL_SERVER_ERROR;
        }
        if (status == BaseResponseStatus.JWT_EXPIRED || status == BaseResponseStatus.JWT_INVALID) {
            return HttpStatus.UNAUTHORIZED;
        }
        if (status == BaseResponseStatus.WORKSPACE_ACCESS_DENIED
                || status == BaseResponseStatus.WORKSPACE_SHARE_NOT_ALLOWED
                || status == BaseResponseStatus.WORKSPACE_SHARE_ENDED
                || status == BaseResponseStatus.WORKSPACE_NOT_ACCESSIBLE
                || status == BaseResponseStatus.ADMIN_ONLY_ACTION
                || status == BaseResponseStatus.GROUP_ACCESS_DENIED) {
            return HttpStatus.FORBIDDEN;
        }
        if (status == BaseResponseStatus.USER_NOT_FOUND
                || status == BaseResponseStatus.WORKSPACE_NOT_FOUND
                || status == BaseResponseStatus.GROUP_RELATIONSHIP_NOT_FOUND
                || status == BaseResponseStatus.GROUP_NOT_FOUND
                || status == BaseResponseStatus.GROUP_INVITE_NOT_FOUND
                || status == BaseResponseStatus.RELATIONSHIP_INVITE_NOT_FOUND) {
            return HttpStatus.NOT_FOUND;
        }

        return HttpStatus.BAD_REQUEST;
    }
}
