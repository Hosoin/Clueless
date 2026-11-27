package com.clueless.closet.controller;

import com.clueless.closet.service.ClosetDraftService;
import com.clueless.closet.service.ClosetOidcUser;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class ClosetAnalysisController {

    private final ClosetDraftService drafts;

    public ClosetAnalysisController(ClosetDraftService drafts) {
        this.drafts = drafts;
    }

    @PostMapping(path = {"/api/closet/analyze", "/api/closet/items/analyze"},
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE, produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> analyze(@AuthenticationPrincipal ClosetOidcUser principal, HttpServletRequest request) {
        if (principal == null || principal.userId() <= 0) {
            return result(HttpStatus.UNAUTHORIZED).build();
        }
        try {
            var upload = GarmentUpload.read(request);
            return result(HttpStatus.OK).body(drafts.analyze(principal.userId(), upload.bytes(), upload.subtype()));
        } catch (DataAccessException ex) {
            return result(HttpStatus.SERVICE_UNAVAILABLE).build();
        } catch (ResponseStatusException ex) {
            return result(HttpStatus.valueOf(ex.getStatusCode().value())).build();
        }
    }

    private static ResponseEntity.BodyBuilder result(HttpStatus status) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore());
    }
}
