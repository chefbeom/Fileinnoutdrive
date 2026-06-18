package com.example.WaffleBear.workspace.comment;

import com.example.WaffleBear.common.exception.BaseException;
import com.example.WaffleBear.common.model.BaseResponseStatus;
import com.example.WaffleBear.config.stomp.ClusteredStompPublisher;
import com.example.WaffleBear.notification.NotificationService;
import com.example.WaffleBear.user.model.User;
import com.example.WaffleBear.user.repository.UserRepository;
import com.example.WaffleBear.workspace.model.post.Post;
import com.example.WaffleBear.workspace.model.relation.AccessRole;
import com.example.WaffleBear.workspace.model.relation.UserPost;
import com.example.WaffleBear.workspace.repository.PostRepository;
import com.example.WaffleBear.workspace.repository.UserPostRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class WorkspaceCommentService {

    private static final int MAX_COMMENT_LENGTH = 4000;
    private static final int MAX_ANCHOR_BLOCK_ID_LENGTH = 80;
    private static final int MAX_ANCHOR_BLOCK_TYPE_LENGTH = 40;
    private static final int MAX_ANCHOR_TEXT_LENGTH = 255;
    private static final Pattern EMAIL_MENTION_PATTERN = Pattern.compile(
            "(?<![A-Za-z0-9._%+-])@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})"
    );

    private final WorkspaceCommentRepository workspaceCommentRepository;
    private final PostRepository postRepository;
    private final UserPostRepository userPostRepository;
    private final UserRepository userRepository;
    private final ClusteredStompPublisher stompPublisher;
    private final NotificationService notificationService;

    @Transactional(readOnly = true)
    public List<WorkspaceCommentDto.ResComment> list(Long workspaceIdx, Long userIdx) {
        requireAccess(workspaceIdx, userIdx);
        return workspaceCommentRepository.findAllByWorkspace_IdxOrderByResolvedAscCreatedAtDesc(workspaceIdx)
                .stream()
                .map(WorkspaceCommentDto.ResComment::from)
                .toList();
    }

    @Transactional
    public WorkspaceCommentDto.ResComment create(Long workspaceIdx, Long userIdx, WorkspaceCommentDto.ReqCreate request) {
        UserPost relation = requireAccess(workspaceIdx, userIdx);
        String contents = normalizeContents(request == null ? null : request.contents());
        String anchorBlockId = normalizeOptional(request == null ? null : request.anchorBlockId(), MAX_ANCHOR_BLOCK_ID_LENGTH);
        String anchorBlockType = normalizeOptional(request == null ? null : request.anchorBlockType(), MAX_ANCHOR_BLOCK_TYPE_LENGTH);
        String anchorText = normalizeAnchorText(request == null ? null : request.anchorText());

        User author = userRepository.findById(userIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.USER_NOT_FOUND));
        WorkspaceComment comment = workspaceCommentRepository.save(WorkspaceComment.builder()
                .workspace(relation.getWorkspace())
                .author(author)
                .contents(contents)
                .anchorBlockId(anchorBlockId)
                .anchorBlockType(anchorBlockType)
                .anchorText(anchorText)
                .resolved(false)
                .build());
        WorkspaceCommentDto.ResComment result = WorkspaceCommentDto.ResComment.from(comment);
        publishCommentEvent(workspaceIdx, "UPSERT", userIdx, result, comment.getIdx());
        dispatchMentionNotifications(relation.getWorkspace(), author, contents, Set.of());
        return result;
    }

    @Transactional
    public WorkspaceCommentDto.ResComment update(Long workspaceIdx, Long commentIdx, Long userIdx, WorkspaceCommentDto.ReqUpdate request) {
        UserPost relation = requireAccess(workspaceIdx, userIdx);
        WorkspaceComment comment = findComment(workspaceIdx, commentIdx);
        if (!canModifyComment(relation, comment)) {
            throw BaseException.from(BaseResponseStatus.WORKSPACE_ACCESS_DENIED);
        }

        Set<String> previousMentions = extractMentionedEmails(comment.getContents());
        String contents = normalizeContents(request == null ? null : request.contents());
        comment.updateContents(contents);
        WorkspaceCommentDto.ResComment result = WorkspaceCommentDto.ResComment.from(comment);
        publishCommentEvent(workspaceIdx, "UPSERT", userIdx, result, comment.getIdx());
        dispatchMentionNotifications(relation.getWorkspace(), comment.getAuthor(), contents, previousMentions);
        return result;
    }

    @Transactional
    public WorkspaceCommentDto.ResComment resolve(Long workspaceIdx, Long commentIdx, Long userIdx, WorkspaceCommentDto.ReqResolve request) {
        UserPost relation = requireAccess(workspaceIdx, userIdx);
        WorkspaceComment comment = findComment(workspaceIdx, commentIdx);
        if (!canResolveComment(relation, comment)) {
            throw BaseException.from(BaseResponseStatus.WORKSPACE_ACCESS_DENIED);
        }

        comment.updateResolved(Boolean.TRUE.equals(request == null ? Boolean.TRUE : request.resolved()));
        WorkspaceCommentDto.ResComment result = WorkspaceCommentDto.ResComment.from(comment);
        publishCommentEvent(workspaceIdx, "UPSERT", userIdx, result, comment.getIdx());
        return result;
    }

    @Transactional
    public BaseResponseStatus delete(Long workspaceIdx, Long commentIdx, Long userIdx) {
        UserPost relation = requireAccess(workspaceIdx, userIdx);
        WorkspaceComment comment = findComment(workspaceIdx, commentIdx);
        if (!canModifyComment(relation, comment)) {
            throw BaseException.from(BaseResponseStatus.WORKSPACE_ACCESS_DENIED);
        }

        workspaceCommentRepository.delete(comment);
        publishCommentEvent(workspaceIdx, "DELETE", userIdx, null, commentIdx);
        return BaseResponseStatus.SUCCESS;
    }

    private UserPost requireAccess(Long workspaceIdx, Long userIdx) {
        return userPostRepository.findByUser_IdxAndWorkspace_Idx(userIdx, workspaceIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.WORKSPACE_ACCESS_DENIED));
    }

    private WorkspaceComment findComment(Long workspaceIdx, Long commentIdx) {
        return workspaceCommentRepository.findByIdxAndWorkspace_Idx(commentIdx, workspaceIdx)
                .orElseThrow(() -> BaseException.from(BaseResponseStatus.WORKSPACE_NOT_FOUND));
    }

    private boolean canModifyComment(UserPost relation, WorkspaceComment comment) {
        return relation.getLevel() == AccessRole.ADMIN
                || Objects.equals(relation.getUser().getIdx(), comment.getAuthor().getIdx());
    }

    private boolean canResolveComment(UserPost relation, WorkspaceComment comment) {
        return canModifyComment(relation, comment)
                || relation.getLevel() == AccessRole.WRITE;
    }

    private String normalizeContents(String contents) {
        String normalized = contents == null ? "" : contents.trim();
        if (normalized.isBlank() || normalized.length() > MAX_COMMENT_LENGTH) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return normalized;
    }

    private String normalizeOptional(String value, int maxLength) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            return null;
        }
        if (normalized.length() > maxLength) {
            throw BaseException.from(BaseResponseStatus.REQUEST_ERROR);
        }
        return normalized;
    }

    private String normalizeAnchorText(String value) {
        String normalized = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (normalized.isBlank()) {
            return null;
        }
        return normalized.length() > MAX_ANCHOR_TEXT_LENGTH
                ? normalized.substring(0, MAX_ANCHOR_TEXT_LENGTH)
                : normalized;
    }

    private Set<String> extractMentionedEmails(String contents) {
        Matcher matcher = EMAIL_MENTION_PATTERN.matcher(contents == null ? "" : contents);
        return matcher.results()
                .map(match -> match.group(1).toLowerCase(Locale.ROOT))
                .collect(Collectors.toSet());
    }

    private void dispatchMentionNotifications(
            Post workspace,
            User author,
            String contents,
            Set<String> alreadyMentionedEmails
    ) {
        Set<String> mentionedEmails = extractMentionedEmails(contents);
        mentionedEmails.removeAll(alreadyMentionedEmails == null ? Set.of() : alreadyMentionedEmails);
        if (workspace == null || author == null || mentionedEmails.isEmpty()) {
            return;
        }

        userPostRepository.findAllByWorkspace_idx(workspace.getIdx()).stream()
                .map(UserPost::getUser)
                .filter(Objects::nonNull)
                .filter(user -> user.getEmail() != null)
                .filter(user -> !Objects.equals(user.getIdx(), author.getIdx()))
                .filter(user -> mentionedEmails.contains(user.getEmail().toLowerCase(Locale.ROOT)))
                .forEach(user -> notificationService.sendWorkspaceMentionNotification(
                        user.getIdx(),
                        workspace.getUUID(),
                        workspace.getTitle(),
                        author.getName()
                ));
    }

    private void publishCommentEvent(
            Long workspaceIdx,
            String action,
            Long actorUserIdx,
            WorkspaceCommentDto.ResComment comment,
            Long commentIdx
    ) {
        if (workspaceIdx == null) {
            return;
        }

        stompPublisher.send(
                "/sub/workspace/comments/" + workspaceIdx,
                new WorkspaceCommentDto.CommentEvent(
                        workspaceIdx,
                        action,
                        actorUserIdx,
                        comment,
                        commentIdx
                )
        );
    }
}
