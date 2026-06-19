APP_NAME = "FileInNOut Desktop"
CONFIG_DIR_NAME = "FileInNOutDesktop"
STATE_DIR_NAME = ".fileinnout"
STATE_FILE_NAME = "state.json"
LOCK_FILE_NAME = "sync.lock"
CHUNK_SIZE_BYTES = 80 * 1024 * 1024
GET_RETRY_ATTEMPTS = 3
PARTITION_SIZE_BYTES = 100 * 1024 * 1024
SHARED_ROOT_NAME = "Shared"
SHARE_URL_SCHEME = "fileinnout"
SHARE_URL_HOSTS = {"shared", "share", "folder"}
MY_DRIVE_HUB_NAME = "\ub0b4 \ub4dc\ub77c\uc774\ube0c"
SHARED_DRIVE_HUB_NAME = "\uacf5\uc720 \ubb38\uc11c\ud568"
ROOT_FILE_SYNC_FOLDER_NAME = "\ub8e8\ud2b8 \ud30c\uc77c"
DRIVE_ROOT_HUB_FOLDER_NAMES = {
    MY_DRIVE_HUB_NAME.casefold(),
    SHARED_DRIVE_HUB_NAME.casefold(),
}
SKIPPED_ROOTS = {STATE_DIR_NAME}
SKIPPED_FILES = {"desktop.ini", "Thumbs.db", ".DS_Store"}
SKIPPED_FILE_PREFIXES = (".~", "~$")
SKIPPED_FILE_SUFFIXES = (
    ".download",
    ".tmp",
    ".temp",
    ".crdownload",
    ".part",
    ".partial",
    ".swp",
    ".swx",
)
DRIVE_ROOT_SKIPPED_FOLDER_NAMES = {
    STATE_DIR_NAME.casefold(),
    "$recycle.bin",
    "system volume information",
    *DRIVE_ROOT_HUB_FOLDER_NAMES,
}
FILE_ATTRIBUTE_REPARSE_POINT = 0x400

ACCOUNT_PROFILE_FIELDS = ("token", "refreshToken", "syncDir", "syncFolders", "driveLetter")
ACCOUNT_SYNC_FIELDS = ("syncDir", "syncFolders", "driveLetter")
