package org.mutantcat.agent.kylin;

import org.mutantcat.agent.DatabaseAgent;
import org.mutantcat.agent.test.JdbcFakeExecutionBehaviorTest;

class KylinAgentTest extends JdbcFakeExecutionBehaviorTest {
    @Override
    protected DatabaseAgent createAgent() {
        return new KylinAgent();
    }

    @Override
    protected String resultSetSql() {
        return "CALL sample_proc()";
    }
}
