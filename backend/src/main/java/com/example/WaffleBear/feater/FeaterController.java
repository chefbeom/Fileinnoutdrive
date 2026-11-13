package com.example.WaffleBear.feater;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.config.CookieResponseWriter;
import com.example.WaffleBear.feater.model.FeaterDto;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.user.model.UserDto;
import com.example.WaffleBear.user.service.AccountWithdrawalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/feater/settings")
@RequiredArgsConstructor
@Tag(name = "Profile", description = "Profile and personal settings APIs")
@SecurityRequirement(name = "bearerAuth")
public class FeaterController {

    private final FeaterService featerService;
    private final AccountWithdrawalService accountWithdrawalService;
    private final CookieResponseWriter cookieResponseWriter;

    @GetMapping("/me")
    @Operation(summary = "Get my settings", description = "Returns the current user's profile and settings.")
    public ResponseEntity<?> getSettings(@AuthenticationPrincipal AuthUserDetails userDetails) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        FeaterDto.SettingsRes result = featerService.getSettings(userIdx);

        return ResponseEntity.ok(BaseResponse.success(result));
    }

    @PutMapping("/me")
    @Operation(summary = "Update my settings", description = "Updates profile settings and user preferences.")
    public ResponseEntity<?> updateSettings(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @RequestBody FeaterDto.SettingsUpdateReq request
    ) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        FeaterDto.SettingsRes result = featerService.updateSettings(userIdx, request);

        return ResponseEntity.ok(BaseResponse.success(result));
    }

    @PostMapping(value = "/me/profile-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload profile image", description = "Uploads or replaces the current user's profile image.")
    public ResponseEntity<?> uploadProfileImage(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @RequestParam("image") MultipartFile image
    ) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        FeaterDto.SettingsRes result = featerService.uploadProfileImage(userIdx, image);

        return ResponseEntity.ok(BaseResponse.success(result));
    }

    @PostMapping("/me/withdraw")
    @Operation(summary = "Withdraw my account", description = "Permanently deletes the current user's account and all associated data.")
    public ResponseEntity<?> withdrawAccount(
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
    public ResponseEntity<?> deleteAccount(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @RequestBody(required = false) UserDto.WithdrawReq request,
            HttpServletResponse response
    ) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        UserDto.WithdrawRes result = accountWithdrawalService.withdrawAccount(userIdx, request);
        cookieResponseWriter.clearRefreshCookie(response);

        return ResponseEntity.ok(BaseResponse.success(result));
    }

    @GetMapping("/me/ui-layout")
    @Operation(summary = "Get UI layout customization preferences", description = "Returns the current user's customizable navigation button placement, section visibility, and header/sidebar layout preferences.")
    public ResponseEntity<?> getUiLayout(@AuthenticationPrincipal AuthUserDetails userDetails) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        return ResponseEntity.ok(BaseResponse.success(featerService.getUiLayout(userIdx)));
    }

    @PutMapping("/me/ui-layout")
    @Operation(summary = "Update UI layout customization preferences", description = "Persists the current user's customizable navigation button placement, section visibility, and header/sidebar layout preferences.")
    public ResponseEntity<?> updateUiLayout(
            @AuthenticationPrincipal AuthUserDetails userDetails,
            @RequestBody(required = false) FeaterDto.UiLayoutReq request
    ) {
        Long userIdx = userDetails != null ? userDetails.getIdx() : null;
        Map<String, Object> layout = request != null && request.layout() != null ? request.layout() : Map.of();
        return ResponseEntity.ok(BaseResponse.success(featerService.updateUiLayout(userIdx, layout)));
    }
}
