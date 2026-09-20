package org.mutantcat.agent.ignite3;

import org.mutantcat.agent.DatabaseAgent;
import org.mutantcat.agent.test.JdbcFakeExecutionBehaviorTest;

class Ignite3AgentTest extends JdbcFakeExecutionBehaviorTest {
    @Override
    protected DatabaseAgent createAgent() {
        return new Ignite3Agent();
    }

    @Override
    protected String resultSetSql() {
        return "SELECT 1";
    }
}
