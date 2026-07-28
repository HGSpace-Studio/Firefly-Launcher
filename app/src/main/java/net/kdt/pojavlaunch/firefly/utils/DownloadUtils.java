package net.kdt.pojavlaunch.firefly.utils;

import android.util.Log;

import androidx.annotation.Nullable;

import net.kdt.pojavlaunch.firefly.Tools;

import org.apache.commons.io.IOUtils;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Callable;

@SuppressWarnings("IOStreamConstructor")
public class DownloadUtils {
    public static final String USER_AGENT = Tools.APP_NAME;
    private static final int CONNECT_TIMEOUT = 15000;
    private static final int READ_TIMEOUT = 30000;

    private static final int DOWNLOAD_BUFFER_SIZE = 65536;
    private static final int MAX_RETRIES = 3;

    public interface SpeedListener {
        void onSpeedUpdated(long bytesPerSecond);
    }

    public static void download(String url, OutputStream os) throws IOException {
        download(new URL(url), os);
    }

    public static void download(URL url, OutputStream os) throws IOException {
        InputStream is = null;
        try {
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setConnectTimeout(CONNECT_TIMEOUT);
            conn.setReadTimeout(READ_TIMEOUT);
            conn.setDoInput(true);
            conn.connect();
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                throw new IOException("Server returned HTTP " + conn.getResponseCode()
                        + ": " + conn.getResponseMessage());
            }
            is = conn.getInputStream();
            IOUtils.copy(is, os);
        } catch (SocketTimeoutException e) {
            throw new IOException("Download timed out: " + url, e);
        } catch (IOException e) {
            throw new IOException("Unable to download from " + url, e);
        } finally {
            if (is != null) {
                try {
                    is.close();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }
    }

    public static String downloadString(String url) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        download(url, bos);
        bos.close();
        return new String(bos.toByteArray(), StandardCharsets.UTF_8);
    }

    public static void downloadFile(String url, File out) throws IOException {
        downloadFileWithRetry(url, out, MAX_RETRIES);
    }

    private static void downloadFileWithRetry(String url, File out, int retries) throws IOException {
        IOException lastException = null;
        for (int attempt = 0; attempt < retries; attempt++) {
            try {
                downloadFileInternal(url, out);
                return;
            } catch (IOException e) {
                lastException = e;
                Log.w("DownloadUtils", "Download attempt " + (attempt + 1) + "/" + retries + " failed: " + url, e);
                if (attempt < retries - 1) {
                    try {
                        Thread.sleep(1000L * (attempt + 1));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Download interrupted", ie);
                    }
                }
            }
        }
        throw lastException;
    }

