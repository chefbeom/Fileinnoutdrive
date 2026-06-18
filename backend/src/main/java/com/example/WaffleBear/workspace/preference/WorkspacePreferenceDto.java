package com.example.WaffleBear.workspace.preference;

import java.time.LocalDateTime;
import java.util.List;

public class WorkspacePreferenceDto {

    public record ReqPreference(
            List<String> favoriteWorkspaceIds,
            List<String> recentWorkspaceIds,
            List<DocumentSection> documentSections,
            List<PageIndexView> pageIndexViews
    ) {
    }

    public record ResPreference(
            List<String> favoriteWorkspaceIds,
            List<String> recentWorkspaceIds,
            List<DocumentSection> documentSections,
            List<PageIndexView> pageIndexViews,
            LocalDateTime updatedAt
    ) {
        public static ResPreference empty() {
            return new ResPreference(List.of(), List.of(), List.of(), List.of(), null);
        }
    }

    public record DocumentSection(
            String id,
            String name,
            Boolean collapsed,
            List<String> documentIds
    ) {
    }

    public record PageIndexView(
            String id,
            String name,
            String filter,
            String query,
            String tag,
            String owner,
            String sort
    ) {
    }
}
