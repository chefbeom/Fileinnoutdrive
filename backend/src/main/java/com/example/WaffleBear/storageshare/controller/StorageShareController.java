package com.example.WaffleBear.storageshare.controller;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.storageshare.model.dto.StorageShareDto;
import com.example.WaffleBear.storageshare.service.SharedStorageService;
import com.example.WaffleBear.storageshare.service.StorageGrantService;
import com.example.WaffleBear.user.model.AuthUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/storage-share")
@Tag(name = "Storage Share", description = "저장 용량 공유/대여 및 논리적 공유 저장소 API")
@SecurityRequirement(name = "bearerAuth")
public class StorageShareController {

    private final StorageGrantService storageGrantService;
    private final SharedStorageService sharedStorageService;

    @GetMapping("/grants/overview")
    @Operation(summary = "저장 용량 공유/대여 현황 조회")
    public BaseResponse<?> getCapacityOverview(@AuthenticationPrincipal AuthUserDetails user) {
        return BaseResponse.success(storageGrantService.getCapacityOverview(resolveUserIdx(user)));
    }

    @PostMapping("/grants")
    @Operation(summary = "저장 용량 공유 또는 기간 대여 생성")
    public BaseResponse<?> createGrants(
            @AuthenticationPrincipal AuthUserDetails user,
            @RequestBody StorageShareDto.CreateGrantReq request
    ) {
        return BaseResponse.success(storageGrantService.createGrants(resolveUserIdx(user), request));
    }

    @PostMapping("/grants/{grantIdx}/cancel")
    @Operation(summary = "저장 용량 공유 취소 (1개월 유예) 또는 수신자 반납")
    public BaseResponse<?> cancelGrant(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long grantIdx
    ) {
        return BaseResponse.success(storageGrantService.cancelGrant(resolveUserIdx(user), grantIdx));
    }

    @GetMapping("/spaces")
    @Operation(summary = "참여 중인 공유 저장소 목록 조회")
    public BaseResponse<?> listSharedStorages(@AuthenticationPrincipal AuthUserDetails user) {
        return BaseResponse.success(sharedStorageService.listMySharedStorages(resolveUserIdx(user)));
    }

    @PostMapping("/spaces")
    @Operation(summary = "논리적 공유 저장소 생성")
    public BaseResponse<?> createSharedStorage(
            @AuthenticationPrincipal AuthUserDetails user,
            @RequestBody StorageShareDto.CreateSharedStorageReq request
    ) {
        return BaseResponse.success(sharedStorageService.createSharedStorage(resolveUserIdx(user), request));
    }

    @GetMapping("/spaces/{storageIdx}")
    @Operation(summary = "공유 저장소 상세(파일/폴더 트리, 참여자, 승인 요청) 조회")
    public BaseResponse<?> getSharedStorageDetail(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestParam(required = false) Long parentIdx
    ) {
        return BaseResponse.success(sharedStorageService.getSharedStorageDetail(resolveUserIdx(user), storageIdx, parentIdx));
    }

    @PostMapping("/spaces/{storageIdx}/invites")
    @Operation(summary = "공유 저장소에 참여자 초대 (그룹/이메일/친구)")
    public BaseResponse<?> inviteMembers(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestBody StorageShareDto.InviteMembersReq request
    ) {
        return BaseResponse.success(sharedStorageService.inviteMembers(resolveUserIdx(user), storageIdx, request));
    }

    @PostMapping("/spaces/{storageIdx}/invites/respond")
    @Operation(summary = "공유 저장소 초대 수락/거절")
    public BaseResponse<?> respondInvite(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestBody StorageShareDto.RespondInviteReq request
    ) {
        return BaseResponse.success(sharedStorageService.respondToInvite(resolveUserIdx(user), storageIdx, request));
    }

    @PatchMapping("/spaces/{storageIdx}/contribution")
    @Operation(summary = "내 공유 저장소 기여 용량 변경")
    public BaseResponse<?> updateMyContribution(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestBody StorageShareDto.UpdateContributionReq request
    ) {
        return BaseResponse.success(sharedStorageService.updateMyContribution(resolveUserIdx(user), storageIdx, request));
    }

    @PostMapping("/spaces/{storageIdx}/folders")
    @Operation(summary = "공유 저장소 내 폴더 생성")
    public BaseResponse<?> createFolder(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestBody StorageShareDto.CreateFolderReq request
    ) {
        return BaseResponse.success(sharedStorageService.createFolder(resolveUserIdx(user), storageIdx, request));
    }

    @PostMapping("/spaces/{storageIdx}/uploads/init")
    @Operation(summary = "공유 저장소 파일/폴더 업로드 URL 발급")
    public BaseResponse<?> initUpload(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestBody List<StorageShareDto.InitUploadItemReq> requests
    ) {
        return BaseResponse.success(sharedStorageService.initUpload(resolveUserIdx(user), storageIdx, requests));
    }

    @PostMapping("/spaces/{storageIdx}/uploads/complete")
    @Operation(summary = "공유 저장소 파일 업로드 완료 처리")
    public BaseResponse<?> completeUpload(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestBody StorageShareDto.CompleteUploadReq request
    ) {
        return BaseResponse.success(sharedStorageService.completeUpload(resolveUserIdx(user), storageIdx, request));
    }

    @GetMapping("/spaces/{storageIdx}/nodes/{nodeIdx}/download-url")
    @Operation(summary = "공유 저장소 파일 다운로드 URL 발급")
    public BaseResponse<?> getDownloadUrl(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @PathVariable Long nodeIdx
    ) {
        String downloadUrl = sharedStorageService.getDownloadUrl(resolveUserIdx(user), storageIdx, nodeIdx);
        return BaseResponse.success(Map.of("downloadUrl", downloadUrl));
    }

    @PostMapping("/spaces/{storageIdx}/approvals")
    @Operation(summary = "공유 저장소/파일/참여자 삭제 전원 승인 요청 생성")
    public BaseResponse<?> requestApproval(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @RequestBody StorageShareDto.CreateApprovalReq request
    ) {
        return BaseResponse.success(sharedStorageService.requestApproval(resolveUserIdx(user), storageIdx, request));
    }

    @PostMapping("/spaces/{storageIdx}/approvals/{approvalIdx}/vote")
    @Operation(summary = "공유 저장소 삭제/변경 승인 투표 (승인 또는 거절)")
    public BaseResponse<?> voteApproval(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx,
            @PathVariable Long approvalIdx,
            @RequestBody StorageShareDto.VoteApprovalReq request
    ) {
        return BaseResponse.success(
                sharedStorageService.voteApproval(resolveUserIdx(user), storageIdx, approvalIdx, request)
        );
    }

    @PostMapping("/spaces/{storageIdx}/restore")
    @Operation(summary = "삭제 대기(휴지통) 상태의 공유 저장소 복원")
    public BaseResponse<?> restoreTrashedStorage(
            @AuthenticationPrincipal AuthUserDetails user,
            @PathVariable Long storageIdx
    ) {
        return BaseResponse.success(sharedStorageService.restoreTrashedStorage(resolveUserIdx(user), storageIdx));
    }

    private Long resolveUserIdx(AuthUserDetails user) {
        return user != null && user.getIdx() != null ? user.getIdx() : 0L;
    }
}
