package com.example.WaffleBear.storageshare.model;

/**
 * 저장 공간 공유 / 공유 저장소 기능에서 사용하는 열거형 모음.
 */
public final class StorageShareEnums {

    private StorageShareEnums() {
    }

    /** 용량 공유 방식 */
    public enum GrantType {
        /** 월 단위 정기 공유: 취소 전까지 매달 자동 유지 */
        RECURRING,
        /** 기간 대여: 시작일 ~ 종료일 */
        FIXED
    }

    /** 용량 공유 상태 */
    public enum GrantStatus {
        /** 유지 중(시작 전 예약 포함) */
        ACTIVE,
        /** 취소됨: 유예 기간 진행 중 */
        CANCELLED,
        /** 종료 처리 완료(초과분 정리 완료) */
        ENDED
    }

    public enum SharedStorageStatus {
        ACTIVE,
        /** 참여자 전원 승인으로 삭제됨: 30일 뒤 완전 삭제 */
        TRASHED
    }

    public enum MemberRole {
        OWNER,
        MEMBER
    }

    public enum MemberStatus {
        INVITED,
        ACTIVE,
        DECLINED
    }

    public enum NodeType {
        FILE,
        FOLDER
    }

    public enum ApprovalType {
        DELETE_STORAGE,
        DELETE_NODE,
        REMOVE_MEMBER
    }

    public enum ApprovalStatus {
        PENDING,
        APPROVED,
        REJECTED,
        EXPIRED,
        CANCELLED
    }
}
