package com.example.WaffleBear.common.exception;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void asyncRequestNotUsableExceptionIsIgnoredWithoutWritingResponse() {
        AsyncRequestNotUsableException ex = new AsyncRequestNotUsableException(
                "ServletOutputStream failed to flush: java.io.IOException: Broken pipe",
                new IOException("Broken pipe")
        );

        assertDoesNotThrow(() -> handler.handleAsyncRequestNotUsableException(ex));
    }

    @Test
    void brokenPipeIoExceptionInGeneralHandlerReturnsNullInsteadOf500Response() {
        Exception ex = new RuntimeException("Wrapper", new IOException("Broken pipe"));

        ResponseEntity<BaseResponse<Void>> response = handler.handleGeneralException(ex);

        assertNull(response);
    }

    @Test
    void nonClientDisconnectExceptionStillReturns500Response() {
        Exception ex = new RuntimeException("Unexpected database failure");

        ResponseEntity<BaseResponse<Void>> response = handler.handleGeneralException(ex);

        assertNotNull(response);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
    }

    @Test
    void eventStreamRequestSuppressesJsonBodyOnUnhandledException() {
        org.springframework.mock.web.MockHttpServletRequest request =
                new org.springframework.mock.web.MockHttpServletRequest("GET", "/api/sse/connect");
        request.setServletPath("/sse/connect");
        org.springframework.mock.web.MockHttpServletResponse servletResponse =
                new org.springframework.mock.web.MockHttpServletResponse();
        servletResponse.setContentType("text/event-stream");

        ResponseEntity<BaseResponse<Void>> response = handler.handleGeneralException(
                new RuntimeException("Stream error"),
                request,
                servletResponse
        );

        assertNotNull(response);
        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        assertNull(response.getBody());
    }

    @Test
    void baseExceptionUsesDefaultMessageOrCustomDetailMessage() {
        ResponseEntity<BaseResponse<Void>> defaultResponse = handler.handleException(
                BaseException.from(BaseResponseStatus.FILE_NAME_WRONG)
        );
        assertEquals(HttpStatus.BAD_REQUEST, defaultResponse.getStatusCode());
        assertNotNull(defaultResponse.getBody());
        assertEquals(BaseResponseStatus.FILE_NAME_WRONG.getCode(), defaultResponse.getBody().getCode());
        assertEquals(BaseResponseStatus.FILE_NAME_WRONG.getMessage(), defaultResponse.getBody().getMessage());

        ResponseEntity<BaseResponse<Void>> customResponse = handler.handleException(
                BaseException.from(BaseResponseStatus.FILE_NAME_WRONG, "파일 이름이 올바르지 않습니다: bad.mp4")
        );
        assertEquals(HttpStatus.BAD_REQUEST, customResponse.getStatusCode());
        assertNotNull(customResponse.getBody());
        assertEquals(BaseResponseStatus.FILE_NAME_WRONG.getCode(), customResponse.getBody().getCode());
        assertEquals("파일 이름이 올바르지 않습니다: bad.mp4", customResponse.getBody().getMessage());
    }
}