    private static void downloadFileInternal(String url, File out) throws IOException {
        FileUtils.ensureParentDirectory(out);
        boolean supportsResume = out.exists() && out.canWrite() && out.length() > 0;
        HttpURLConnection conn = null;
        InputStream readStr = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setConnectTimeout(CONNECT_TIMEOUT);
            conn.setReadTimeout(READ_TIMEOUT);
            conn.setDoInput(true);
            if (supportsResume) {
                long existingLength = out.length();
                conn.setRequestProperty("Range", "bytes=" + existingLength + "-");
            }
            conn.connect();
            int responseCode = conn.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_NOT_FOUND) {
                throw new FileNotFoundException("File not found: " + url);
            }
            if (responseCode != HttpURLConnection.HTTP_OK &&
                responseCode != HttpURLConnection.HTTP_PARTIAL) {
                throw new IOException("Server returned HTTP " + responseCode
                        + ": " + conn.getResponseMessage());
            }
            readStr = conn.getInputStream();
            try (RandomAccessFile raf = new RandomAccessFile(out, "rw")) {
                if (responseCode == HttpURLConnection.HTTP_PARTIAL) {
                    raf.seek(out.length());
                } else {
                    raf.setLength(0);
                }
                byte[] buffer = new byte[DOWNLOAD_BUFFER_SIZE];
                int current;
                while ((current = readStr.read(buffer)) != -1) {
                    raf.write(buffer, 0, current);
                }
            }
        } finally {
            if (readStr != null) {
                try { readStr.close(); } catch (Exception ignored) {}
            }
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    public static void downloadFileMonitored(String urlInput, File outputFile, @Nullable byte[] buffer,
                                             Tools.DownloaderFeedback monitor) throws IOException {
        downloadFileMonitoredWithRetry(urlInput, outputFile, buffer, monitor, MAX_RETRIES);
    }

    private static void downloadFileMonitoredWithRetry(String urlInput, File outputFile, @Nullable byte[] buffer,
                                                      Tools.DownloaderFeedback monitor, int retries) throws IOException {
        IOException lastException = null;
        for (int attempt = 0; attempt < retries; attempt++) {
            try {
                downloadFileMonitoredInternal(urlInput, outputFile, buffer, monitor);
                return;
            } catch (IOException e) {
                lastException = e;
                Log.w("DownloadUtils", "Monitored download attempt " + (attempt + 1) + "/" + retries + " failed: " + urlInput, e);
                if (attempt < retries - 1) {
                    try {
                        Thread.sleep(1000L * (attempt + 1));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Download interrupted", ie);
                    }
                }
            }
        }
        throw lastException;
    }

    private static void downloadFileMonitoredInternal(String urlInput, File outputFile, @Nullable byte[] buffer,
                                                        Tools.DownloaderFeedback monitor) throws IOException {
        FileUtils.ensureParentDirectory(outputFile);

        HttpURLConnection conn = (HttpURLConnection) new URL(urlInput).openConnection();
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setConnectTimeout(CONNECT_TIMEOUT);
        conn.setReadTimeout(READ_TIMEOUT);
        InputStream readStr = conn.getInputStream();
        try (FileOutputStream fos = new FileOutputStream(outputFile)) {
            int current;
            int overall = 0;
            int length = conn.getContentLength();

            if (buffer == null) buffer = new byte[DOWNLOAD_BUFFER_SIZE];

            while ((current = readStr.read(buffer)) != -1) {
                overall += current;
                fos.write(buffer, 0, current);
                monitor.updateProgress(overall, length);
            }
        } catch (SocketTimeoutException e) {
            throw new IOException("Download timed out: " + urlInput, e);
        } finally {
            conn.disconnect();
        }
    }

    public static <T> T downloadStringCached(String url, String cacheName, ParseCallback<T> parseCallback) throws IOException, ParseException {
        File cacheDestination = new File(Tools.DIR_CACHE, "string_cache/" + cacheName);
        if (cacheDestination.isFile() &&
                cacheDestination.canRead() &&
                System.currentTimeMillis() < (cacheDestination.lastModified() + 86400000)) {
            try {
                String cachedString = Tools.read(new FileInputStream(cacheDestination));
                return parseCallback.process(cachedString);
            } catch (IOException e) {
                Log.i("DownloadUtils", "Failed to read the cached file", e);
            } catch (ParseException e) {
                Log.i("DownloadUtils", "Failed to parse the cached file", e);
            }
        }
        String urlContent = DownloadUtils.downloadString(url);
        T parseResult = parseCallback.process(urlContent);

        boolean tryWriteCache;
        if (cacheDestination.exists()) {
            tryWriteCache = cacheDestination.canWrite();
        } else {
            tryWriteCache = FileUtils.ensureParentDirectorySilently(cacheDestination);
        }

        if (tryWriteCache) try {
            Tools.write(cacheDestination.getAbsolutePath(), urlContent);
        } catch (IOException e) {
            Log.i("DownloadUtils", "Failed to cache the string", e);
        }
        return parseResult;
    }

    private static <T> T downloadFile(Callable<T> downloadFunction) throws IOException {
        try {
            return downloadFunction.call();
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static boolean verifyFile(File file, String sha1) {
        return file.exists() && Tools.compareSHA1(file, sha1);
    }

    public static <T> T ensureSha1(File outputFile, @Nullable String sha1, Callable<T> downloadFunction) throws IOException {
        if (sha1 == null) {
            if (outputFile.exists()) return null;
            else return downloadFile(downloadFunction);
        }

        int attempts = 0;
        boolean fileOkay = verifyFile(outputFile, sha1);
        T result = null;
        while (attempts < 5 && !fileOkay) {
            attempts++;
            downloadFile(downloadFunction);
            fileOkay = verifyFile(outputFile, sha1);
        }
        if (!fileOkay)
            throw new SHA1VerificationException("SHA1 verification failed after 5 download attempts");
        return result;
    }

    public static long getContentLength(String url) throws IOException {
        HttpURLConnection urlConnection = (HttpURLConnection) new URL(url).openConnection();
        urlConnection.setRequestProperty("User-Agent", USER_AGENT);
        urlConnection.setRequestMethod("HEAD");
        urlConnection.setConnectTimeout(CONNECT_TIMEOUT);
        urlConnection.setReadTimeout(READ_TIMEOUT);
        urlConnection.setDoInput(false);
        urlConnection.setDoOutput(false);
        urlConnection.connect();
        int responseCode = urlConnection.getResponseCode();
        if(responseCode >= 200 && responseCode <= 299) return urlConnection.getContentLength();
        return -1;
    }

    public interface ParseCallback<T> {
        T process(String input) throws ParseException;
    }

    public static class ParseException extends Exception {
        public ParseException(Exception e) {
            super(e);
        }
    }

    public static class SHA1VerificationException extends IOException {
        public SHA1VerificationException(String message) {
            super(message);
        }
    }
}
