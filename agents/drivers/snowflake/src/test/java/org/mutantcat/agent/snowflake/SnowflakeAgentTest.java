package org.mutantcat.agent.snowflake;

import org.mutantcat.agent.DatabaseAgent;
import org.mutantcat.agent.test.JdbcFakeExecutionBehaviorTest;

class SnowflakeAgentTest extends JdbcFakeExecutionBehaviorTest {
    @Override
    protected DatabaseAgent createAgent() {
        return new SnowflakeAgent();
    }

    @Override
    protected String resultSetSql() {
        return "CALL sample_proc()";
    }
}
