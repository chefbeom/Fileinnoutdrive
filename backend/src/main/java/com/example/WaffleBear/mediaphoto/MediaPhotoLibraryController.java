package com.example.WaffleBear.mediaphoto;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.user.model.AuthUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/media-library")
@Tag(name = "Media & Photo Library", description = "Per-user media series, folder classifications, overrides, watch history, collections, and photo albums")
@SecurityRequirement(name = "bearerAuth")
public class MediaPhotoLibraryController {

    private final MediaPhotoLibraryService mediaPhotoLibraryService;

    @GetMapping
    @Operation(summary = "Get media & photo library state", description = "Returns the current user's designated folders/files, series overrides, watch history, collections, and albums.")
    public BaseResponse get(
            @AuthenticationPrincipal AuthUserDetails user
    ) {
        MediaPhotoLibraryDto.ResLibrary result = mediaPhotoLibraryService.get(user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @PutMapping
    @Operation(summary = "Save media & photo library state", description = "Persists the current user's designated folders/files, series classifications/overrides, watch history, collections, and albums.")
    public BaseResponse save(
            @AuthenticationPrincipal AuthUserDetails user,
            @RequestBody(required = false) MediaPhotoLibraryDto.ReqLibrary request
    ) {
        Map<String, Object> state = request != null && request.state() != null ? request.state() : Map.of();
        MediaPhotoLibraryDto.ResLibrary result = mediaPhotoLibraryService.save(user.getIdx(), state);
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @GetMapping("/vault")
    @Operation(summary = "Get vault media & photo library state", description = "Returns the current user's secret vault media and photo library state. Requires unlocked vault.")
    public BaseResponse getVault(
            @AuthenticationPrincipal AuthUserDetails user
    ) {
        MediaPhotoLibraryDto.ResLibrary result = mediaPhotoLibraryService.getVault(user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @PutMapping("/vault")
    @Operation(summary = "Save vault media & photo library state", description = "Persists the current user's secret vault media and photo library state. Requires unlocked vault.")
    public BaseResponse saveVault(
            @AuthenticationPrincipal AuthUserDetails user,
            @RequestBody(required = false) MediaPhotoLibraryDto.ReqLibrary request
    ) {
        Map<String, Object> state = request != null && request.state() != null ? request.state() : Map.of();
        MediaPhotoLibraryDto.ResLibrary result = mediaPhotoLibraryService.saveVault(user.getIdx(), state);
        return BaseResponse.success(ResponseEntity.ok(result));
    }
}
