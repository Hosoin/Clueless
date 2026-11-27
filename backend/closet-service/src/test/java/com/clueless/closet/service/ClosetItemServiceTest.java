package com.clueless.closet.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.clueless.closet.repository.ClosetItemRepository;
import com.clueless.closet.repository.ClosetItemRepository.DraftValues;
import com.clueless.closet.repository.ClosetItemRepository.EditField;
import com.clueless.closet.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.web.context.WebApplicationContext;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "GOOGLE_CLIENT_ID=", "GOOGLE_CLIENT_SECRET=", "ML_API_URL=", "ML_API_KEY=",
        "BLOB_CONTAINER_NAME=", "BLOB_DRAFTS_CONTAINER=", "AZURE_STORAGE_CONNECTION_STRING=",
        "spring.datasource.url=jdbc:postgresql://127.0.0.1:1/item_edit_mock",
        "spring.datasource.username=synthetic", "spring.datasource.password=synthetic", "DB_CA_CERT=synthetic.pem"
})
class ClosetItemServiceTest {

    private static final String ME = "/api/auth/me";
    private static final String ORIGIN = "http://localhost:5173";
    private static final String CSRF = "X-CSRF-TOKEN";
    private static final long OWNER = 42L;
    private static final long ITEM = 9_007_199_254_740_993L;
    private static final String PATH = "/api/closet/items/" + ITEM;

    @MockitoBean
    private ClosetItemRepository items;
    @MockitoBean
    private UserRepository users;
    @MockitoBean
    private PlatformTransactionManager transactions;

    private MockMvc mvc;

    @BeforeEach
    void setup(@Autowired WebApplicationContext context, @Autowired FilterChainProxy security) {
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
        when(users.findProfileById(OWNER)).thenReturn(Optional.of(new UserRepository.UserProfile(OWNER, "test", null, null)));
        when(transactions.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
    }

    @Test
    void sameSessionCsrfTokenAllowsConfirmAndPatch() throws Exception {
        var session = member();
        String csrf = csrf(session);
        when(items.lockDraft(OWNER, ITEM)).thenReturn(Optional.of(new DraftValues("상의", "네이비")));
        when(items.edit(OWNER, ITEM, true, Map.of())).thenReturn(true);
        String name = "옷" + "🧥".repeat(49);
        when(items.edit(OWNER, ITEM, false, Map.of(EditField.NAME, name, EditField.MEMO, ""))).thenReturn(true);

        empty(mvc.perform(post(PATH + "/confirm").session(session).header(CSRF, csrf)
                .contentType(MediaType.APPLICATION_JSON).content("{}")), 204);
        empty(mvc.perform(patch(PATH).session(session).header(CSRF, csrf).header(HttpHeaders.ORIGIN, ORIGIN)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"" + name + "\",\"memo\":\"\"}"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN)), 204);
        verify(transactions).commit(any());
    }

