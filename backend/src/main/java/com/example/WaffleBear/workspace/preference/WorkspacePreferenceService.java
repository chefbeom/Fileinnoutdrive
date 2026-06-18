package com.example.WaffleBear.workspace.preference;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static com.example.WaffleBear.common.model.BaseResponseStatus.FAIL;
import static com.example.WaffleBear.common.model.BaseResponseStatus.USER_NOT_FOUND;

@Service
@RequiredArgsConstructor
public class WorkspacePreferenceService {

    private static final int FAVORITE_LIMIT = 64;
    private static final int RECENT_LIMIT = 12;
    private static final int SECTION_LIMIT = 24;
    private static final int VIEW_LIMIT = 12;
    private static final Set<String> ALLOWED_FILTERS = Set.of("all", "active", "blocked", "overdue", "shared");
    private static final Set<String> ALLOWED_SORTS = Set.of("updated-desc", "due-asc", "priority-desc", "title-asc");
    private static final TypeReference<List<String>> STRING_LIST_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<WorkspacePreferenceDto.DocumentSection>> SECTION_LIST_TYPE = new TypeReference<>() {
    };
    private static final TypeReference<List<WorkspacePreferenceDto.PageIndexView>> VIEW_LIST_TYPE = new TypeReference<>() {
    };

    private final WorkspacePreferenceRepository workspacePreferenceRepository;
    private final UserRepository userRepository;
    private final UserPostRepository userPostRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public WorkspacePreferenceDto.ResPreference get(Long userIdx) {
        return workspacePreferenceRepository.findByUser_Idx(userIdx)
                .map(preference -> toResponse(userIdx, preference))
                .orElseGet(WorkspacePreferenceDto.ResPreference::empty);
    }

    @Transactional
    public WorkspacePreferenceDto.ResPreference save(
            Long userIdx,
            WorkspacePreferenceDto.ReqPreference request
    ) {
        User user = userRepository.findById(userIdx)
                .orElseThrow(() -> new BaseException(USER_NOT_FOUND));
        PreferencePayload payload = normalize(userIdx, request);
        WorkspacePreference preference = workspacePreferenceRepository.findByUser_Idx(userIdx)
                .orElseGet(() -> WorkspacePreference.create(user));

        preference.update(
                writeJson(payload.favoriteWorkspaceIds()),
                writeJson(payload.recentWorkspaceIds()),
                writeJson(payload.documentSections()),
                writeJson(payload.pageIndexViews())
        );

        WorkspacePreference saved = workspacePreferenceRepository.saveAndFlush(preference);
        return payload.toResponse(saved.getUpdatedAt());
    }

    private WorkspacePreferenceDto.ResPreference toResponse(Long userIdx, WorkspacePreference preference) {
        Set<String> accessibleWorkspaceIds = accessibleWorkspaceIds(userIdx);
        return new WorkspacePreferenceDto.ResPreference(
                normalizeWorkspaceIds(
                        readJson(preference.getFavoriteWorkspaceIds(), STRING_LIST_TYPE, List.of()),
                        accessibleWorkspaceIds,
                        FAVORITE_LIMIT
                ),
                normalizeWorkspaceIds(
                        readJson(preference.getRecentWorkspaceIds(), STRING_LIST_TYPE, List.of()),
                        accessibleWorkspaceIds,
                        RECENT_LIMIT
                ),
                normalizeSections(
                        readJson(preference.getDocumentSections(), SECTION_LIST_TYPE, List.of()),
                        accessibleWorkspaceIds
                ),
                normalizeViews(readJson(preference.getPageIndexViews(), VIEW_LIST_TYPE, List.of())),
                preference.getUpdatedAt()
        );
    }

    private PreferencePayload normalize(
            Long userIdx,
            WorkspacePreferenceDto.ReqPreference request
    ) {
        WorkspacePreferenceDto.ReqPreference source = request == null
                ? new WorkspacePreferenceDto.ReqPreference(List.of(), List.of(), List.of(), List.of())
                : request;
        Set<String> accessibleWorkspaceIds = accessibleWorkspaceIds(userIdx);
        return new PreferencePayload(
                normalizeWorkspaceIds(source.favoriteWorkspaceIds(), accessibleWorkspaceIds, FAVORITE_LIMIT),
                normalizeWorkspaceIds(source.recentWorkspaceIds(), accessibleWorkspaceIds, RECENT_LIMIT),
                normalizeSections(source.documentSections(), accessibleWorkspaceIds),
                normalizeViews(source.pageIndexViews())
        );
    }

    private Set<String> accessibleWorkspaceIds(Long userIdx) {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (UserPost relation : userPostRepository.findAllByUser_IdxOrderByWorkspaceUpdatedAtDesc(userIdx)) {
            Long workspaceIdx = relation.getWorkspace() == null ? null : relation.getWorkspace().getIdx();
            if (workspaceIdx != null) {
                ids.add(String.valueOf(workspaceIdx));
            }
        }
        return ids;
    }

