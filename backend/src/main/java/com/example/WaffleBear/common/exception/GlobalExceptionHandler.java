package com.example.WaffleBear.common.exception;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.io.EOFException;
import java.io.IOException;
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

    @ExceptionHandler(AsyncRequestTimeoutException.class)
    public void handleAsyncRequestTimeoutException(AsyncRequestTimeoutException e) {
        // SSE 스트림 연결이 클라이언트 탭 종료, 새로고침 또는 타임아웃으로 끊어졌을 때의 정상적인 비동기 종료 수명주기
        // 이미 response 헤더(text/event-stream)가 커밋된 상태이므로 추가 에러 응답을 작성하지 않고 안전하게 무시합니다.
        log.debug("Async request timed out or client disconnected: {}", e.getMessage());
    }

    @ExceptionHandler(AsyncRequestNotUsableException.class)
    public void handleAsyncRequestNotUsableException(AsyncRequestNotUsableException e) {
        // 클라이언트가 응답 수신 도중 연결을 먼저 종료(Broken pipe 등)한 경우
        // 이미 닫힌 소켓에 에러 JSON 응답을 쓰려고 시도하면 2차 예외가 발생하므로 조용히 무시합니다.
        log.debug("Client disconnected before response completed: {}", e.getMessage());
    }

    public ResponseEntity<BaseResponse<Void>> handleGeneralException(Exception e) {
        return handleGeneralException(e, null, null);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<BaseResponse<Void>> handleGeneralException(
            Exception e,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        if (isClientDisconnectException(e)) {
            log.debug("Client disconnected during request processing: {}", e.getMessage());
            return null;
        }
        if (response != null && response.isCommitted()) {
            log.debug("Skipping error response because servlet response is already committed: {}", e.getMessage());
            return null;
        }
        if (e instanceof AccessDeniedException accessDeniedException) {
            throw accessDeniedException;
        }
        if (e instanceof AuthenticationException authenticationException) {
            throw authenticationException;
        }
        if (isEventStreamRequest(request, response)) {
            log.debug("Suppressing JSON error body on text/event-stream endpoint: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
        }
        log.error("Unhandled application exception", e);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(BaseResponse.fail(BaseResponseStatus.FAIL));
    }

    private boolean isEventStreamRequest(HttpServletRequest request, HttpServletResponse response) {
        if (response != null) {
            String contentType = response.getContentType();
            if (contentType != null && contentType.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
                return true;
            }
        }
        if (request != null) {
            String accept = request.getHeader(HttpHeaders.ACCEPT);
            if (accept != null && accept.contains(MediaType.TEXT_EVENT_STREAM_VALUE)) {
                return true;
            }
            String servletPath = request.getServletPath();
            if (servletPath != null && servletPath.startsWith("/sse")) {
                return true;
            }
        }
        return false;
    }

    private boolean isClientDisconnectException(Throwable throwable) {
        Throwable current = throwable;
        while (current != null) {
            if (current instanceof AsyncRequestNotUsableException
                    || current instanceof AsyncRequestTimeoutException
                    || current instanceof EOFException) {
                return true;
            }
            String className = current.getClass().getName();
            if (className.endsWith("ClientAbortException")
                    || className.endsWith("RecycleRequiredException")) {
                return true;
            }
            if (current instanceof IOException) {
                String message = current.getMessage();
                if (message != null) {
                    String lower = message.toLowerCase();
                    if (lower.contains("broken pipe")
                            || lower.contains("connection reset")
                            || lower.contains("socket closed")
                            || lower.contains("stream is closed")
                            || lower.contains("aborted")
                            || lower.contains("현재 연결은 사용자의 호스트 시스템의 소프트웨어의 의해 중단되었습니다")) {
                        return true;
                    }
                }
            }
            current = current.getCause();
        }
        return false;
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
                || status == BaseResponseStatus.GROUP_ACCESS_DENIED
                || status == BaseResponseStatus.SHARE_LINK_PASSWORD_REQUIRED
                || status == BaseResponseStatus.SHARE_LINK_PASSWORD_INVALID) {
            return HttpStatus.FORBIDDEN;
        }
        if (status == BaseResponseStatus.SHARE_LINK_EXPIRED
                || status == BaseResponseStatus.SHARE_LINK_DOWNLOAD_LIMIT_REACHED
                || status == BaseResponseStatus.SHARE_LINK_REVOKED
                || status == BaseResponseStatus.SHARE_LINK_FILE_UNAVAILABLE) {
            return HttpStatus.GONE;
        }
        if (status == BaseResponseStatus.USER_NOT_FOUND
                || status == BaseResponseStatus.WORKSPACE_NOT_FOUND
                || status == BaseResponseStatus.GROUP_RELATIONSHIP_NOT_FOUND
                || status == BaseResponseStatus.GROUP_NOT_FOUND
                || status == BaseResponseStatus.GROUP_INVITE_NOT_FOUND
                || status == BaseResponseStatus.RELATIONSHIP_INVITE_NOT_FOUND
                || status == BaseResponseStatus.SHARE_LINK_NOT_FOUND) {
            return HttpStatus.NOT_FOUND;
        }

        return HttpStatus.BAD_REQUEST;
    }
}
