package com.example.WaffleBear.file.service;

import lombok.extern.slf4j.Slf4j;
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
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class VideoThumbnailService {

    private static final Set<String> SUPPORTED_VIDEO_FORMATS = Set.of(
            "mp4", "mov", "m4v", "webm", "mkv", "avi", "wmv", "mpeg", "mpg", "ogv", "3gp"
    );
    private static final int MAX_THUMBNAIL_WIDTH = 480;
    private static final int MAX_THUMBNAIL_HEIGHT = 320;
    private static final long FFMPEG_TIMEOUT_SECONDS = 20L;
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

        byte[] seekFrame = runFfmpegThumbnail(inputSource, "00:00:01", false);
        if (seekFrame.length > 0) {
            return seekFrame;
        }
        return runFfmpegThumbnail(inputSource, "00:00:00", true);
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

    private byte[] runFfmpegThumbnail(String inputSource, String seekTimestamp, boolean tolerantFallback) {
        boolean isHttpSource = inputSource.startsWith("http://") || inputSource.startsWith("https://");
        List<String> command = new ArrayList<>();
        command.add("ffmpeg");
        command.add("-hide_banner");
        command.add("-loglevel");
        command.add("error");
        command.add("-nostdin");
        if (isHttpSource) {
            command.add("-rw_timeout");
            command.add("15000000");
            command.add("-multiple_requests");
            command.add("0");
        }
        command.add("-analyzeduration");
        command.add("5000000");
        command.add("-probesize");
        command.add("10000000");
        if (tolerantFallback) {
            command.add("-err_detect");
            command.add("ignore_err");
        } else {
            command.add("-noaccurate_seek");
        }
        command.add("-ss");
        command.add(seekTimestamp);
        command.add("-i");
        command.add(inputSource);
        command.add("-map");
        command.add("0:v:0");
        command.add("-an");
        command.add("-sn");
        command.add("-dn");
        command.add("-frames:v");
        command.add("1");
        command.add("-vf");
        command.add("scale='trunc(min(" + MAX_THUMBNAIL_WIDTH + ",iw)/2)*2':-2,format=yuvj420p");
        command.add("-strict");
        command.add("unofficial");
        command.add("-q:v");
        command.add("4");
        command.add("-f");
        command.add("image2pipe");
        command.add("-vcodec");
        command.add("mjpeg");
        command.add("pipe:1");

        Process process = null;
        ScheduledFuture<?> killFuture = null;
        try {
            process = new ProcessBuilder(command)
                    .redirectErrorStream(false)
                    .start();
            final Process startedProcess = process;
            killFuture = FFMPEG_WATCHDOG.schedule(
                    startedProcess::destroyForcibly,
                    FFMPEG_TIMEOUT_SECONDS,
                    TimeUnit.SECONDS
            );
            ByteArrayOutputStream stderrBuffer = new ByteArrayOutputStream(512);
            Thread stderrReader = new Thread(() -> {
                try (InputStream errIn = startedProcess.getErrorStream()) {
                    byte[] chunk = new byte[512];
                    int read;
                    while ((read = errIn.read(chunk)) != -1) {
                        if (stderrBuffer.size() < 2048) {
                            stderrBuffer.write(chunk, 0, Math.min(read, 2048 - stderrBuffer.size()));
                        }
                    }
                } catch (IOException ignored) {
                }
            }, "ffmpeg-stderr-drain");
            stderrReader.setDaemon(true);
            stderrReader.start();

            try (InputStream stdout = startedProcess.getInputStream();
                 ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
                stdout.transferTo(buffer);
                boolean finished = startedProcess.waitFor(2, TimeUnit.SECONDS);
                try {
                    stderrReader.join(200);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                if (!finished) {
                    startedProcess.destroyForcibly();
                    String errText = stderrBuffer.toString(StandardCharsets.UTF_8);
                    if (tolerantFallback) {
                        log.warn("ffmpeg video thumbnail timed out seek={} err={}", seekTimestamp, errText);
                    } else {
                        log.debug("ffmpeg thumbnail timed out at seek={} err={}", seekTimestamp, errText);
                    }
                    return new byte[0];
                }
                if (startedProcess.exitValue() == 0 && buffer.size() > 0) {
                    return buffer.toByteArray();
                }
                String errText = stderrBuffer.toString(StandardCharsets.UTF_8);
                if (tolerantFallback) {
                    log.warn("ffmpeg video thumbnail failed exit={} seek={} err={}", startedProcess.exitValue(), seekTimestamp, errText);
                } else {
                    log.debug("ffmpeg thumbnail failed exit={} seek={} err={}", startedProcess.exitValue(), seekTimestamp, errText);
                }
            }
        } catch (Exception exception) {
            if (tolerantFallback) {
                log.warn("ffmpeg video thumbnail execution error seek={}: {}", seekTimestamp, exception.getMessage());
            } else {
                log.debug("ffmpeg thumbnail execution error seek={}: {}", seekTimestamp, exception.getMessage());
            }
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
