package com.example.WaffleBear.file.service;

import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Service
public class ImageThumbnailService {

    private static final int MAX_THUMBNAIL_WIDTH = 640;
    private static final int MAX_THUMBNAIL_HEIGHT = 360;
    private static final long FFMPEG_TIMEOUT_SECONDS = 10L;
    private static final ScheduledExecutorService FFMPEG_WATCHDOG = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "ffmpeg-image-watchdog");
        thread.setDaemon(true);
        return thread;
    });

    public byte[] createThumbnail(InputStream sourceStream) throws IOException {
        if (sourceStream == null) {
            return new byte[0];
        }

        byte[] sourceBytes = sourceStream.readAllBytes();
        if (sourceBytes.length == 0) {
            return new byte[0];
        }

        BufferedImage sourceImage = ImageIO.read(new ByteArrayInputStream(sourceBytes));
        if (sourceImage != null) {
            BufferedImage scaledImage = resize(sourceImage);
            try (ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
                ImageIO.write(scaledImage, "jpg", outputStream);
                return outputStream.toByteArray();
            }
        }

        return runFfmpegImageThumbnail(sourceBytes);
    }

    private byte[] runFfmpegImageThumbnail(byte[] sourceBytes) {
        List<String> command = List.of(
                "ffmpeg",
                "-hide_banner",
                "-loglevel", "error",
                "-i", "pipe:0",
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
            try (OutputStream stdin = startedProcess.getOutputStream()) {
                stdin.write(sourceBytes);
            } catch (Exception ignored) {
            }

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
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, targetWidth, targetHeight);
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
