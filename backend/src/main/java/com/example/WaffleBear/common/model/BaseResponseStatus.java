package com.example.WaffleBear.common.model;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum BaseResponseStatus {

    SUCCESS(true, 2000, "요청이 성공했습니다."),

    JWT_EXPIRED(false, 3001, "JWT 토큰이 만료되었습니다."),
    JWT_INVALID(false, 3002, "JWT 토큰이 유효하지 않습니다."),
    SIGNUP_DUPLICATE_EMAIL(false, 3003, "중복된 이메일입니다."),
    SIGNUP_DUPLICATE_NAME(false, 3004, "중복된 이름입니다."),
    SIGNUP_INVALID_PASSWORD(false, 3005, "비밀번호는 영문, 숫자, 특수문자를 포함해야 합니다."),
    SIGNUP_INVALID_UUID(false, 3006, "유효하지 않은 인증값입니다. 이메일 인증을 다시 시도해 주세요."),
    LOGIN_INVALID_USERINFO(false, 3007, "이메일 또는 비밀번호를 확인해 주세요."),

    FILE_NAME_WRONG(false, 3501, "파일 이름이 올바르지 않습니다."),
    FILE_FORMAT_WRONG(false, 3502, "지원하지 않는 파일 형식입니다."),
    FILE_SIZE_WRONG(false, 3503, "현재 멤버십의 파일 업로드 크기 제한을 초과했습니다."),
    FILE_COUNT_WRONG(false, 3504, "한 번에 업로드할 수 있는 파일 개수를 초과했습니다."),
    FILE_UPLOAD_TIMEOUT(false, 3505, "파일 업로드 시간이 초과되었습니다."),
    FILE_DOWNLOAD_TIMEOUT(false, 3506, "파일 다운로드 시간이 초과되었습니다."),
    FILE_UPDATE_TIMEOUT(false, 3507, "파일 조회에 실패했습니다."),
    FILE_EMPTY(false, 3508, "요청한 파일 정보가 없습니다."),
    FILE_NAME_LENGTH_WRONG(false, 3509, "파일 이름 길이가 허용 범위를 초과했습니다."),
    FILE_FORMAT_NOTHING(false, 3510, "파일 확장자가 없습니다."),
    FILE_UPLOADURL_FAIL(false, 3511, "업로드 URL 처리에 실패했습니다."),
    STORAGE_QUOTA_EXCEEDED(false, 3512, "저장 공간이 부족합니다. 용량을 정리하거나 추가 저장용량을 구매해 주세요."),
    PLAN_FEATURE_NOT_AVAILABLE(false, 3513, "현재 멤버십에서 지원하지 않는 기능입니다."),

    REQUEST_ERROR(false, 4001, "입력값이 올바르지 않습니다."),

    FAIL(false, 5000, "요청 처리에 실패했습니다."),

    INVALID_EMAIL_FORMAT(false, 6001, "이메일 형식이 올바르지 않습니다."),

    USER_NOT_FOUND(false, 6002, "해당 사용자가 존재하지 않습니다."),
    USER_NOT_REGISTERED(false, 6003, "가입되지 않은 이메일입니다. 회원가입을 먼저 진행해 주세요."),
    WITHDRAW_INVALID_PASSWORD(false, 6004, "비밀번호가 일치하지 않습니다."),
    WITHDRAW_CONFIRMATION_MISMATCH(false, 6005, "탈퇴 확인 문구가 일치하지 않습니다."),
    WITHDRAW_PROTECTED_ACCOUNT(false, 6006, "관리자 또는 체험 계정은 회원 탈퇴할 수 없습니다."),

    WORKSPACE_NOT_FOUND(false, 6010, "해당 워크스페이스를 찾을 수 없습니다."),
    WORKSPACE_ACCESS_DENIED(false, 6011, "워크스페이스 접근 권한이 없습니다."),
    WORKSPACE_SHARE_NOT_ALLOWED(false, 6012, "이 워크스페이스는 공유할 수 없습니다."),
    WORKSPACE_SHARE_ENDED(false, 6013, "워크스페이스 공유가 종료되었습니다."),
    WORKSPACE_NOT_ACCESSIBLE(false, 6014, "접근 가능한 워크스페이스가 아닙니다."),

    EMAIL_VERIFY_TOKEN_INVALID(false, 6020, "유효하지 않은 토큰입니다."),
    EMAIL_VERIFY_TOKEN_EXPIRED(false, 6021, "토큰이 만료되었습니다."),
    INVITE_REJECTED(false, 6022, "초대를 거절했습니다."),
    ALREADY_JOINED(false, 6023, "이미 참여 중인 사용자입니다."),

    ROLE_SAVE_FAIL(false, 6030, "권한 수정에 실패했습니다."),
    ROLE_LOAD_FAIL(false, 6031, "권한 조회에 실패했습니다."),
    ADMIN_ONLY_ACTION(false, 6032, "관리자만 권한을 변경할 수 있습니다."),
    GROUP_RELATIONSHIP_NOT_FOUND(false, 6033, "관계를 찾을 수 없습니다."),
    GROUP_NOT_FOUND(false, 6034, "그룹을 찾을 수 없습니다."),
    GROUP_INVITE_NOT_FOUND(false, 6035, "그룹 초대를 찾을 수 없습니다."),
    GROUP_INVITE_ALREADY_PROCESSED(false, 6036, "이미 처리된 그룹 초대입니다."),
    RELATIONSHIP_INVITE_NOT_FOUND(false, 6037, "초대를 찾을 수 없습니다."),
    RELATIONSHIP_INVITE_ALREADY_PROCESSED(false, 6038, "이미 처리된 초대입니다."),
    DUPLICATE_RELATIONSHIP(false, 6039, "이미 연결된 사용자입니다."),
    GROUP_NAME_DUPLICATED(false, 6040, "같은 이름의 그룹이 이미 존재합니다."),
    GROUP_ACCESS_DENIED(false, 6041, "그룹 접근 권한이 없습니다."),
    RELATIONSHIP_REQUIRED(false, 6042, "관계가 형성된 사용자만 그룹에 추가할 수 있습니다."),

    STORAGE_GRANT_INVALID_AMOUNT(false, 7101, "공유할 용량은 1GB 이상이어야 합니다."),
    STORAGE_GRANT_INVALID_PERIOD(false, 7102, "대여 기간이 올바르지 않습니다. 종료일은 시작일 이후여야 합니다."),
    STORAGE_GRANT_INSUFFICIENT_CAPACITY(false, 7103, "공유 가능한 여유 용량이 부족합니다. 이미 사용 중이거나 다른 곳에 공유한 용량은 공유할 수 없습니다."),
    STORAGE_GRANT_NO_RECIPIENT(false, 7104, "용량을 공유할 대상이 없습니다."),
    STORAGE_GRANT_NOT_FOUND(false, 7105, "용량 공유 내역을 찾을 수 없습니다."),
    STORAGE_GRANT_ALREADY_CANCELLED(false, 7106, "이미 취소되었거나 종료된 용량 공유입니다."),
    STORAGE_GRANT_SELF_NOT_ALLOWED(false, 7107, "자기 자신에게는 용량을 공유할 수 없습니다."),

    SHARED_STORAGE_NOT_FOUND(false, 7201, "공유 저장소를 찾을 수 없습니다."),
    SHARED_STORAGE_ACCESS_DENIED(false, 7202, "공유 저장소에 참여한 사용자만 이용할 수 있습니다."),
    SHARED_STORAGE_INVALID_NAME(false, 7203, "공유 저장소 이름이 올바르지 않습니다."),
    SHARED_STORAGE_CAPACITY_EXCEEDED(false, 7204, "공유 저장소 용량이 부족합니다. 참여자 기여 용량을 늘려 주세요."),
    SHARED_STORAGE_CONTRIBUTION_TOO_SMALL(false, 7205, "기여 용량을 줄이면 공유 저장소의 사용량보다 용량이 작아집니다."),
    SHARED_STORAGE_INVITE_NOT_FOUND(false, 7206, "공유 저장소 초대를 찾을 수 없습니다."),
    SHARED_STORAGE_NODE_NOT_FOUND(false, 7207, "공유 저장소의 파일 또는 폴더를 찾을 수 없습니다."),
    SHARED_STORAGE_NOT_ACTIVE(false, 7208, "삭제 대기 중인 공유 저장소에서는 이 작업을 할 수 없습니다."),
    SHARED_STORAGE_APPROVAL_NOT_FOUND(false, 7209, "승인 요청을 찾을 수 없습니다."),
    SHARED_STORAGE_APPROVAL_CLOSED(false, 7210, "이미 처리되었거나 만료된 승인 요청입니다."),
    SHARED_STORAGE_APPROVAL_DUPLICATED(false, 7211, "같은 대상에 대해 진행 중인 승인 요청이 이미 있습니다."),
    SHARED_STORAGE_FOLDER_DUPLICATED(false, 7212, "같은 이름의 폴더가 이미 있습니다."),
    SHARED_STORAGE_DELETE_VOTE_REGISTERED(false, 7213, "공유 폴더 삭제에 대한 전원 승인 투표가 등록되었습니다. 참여자 전원이 승인하면 삭제됩니다."),

    VAULT_PIN_INVALID(false, 7301, "비밀 폴더 PIN 번호가 올바르지 않습니다."),
    VAULT_PIN_ALREADY_EXISTS(false, 7302, "이미 비밀 폴더 PIN 번호가 등록되어 있습니다."),
    VAULT_PIN_NOT_REGISTERED(false, 7303, "비밀 폴더 PIN 번호를 먼저 등록해 주세요."),
    VAULT_UNLOCK_REQUIRED(false, 7304, "자체 비밀 폴더 잠금 해제가 필요합니다."),
    SECRET_FOLDER_PIN_INVALID(false, 7305, "숨긴 폴더 PIN 번호가 올바르지 않습니다."),
    SECRET_FOLDER_UNLOCK_REQUIRED(false, 7306, "숨긴 폴더 잠금 해제가 필요합니다."),
    SECRET_FOLDER_NOT_ALLOWED(false, 7307, "공유 중이거나 공유 저장소 폴더는 비밀 폴더로 설정할 수 없습니다."),
    PIN_FORMAT_INVALID(false, 7308, "PIN 번호는 숫자 4자리여야 합니다."),
    PIN_ATTEMPTS_EXCEEDED(false, 7309, "PIN 또는 비밀번호 입력 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요."),
    PASSWORD_POLICY_INVALID(false, 7310, "비밀번호는 최소 8자 이상이어야 합니다.");

    private final boolean success;
    private final int code;
    private final String message;
}
