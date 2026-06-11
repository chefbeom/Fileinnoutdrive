package com.example.WaffleBear.user.service;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
public class RefreshTokenSchemaMaintenance implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(RefreshTokenSchemaMaintenance.class);
    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        dropLegacyEmailUniqueIndexes();
    }

    private void dropLegacyEmailUniqueIndexes() {
        try {
            String schema = jdbcTemplate.queryForObject("select database()", String.class);
            if (schema == null || schema.isBlank()) {
                return;
            }

            List<String> indexNames = jdbcTemplate.queryForList(
                    """
                    select index_name
                    from information_schema.statistics
                    where table_schema = ?
                      and table_name = 'refresh_token'
                      and column_name = 'email'
                      and non_unique = 0
                      and index_name <> 'PRIMARY'
                    """,
                    String.class,
                    schema
            );

            for (String indexName : indexNames) {
                String safeIndexName = indexName.replace("`", "``");
                jdbcTemplate.execute("alter table refresh_token drop index `" + safeIndexName + "`");
                log.info("Dropped legacy unique index on refresh_token.email: {}", indexName);
            }
        } catch (Exception error) {
            log.debug("Refresh token schema maintenance skipped: {}", error.getMessage());
        }
    }
}
