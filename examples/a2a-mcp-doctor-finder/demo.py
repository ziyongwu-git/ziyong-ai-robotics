"""Run the clinic finder without an API key.

Starts the MCP server over stdio, asks the scripted agent two questions,
checks that thread_id does nothing without a checkpointer, then serves
the agent over A2A and calls it.

    python demo.py
"""

from __future__ import annotations

import asyncio
import importlib.metadata as metadata
import socket
from pathlib import Path

import uvicorn
from langchain.agents import create_agent
from langchain.mcp import MCPAdapter
from langgraph.checkpoint.memory import MemorySaver

from a2a.client import ClientConfig, create_client
from a2a.helpers import get_artifact_text, new_text_message
from a2a.types import Role, SendMessageRequest, TaskState

from a2a_app import build_starlette
from scripted_model import ScriptedClinicModel

QUESTION = "Is there a pediatrician in Seattle?"
MISS = "A cardiologist in Tucson?"
PACKAGES = ("a2a-sdk", "mcp", "langchain", "langgraph", "fastmcp")


def _require(label: str, ok: bool, detail: str = "") -> None:
    if ok:
        return
    raise SystemExit(f"{label} failed{': ' + detail if detail else ''}")


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _last(result: dict) -> str:
    content = result["messages"][-1].content
    return content if isinstance(content, str) else str(content)


async def _memory(tools) -> None:
    """Same thread id, with and without a checkpointer. Verified on langgraph 1.2.19."""
    bare = create_agent(
        ScriptedClinicModel(),
        tools,
        system_prompt="Answer only with clinics the find_clinics tool returns.",
        name="ClinicFinder",
    )
    config = {"configurable": {"thread_id": "same-thread"}}
    await bare.ainvoke({"messages": [{"role": "user", "content": QUESTION}]}, config)
    forgotten = await bare.ainvoke(
        {"messages": [{"role": "user", "content": "What did I ask?"}]},
        config,
    )
    _require("no checkpointer forgets the first turn", "only see this turn" in _last(forgotten), _last(forgotten))

    remembered_agent = create_agent(
        ScriptedClinicModel(),
        tools,
        system_prompt="Answer only with clinics the find_clinics tool returns.",
        name="ClinicFinder",
        checkpointer=MemorySaver(),
    )
    await remembered_agent.ainvoke({"messages": [{"role": "user", "content": QUESTION}]}, config)
    remembered = await remembered_agent.ainvoke(
        {"messages": [{"role": "user", "content": "What did I ask?"}]},
        config,
    )
    _require(
        "MemorySaver keeps the first turn",
        "pediatrician in Seattle" in _last(remembered),
        _last(remembered),
    )
    print("checkpointer: without one, the second turn cannot see the first")
    print("checkpointer: with MemorySaver, the second turn can")


async def _serve(graph) -> None:
    port = _free_port()
    base = f"http://127.0.0.1:{port}/"
    app = build_starlette(graph, base)
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    task = asyncio.create_task(server.serve())
    try:
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(0.05)
        _require("server started", server.started)
        client = await create_client(base, client_config=ClientConfig(streaming=False))
        try:
            hit = await _ask(client, QUESTION)
            _require("artifact names Harbor & Pine", "Harbor & Pine Pediatrics" in hit, hit)
            _require("artifact names Amira Solano", "Amira Solano" in hit, hit)
            miss = await _ask(client, MISS)
            _require("empty directory stays empty", "no clinic" in miss, miss)
            _require("empty answer does not invent a cardiologist", "Naomi Berg" not in miss, miss)
        finally:
            await client.close()
        print("a2a: blocking SendMessage returned the artifact")
        print(hit)
    finally:
        server.should_exit = True
        await task


async def _ask(client, text: str) -> str:
    request = SendMessageRequest(message=new_text_message(text, role=Role.ROLE_USER))
    found = ""
    async for chunk in client.send_message(request):
        if not chunk.HasField("task"):
            continue
        _require(
            "task completed",
            chunk.task.status.state == TaskState.TASK_STATE_COMPLETED,
            str(chunk.task.status.state),
        )
        _require("one artifact", len(chunk.task.artifacts) == 1)
        found = get_artifact_text(chunk.task.artifacts[0])
    _require("artifact text", bool(found))
    return found


async def main() -> None:
    print("versions checked by running this file:")
    for name in PACKAGES:
        print(f"  {name} {metadata.version(name)}")
    server_path = Path(__file__).with_name("mcp_server.py")
    async with MCPAdapter(server_path) as adapter:
        tools = await adapter.list_tools()
        names = [tool.name for tool in tools]
        _require("mcp tool is find_clinics", names == ["find_clinics"], str(names))
        print("mcp: list_tools ->", ", ".join(names))
        graph = create_agent(
            ScriptedClinicModel(),
            tools,
            system_prompt="Answer only with clinics the find_clinics tool returns.",
            name="ClinicFinder",
        )
        direct = await graph.ainvoke({"messages": [{"role": "user", "content": QUESTION}]})
        _require("direct answer quotes the tool", "Harbor & Pine Pediatrics" in _last(direct), _last(direct))
        print("agent:", _last(direct))
        await _memory(tools)
        await _serve(graph)


if __name__ == "__main__":
    asyncio.run(main())
