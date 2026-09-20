package org.mutantcat.agent.uxdb;

import org.mutantcat.agent.MultiSessionJsonRpcServer;
import org.mutantcat.agent.PostgresLikeAgent;
import org.mutantcat.agent.PostgresLikeAgentProfile;

public final class UxdbAgent extends PostgresLikeAgent {
    public static final PostgresLikeAgentProfile UXDB_PROFILE = new PostgresLikeAgentProfile(
        "com.uxsino.uxdb.Driver",
        "jdbc:uxdb://{host}:{port}/{database}",
        52025,
        "ux_catalog",
        "ux_"
    );

    public UxdbAgent() {
        super(UXDB_PROFILE);
    }

    public static void main(String[] args) {
        new MultiSessionJsonRpcServer(UxdbAgent::new).run();
    }
}
