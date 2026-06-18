package com.example.WaffleBear.workspace.comment;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.user.model.AuthUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/workspace/{workspaceIdx}/comments")
@Tag(name = "Workspace Comment", description = "Workspace page review comments")
@SecurityRequirement(name = "bearerAuth")
public class WorkspaceCommentController {

    private final WorkspaceCommentService workspaceCommentService;

    @GetMapping
    @Operation(summary = "List workspace comments", description = "Returns review comments for an accessible workspace.")
    public BaseResponse list(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx
    ) {
        List<WorkspaceCommentDto.ResComment> result = workspaceCommentService.list(workspaceIdx, user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @PostMapping
    @Operation(summary = "Create workspace comment", description = "Creates a review comment in a workspace.")
    public BaseResponse create(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx,
            @RequestBody WorkspaceCommentDto.ReqCreate request
    ) {
        WorkspaceCommentDto.ResComment result = workspaceCommentService.create(workspaceIdx, user.getIdx(), request);
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @PatchMapping("/{commentIdx}")
    @Operation(summary = "Update workspace comment", description = "Updates a workspace comment authored by the current user or managed by an admin.")
    public BaseResponse update(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx,
            @PathVariable Long commentIdx,
            @RequestBody WorkspaceCommentDto.ReqUpdate request
    ) {
        WorkspaceCommentDto.ResComment result = workspaceCommentService.update(workspaceIdx, commentIdx, user.getIdx(), request);
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @PatchMapping("/{commentIdx}/resolve")
    @Operation(summary = "Resolve workspace comment", description = "Marks a workspace comment as resolved or unresolved.")
    public BaseResponse resolve(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx,
            @PathVariable Long commentIdx,
            @RequestBody WorkspaceCommentDto.ReqResolve request
    ) {
        WorkspaceCommentDto.ResComment result = workspaceCommentService.resolve(workspaceIdx, commentIdx, user.getIdx(), request);
        return BaseResponse.success(ResponseEntity.ok(result));
    }

    @DeleteMapping("/{commentIdx}")
    @Operation(summary = "Delete workspace comment", description = "Deletes a workspace comment authored by the current user or managed by an admin.")
    public BaseResponse delete(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long workspaceIdx,
            @PathVariable Long commentIdx
    ) {
        BaseResponseStatus result = workspaceCommentService.delete(workspaceIdx, commentIdx, user.getIdx());
        return BaseResponse.success(ResponseEntity.ok(result));
    }
}