    @Test
    void preflightsAcceptOnlyTheLocalFeAndDoNotCallService() throws Exception {
        for (String method : List.of("POST", "PATCH")) {
            String path = method.equals("POST") ? PATH + "/confirm" : PATH;
            mvc.perform(options(path).header(HttpHeaders.ORIGIN, ORIGIN)
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, method)
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "content-type, x-csrf-token"))
                    .andExpect(status().isOk())
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN))
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"))
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, method))
                    .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS, containsString("x-csrf-token")));
            mvc.perform(options(path).header(HttpHeaders.ORIGIN, "https://other.invalid")
                            .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, method))
                    .andExpect(status().isForbidden())
                    .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
        }
        verifyNoInteractions(items);
    }

    @Test
    void anonymousMissingOrDifferentSessionCsrfNeverWrites() throws Exception {
        var session = member();
        String token = csrf(session);
        for (var request : List.of(post(PATH + "/confirm"), patch(PATH))) {
            request.contentType(MediaType.APPLICATION_JSON).content("{}");
            mvc.perform(request).andExpect(status().isForbidden());
            mvc.perform(request.session(session)).andExpect(status().isForbidden());
            mvc.perform(request.session(member()).header(CSRF, token)).andExpect(status().isForbidden());
        }
        var nonMember = session("synthetic non-member");
        mvc.perform(get(ME).session(nonMember)).andExpect(status().isUnauthorized());
        verifyNoInteractions(items);
    }

    @ParameterizedTest
    @ValueSource(strings = {"[]", "null", "", "{} {}", "{\"name\":\"ok\",\"name\":\"duplicate\"}",
            "{\"status\":\"CONFIRMED\"}", "{\"disp_yn\":\"Y\"}", "{\"id\":1}", "{\"user_id\":1}",
            "{\"image_blob\":\"ignored\"}", "{\"meta_json\":{}}", "{\"embedding\":[]}", "{\"subcategory\":\"ignored\"}",
            "{\"category\":\"모자\"}", "{\"color\":\"   \"}", "{\"color\":null}", "{\"memo\":true}",
            "{\"hex\":\"#ABC\"}", "{\"hex\":\"#abcdef\\n\"}", "{\"styles\":\"캐주얼\"}", "{\"tags\":[2]}",
            "{\"memo\":\"\\u0000\"}", "{\"name\":\"\\uD800\"}",
            "{\"name\":\"123456789012345678901234567890123456789012345678901\"}"})
    void rejectsInvalidJsonOrUnwritableFieldsBeforeRepository(String body) throws Exception {
        var session = member();
        String token = csrf(session);
        empty(mvc.perform(patch(PATH).session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content(body)), 400);
        empty(mvc.perform(post(PATH + "/confirm").session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content(body)), 400);
        verifyNoInteractions(items);
    }

    @Test
    void invalidPathIdsAndLargeJsonNeverWrites() throws Exception {
        var session = member();
        String token = csrf(session);
        for (String id : List.of("0", "-1", "+1", "9223372036854775808", "1,2")) {
            empty(mvc.perform(patch("/api/closet/items/{id}", id).session(session).header(CSRF, token)
                    .contentType(MediaType.APPLICATION_JSON).content("{}")), 400);
        }
        mvc.perform(patch("/api/closet/items").session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"id\":1}")).andExpect(status().isNotFound());
        empty(mvc.perform(patch(PATH).session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"memo\":\"" + "x".repeat(65_536) + "\"}")), 413);
        verifyNoInteractions(items);
    }

    @Test
    void missingAndBackendErrorsDoNotExposeDetails() throws Exception {
        var session = member();
        String token = csrf(session);
        empty(mvc.perform(patch(PATH).session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content("{}")), 404);
        empty(mvc.perform(post(PATH + "/confirm").session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content("{}")), 404);
        when(items.edit(anyLong(), anyLong(), eq(false), anyMap()))
                .thenThrow(new DataAccessResourceFailureException("private synthetic detail"));
        empty(mvc.perform(patch(PATH).session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content("{}")), 503);
    }

    private String csrf(MockHttpSession session) throws Exception {
        var result = mvc.perform(get(ME).session(session).header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS, CSRF)).andReturn();
        String token = result.getResponse().getHeader(CSRF);
        assertThat(token).isNotBlank();
        return token;
    }

    private static MockHttpSession member() {
        var now = Instant.now();
        var idToken = new OidcIdToken("synthetic", now, now.plusSeconds(60), Map.of("sub", "item-edit-test"));
        return session(new ClosetOidcUser(new DefaultOidcUser(AuthorityUtils.NO_AUTHORITIES, idToken), OWNER));
    }

    private static MockHttpSession session(Object principal) {
        var auth = UsernamePasswordAuthenticationToken.authenticated(principal, null, List.of());
        var session = new MockHttpSession();
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, new SecurityContextImpl(auth));
        return session;
    }

    private static void empty(ResultActions result, int code) throws Exception {
        result.andExpect(status().is(code)).andExpect(content().string(""))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"));
    }
}
