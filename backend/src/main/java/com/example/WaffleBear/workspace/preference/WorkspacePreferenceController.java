package com.example.WaffleBear.workspace.preference;

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

@RestController
@RequiredArgsConstructor
@RequestMapping("/workspace/preferences")
@Tag(name = "Workspace Preference", description = "Per-user workspace navigation and saved view preferences")
@SecurityRequirement(name = "bearerAuth")
public class WorkspacePreferenceController {

    private final WorkspacePreferenceService workspacePreferenceService;

    @GetMapping
    @Operation(summary = "Get workspace preferences", description = "Returns the current user's workspace favorites, recent pages, sidebar sections, and saved views.")
    public BaseResponse get(
            @AuthenticationPrincipal AuthUserDetails user
    ) {
        WorkspacePreferenceDto.ResPreference result = workspacePreferenceService.get(user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @PutMapping
    @Operation(summary = "Save workspace preferences", description = "Persists the current user's workspace favorites, recent pages, sidebar sections, and saved views.")
    public BaseResponse save(
            @AuthenticationPrincipal AuthUserDetails user,
            @RequestBody WorkspacePreferenceDto.ReqPreference request
    ) {
        WorkspacePreferenceDto.ResPreference result = workspacePreferenceService.save(user.getIdx(), request);
        return BaseResponse.success(ResponseEntity.ok(result));
    }
}
