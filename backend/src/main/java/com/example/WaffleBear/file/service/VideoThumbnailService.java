package com.example.WaffleBear.file.service;

import org.jcodec.api.FrameGrab;
import org.jcodec.api.JCodecException;
import org.jcodec.common.io.NIOUtils;
import org.jcodec.common.io.SeekableByteChannel;
import org.jcodec.common.model.Picture;
import org.jcodec.scale.AWTUtil;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Service
public class VideoThumbnailService {

    private static final Set<String> SUPPORTED_VIDEO_FORMATS = Set.of(
            "mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "mpeg", "mpg", "ogv", "3gp"
    );
    private static final int MAX_THUMBNAIL_WIDTH = 480;
    private static final int MAX_THUMBNAIL_HEIGHT = 320;
    private static final long FFMPEG_TIMEOUT_SECONDS = 15L;
    private static final ScheduledExecutorService FFMPEG_WATCHDOG = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "ffmpeg-video-watchdog");
        thread.setDaemon(true);
        return thread;
    });

    public boolean supports(String fileFormat) {
        String normalizedFormat = fileFormat == null ? "" : fileFormat.trim().toLowerCase(Locale.ROOT);
        if (normalizedFormat.startsWith(".")) {
            normalizedFormat = normalizedFormat.substring(1);
        }
        return SUPPORTED_VIDEO_FORMATS.contains(normalizedFormat);
    }

    public byte[] createThumbnailFromSource(String inputSource) {
        if (inputSource == null || inputSource.isBlank()) {
            return new byte[0];
        }

        byte[] seekFrame = runFfmpegThumbnail(inputSource, "00:00:01");
        if (seekFrame.length > 0) {
            return seekFrame;
        }
        return runFfmpegThumbnail(inputSource, "00:00:00");
    }

    public byte[] createThumbnail(Path videoPath) throws IOException, JCodecException {
        if (videoPath == null) {
            return new byte[0];
        }

        byte[] ffmpegBytes = createThumbnailFromSource(videoPath.toAbsolutePath().toString());
        if (ffmpegBytes.length > 0) {
            return ffmpegBytes;
        }

        try (SeekableByteChannel channel = NIOUtils.readableChannel(videoPath.toFile())) {
            Picture picture = FrameGrab.createFrameGrab(channel).getNativeFrame();
            if (picture == null) {
                return new byte[0];
            }

            BufferedImage sourceImage = AWTUtil.toBufferedImage(picture);
            BufferedImage scaledImage = resize(sourceImage);

            try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
                ImageIO.write(scaledImage, "jpg", outputStream);
                return outputStream.toByteArray();
            }
        }
    }

    private byte[] runFfmpegThumbnail(String inputSource, String seekTimestamp) {
        List<String> command = List.of(
                "ffmpeg",
                "-hide_banner",
                "-loglevel", "error",
                "-nostdin",
                "-ss", seekTimestamp,
                "-i", inputSource,
                "-frames:v", "1",
                "-vf", "scale='min(" + MAX_THUMBNAIL_WIDTH + ",iw)':-2",
                "-q:v", "4",
                "-f", "image2pipe",
                "-vcodec", "mjpeg",
                "pipe:1"
        );

        Process process = null;
        ScheduledFuture<?> killFuture = null;
        try {
            process = new ProcessBuilder(command)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();
            final Process startedProcess = process;
            killFuture = FFMPEG_WATCHDOG.schedule(
                    startedProcess::destroyForcibly,
                    FFMPEG_TIMEOUT_SECONDS,
                    TimeUnit.SECONDS
            );
            try (InputStream stdout = startedProcess.getInputStream();
                 ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                stdout.transferTo(buffer);
                boolean finished = startedProcess.waitFor(2, TimeUnit.SECONDS);
                if (!finished) {
                    startedProcess.destroyForcibly();
                    return new byte[0];
                }
                if (startedProcess.exitValue() == 0 && buffer.size() > 0) {
                    return buffer.toByteArray();
                }
            }
        } catch (Exception ignored) {
            if (process != null) {
                process.destroyForcibly();
            }
        } finally {
            if (killFuture != null) {
                killFuture.cancel(false);
            }
        }
        return new byte[0];
    }

    private BufferedImage resize(BufferedImage sourceImage) {
        int sourceWidth = Math.max(1, sourceImage.getWidth());
        int sourceHeight = Math.max(1, sourceImage.getHeight());
        double scale = Math.min(
                1.0,
                Math.min(MAX_THUMBNAIL_WIDTH / (double) sourceWidth, MAX_THUMBNAIL_HEIGHT / (double) sourceHeight)
        );

        int targetWidth = Math.max(1, (int) Math.round(sourceWidth * scale));
        int targetHeight = Math.max(1, (int) Math.round(sourceHeight * scale));
        BufferedImage targetImage = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB);

        Graphics2D graphics = targetImage.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            graphics.drawImage(sourceImage, 0, 0, targetWidth, targetHeight, null);
        } finally {
            graphics.dispose();
        }

        return targetImage;
    }
}
