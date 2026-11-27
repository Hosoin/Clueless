package com.clueless.closet.service;

import java.io.IOException;
import java.net.InetAddress;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Locale;
import java.util.Properties;

import com.clueless.closet.controller.GarmentUpload;
import jakarta.servlet.MultipartConfigElement;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServer;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

final class LocalGarmentAnalysisRunner {

    static final String PATH = "/api/closet/items/analyze";
    private static final String LOOPBACK = "127.0.0.1";
    private static final int PORT = 18081;
    private static final int MIB = 1024 * 1024;

    public static void main(String[] args) throws IOException {
        var url = System.getenv("ML_API_URL");
        var key = System.getenv("ML_API_KEY");
        var settings = new Properties();
        if (url == null || key == null) {
            try (var env = Files.newBufferedReader(Path.of(".env"))) {
                settings.load(env);
            } catch (NoSuchFileException ignored) {
                // The client returns 503 when ML is not configured.
            }
        }
        var ml = new GarmentAnalysisClient(url != null ? url : settings.getProperty("ML_API_URL", ""),
                key != null ? key : settings.getProperty("ML_API_KEY", ""), new JsonMapper());
        var server = start(ml, PORT);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try (ml) {
                server.destroy();
            }
        }));
        System.out.printf("Local analysis: POST http://%s:%d%s%n", LOOPBACK, PORT, PATH);
    }

    static WebServer start(GarmentAnalysisClient ml, int port) throws IOException {
        var factory = new TomcatServletWebServerFactory(port);
        factory.setAddress(InetAddress.getByName(LOOPBACK));
        // Register one servlet without discovering any application, security, or database beans.
        var server = factory.getWebServer(context -> {
            var servlet = context.addServlet("localAnalysis", new HttpServlet() {
                @Override
                protected void service(HttpServletRequest request, HttpServletResponse response) throws IOException {
                    if (!LOOPBACK.equals(request.getRemoteAddr())
                            || !(LOOPBACK + ":" + request.getLocalPort()).equals(request.getHeader("Host"))
                            || request.getHeader("Origin") != null
                            || Collections.list(request.getHeaderNames()).stream()
                                    .anyMatch(name -> name.toLowerCase(Locale.ROOT).startsWith("sec-fetch-"))) {
                        response.setStatus(403);
                        return;
                    }
                    if (!PATH.equals(request.getRequestURI())) {
                        response.setStatus(404);
                        return;
                    }
                    if (!"POST".equals(request.getMethod())) {
                        response.setHeader("Allow", "POST");
                        response.setStatus(405);
                        return;
                    }
                    if (!isMultipart(request.getContentType())) {
                        response.setStatus(415);
                        return;
                    }
                    // Deliberately a raw ML probe: no production draft workflow, DB, Blob, or auth bypass.
                    response.setHeader("Cache-Control", "no-store");
                    try {
                        var upload = GarmentUpload.read(request);
                        var result = ml.analyze(upload.bytes(), upload.subtype());
                        response.setStatus(result.status().value());
                        if (result.body() != null) {
                            response.setContentType("application/json");
                            response.getOutputStream().write(result.body());
                        }
                    } catch (ResponseStatusException ex) {
                        response.setStatus(ex.getStatusCode().value());
                    }
                }
            });
            servlet.addMapping(PATH);
            servlet.setMultipartConfig(new MultipartConfigElement("", 10 * MIB, 11 * MIB, 0));
        });
        server.start();
        return server;
    }

    private static boolean isMultipart(String type) {
        try {
            return type != null && MediaType.MULTIPART_FORM_DATA.equalsTypeAndSubtype(MediaType.parseMediaType(type));
        } catch (InvalidMediaTypeException ex) {
            return false;
        }
    }
}
