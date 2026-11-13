package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.common.model.BaseResponse;
import com.example.WaffleBear.user.model.AuthUserDetails;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/file/secret")
@Tag(name = "Secret Folder", description = "Personal vault & hidden folder PIN management APIs")
@SecurityRequirement(name = "bearerAuth")
public class SecretFolderController {

    private final SecretFolderService secretFolderService;

    @GetMapping("/vault/status")
    @Operation(summary = "Get vault PIN status")
    public ResponseEntity<BaseResponse<SecretFolderDto.VaultStatusRes>> getVaultStatus(
            @AuthenticationPrincipal AuthUserDetails dto
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.getVaultStatus(userIdx)));
    }

    @PostMapping("/vault/pin/register")
    @Operation(summary = "Register initial 4-digit vault PIN")
    public ResponseEntity<BaseResponse<SecretFolderDto.UnlockRes>> registerVaultPin(
            @AuthenticationPrincipal AuthUserDetails dto,
            @RequestBody(required = false) SecretFolderDto.PinReq request
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        String pin = request != null ? request.getPin() : null;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.registerVaultPin(userIdx, pin)));
    }

    @PostMapping("/vault/unlock")
    @Operation(summary = "Unlock personal secret vault with 4-digit PIN")
    public ResponseEntity<BaseResponse<SecretFolderDto.UnlockRes>> unlockVault(
            @AuthenticationPrincipal AuthUserDetails dto,
            @RequestBody(required = false) SecretFolderDto.PinReq request
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        String pin = request != null ? request.getPin() : null;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.unlockVault(userIdx, pin)));
    }

    @PostMapping("/vault/lock")
    @Operation(summary = "Lock personal secret vault and revoke issued tokens")
    public ResponseEntity<BaseResponse<SecretFolderDto.VaultStatusRes>> lockVault(
            @AuthenticationPrincipal AuthUserDetails dto
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.lockVault(userIdx)));
    }

    @PutMapping("/vault/pin")
    @Operation(summary = "Change vault 4-digit PIN")
    public ResponseEntity<BaseResponse<SecretFolderDto.UnlockRes>> changeVaultPin(
            @AuthenticationPrincipal AuthUserDetails dto,
            @RequestBody(required = false) SecretFolderDto.PinChangeReq request
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        String currentPin = request != null ? request.getCurrentPin() : null;
        String newPin = request != null ? request.getNewPin() : null;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.changeVaultPin(userIdx, currentPin, newPin)));
    }

    @GetMapping("/folder/{folderIdx}/status")
    @Operation(summary = "Get hidden folder lock status")
    public ResponseEntity<BaseResponse<SecretFolderDto.FolderStatusRes>> getFolderStatus(
            @AuthenticationPrincipal AuthUserDetails dto,
            @PathVariable Long folderIdx
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.getFolderStatus(userIdx, folderIdx)));
    }

    @PostMapping("/folder/{folderIdx}/unlock")
    @Operation(summary = "Unlock (or register initial PIN for) hidden folder")
    public ResponseEntity<BaseResponse<SecretFolderDto.UnlockRes>> unlockFolder(
            @AuthenticationPrincipal AuthUserDetails dto,
            @PathVariable Long folderIdx,
            @RequestBody(required = false) SecretFolderDto.PinReq request
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        String pin = request != null ? request.getPin() : null;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.unlockFolder(userIdx, folderIdx, pin)));
    }

    @PostMapping("/folder/{folderIdx}/lock")
    @Operation(summary = "Lock hidden folder and revoke issued unlock tokens")
    public ResponseEntity<BaseResponse<SecretFolderDto.FolderStatusRes>> lockFolder(
            @AuthenticationPrincipal AuthUserDetails dto,
            @PathVariable Long folderIdx
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.lockFolder(userIdx, folderIdx)));
    }

    @PatchMapping("/folder/{folderIdx}/config")
    @Operation(summary = "Configure hidden folder visibility and optional 4-digit PIN")
    public ResponseEntity<BaseResponse<SecretFolderDto.FolderStatusRes>> configureFolder(
            @AuthenticationPrincipal AuthUserDetails dto,
            @PathVariable Long folderIdx,
            @RequestBody(required = false) SecretFolderDto.FolderConfigReq request
    ) {
        Long userIdx = dto != null ? dto.getIdx() : 0L;
        return ResponseEntity.ok(BaseResponse.success(secretFolderService.configureFolder(userIdx, folderIdx, request)));
    }
}
