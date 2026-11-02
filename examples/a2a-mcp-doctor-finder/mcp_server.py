"""MCP server for the fictional clinic directory. Speaks stdio.

Run on its own with `python mcp_server.py`. The demo launches this file
as a subprocess through LangChain's MCPAdapter.
"""

import json

from mcp.server import MCPServer

from clinics import find_clinics as directory

mcp = MCPServer("clinic-directory")


@mcp.tool(name="find_clinics")
def find_clinics(
    city: str | None = None,
    state: str | None = None,
    specialty: str | None = None,
) -> str:
    """Find fictional clinics. Provide a city, a state, or a specialty. Matching is case-insensitive."""
    return json.dumps(directory(city=city, state=state, specialty=specialty))


if __name__ == "__main__":
    mcp.run(transport="stdio")
