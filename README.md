<div align=center>
<img src="icon.png" style="width:100px;" width="100"/>
<h2>NexDB</h2>
</div>

[简体中文](README.zh-CN.md) | English

### 1. Overview
- Lightweight open-source database manager: one ~25 MB package, no Java or Python runtime, no bundled Chromium, native on macOS, Windows, and Linux.
- 90+ databases in one tool: MySQL, PostgreSQL, SQLite, Redis, MongoDB, DuckDB, ClickHouse, SQL Server, Oracle, Elasticsearch, TiDB, OceanBase, openGauss, DM, TDengine, InfluxDB, and more, with Agent/JDBC extensions and Pulsar, Kafka, and RocketMQ message queue admin.
- Desktop, Docker/Web, and CLI share the same codebase and the same connection configuration.
- Built-in AI SQL assistant: natural-language SQL generation, explanation, optimization, error fixing, and built-in safety checks. Works with Claude, OpenAI, local models via Ollama, and any OpenAI-compatible endpoint.
- Built-in MCP server, so Claude Code, Cursor, Windsurf, and other AI coding agents can query your configured databases.
- Query editor, virtualized data grid, schema tools, ER diagram, schema diff, explain plan, import/export/migration/compare, Redis and MongoDB browsers, SSH tunnel, and encrypted config import/export.

### 2. Deployment
1. Desktop: download the latest installer from [Releases](https://github.com/Mutantcat-Working-Group/NexDB/releases/latest).
   ```
   # macOS
   brew install --cask dbx

   # Windows
   winget install t8y2.dbx

   # Linux
   flatpak remote-add --if-not-exists flatpark https://dl.flatpark.org/flatpark.flatpakrepo
   flatpak install flatpark org.mutantcat.nexdb
   ```
2. Self-hosted Docker (Web): open `http://localhost:4224` in your browser.
   ```
   docker run -d --pull=always --name nexdb -p 4224:4224 -v nexdb-data:/app/data t8y2/dbx:latest
   ```
   Use `docker.cnb.cool/dbxio.com/dbx:latest` for faster pulls in China. For Compose deployment, use `deploy/docker-compose.release.yml`.
3. CLI:
   ```
   npm install -g @dbx-app/cli
   ```
4. Build from source: Node.js >= 18, pnpm, Rust >= 1.88. Run `make` for the local development environment and `make package` for installers.

### 3. Usage
1. Create a connection, pick a database type, fill in host and credentials, then query.
2. AI assistant: describe what you want in plain language, review the generated SQL, and run it. Existing SQL can be explained, optimized, or fixed.
3. MCP integration: start the MCP server in your AI coding agent.
   ```
   npx @dbx-app/mcp-server
   ```
   Add this to `.mcp.json`:
   ```json
   {
     "mcpServers": {
       "nexdb": { "command": "npx", "args": ["-y", "@dbx-app/mcp-server"] }
     }
   }
   ```
   For Web/Docker deployments, set `DBX_WEB_URL`; when the login page requires a password, also set `DBX_WEB_PASSWORD`.
4. CLI usage:
   ```
   dbx connections list --json
   dbx query local "select 1" --json
   ```
5. Data operations: import CSV or Excel, migrate between databases, export a database, compare table data, run `.sql` files, and drag and drop Parquet, CSV, or JSON files for instant preview.

### 4. Integration
1. MCP server (service name `org.mutantcat.nexdb`)
   - Description: lets MCP-compatible agents list connections, browse tables, execute SQL, and open tables directly in NexDB.
   - Install: `npx @dbx-app/mcp-server`; precompiled binaries for macOS, Linux, and Windows are published in [Releases](https://github.com/Mutantcat-Working-Group/NexDB/releases).
   - Permissions: manage the connection allowlist and read-only / data read-write / full-access modes in Settings -> MCP.
   - Environment: `DBX_WEB_URL` and `DBX_WEB_PASSWORD` for Web/Docker; Windows portable builds also need `DBX_DATA_DIR` pointing to the `data` directory.
2. Web API
   - Description: HTTP API for Docker/Web deployments.
   - Documentation: [docs/content/docs/web-api.mdx](docs/content/docs/web-api.mdx); samples are in [examples/](examples/).

### 5. Focus
- Lightweight: ~25 MB, no runtime dependencies, fully native on every platform.
- Breadth: 90+ databases behind one entry point, extensible through native drivers, Agent profiles, and custom JDBC.
- AI native: SQL assistant and MCP are built in, not plugins, so your data is directly available to AI coding agents.
- Multi-form: desktop, Docker/Web, and CLI share one codebase and one connection configuration.
- Engineering: SSH tunnel, auto-reconnect, confirmation for destructive operations, encrypted config, and automatic updates.

### 6. Roadmap
- [X] Desktop app (Tauri 2 + Vue 3)
- [X] Docker/Web version
- [X] CLI and script workflows
- [X] 90+ database connections with Agent/JDBC extensions
- [X] Query editor and data grid
- [X] Schema tools, ER diagram, schema diff, explain plan
- [X] AI SQL assistant
- [X] MCP server
- [X] Redis and MongoDB browsers
- [X] Data import, migration, export, and compare
- [X] SSH tunnel and safety features
- [X] Plugin and JDBC driver store

[Apache-2.0](LICENSE)
