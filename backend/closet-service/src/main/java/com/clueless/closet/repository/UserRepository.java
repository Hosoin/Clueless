package com.clueless.closet.repository;

import java.sql.Types;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {

    private static final List<String> NICKNAME_PREFIXES = List.of("포근한", "반짝이는", "느긋한", "장난꾸러기");
    private static final List<String> NICKNAME_ANIMALS = List.of("여우", "수달", "토끼", "고양이");

    private final JdbcClient jdbc;

    public UserRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 로그인 시 기존 유저 확인 후 없으면 생성
    public LoginUser findOrCreate(String provider, String subject, String userName, String email) {
        return findExistingId(provider, subject, userName, email).map(id -> new LoginUser(id, false))
                .or(() -> jdbc.sql("""
                        INSERT INTO public.user_info (auth_provider, provider_user_id, user_name, email, nick_name)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT (auth_provider, provider_user_id) DO NOTHING
                        RETURNING id
                        """)
                        .params(provider, subject, userName, email, randomNickname())
                        .query(Long.class)
                        .optional().map(id -> new LoginUser(id, true)))
                // A separate statement can see the row committed by a concurrent first login.
                .or(() -> findExistingId(provider, subject, userName, email).map(id -> new LoginUser(id, false)))
                .orElseThrow(() -> new EmptyResultDataAccessException(1));
    }

    // 유저 프로필 조회
    public Optional<UserProfile> findProfileById(long id) {
        return jdbc.sql("""
                SELECT id, user_name, nick_name, email, preferred_styles
                FROM public.user_info WHERE id = ?
                """)
                .param(id)
                .query((rs, row) -> new UserProfile(rs.getLong("id"), rs.getString("user_name"),
                        rs.getString("nick_name"), rs.getString("email"),
                        Arrays.asList((String[]) rs.getArray("preferred_styles").getArray())))
                .optional();
    }

    public boolean updateProfile(long id, String nickName, List<String> preferredStyles) {
        return jdbc.sql("""
                UPDATE public.user_info
                SET nick_name = COALESCE(:nickName, nick_name),
                    preferred_styles = COALESCE(CAST(:preferredStyles AS text[]), preferred_styles),
                    updated_at = now()
                WHERE id = :id
                """)
                .param("id", id).param("nickName", nickName, Types.VARCHAR)
                .param("preferredStyles", preferredStyles == null ? null : preferredStyles.toArray(String[]::new), Types.ARRAY)
                .update() == 1;
    }

    public record UserProfile(long id, String userName, String nickName, String email,
                              List<String> preferredStyles) {
    }

    public record LoginUser(long id, boolean newUser) {
    }

    // 로그인 시 기존 유저 확인 후 없으면 생성
    private Optional<Long> findExistingId(String provider, String subject, String userName, String email) {
        return jdbc.sql("""
                SELECT id, user_name IS NULL AS missing_name, email IS NULL AS missing_email
                FROM public.user_info WHERE auth_provider = ? AND provider_user_id = ?
                """)
                .params(provider, subject)
                .query((rs, row) -> new UserRow(rs.getLong("id"), rs.getBoolean("missing_name"),
                        rs.getBoolean("missing_email")))
                .optional()
                .map(user -> {
                    if ((user.missingName() && userName != null) || (user.missingEmail() && email != null)) {
                        backfillProfile(user.id(), userName, email);
                    }
                    return user.id();
                });
    }

    // 기존 유저 프로필 업데이트
    private void backfillProfile(long id, String userName, String email) {
        // Recheck both fields against the current row in case another login filled them.
        jdbc.sql("""
                UPDATE public.user_info
                SET user_name = COALESCE(user_name, :userName), email = COALESCE(email, :email)
                WHERE id = :id AND ((user_name IS NULL AND :userName IS NOT NULL)
                    OR (email IS NULL AND :email IS NOT NULL))
                """)
                .param("id", id)
                .param("userName", userName, Types.VARCHAR)
                .param("email", email, Types.VARCHAR)
                .update();
    }

    // 회원가입 시 랜덤 닉네임 생성
    private static String randomNickname() {
        var random = ThreadLocalRandom.current();
        return NICKNAME_PREFIXES.get(random.nextInt(NICKNAME_PREFIXES.size()))
                + NICKNAME_ANIMALS.get(random.nextInt(NICKNAME_ANIMALS.size()))
                + random.nextInt(1000, 10_000);
    }

    private record UserRow(long id, boolean missingName, boolean missingEmail) {
    }
}
