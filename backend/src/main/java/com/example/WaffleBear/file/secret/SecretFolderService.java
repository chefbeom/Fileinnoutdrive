package com.example.WaffleBear.file.secret;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.feater.FeaterRepository;
import com.example.WaffleBear.feater.model.Feater;
import com.example.WaffleBear.file.FileUpDownloadRepository;
import com.example.WaffleBear.file.model.FileInfo;
import com.example.WaffleBear.file.model.FileNodeType;
import com.example.WaffleBear.file.share.ShareRepository;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class SecretFolderService {

    private static final Pattern PIN_PATTERN = Pattern.compile("^\\d{4}$");

    private final FeaterRepository featerRepository;
    private final UserRepository userRepository;
    private final FileUpDownloadRepository fileUpDownloadRepository;
    private final ShareRepository shareRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecretTokenService secretTokenService;
    private final SecretAccessGuard secretAccessGuard;
    private PinAttemptLimiter pinAttemptLimiter = new PinAttemptLimiter();

    @Autowired(required = false)
    public void setPinAttemptLimiter(PinAttemptLimiter pinAttemptLimiter) {
        if (pinAttemptLimiter != null) {
            this.pinAttemptLimiter = pinAttemptLimiter;
        }
    }

    @Transactional(readOnly = true)
    public SecretFolderDto.VaultStatusRes getVaultStatus(Long userIdx) {
        validateUser(userIdx);
        boolean pinRegistered = featerRepository.findByUser_Idx(userIdx)
                .map(Feater::hasVaultPin)
                .orElse(false);
        return SecretFolderDto.VaultStatusRes.builder()
                .pinRegistered(pinRegistered)
                .unlocked(secretAccessGuard.hasValidVaultToken(userIdx))
                .build();
    }

    @Transactional
    public SecretFolderDto.UnlockRes registerVaultPin(Long userIdx, String rawPin) {
        validateUser(userIdx);
        String pin = validatePinFormat(rawPin);
        Feater settings = getOrCreateSettings(userIdx);
        if (settings.hasVaultPin()) {
            throw BaseException.from(BaseResponseStatus.VAULT_PIN_ALREADY_EXISTS);
        }
        settings.updateVaultPinHash(passwordEncoder.encode(pin));
        featerRepository.saveAndFlush(settings);

        return SecretFolderDto.UnlockRes.builder()
                .unlocked(true)
                .pinRegistered(true)
                .unlockToken(secretTokenService.createVaultUnlockToken(userIdx))
                .build();
    }

    @Transactional(readOnly = true)
    public SecretFolderDto.UnlockRes unlockVault(Long userIdx, String rawPin) {
        validateUser(userIdx);
        String attemptScope = vaultAttemptScope(userIdx);
        pinAttemptLimiter.assertNotLocked(attemptScope);
        String pin = validatePinFormat(rawPin);
        Feater settings = featerRepository.findByUser_Idx(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.VAULT_PIN_NOT_REGISTERED));
        if (!settings.hasVaultPin()) {
            throw BaseException.from(BaseResponseStatus.VAULT_PIN_NOT_REGISTERED);
        }
        if (!passwordEncoder.matches(pin, settings.getVaultPinHash())) {
            pinAttemptLimiter.recordFailure(attemptScope);
            throw BaseException.from(BaseResponseStatus.VAULT_PIN_INVALID);
        }
        pinAttemptLimiter.clearFailures(attemptScope);

        return SecretFolderDto.UnlockRes.builder()
                .unlocked(true)
                .pinRegistered(true)
                .unlockToken(secretTokenService.createVaultUnlockToken(userIdx))
                .build();
    }

    @Transactional(readOnly = true)
    public SecretFolderDto.VaultStatusRes lockVault(Long userIdx) {
        validateUser(userIdx);
        secretTokenService.revokeVaultTokens(userIdx);
        boolean pinRegistered = featerRepository.findByUser_Idx(userIdx)
                .map(Feater::hasVaultPin)
                .orElse(false);
        return SecretFolderDto.VaultStatusRes.builder()
                .pinRegistered(pinRegistered)
                .unlocked(false)
                .build();
    }

    @Transactional
    public SecretFolderDto.UnlockRes changeVaultPin(Long userIdx, String currentPin, String newPin) {
        validateUser(userIdx);
        String attemptScope = vaultAttemptScope(userIdx);
        pinAttemptLimiter.assertNotLocked(attemptScope);
        String validCurrentPin = validatePinFormat(currentPin);
        String validNewPin = validatePinFormat(newPin);
        Feater settings = featerRepository.findByUser_Idx(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.VAULT_PIN_NOT_REGISTERED));
        if (!settings.hasVaultPin()) {
            throw BaseException.from(BaseResponseStatus.VAULT_PIN_NOT_REGISTERED);
        }
        if (!passwordEncoder.matches(validCurrentPin, settings.getVaultPinHash())) {
            pinAttemptLimiter.recordFailure(attemptScope);
            throw BaseException.from(BaseResponseStatus.VAULT_PIN_INVALID);
        }
        pinAttemptLimiter.clearFailures(attemptScope);

        settings.updateVaultPinHash(passwordEncoder.encode(validNewPin));
        featerRepository.saveAndFlush(settings);
        secretTokenService.revokeVaultTokens(userIdx);

        return SecretFolderDto.UnlockRes.builder()
                .unlocked(true)
                .pinRegistered(true)
                .unlockToken(secretTokenService.createVaultUnlockToken(userIdx))
                .build();
    }

    @Transactional(readOnly = true)
    public SecretFolderDto.FolderStatusRes getFolderStatus(Long userIdx, Long folderIdx) {
        FileInfo folder = loadOwnedFolder(userIdx, folderIdx);
        if (folder.isVaultSpace()) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }
        return toFolderStatus(userIdx, folder, null);
    }

    @Transactional
    public SecretFolderDto.UnlockRes unlockFolder(Long userIdx, Long folderIdx, String rawPin) {
        validateUser(userIdx);
        String attemptScope = folderAttemptScope(userIdx, folderIdx);
        pinAttemptLimiter.assertNotLocked(attemptScope);
        String pin = validatePinFormat(rawPin);
        FileInfo folder = loadOwnedFolder(userIdx, folderIdx);
        if (folder.isVaultSpace()) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }
        if (!folder.isHiddenFolder()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        if (!folder.isFolderPinEnabled()) {
            return SecretFolderDto.UnlockRes.builder()
                    .unlocked(true)
                    .pinRegistered(false)
                    .folderIdx(folder.getIdx())
                    .build();
        }

        if (!folder.hasFolderPin()) {
            folder.updateHiddenSettings(true, true, passwordEncoder.encode(pin));
            fileUpDownloadRepository.saveAndFlush(folder);
        } else if (!passwordEncoder.matches(pin, folder.getFolderPinHash())) {
            pinAttemptLimiter.recordFailure(attemptScope);
            throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_PIN_INVALID);
        }
        pinAttemptLimiter.clearFailures(attemptScope);

        return SecretFolderDto.UnlockRes.builder()
                .unlocked(true)
                .pinRegistered(true)
                .unlockToken(secretTokenService.createFolderUnlockToken(userIdx, folder.getIdx()))
                .folderIdx(folder.getIdx())
                .build();
    }

    @Transactional(readOnly = true)
    public SecretFolderDto.FolderStatusRes lockFolder(Long userIdx, Long folderIdx) {
        FileInfo folder = loadOwnedFolder(userIdx, folderIdx);
        if (folder.isVaultSpace()) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }
        secretTokenService.revokeFolderTokens(userIdx, folder.getIdx());
        return SecretFolderDto.FolderStatusRes.builder()
                .folderIdx(folder.getIdx())
                .hidden(folder.isHiddenFolder())
                .pinEnabled(folder.isFolderPinEnabled())
                .pinRegistered(folder.hasFolderPin())
                .unlocked(false)
                .unlockToken(null)
                .build();
    }

    @Transactional
    public SecretFolderDto.FolderStatusRes configureFolder(
            Long userIdx,
            Long folderIdx,
            SecretFolderDto.FolderConfigReq request
    ) {
        if (request == null) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        FileInfo folder = loadOwnedFolder(userIdx, folderIdx);
        if (folder.isVaultSpace()) {
            secretAccessGuard.requireVaultUnlocked(userIdx);
        }
        assertConfigurableFolder(folder);

        if (folder.isHiddenFolder() && folder.isFolderPinEnabled() && folder.hasFolderPin()) {
            String attemptScope = folderAttemptScope(userIdx, folderIdx);
            pinAttemptLimiter.assertNotLocked(attemptScope);
            String currentPin = validatePinFormatOrFail(request.getCurrentPin(), BaseResponseStatus.SECRET_FOLDER_PIN_INVALID);
            if (!passwordEncoder.matches(currentPin, folder.getFolderPinHash())) {
                pinAttemptLimiter.recordFailure(attemptScope);
                throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_PIN_INVALID);
            }
            pinAttemptLimiter.clearFailures(attemptScope);
        }

        boolean nextHidden = request.getHidden() != null ? request.getHidden() : folder.isHiddenFolder();
        boolean nextPinEnabled = nextHidden && (request.getPinEnabled() != null
                ? request.getPinEnabled()
                : folder.isFolderPinEnabled());

        String nextPinHash = null;
        if (nextHidden && nextPinEnabled) {
            String requestedPin = request.getPin() == null ? "" : request.getPin().trim();
            if (!requestedPin.isEmpty()) {
                nextPinHash = passwordEncoder.encode(validatePinFormat(requestedPin));
            } else {
                nextPinHash = folder.hasFolderPin() ? folder.getFolderPinHash() : null;
            }
        }

        folder.updateHiddenSettings(nextHidden, nextPinEnabled, nextPinHash);
        FileInfo saved = fileUpDownloadRepository.saveAndFlush(folder);
        secretTokenService.revokeFolderTokens(userIdx, saved.getIdx());

        String token = (saved.isHiddenFolder() && saved.isFolderPinEnabled() && saved.hasFolderPin())
                ? secretTokenService.createFolderUnlockToken(userIdx, saved.getIdx())
                : null;
        return toFolderStatus(userIdx, saved, token);
    }

    public String encodeOptionalFolderPin(Boolean pinEnabled, String rawPin) {
        if (!Boolean.TRUE.equals(pinEnabled)) {
            return null;
        }
        if (rawPin == null || rawPin.trim().isEmpty()) {
            return null;
        }
        return passwordEncoder.encode(validatePinFormat(rawPin));
    }

    public void assertConfigurableFolder(FileInfo folder) {
        if (folder == null || resolveNodeType(folder) != FileNodeType.FOLDER) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        String saveName = folder.getFileSaveName() == null ? "" : folder.getFileSaveName();
        if (folder.isSharedFile() || saveName.startsWith("shared-") || shareRepository.countByFile_Idx(folder.getIdx()) > 0) {
            throw BaseException.from(BaseResponseStatus.SECRET_FOLDER_NOT_ALLOWED);
        }
    }

    private SecretFolderDto.FolderStatusRes toFolderStatus(Long userIdx, FileInfo folder, String issuedToken) {
        boolean unlocked = issuedToken != null || secretAccessGuard.isFolderUnlocked(userIdx, folder);
        return SecretFolderDto.FolderStatusRes.builder()
                .folderIdx(folder.getIdx())
                .hidden(folder.isHiddenFolder())
                .pinEnabled(folder.isFolderPinEnabled())
                .pinRegistered(folder.hasFolderPin())
                .unlocked(unlocked)
                .unlockToken(issuedToken)
                .build();
    }

    private FileInfo loadOwnedFolder(Long userIdx, Long folderIdx) {
        validateUser(userIdx);
        if (folderIdx == null || folderIdx <= 0) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        FileInfo folder = fileUpDownloadRepository.findByIdxAndUser_Idx(folderIdx, userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
        if (resolveNodeType(folder) != FileNodeType.FOLDER || folder.isTrashed()) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return folder;
    }

    private FileNodeType resolveNodeType(FileInfo file) {
        return file.getNodeType() == null ? FileNodeType.FILE : file.getNodeType();
    }

    private Feater getOrCreateSettings(Long userIdx) {
        User user = userRepository.findById(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.REQUEST_ERROR));
        return featerRepository.findByUser_Idx(userIdx)
                .orElseGet(() -> featerRepository.save(
                        Feater.builder()
                                .user(user)
                                .displayName(resolveInitialDisplayName(user))
                                .localeCode("KO")
                                .regionCode("KR")
                                .marketingOptIn(true)
                                .privateProfile(false)
                                .emailNotification(true)
                                .securityNotification(true)
                                .profileImageUrl(null)
                                .build()
                ));
    }

    private String resolveInitialDisplayName(User user) {
        String candidate = user.getName();
        if (candidate != null && !candidate.isBlank() && candidate.trim().length() <= 100) {
            return candidate.trim();
        }
        String email = user.getEmail();
        if (email != null && email.contains("@")) {
            String localPart = email.substring(0, email.indexOf('@')).trim();
            if (!localPart.isBlank() && localPart.length() <= 100) {
                return localPart.toLowerCase(Locale.ROOT);
            }
        }
        return "User";
    }

    private String vaultAttemptScope(Long userIdx) {
        return "vault:" + userIdx;
    }

    private String folderAttemptScope(Long userIdx, Long folderIdx) {
        return "folder:" + userIdx + ":" + folderIdx;
    }

    private void validateUser(Long userIdx) {
        if (userIdx == null || userIdx <= 0) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
    }

    private String validatePinFormat(String rawPin) {
        return validatePinFormatOrFail(rawPin, BaseResponseStatus.PIN_FORMAT_INVALID);
    }

    private String validatePinFormatOrFail(String rawPin, BaseResponseStatus status) {
        String pin = rawPin == null ? "" : rawPin.trim();
        if (!PIN_PATTERN.matcher(pin).matches()) {
            throw BaseException.from(status);
        }
        return pin;
    }
}
