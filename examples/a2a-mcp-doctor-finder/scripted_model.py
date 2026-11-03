"""A stand-in for a chat model. It emits one tool call, then quotes the tool.

create_agent calls bind_tools before every model step. This class accepts
that call and ignores the schema: the next _generate decides from the
messages it can see. There is no API key.
"""

from __future__ import annotations

from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable

from clinics import clinics_from_tool_content, parse_question, render_answer


class ScriptedClinicModel(BaseChatModel):
    """Parse a short question, call find_clinics, and answer from that JSON."""

    @property
    def _llm_type(self) -> str:
        return "scripted-clinic"

    def bind_tools(
        self,
        tools: Any,
        *,
        tool_choice: str | None = None,
        **kwargs: Any,
    ) -> Runnable:
        return self

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        humans = [m for m in messages if isinstance(m, HumanMessage)]
        latest = humans[-1].content if humans else ""
        if not isinstance(latest, str):
            latest = str(latest)
        if "what did i ask" in latest.lower():
            earlier = []
            for message in humans[:-1]:
                text = message.content if isinstance(message.content, str) else str(message.content)
                earlier.append(text)
            if not earlier:
                content = "I can only see this turn. No earlier question is in the state."
            else:
                content = "Earlier in this state: " + " | ".join(earlier)
            return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content))])

        tool_messages = [m for m in messages if isinstance(m, ToolMessage)]
        if not tool_messages:
            parsed = parse_question(latest)
            if not parsed["understood"]:
                return ChatResult(
                    generations=[
                        ChatGeneration(message=AIMessage(content=render_answer(parsed, [])))
                    ]
                )
            args = {}
            if parsed["city"]:
                args["city"] = parsed["city"]
            elif parsed["state"]:
                args["state"] = parsed["state"]
            if parsed["specialty"]:
                args["specialty"] = parsed["specialty"]
            call = AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "find_clinics",
                        "args": args,
                        "id": "call-1",
                        "type": "tool_call",
                    }
                ],
            )
            return ChatResult(generations=[ChatGeneration(message=call)])

        parsed = parse_question(latest)
        rows = clinics_from_tool_content(tool_messages[-1].content)
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=render_answer(parsed, rows)))]
        )
