package org.mutantcat.agent.h2legacy;

import org.mutantcat.agent.MultiSessionJsonRpcServer;
import org.mutantcat.agent.h2.H2Agent;

public final class H2LegacyAgent extends H2Agent {
    public static void main(String[] args) {
        new MultiSessionJsonRpcServer(H2LegacyAgent::new).run();
    }
}
