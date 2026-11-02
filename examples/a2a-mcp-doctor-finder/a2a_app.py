"""Wrap a compiled LangGraph agent as an A2A 1.0 JSON-RPC server.

Checked against a2a-sdk 1.3.0. The older A2AStarletteApplication wrapper
is not in that package. Routes come from a2a.server.routes.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage

from a2a.helpers import new_task_from_user_message, new_text_part
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore, TaskUpdater
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentInterface,
    AgentSkill,
)
from a2a.utils.errors import UnsupportedOperationError
from starlette.applications import Starlette


def _last_text(result: dict) -> str:
    message = result["messages"][-1]
    if isinstance(message, AIMessage) and isinstance(message.content, str):
        return message.content
    return str(getattr(message, "content", ""))


class ClinicAgentExecutor(AgentExecutor):
    """One task per request. No checkpointer, so each task is its own turn."""

    def __init__(self, graph) -> None:
        self.graph = graph

    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        message = context.message
        if message is None:
            return
        task = context.current_task or new_task_from_user_message(message)
        await event_queue.enqueue_event(task)
        updater = TaskUpdater(event_queue, task.id, task.context_id)
        await updater.start_work()
        result = await self.graph.ainvoke(
            {"messages": [{"role": "user", "content": context.get_user_input()}]}
        )
        await updater.add_artifact([new_text_part(_last_text(result))], name="clinic_answer")
        await updater.complete()

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise UnsupportedOperationError()


def agent_card(base_url: str) -> AgentCard:
    return AgentCard(
        name="Clinic Finder",
        description=(
            "Finds a fictional clinic by city and specialty, and only reports "
            "names the directory returns."
        ),
        version="1.0.0",
        supported_interfaces=[
            AgentInterface(
                url=base_url,
                protocol_binding="JSONRPC",
                protocol_version="1.0",
            )
        ],
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        capabilities=AgentCapabilities(streaming=True, push_notifications=False),
        skills=[
            AgentSkill(
                id="find_clinics",
                name="Find clinics",
                description="Look up a fictional clinic by city or specialty.",
                tags=["clinic", "directory"],
                examples=["Is there a pediatrician in Seattle?"],
            )
        ],
    )


def build_starlette(graph, base_url: str) -> Starlette:
    card = agent_card(base_url)
    handler = DefaultRequestHandler(
        agent_executor=ClinicAgentExecutor(graph),
        task_store=InMemoryTaskStore(),
        agent_card=card,
    )
    return Starlette(
        routes=[
            *create_agent_card_routes(card),
            *create_jsonrpc_routes(handler, rpc_url="/"),
        ]
    )
