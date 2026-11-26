package com.clueless.closet.config;

import com.clueless.closet.service.UserService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.oidc.authentication.OidcIdTokenDecoderFactory;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.converter.ClaimTypeConverter;
import org.springframework.security.oauth2.core.oidc.StandardClaimNames;
import org.springframework.security.oauth2.jwt.JwtDecoderFactory;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.util.StringUtils;

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
    SecurityFilterChain securityFilterChain(HttpSecurity http, UserService userService,
            @Value("${closet.security.google.client-id:}") String clientId,
            @Value("${closet.security.google.client-secret:}") String clientSecret) {
        http.authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/test").permitAll()
                        .anyRequest().authenticated())
                .requestCache(cache -> cache.disable())
                .logout(logout -> logout
                        .logoutRequestMatcher(PathPatternRequestMatcher.withDefaults()
                                .matcher(HttpMethod.POST, "/api/auth/logout"))
                        .logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
                .exceptionHandling(exceptions -> exceptions
                    .authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));

        // Missing credentials disable Google login without exposing any other routes.
        if (StringUtils.hasText(clientId) && StringUtils.hasText(clientSecret)) {
            var google = CommonOAuth2Provider.GOOGLE.getBuilder("google")
                    .clientId(clientId).clientSecret(clientSecret).scope("openid", "profile", "email").build();
            http.oauth2Login(login -> login
                    .clientRegistrationRepository(new InMemoryClientRegistrationRepository(google))
                    .loginPage("/oauth2/authorization/google")
                    .userInfoEndpoint(userInfo -> userInfo.oidcUserService(userService))
                    .failureHandler((request, response, failure) -> response.setStatus(HttpStatus.UNAUTHORIZED.value()))
                    .defaultSuccessUrl("http://localhost:5173/home", true));
        }
        return http.build();
    }
}