    private List<String> normalizeWorkspaceIds(List<String> values, Set<String> validIds, int limit) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : values == null ? List.<String>of() : values) {
            String id = clean(value, 40);
            if (id.isBlank() || !validIds.contains(id)) {
                continue;
            }
            normalized.add(id);
            if (normalized.size() >= limit) {
                break;
            }
        }
        return List.copyOf(normalized);
    }

    private List<WorkspacePreferenceDto.DocumentSection> normalizeSections(
            List<WorkspacePreferenceDto.DocumentSection> sections,
            Set<String> validIds
    ) {
        LinkedHashSet<String> sectionIds = new LinkedHashSet<>();
        LinkedHashSet<String> assignedDocumentIds = new LinkedHashSet<>();
        List<WorkspacePreferenceDto.DocumentSection> normalized = new ArrayList<>();

        for (WorkspacePreferenceDto.DocumentSection section : sections == null ? List.<WorkspacePreferenceDto.DocumentSection>of() : sections) {
            if (section == null) {
                continue;
            }
            String id = clean(section.id(), 80);
            String name = clean(section.name(), 32);
            if (id.isBlank() || name.isBlank() || !sectionIds.add(id)) {
                continue;
            }

            List<String> documentIds = new ArrayList<>();
            for (String rawDocumentId : section.documentIds() == null ? List.<String>of() : section.documentIds()) {
                String documentId = clean(rawDocumentId, 40);
                if (documentId.isBlank() || !validIds.contains(documentId) || !assignedDocumentIds.add(documentId)) {
                    continue;
                }
                documentIds.add(documentId);
            }

            normalized.add(new WorkspacePreferenceDto.DocumentSection(
                    id,
                    name,
                    Boolean.TRUE.equals(section.collapsed()),
                    List.copyOf(documentIds)
            ));

            if (normalized.size() >= SECTION_LIMIT) {
                break;
            }
        }

        return List.copyOf(normalized);
    }

    private List<WorkspacePreferenceDto.PageIndexView> normalizeViews(
            List<WorkspacePreferenceDto.PageIndexView> views
    ) {
        LinkedHashSet<String> viewIds = new LinkedHashSet<>();
        LinkedHashSet<String> viewNames = new LinkedHashSet<>();
        List<WorkspacePreferenceDto.PageIndexView> normalized = new ArrayList<>();

        for (WorkspacePreferenceDto.PageIndexView view : views == null ? List.<WorkspacePreferenceDto.PageIndexView>of() : views) {
            if (view == null) {
                continue;
            }
            String id = clean(view.id(), 80);
            String name = clean(view.name(), 32);
            String nameKey = name.toLowerCase(Locale.ROOT);
            if (id.isBlank() || name.isBlank() || !viewIds.add(id) || !viewNames.add(nameKey)) {
                continue;
            }

            normalized.add(new WorkspacePreferenceDto.PageIndexView(
                    id,
                    name,
                    allowedOrDefault(clean(view.filter(), 24), ALLOWED_FILTERS, "all"),
                    clean(view.query(), 80),
                    cleanLower(view.tag(), 80),
                    cleanLower(view.owner(), 120),
                    allowedOrDefault(clean(view.sort(), 32), ALLOWED_SORTS, "updated-desc")
            ));

            if (normalized.size() >= VIEW_LIMIT) {
                break;
            }
        }

        return List.copyOf(normalized);
    }

    private String allowedOrDefault(String value, Set<String> allowedValues, String fallback) {
        return allowedValues.contains(value) ? value : fallback;
    }

    private String cleanLower(String value, int maxLength) {
        return clean(value, maxLength).toLowerCase(Locale.ROOT);
    }

    private String clean(String value, int maxLength) {
        String normalized = String.valueOf(value == null ? "" : value)
                .replaceAll("\\s+", " ")
                .trim();
        if (normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength);
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? List.of() : value);
        } catch (JsonProcessingException e) {
            throw new BaseException(FAIL);
        }
    }

    private <T> T readJson(String value, TypeReference<T> type, T fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return objectMapper.readValue(value, type);
        } catch (JsonProcessingException e) {
            return fallback;
        }
    }

    private record PreferencePayload(
            List<String> favoriteWorkspaceIds,
            List<String> recentWorkspaceIds,
            List<WorkspacePreferenceDto.DocumentSection> documentSections,
            List<WorkspacePreferenceDto.PageIndexView> pageIndexViews
    ) {
        WorkspacePreferenceDto.ResPreference toResponse(java.time.LocalDateTime updatedAt) {
            return new WorkspacePreferenceDto.ResPreference(
                    favoriteWorkspaceIds,
                    recentWorkspaceIds,
                    documentSections,
                    pageIndexViews,
                    updatedAt
            );
        }
    }
}
