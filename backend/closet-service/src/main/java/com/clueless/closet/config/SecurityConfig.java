package com.clueless.closet.config;

import com.clueless.closet.service.ClosetOidcUser;
import com.clueless.closet.service.UserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenDecoderFactory;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.converter.ClaimTypeConverter;
import org.springframework.security.oauth2.core.oidc.StandardClaimNames;
import org.springframework.security.oauth2.jwt.JwtDecoderFactory;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandlerImpl;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class SecurityConfig {

    @Bean
    JwtDecoderFactory<ClientRegistration> oidcIdTokenDecoderFactory() {
        var factory = new OidcIdTokenDecoderFactory();
        var claimConverter = idTokenClaimConverter();
        factory.setClaimTypeConverterFactory(registration -> claimConverter);
        return factory;
    }

    static ClaimTypeConverter idTokenClaimConverter() {
        var converters = OidcIdTokenDecoderFactory.createDefaultClaimTypeConverters();
        // Spring normally also converts the string "true" to a boolean.
        converters.remove(StandardClaimNames.EMAIL_VERIFIED);
        return new ClaimTypeConverter(converters);
    }

    @Bean
    WebMvcConfigurer closetCsrfCors() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                // Local editing clients need to read the same-session token before writing.
                registry.addMapping("/api/auth/me").allowedOrigins("http://localhost:5173")
                        .allowedMethods("GET", "PATCH").allowedHeaders("Content-Type", "X-CSRF-TOKEN")
                        .allowCredentials(true).exposedHeaders("X-CSRF-TOKEN");
            }
        };
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, UserService userService,
            @Value("${closet.security.google.client-id:}") String clientId,
            @Value("${closet.security.google.client-secret:}") String clientSecret,
            @Value("${closet.security.google.success-url}") String successUrl) {
        var profilePatch = PathPatternRequestMatcher.withDefaults().matcher(HttpMethod.PATCH, "/api/auth/me");
        var trustResolver = new AuthenticationTrustResolverImpl();
        var unauthorized = new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED);
        var forbidden = new AccessDeniedHandlerImpl();
        http.cors(Customizer.withDefaults())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/test").permitAll()
                        .anyRequest().authenticated())
                .requestCache(cache -> cache.disable())
                .logout(logout -> logout
                        .logoutRequestMatcher(PathPatternRequestMatcher.withDefaults()
                                .matcher(HttpMethod.POST, "/api/auth/logout"))
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(unauthorized)
                        .accessDeniedHandler((request, response, denied) -> {
                            // CSRF runs before authorization, so distinguish a missing login here.
                            if (profilePatch.matches(request) && !trustResolver.isAuthenticated(
                                    SecurityContextHolder.getContext().getAuthentication())) {
                                unauthorized.commence(request, response, null);
                            } else {
                                forbidden.handle(request, response, denied);
                            }
                        }));

        // Missing credentials disable Google login without exposing any other routes.
        if (StringUtils.hasText(clientId) && StringUtils.hasText(clientSecret)) {
            var google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                    .clientId(clientId).clientSecret(clientSecret).scope("openid", "profile", "email").build();
            var returning = new SimpleUrlAuthenticationSuccessHandler(successUrl);
            var newlyRegistered = new SimpleUrlAuthenticationSuccessHandler(withNewUserMarker(successUrl));
            http.oauth2Login(login -> login
                    .clientRegistrationRepository(new InMemoryClientRegistrationRepository(google))
                    .loginPage("/oauth2/authorization/google")
                    .userInfoEndpoint(userInfo -> userInfo.oidcUserService(userService))
                    .failureHandler((request, response, failure) -> response.setStatus(HttpStatus.UNAUTHORIZED.value()))
                    .successHandler((request, response, auth) -> {
                        var handler = auth.getPrincipal() instanceof ClosetOidcUser user && user.newUser()
                                ? newlyRegistered : returning;
                        handler.onAuthenticationSuccess(request, response, auth);
                    }));
        }
        return http.build();
    }

    private static String withNewUserMarker(String url) {
        // Append to the raw query without re-encoding it or touching a HashRouter fragment.
        int hash = url.indexOf('#');
        String base = hash < 0 ? url : url.substring(0, hash);
        int query = base.indexOf('?');
        String separator = query < 0 ? "?" : query == base.length() - 1 || base.endsWith("&") ? "" : "&";
        return base + separator + "newUser=1" + (hash < 0 ? "" : url.substring(hash));
    }
}
