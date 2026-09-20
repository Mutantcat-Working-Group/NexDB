package org.mutantcat.agent.vertica;

import org.mutantcat.agent.ConfiguredJdbcAgent;
import org.mutantcat.agent.JdbcAgentProfile;
import org.mutantcat.agent.MultiSessionJsonRpcServer;

public final class VerticaAgent extends ConfiguredJdbcAgent {
    public static final JdbcAgentProfile VERTICA_PROFILE = new JdbcAgentProfile(
        "com.vertica.jdbc.Driver",
        "jdbc:vertica://{host}:{port}/{database}",
        5433
    );

    public VerticaAgent() {
        super(VERTICA_PROFILE);
    }

    public static void main(String[] args) {
        new MultiSessionJsonRpcServer(VerticaAgent::new).run();
    }
}
