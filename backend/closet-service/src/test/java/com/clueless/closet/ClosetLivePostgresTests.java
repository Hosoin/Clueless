package com.clueless.closet;

import java.sql.SQLException;
import javax.sql.DataSource;

import com.clueless.testsupport.LivePostgresChecks;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

@Tag("live-postgres")
@SpringBootTest(classes = ClosetServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ClosetLivePostgresTests {

    @Test
    void verifiesDevelopmentDatabase(@Autowired DataSource dataSource, @Autowired Environment environment)
            throws SQLException {
        LivePostgresChecks.verify(dataSource, environment);
    }
}
