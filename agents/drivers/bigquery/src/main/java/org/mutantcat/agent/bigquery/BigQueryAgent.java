package org.mutantcat.agent.bigquery;

import org.mutantcat.agent.AbstractJdbcAgent;
import org.mutantcat.agent.ColumnInfo;
import org.mutantcat.agent.ConnectParams;
import org.mutantcat.agent.DatabaseInfo;
import org.mutantcat.agent.ForeignKeyInfo;
import org.mutantcat.agent.IndexInfo;
import org.mutantcat.agent.JdbcIdentifiers;
import org.mutantcat.agent.MultiSessionJsonRpcServer;
import org.mutantcat.agent.MetadataListConstraints;
import org.mutantcat.agent.MetadataSqlSupport;
import org.mutantcat.agent.TableInfo;
import org.mutantcat.agent.TriggerInfo;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

public final class BigQueryAgent extends AbstractJdbcAgent {

    @Override
    protected String driverClass() {
        return "com.simba.googlebigquery.jdbc.Driver";
    }

    @Override
    protected String buildJdbcUrl(ConnectParams params) {
        return buildUrl(params);
    }

    @Override
    public List<DatabaseInfo> listDatabases() {
        return unchecked(() -> {
            List<DatabaseInfo> result = new ArrayList<>();
            try (java.sql.Statement stmt = requireConnected().createStatement();
                 ResultSet rs = stmt.executeQuery("SELECT schema_name FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY schema_name")) {
                while (rs.next()) {
                    result.add(new DatabaseInfo(rs.getString(1)));
                }
            }
            return result;
        });
    }

    @Override
    public List<String> listSchemas() {
        List<String> result = new ArrayList<>();
        for (DatabaseInfo database : listDatabases()) {
            result.add(database.getName());
        }
        return result;
    }

