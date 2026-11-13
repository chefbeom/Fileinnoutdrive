package com.example.WaffleBear.mediaphoto;

import java.time.LocalDateTime;
import java.util.Map;

public class MediaPhotoLibraryDto {

    public record ReqLibrary(
            Map<String, Object> state
    ) {
    }

    public record ResLibrary(
            Map<String, Object> state,
            LocalDateTime updatedAt
    ) {
        public static ResLibrary empty() {
            return new ResLibrary(Map.of(), null);
        }
    }
}
