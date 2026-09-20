package org.mutantcat.agent.informix;

import org.mutantcat.agent.DatabaseAgent;
import org.mutantcat.agent.test.JdbcFakeExecutionBehaviorTest;

class InformixAgentExecutionTest extends JdbcFakeExecutionBehaviorTest {
    @Override
    protected DatabaseAgent createAgent() {
        return new InformixAgent();
    }

    @Override
    protected String resultSetSql() {
        return "EXECUTE PROCEDURE sample_proc()";
    }
}
