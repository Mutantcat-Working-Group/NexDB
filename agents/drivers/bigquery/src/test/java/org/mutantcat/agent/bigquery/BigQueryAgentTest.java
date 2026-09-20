package org.mutantcat.agent.bigquery;

import org.mutantcat.agent.DatabaseAgent;
import org.mutantcat.agent.test.JdbcFakeExecutionBehaviorTest;

class BigQueryAgentTest extends JdbcFakeExecutionBehaviorTest {
    @Override
    protected DatabaseAgent createAgent() {
        return new BigQueryAgent();
    }

    @Override
    protected String resultSetSql() {
        return "CALL dataset.proc()";
    }
}
