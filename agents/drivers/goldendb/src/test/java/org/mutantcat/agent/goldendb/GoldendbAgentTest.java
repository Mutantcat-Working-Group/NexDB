package org.mutantcat.agent.goldendb;

import org.mutantcat.agent.DatabaseAgent;
import org.mutantcat.agent.test.JdbcFakeExecutionBehaviorTest;

class GoldendbAgentTest extends JdbcFakeExecutionBehaviorTest {
    @Override
    protected DatabaseAgent createAgent() {
        return new GoldendbAgent();
    }

    @Override
    protected String resultSetSql() {
        return "CALL sample_proc()";
    }
}
