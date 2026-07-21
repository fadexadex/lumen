"""Command builders — wire schema mirror of `lib/live/canvas-commands.ts` (see plan 06 §2).

Keep this file in lockstep with the TS discriminated union. Ops: highlight, circle, label,
arrow, drawAxis, plotParabola, panTo, clear. Every command is `{id, op, args}`.
"""

import json
import uuid
from typing import Any, Optional


def _cmd(op: str, **args: Any) -> str:
    # id lets the client dedupe/ack.
    return json.dumps(
        {
            "id": uuid.uuid4().hex[:8],
            "op": op,
            "args": {k: v for k, v in args.items() if v is not None},
        }
    )


def highlight(target: str, label: Optional[str] = None, color: str = "amber") -> str:
    return _cmd("highlight", target=target, label=label, color=color)


def circle(target: str, label: Optional[str] = None) -> str:
    return _cmd("circle", target=target, label=label)


def label(target: str, text: str, place: str = "above") -> str:
    return _cmd("label", target=target, text=text, place=place)


def arrow(from_target: str, to_target: str, text: Optional[str] = None) -> str:
    return _cmd("arrow", **{"from": from_target, "to": to_target, "text": text})


def draw_axis(target: str = "axisOfSymmetry") -> str:
    return _cmd("drawAxis", target=target)


def plot_parabola(a: float, b: float, c: float) -> str:
    return _cmd("plotParabola", a=a, b=b, c=c)


def focus(target: str) -> str:
    return _cmd("panTo", target=target)


def clear() -> str:
    return _cmd("clear")
