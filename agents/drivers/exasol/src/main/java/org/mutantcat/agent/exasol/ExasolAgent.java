package org.mutantcat.agent.exasol;

import org.mutantcat.agent.ConfiguredJdbcAgent;
import org.mutantcat.agent.JdbcAgentProfile;
import org.mutantcat.agent.MultiSessionJsonRpcServer;

public final class ExasolAgent extends ConfiguredJdbcAgent {
    public static final JdbcAgentProfile EXASOL_PROFILE = new JdbcAgentProfile(
        "com.exasol.jdbc.EXADriver",
        "jdbc:exa:{host}:{port};schema={database}",
        8563,
        true
    );

    public ExasolAgent() {
        super(EXASOL_PROFILE);
    }

    public static void main(String[] args) {
        new MultiSessionJsonRpcServer(ExasolAgent::new).run();
    }
}
