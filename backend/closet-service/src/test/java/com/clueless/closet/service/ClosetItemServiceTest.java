package com.clueless.closet.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.clueless.closet.repository.ClosetItemRepository;
import com.clueless.closet.repository.ClosetItemRepository.DetailValues;
import com.clueless.closet.repository.ClosetItemRepository.DraftValues;
import com.clueless.closet.repository.ClosetItemRepository.EditField;
import com.clueless.closet.repository.ClosetItemRepository.ListValues;
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
import org.springframework.test.json.JsonCompareMode;
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
    private static final String LIST_PATH = "/api/closet/items";
    private static final String PATH = LIST_PATH + "/" + ITEM;

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
        when(users.findProfileById(OWNER)).thenReturn(Optional.of(
                new UserRepository.UserProfile(OWNER, "test", null, null, List.of())));
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

    @ParameterizedTest
    @ValueSource(strings = {"Y", "N"})
    void recommendationFlagIsWritableOnlyOnPatch(String value) throws Exception {
        var session = member();
        String token = csrf(session);
        String body = "{\"recommend_yn\":\"" + value + "\"}";
        when(items.edit(OWNER, ITEM, false, Map.of(EditField.RECOMMEND_YN, value))).thenReturn(true);

        empty(mvc.perform(patch(PATH).session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content(body)), 204);
        empty(mvc.perform(post(PATH + "/confirm").session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content(body)), 400);
        verify(items).edit(OWNER, ITEM, false, Map.of(EditField.RECOMMEND_YN, value));
        verifyNoMoreInteractions(items);
    }

    @Test
    void listUsesSessionOwnerAndReturnsOnlyTheSummaryFieldsWithOrWithoutFilters() throws Exception {
        var session = member();
        when(items.findList(OWNER, "상의", ClosetColor.BLACK.storedLabels(), "N"))
                .thenReturn(List.of(new ListValues(ITEM, "셔츠", true), new ListValues(ITEM - 1, null, false)));
        mvc.perform(get(LIST_PATH).session(session).header(HttpHeaders.ORIGIN, ORIGIN)
                        .param("category", "상의").param("color", "블랙").param("recommend_yn", "N")
                        .param("user_id", "1"))
                .andExpect(status().isOk()).andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(content().json("""
                        {"total_count":2,"items":[
                          {"id":"9007199254740993","name":"셔츠","preview_url":"/api/closet/preview?id=9007199254740993"},
                          {"id":"9007199254740992","name":null,"preview_url":null}]}
                        """, JsonCompareMode.STRICT));
        mvc.perform(get(LIST_PATH).session(session)).andExpect(status().isOk())
                .andExpect(content().json("""
                        {"total_count":0,"items":[]}
                        """, JsonCompareMode.STRICT));
        verify(items).findList(OWNER, "상의", ClosetColor.BLACK.storedLabels(), "N");
        verify(items).findList(OWNER, null, List.of(), null);
        verifyNoMoreInteractions(items);
    }

    @Test
    void listRejectsAnonymousUnknownOriginAndInvalidFiltersBeforeRepository() throws Exception {
        mvc.perform(get(LIST_PATH)).andExpect(status().isUnauthorized());
        empty(mvc.perform(get(LIST_PATH).session(session("non-member"))), 401);
        var session = member();
        mvc.perform(get(LIST_PATH).session(session).header(HttpHeaders.ORIGIN, "https://other.invalid"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN));
        mvc.perform(options(LIST_PATH).header(HttpHeaders.ORIGIN, ORIGIN)
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS, "GET"));
        for (var invalid : Map.of("category", List.of("", "모자", "전체", "상의' OR '1'='1"),
                "color", List.of("", "전체", "검정", "커스텀"),
                "recommend_yn", List.of("", "y", "전체", "N ")).entrySet()) {
            for (String value : invalid.getValue()) {
                empty(mvc.perform(get(LIST_PATH).session(session).param(invalid.getKey(), value)), 400);
            }
            empty(mvc.perform(get(LIST_PATH).session(session).param(invalid.getKey(), "상의", "상의")), 400);
        }
        verifyNoInteractions(items);
    }

    @Test
    void detailReturnsOnlyAllowlistedJsonWithStringIdAndRelativePreview() throws Exception {
        when(items.findDetail(OWNER, ITEM)).thenReturn(Optional.of(new DetailValues(ITEM, "셔츠", "상의", "반팔",
                "블루", "#00bbff", new String[] {"캐주얼"}, new String[] {"쉼,표"}, "", "N", true)));
        mvc.perform(get(PATH).session(member()).header(HttpHeaders.ORIGIN, ORIGIN))
                .andExpect(status().isOk()).andExpect(content().contentType(MediaType.APPLICATION_JSON))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(content().json("""
                        {"id":"9007199254740993","name":"셔츠","category":"상의","sub_category":"반팔",
                         "color":"블루","color_hex":"#00bbff","styles":["캐주얼"],"tags":["쉼,표"],"memo":"",
                         "recommend_yn":"N","preview_url":"/api/closet/preview?id=9007199254740993"}
                        """, JsonCompareMode.STRICT))
                .andExpect(jsonPath("$.id").isString());
        verify(items).findDetail(OWNER, ITEM);
        verifyNoMoreInteractions(items);
    }

    @Test
    void detailIncludesNullsWhenNoImageIsReferenced() throws Exception {
        when(items.findDetail(OWNER, ITEM)).thenReturn(Optional.of(new DetailValues(ITEM, null, "상의", null,
                "블루", null, new String[0], new String[0], null, "Y", false)));
        mvc.perform(get(PATH).session(member())).andExpect(status().isOk())
                .andExpect(content().json("""
                        {"id":"9007199254740993","name":null,"category":"상의","sub_category":null,
                         "color":"블루","color_hex":null,"styles":[],"tags":[],"memo":null,
                         "recommend_yn":"Y","preview_url":null}
                        """, JsonCompareMode.STRICT));
    }

    @Test
    void sameSessionCsrfTokenAllowsBodylessDeletionOnlyOnce() throws Exception {
        var session = member();
        var request = delete(PATH).session(session).header(CSRF, csrf(session)).header(HttpHeaders.ORIGIN, ORIGIN);
        when(items.hide(OWNER, ITEM)).thenReturn(true, false);
        empty(mvc.perform(request).andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN)), 204);
        empty(mvc.perform(request), 404);
        verify(items, times(2)).hide(OWNER, ITEM);
        verifyNoMoreInteractions(items);
    }

    @Test
    void preflightsAcceptOnlyTheLocalFeAndDoNotCallService() throws Exception {
        for (String method : List.of("POST", "PATCH", "GET", "DELETE")) {
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
        for (var request : List.of(post(PATH + "/confirm").content("{}"),
                patch(PATH).content("{\"recommend_yn\":\"N\"}"))) {
            request.contentType(MediaType.APPLICATION_JSON);
            mvc.perform(request).andExpect(status().isForbidden());
            mvc.perform(request.session(session)).andExpect(status().isForbidden());
            mvc.perform(request.session(member()).header(CSRF, token)).andExpect(status().isForbidden());
        }
        mvc.perform(delete(PATH)).andExpect(status().isForbidden());
        mvc.perform(delete(PATH).session(session)).andExpect(status().isForbidden());
        mvc.perform(delete(PATH).session(member()).header(CSRF, token)).andExpect(status().isForbidden());
        var nonMember = session("synthetic non-member");
        mvc.perform(get(ME).session(nonMember)).andExpect(status().isUnauthorized());
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        empty(mvc.perform(get(PATH).session(nonMember)), 401);
        verifyNoInteractions(items);
    }

    @ParameterizedTest
    @ValueSource(strings = {"[]", "null", "", "{} {}", "{\"name\":\"ok\",\"name\":\"duplicate\"}",
            "{\"status\":\"CONFIRMED\"}", "{\"disp_yn\":\"Y\"}", "{\"id\":1}", "{\"user_id\":1}",
            "{\"image_blob\":\"ignored\"}", "{\"meta_json\":{}}", "{\"embedding\":[]}", "{\"subcategory\":\"ignored\"}",
            "{\"category\":\"모자\"}", "{\"color\":\"   \"}", "{\"color\":null}", "{\"color\":\"커스텀\"}", "{\"memo\":true}",
            "{\"hex\":\"#ABC\"}", "{\"hex\":\"#abcdef\\n\"}", "{\"styles\":\"캐주얼\"}", "{\"tags\":[2]}",
            "{\"recommend_yn\":null}", "{\"recommend_yn\":true}", "{\"recommend_yn\":1}",
            "{\"recommend_yn\":\"y\"}", "{\"recommend_yn\":\"n\"}", "{\"recommend_yn\":\"X\"}",
            "{\"recommend_yn\":\" Y\"}", "{\"recommend_yn\":\"N \"}", "{\"recommend_yn\":\"\"}",
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
            empty(mvc.perform(get("/api/closet/items/{id}", id).session(session)), 400);
            empty(mvc.perform(delete("/api/closet/items/{id}", id).session(session).header(CSRF, token)), 400);
        }
        mvc.perform(patch(LIST_PATH).session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"id\":1}")).andExpect(status().isMethodNotAllowed());
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
        empty(mvc.perform(get(PATH).session(session)), 404);
        empty(mvc.perform(delete(PATH).session(session).header(CSRF, token)), 404);
        var failure = new DataAccessResourceFailureException("private synthetic detail");
        when(items.edit(anyLong(), anyLong(), eq(false), anyMap())).thenThrow(failure);
        when(items.findDetail(OWNER, ITEM)).thenThrow(failure);
        when(items.findList(OWNER, null, List.of(), null)).thenThrow(failure);
        when(items.hide(OWNER, ITEM)).thenThrow(failure);
        empty(mvc.perform(patch(PATH).session(session).header(CSRF, token)
                .contentType(MediaType.APPLICATION_JSON).content("{}")), 503);
        empty(mvc.perform(get(PATH).session(session)), 503);
        empty(mvc.perform(get(LIST_PATH).session(session)), 503);
        empty(mvc.perform(delete(PATH).session(session).header(CSRF, token)), 503);
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
        return session(new ClosetOidcUser(new DefaultOidcUser(AuthorityUtils.NO_AUTHORITIES, idToken), OWNER, false));
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
