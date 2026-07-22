"""Function tools that draw on the learner's board via RPC.

Each tool is async, builds a Command (see commands.py), forwards it via
`room.local_participant.perform_rpc` to the learner's client, and returns a short string so
the model keeps talking. The RPC target (the learner's identity) and room are captured from
the session userdata set in agent.py.
"""

from livekit.agents import function_tool, RunContext

import asyncio

import commands as C
from board_context import board
from work_tracker import WorkTracker


def _target_available(ctx: RunContext, target: str) -> bool:
    tracker = ctx.session.userdata.get("work_tracker")
    writing_targets = tracker.target_names() if isinstance(tracker, WorkTracker) else set()
    known = set(board.targets) | writing_targets
    # Do not reject while the initial board snapshot is still in flight.
    return not known or target in known


def _unknown_target(target: str) -> str:
    return f"unknown-target:{target}; call get_board_state and choose an exact listed target"


async def _send(ctx: RunContext, payload: str) -> str:
    """Fire-and-forget canvas RPC so Gemini isn't blocked / interrupted mid-turn.

    Awaiting RPC while mic audio still flows is a known Gemini Live stall pattern after
    draw tools. Return immediately; the client animates independently.
    """
    ud = ctx.session.userdata
    room = ud["room"]
    user = ud["user_identity"]

    async def _rpc() -> None:
        try:
            await room.local_participant.perform_rpc(
                destination_identity=user,
                method="lumen.canvas",
                payload=payload,
                response_timeout=5.0,
            )
        except Exception:  # noqa: BLE001
            pass

    asyncio.create_task(_rpc())
    return "ok"


@function_tool
async def highlight_region(ctx: RunContext, target: str, label: str | None = None) -> str:
    """Highlight one named text/equation/region target (e.g. step2.equation1 or work.vertex-work.line2). Call get_board_state first when the reference is ambiguous."""
    if not _target_available(ctx, target):
        return _unknown_target(target)
    return await _send(ctx, C.highlight(target, label))


@function_tool
async def circle_point(ctx: RunContext, target: str, label: str | None = None) -> str:
    """Draw a hand-drawn circle around a named point target (e.g. vertex or root1)."""
    if not _target_available(ctx, target):
        return _unknown_target(target)
    return await _send(ctx, C.circle(target, label))


@function_tool
async def add_label(ctx: RunContext, target: str, text: str, place: str = "above") -> str:
    """Write a short label beside an exact named target. place: above|below|left|right."""
    if not _target_available(ctx, target):
        return _unknown_target(target)
    return await _send(ctx, C.label(target, text, place))


@function_tool
async def draw_arrow(ctx: RunContext, from_target: str, to_target: str, text: str | None = None) -> str:
    """Draw an arrow between two targets, optionally labeled."""
    if not _target_available(ctx, from_target):
        return _unknown_target(from_target)
    if not _target_available(ctx, to_target):
        return _unknown_target(to_target)
    return await _send(ctx, C.arrow(from_target, to_target, text))


@function_tool
async def draw_axis_of_symmetry(ctx: RunContext) -> str:
    """Draw the vertical axis of symmetry through the parabola's vertex."""
    return await _send(ctx, C.draw_axis())


@function_tool
async def plot_parabola(ctx: RunContext, a: float, b: float, c: float) -> str:
    """Overlay a comparison parabola stroke y = a x^2 + b x + c without moving the widget sliders."""
    return await _send(ctx, C.plot_parabola(a, b, c))


@function_tool
async def set_parabola(ctx: RunContext, a: float, b: float, c: float) -> str:
    """Move the live parabola widget (sliders + curve) to y = a x^2 + b x + c. Prefer this when showing a different example on the graph."""
    return await _send(ctx, C.set_parabola(a, b, c))


@function_tool
async def write_on_board(
    ctx: RunContext,
    lines: list[str],
    target: str | None = None,
    place: str = "below",
    job_id: str | None = None,
    work_status: str = "standalone",
) -> str:
    """Write steps on the board. work_status: standalone|in_progress|complete. Mark requested multi-step solutions in_progress until their final-answer update is complete."""
    if target and not _target_available(ctx, target):
        return _unknown_target(target)
    stable_job_id = job_id or "active-work"
    tracker = ctx.session.userdata.get("work_tracker")
    if isinstance(tracker, WorkTracker):
        tracker.update(job_id=stable_job_id, lines=lines, work_status=work_status)
    return await _send(ctx, C.write_block(lines, target, place, stable_job_id))


@function_tool
async def cancel_writing(ctx: RunContext, job_id: str | None = None) -> str:
    """Pause/stop an in-progress write_on_board animation (keeps text already revealed)."""
    return await _send(ctx, C.cancel_writing(job_id))


@function_tool
async def focus_on(ctx: RunContext, target: str) -> str:
    """Pan/zoom the board so a target is centered and comfortable to see."""
    if not _target_available(ctx, target):
        return _unknown_target(target)
    return await _send(ctx, C.focus(target))


@function_tool
async def clear_annotations(ctx: RunContext) -> str:
    """Remove all of Lumen's drawings and writing from the board."""
    return await _send(ctx, C.clear())


@function_tool
async def get_board_state(ctx: RunContext) -> str:
    """Read the current board and exact semantic targets. Call before marking an ambiguous reference."""
    tracker = ctx.session.userdata.get("work_tracker")
    writing = tracker.target_prompt() if isinstance(tracker, WorkTracker) else ""
    return "\n".join(part for part in (board.as_prompt(), writing) if part)


ALL_TOOLS = [
    highlight_region, circle_point, add_label, draw_arrow, draw_axis_of_symmetry,
    plot_parabola, set_parabola, write_on_board, cancel_writing,
    focus_on, clear_annotations, get_board_state,
]
