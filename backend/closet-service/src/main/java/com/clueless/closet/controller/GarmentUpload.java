package com.clueless.closet.controller;

import java.io.IOException;
import java.util.Collection;
import java.util.HexFormat;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.Part;
import org.springframework.http.HttpStatus;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

public record GarmentUpload(byte[] bytes, String subtype) {

    private static final long MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    private static final HexFormat HEX = HexFormat.of();

    public static GarmentUpload read(HttpServletRequest request) {
        Collection<Part> parts;
        try {
            parts = request.getParts();
        } catch (IllegalStateException ex) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE);
        } catch (IOException | ServletException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (parts.size() != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        var image = parts.iterator().next();
        if (!"image".equals(image.getName()) || !StringUtils.hasText(image.getSubmittedFileName()) || image.getSize() == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        if (image.getSize() > MAX_IMAGE_BYTES) {
            throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE);
        }
        byte[] bytes;
        try (var body = image.getInputStream()) {
            bytes = body.readAllBytes();
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        String subtype = imageSubtype(image.getContentType(), bytes);
        if (subtype == null) {
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }
        return new GarmentUpload(bytes, subtype);
    }

    // shortcut: check signatures only; the ML decoder validates the full image.
    private static String imageSubtype(String contentType, byte[] bytes) {
        String signature = HEX.formatHex(bytes, 0, Math.min(bytes.length, 12));
        if ("image/jpeg".equalsIgnoreCase(contentType) && signature.startsWith("ffd8ff")) {
            return "jpeg";
        }
        if ("image/png".equalsIgnoreCase(contentType) && signature.startsWith("89504e470d0a1a0a")) {
            return "png";
        }
        if ("image/webp".equalsIgnoreCase(contentType) && signature.length() == 24
                && signature.startsWith("52494646") && signature.endsWith("57454250")) {
            return "webp";
        }
        return null;
    }
}
