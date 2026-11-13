package com.example.WaffleBear.user.controller;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.service.AccountWithdrawalService;
import com.example.WaffleBear.user.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RequestMapping("/user")
@RestController
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Signup, email verification, and account withdrawal APIs")
public class UserController {
    private final UserService userService;
    private final AccountWithdrawalService accountWithdrawalService;
    private final CookieResponseWriter cookieResponseWriter;

    @Value("${app.admin-only:false}")
    private boolean adminOnly;

    @PostMapping("/signup")
    @Operation(summary = "Sign up", description = "Creates a new local account and starts the email verification flow.")
    public ResponseEntity<?> signup(@RequestBody UserDto.SignupReq dto) {
        if (adminOnly) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "signup disabled in admin-only mode"));
        }
        UserDto.SignupRes result = userService.signup(dto);
        return ResponseEntity.ok(BaseResponse.success(result));
    }

    @GetMapping("/verify")
    @Operation(summary = "Verify email", description = "Completes email verification with the issued token.")
    public ResponseEntity<String> verifyEmail(@RequestParam("token") String token) {
        userService.verifyEmail(token);
        return ResponseEntity.ok("성공");
    }

    @PostMapping("/me/withdraw")
    @Operation(summary = "Withdraw my account", description = "Permanently deletes the current user's account and all associated data.")
    public ResponseEntity<?> withdrawMe(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @RequestBody(required = false) UserDto.WithdrawReq request,
            HttpServletResponse response
    ) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        UserDto.WithdrawRes result = accountWithdrawalService.withdrawAccount(userIdx, request);
        cookieResponseWriter.clearRefreshCookie(response);
        return ResponseEntity.ok(BaseResponse.success(result));
    }

    @DeleteMapping("/me")
    @Operation(summary = "Delete my account", description = "Permanently deletes the current user's account and all associated data.")
    public ResponseEntity<?> deleteMe(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @RequestBody(required = false) UserDto.WithdrawReq request,
            HttpServletResponse response
    ) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        UserDto.WithdrawRes result = accountWithdrawalService.withdrawAccount(userIdx, request);
        cookieResponseWriter.clearRefreshCookie(response);
        return ResponseEntity.ok(BaseResponse.success(result));
    }
}
