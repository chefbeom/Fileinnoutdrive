package com.example.WaffleBear.common.exception;

import com.example.WaffleBear.common.model.BaseResponse;
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
}
