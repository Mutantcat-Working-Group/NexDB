# NexDB Oracle Go Agent

Experimental native Oracle agent for NexDB using `github.com/sijms/go-ora/v2`.

## Build

```bash
go build -o agent .
```

Cross-compile release builds use pure Go output:

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o dbx-agent-oracle-linux-x64 .
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o dbx-agent-oracle-macos-aarch64 .
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o dbx-agent-oracle-windows-x64.exe .
```

## Local NexDB Test

Build the binary, then copy it into NexDB's installed Oracle driver directory:

```bash
mkdir -p ~/.dbx/agents/drivers/oracle
cp agent ~/.dbx/agents/drivers/oracle/agent
chmod +x ~/.dbx/agents/drivers/oracle/agent
```

NexDB prefers `agent` over `agent.jar`, so Oracle connections will use this Go
agent until the file is removed.

To restore the Java agent:

```bash
rm ~/.dbx/agents/drivers/oracle/agent
```
