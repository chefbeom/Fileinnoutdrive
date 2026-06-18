package com.example.WaffleBear.workspace.revision;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.user.model.AuthUserDetails;
import com.example.WaffleBear.workspace.model.post.PostDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/workspace/{workspaceIdx}/revisions")
@Tag(name = "Workspace Revision", description = "Workspace document version history APIs")
@SecurityRequirement(name = "bearerAuth")
public class WorkspaceRevisionController {

    private final WorkspaceRevisionService workspaceRevisionService;

    @GetMapping
    @Operation(summary = "List workspace revisions", description = "Returns recent saved document revisions for an accessible workspace.")
    public BaseResponse list(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx
    ) {
        List<WorkspaceRevisionDto.ResSummary> result = workspaceRevisionService.list(workspaceIdx, user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @GetMapping("/{revisionIdx}")
    @Operation(summary = "Read workspace revision", description = "Returns the full contents of a saved workspace revision.")
    public BaseResponse read(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx,
            @PathVariable Long revisionIdx
    ) {
        WorkspaceRevisionDto.ResRevision result = workspaceRevisionService.read(workspaceIdx, revisionIdx, user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @PostMapping("/{revisionIdx}/restore")
    @Operation(summary = "Restore workspace revision", description = "Restores a saved revision into the current workspace document.")
    public BaseResponse restore(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx,
            @PathVariable Long revisionIdx
    ) {
        PostDto.ResPost result = workspaceRevisionService.restore(workspaceIdx, revisionIdx, user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }
}
