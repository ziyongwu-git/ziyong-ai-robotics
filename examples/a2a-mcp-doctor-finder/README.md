# Clinic finder: MCP, LangGraph, and A2A

A small agent that looks up **fictional** clinics. It is the runnable version of the note at `/learning/how-agents-talk`. Nothing here is a real practice. There is no API key: the "model" is a short Python class that emits one tool call and then quotes the tool's JSON.

The pieces:

| File | Role |
| --- | --- |
| `mcp_server.py` | Official MCP Python SDK (`mcp` 2.3.0). `MCPServer` exposes `find_clinics` over stdio. |
| `scripted_model.py` | Stands in for a chat model. `create_agent` still runs the model → tool → model loop. |
| `a2a_app.py` | `a2a-sdk` 1.3.0. JSON-RPC routes plus the card at `/.well-known/agent-card.json`. |
| `demo.py` | Launches the tool, asks the agent, checks memory, serves A2A, and calls it. |
| `clinics.py` | Eight invented clinics. The browser toy uses the same rows. |

Versions below are what `demo.py` installed and ran on 2 November 2026, Python 3.12.3. The packages declare Python 3.10 or newer. I did not re-run them on 3.10 or 3.11.

- `a2a-sdk` 1.3.0 (PyPI, released 27 Oct 2026), extra `http-server`
- `mcp` 2.3.0
- `langchain` 1.4.8 with the `mcp` extra (`langchain.mcp.MCPAdapter`, still marked beta)
- `langgraph` 1.2.19
- `fastmcp` 4.1.5, pulled in by `langchain[mcp]`. The adapter uses it as the MCP *client*. The server in this folder is `mcp.MCPServer`, not FastMCP.

`langchain.mcp` prints a beta warning the first time it is imported. That warning is expected.

## Run it

From this folder:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python demo.py
```

A successful run prints the package versions, one clinic from the tool, two lines about the checkpointer, and the same clinic again as an A2A artifact. It also asks for a cardiologist in Tucson, which the directory does not have, and checks that the answer does not invent one.

Import check, after the install:

```bash
python -c "import clinics, mcp_server, scripted_model, a2a_app"
```

The site build does not install or run this folder.

## What the demo is checking

- `MCPAdapter(Path("mcp_server.py"))` starts the server and `list_tools()` returns `find_clinics`.
- The agent answers "Is there a pediatrician in Seattle?" with Harbor & Pine Pediatrics, the only matching row.
- Passing `thread_id` without a checkpointer does not restore the previous turn. The same id with `MemorySaver` does.
- A blocking A2A `SendMessage` (client `streaming=False`) returns a task in `TASK_STATE_COMPLETED` whose artifact is that sentence.
- `push_notifications` on the card is false. `cancel` raises `UnsupportedOperationError`. The demo does not send `CancelTask`.

`.venv/` is gitignored. Do not commit it.
