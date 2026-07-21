"""Function tools that draw on the learner's board via RPC.

Each tool is async, builds a Command (see commands.py), forwards it via
`room.local_participant.perform_rpc` to the learner's client, and returns a short string so
the model keeps talking. The RPC target (the learner's identity) and room are captured from
the session userdata set in agent.py.
"""

from livekit.agents import function_tool, RunContext

import commands as C
from board_context import board


async def _send(ctx: RunContext, payload: str) -> str:
    ud = ctx.session.userdata
    room = ud["room"]
    user = ud["user_identity"]
    try:
        res = await room.local_participant.perform_rpc(
            destination_identity=user,
            method="lumen.canvas",
            payload=payload,
            response_timeout=5.0,
        )
        return f"ok:{res}"
    except Exception as e:  # noqa: BLE001
        return f"error:{e}"  # model can react verbally


@function_tool
async def highlight_region(ctx: RunContext, target: str, label: str | None = None) -> str:
    """Highlight a named target on the board (e.g. 'vertex', 'step2.equation'). Use while explaining it."""
    return await _send(ctx, C.highlight(target, label))


@function_tool
async def circle_point(ctx: RunContext, target: str, label: str | None = None) -> str:
    """Draw a hand-drawn circle around a named point (e.g. 'vertex', 'root1')."""
    return await _send(ctx, C.circle(target, label))


@function_tool
async def add_label(ctx: RunContext, target: str, text: str, place: str = "above") -> str:
    """Write a short text label near a target. place: above|below|left|right."""
    return await _send(ctx, C.label(target, text, place))


@function_tool
async def draw_arrow(ctx: RunContext, from_target: str, to_target: str, text: str | None = None) -> str:
    """Draw an arrow between two targets, optionally labeled."""
    return await _send(ctx, C.arrow(from_target, to_target, text))


@function_tool
async def draw_axis_of_symmetry(ctx: RunContext) -> str:
    """Draw the vertical axis of symmetry through the parabola's vertex."""
    return await _send(ctx, C.draw_axis())


@function_tool
async def plot_parabola(ctx: RunContext, a: float, b: float, c: float) -> str:
    """Overlay a new parabola y = a x^2 + b x + c on the graph to compare shapes."""
    return await _send(ctx, C.plot_parabola(a, b, c))


@function_tool
async def focus_on(ctx: RunContext, target: str) -> str:
    """Pan/zoom the board so a target is centered and comfortable to see."""
    return await _send(ctx, C.focus(target))


@function_tool
async def clear_annotations(ctx: RunContext) -> str:
    """Remove all of Lumen's drawings from the board."""
    return await _send(ctx, C.clear())


@function_tool
async def get_board_state(ctx: RunContext) -> str:
    """Read what is currently on the learner's board (step, equation, available targets)."""
    return board.as_prompt()


ALL_TOOLS = [
    highlight_region, circle_point, add_label, draw_arrow, draw_axis_of_symmetry,
    plot_parabola, focus_on, clear_annotations, get_board_state,
]