    @Override
    public List<TableInfo> listTables(String schema) {
        return unchecked(() -> {
            List<TableInfo> result = new ArrayList<>();
            String quotedSchema = JdbcIdentifiers.INSTANCE.backtick(schema);
            String sql = "SELECT table_name, table_type FROM " + quotedSchema + ".INFORMATION_SCHEMA.TABLES ORDER BY table_name";
            try (java.sql.PreparedStatement stmt = requireConnected().prepareStatement(sql);
                 ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    result.add(new TableInfo(
                        rs.getString("table_name"),
                        normalizeTableType(rs.getString("table_type")),
                        null
                    ));
                }
            }
            return result;
        });
    }

    @Override
    public List<TableInfo> listTables(String schema, MetadataListConstraints constraints) {
        MetadataListConstraints normalized = MetadataListConstraints.orNone(constraints);
        if (isUnconstrained(normalized)) {
            return listTables(schema);
        }
        if (!normalized.includesTableLikeTypes()) {
            return List.of();
        }
        if (hasLikeWildcard(normalized.getFilter())) {
            return normalized.filterTables(listTables(schema));
        }
        try {
            return queryConstrainedTables(schema, normalized);
        } catch (RuntimeException e) {
            return normalized.filterTables(listTables(schema));
        }
    }

    private List<TableInfo> queryConstrainedTables(String schema, MetadataListConstraints constraints) {
        return unchecked(() -> {
            List<TableInfo> result = new ArrayList<>();
            List<Object> args = new ArrayList<>();
            String quotedSchema = JdbcIdentifiers.INSTANCE.backtick(schema);
            StringBuilder sql = new StringBuilder("SELECT table_name, table_type FROM ")
                .append(quotedSchema)
                .append(".INFORMATION_SCHEMA.TABLES WHERE 1 = 1");
            appendBigQueryTableTypePredicate(sql, args, constraints);
            if (constraints.hasFilter()) {
                sql.append(" AND UPPER(table_name) LIKE ?");
                args.add(constraints.fuzzyLikePattern().toUpperCase(Locale.ROOT));
            }
            sql.append(" ORDER BY table_name");
            MetadataSqlSupport.appendLiteralLimitOffset(sql, constraints);
            try (java.sql.PreparedStatement stmt = requireConnected().prepareStatement(sql.toString())) {
                MetadataSqlSupport.bind(stmt, args);
                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        result.add(new TableInfo(
                            rs.getString("table_name"),
                            normalizeTableType(rs.getString("table_type")),
                            null
                        ));
                    }
                }
            }
            return constraints.withoutPaging().filterTables(result);
        });
    }

    @Override
    public List<ColumnInfo> getColumns(String schema, String table) {
        return unchecked(() -> {
            List<ColumnInfo> result = new ArrayList<>();
            String quotedSchema = JdbcIdentifiers.INSTANCE.backtick(schema);
            String sql = "SELECT column_name, data_type, is_nullable " +
                "FROM " + quotedSchema + ".INFORMATION_SCHEMA.COLUMNS " +
                "WHERE table_name = ? " +
                "ORDER BY ordinal_position";
            try (java.sql.PreparedStatement stmt = requireConnected().prepareStatement(sql)) {
                stmt.setString(1, table);
                try (ResultSet rs = stmt.executeQuery()) {
                    while (rs.next()) {
                        result.add(new ColumnInfo(
                            rs.getString("column_name"),
                            rs.getString("data_type"),
                            "YES".equals(rs.getString("is_nullable")),
                            null,
                            false,
                            null,
                            null,
                            null,
                            null,
                            null
                        ));
                    }
                }
            }
            return result;
        });
    }

    @Override
    public List<IndexInfo> listIndexes(String schema, String table) {
        return Collections.emptyList();
    }

    @Override
    public List<ForeignKeyInfo> listForeignKeys(String schema, String table) {
        return Collections.emptyList();
    }

    @Override
    public List<TriggerInfo> listTriggers(String schema, String table) {
        return Collections.emptyList();
    }

    @Override
    public String setSchemaSQL(String schema) {
        return "";
    }

    static String buildUrl(ConnectParams params) {
        String url = "jdbc:bigquery://" + params.getHost() + ":" + params.getPort() + ";ProjectId=" + params.getDatabase();
        String extraParams = trimSemicolons(params.getUrl_params());
        return extraParams.isBlank() ? url : url + ";" + extraParams;
    }

    private static String trimSemicolons(String value) {
        if (value == null) {
            return "";
        }
        return value.trim().replaceAll("^;+", "").replaceAll(";+\\s*$", "");
    }

    private static String normalizeTableType(String type) {
        if ("BASE TABLE".equals(type)) {
            return "TABLE";
        }
        if ("MATERIALIZED VIEW".equals(type)) {
            return "MATERIALIZED_VIEW";
        }
        return type;
    }

    private static boolean isUnconstrained(MetadataListConstraints constraints) {
        return !constraints.hasFilter() && !constraints.hasLimit() && !constraints.hasOffset() && !constraints.hasObjectTypes();
    }

    private static void appendBigQueryTableTypePredicate(StringBuilder sql, List<Object> args, MetadataListConstraints constraints) {
        if (!constraints.hasObjectTypes()) {
            return;
        }
        List<String> types = new ArrayList<>();
        if (constraints.tableTypeAllowed("TABLE")) {
            types.add("BASE TABLE");
        }
        if (constraints.tableTypeAllowed("VIEW")) {
            types.add("VIEW");
        }
        if (constraints.tableTypeAllowed("MATERIALIZED_VIEW")) {
            types.add("MATERIALIZED VIEW");
        }
        if (types.isEmpty()) {
            sql.append(" AND 1 = 0");
            return;
        }
        sql.append(" AND table_type IN (").append(MetadataSqlSupport.placeholders(types.size())).append(")");
        args.addAll(types);
    }

    private static boolean hasLikeWildcard(String value) {
        return value != null && (value.contains("%") || value.contains("_") || value.contains("\\"));
    }

    public static void main(String[] args) {
        new MultiSessionJsonRpcServer(BigQueryAgent::new).run();
    }
}
