package org.mutantcat.agent;

enum JdbcSessionRole {
    WORKLOAD,
    METADATA;

    static JdbcSessionRole from(String value) {
        return "metadata".equalsIgnoreCase(value == null ? "" : value.trim()) ? METADATA : WORKLOAD;
    }
}
