# 02 · Backend — LiveKit Agent Worker + Gemini Live

The agent is a **Python worker** that joins each Lumen room, runs a Gemini Live speech-to-speech
session, and calls **function tools** that forward canvas commands to the browser over RPC.

> Why Python and not Node? `livekit-agents` Python is the most mature, has the best Gemini Live
> plugin coverage, and `generateReply()`/native-audio quirks noted in the JS plugin README are
> avoided. The agent is a separate process; your app stays TS. (A Node variant is possible with
> `@livekit/agents` + `@livekit/agents-plugin-google` if you insist — noted at the end.)

---

## 1. Directory

```
agent/
  agent.py            # entrypoint, AgentSession, model wiring, RPC helper
  tools.py            # @function_tool defs → canvas Command JSON
  prompts.py          # persona + teaching + tool-use instructions
  board_context.py    # holds latest board state (from client data msgs)
  commands.py         # Command builders + schema (mirror of TS canvas-commands.ts)
  pyproject.toml
  .env.local
```

## 2. Dependencies

`agent/pyproject.toml` (uv-managed; `pip` works too):

```toml
[project]
name = "lumen-agent"
version = "0.1.0"
requires-python = ">=3.10,<3.14"
dependencies = [
  "livekit-agents>=1.4",
  "livekit-plugins-google>=1.4",   # Gemini Live (native audio)
  "livekit-plugins-openai>=1.4",   # fallback: OpenAI Realtime
  "livekit-plugins-silero>=1.4",   # VAD (turn detection safety net)
  "python-dotenv>=1.0",
]
```

Install:

```bash
cd agent
uv sync           # or: python -m venv .venv && . .venv/bin/activate && pip install -e .
```

## 3. Environment (`agent/.env.local`)

```dotenv
# LiveKit Cloud (Build project) — from cloud.livekit.io
LIVEKIT_URL=wss://<project>.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxx

# Gemini (Google AI Studio) — free tier key
GOOGLE_API_KEY=AIza...

# Fallback (optional)
OPENAI_API_KEY=sk-...

# Which realtime backend: "gemini" | "openai"
LUMEN_MODEL_BACKEND=gemini
```

## 4. `prompts.py` — persona + tool discipline

The prompt does three jobs: persona, teaching style, and **tool-use rules** that make
"draw while talking" reliable.

```python
SYSTEM_PROMPT = """
You are Lumen, a warm, concise math tutor for a curious teenager. You are speaking out loud,
so keep sentences short and natural. Never read LaTeX aloud; say math in words.

You are looking at the learner's whiteboard. You cannot see pixels — instead you are told,
in text, what is on the board (the current lesson step, the equation, and a list of named
TARGETS you can point to, e.g. "vertex", "axisOfSymmetry", "root1", "step2.equation").

WHEN TO DRAW:
- Whenever pointing at something makes the idea clearer, CALL A TOOL. Prefer showing over
  telling. Circle, highlight, label, or plot as you explain.
- You may call multiple tools in one turn (e.g. draw the axis, then circle the vertex).

HOW TO DRAW (critical):
- Keep talking while you call tools. Do NOT wait silently for a drawing to finish; the tools
  return immediately and the drawing animates on its own.
- Reference targets by their NAME from the board state. If a target you want does not exist,
  either pick a nearby existing target or ask the learner, but never invent coordinates.
- Use clear_annotations when the board gets cluttered or when you move to a new idea.

Keep responses to 1–3 sentences before pausing for the learner. You are a conversation, not
a lecture.
""".strip()

GREETING = "Hey, I'm Lumen. I can see your board — what are you working on?"
```

## 5. `commands.py` — Command builders (schema mirror)

Single source of truth for the JSON that crosses to the browser. Keep in lockstep with the TS
`canvas-commands.ts` (see `06`).

```python
import json
from typing import Any, Optional

def _cmd(op: str, **args: Any) -> str:
    # id lets the client dedupe/ack; ts for ordering.
    import time, uuid
    return json.dumps({
        "id": uuid.uuid4().hex[:8],
        "op": op,
        "args": {k: v for k, v in args.items() if v is not None},
    })

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
```

## 6. `board_context.py` — what the model knows about the board

The client streams a compact board summary (see `08`). The agent stores the latest and
injects it into the model.

```python
from dataclasses import dataclass, field

@dataclass
class BoardContext:
    module_id: str = ""
    step_index: int = 0
    step_total: int = 0
    step_title: str = ""
    equation: str = ""                 # e.g. "y = x^2 - 5x + 6"
    parabola: dict | None = None       # {"a":1,"b":-5,"c":6}
    targets: list[str] = field(default_factory=list)  # ["vertex","axisOfSymmetry","root1",...]

    def as_prompt(self) -> str:
        lines = [
            f"Current step {self.step_index + 1} of {self.step_total}: {self.step_title}",
        ]
        if self.equation:
            lines.append(f"Equation on board: {self.equation}")
        if self.parabola:
            p = self.parabola
            lines.append(f"Parabola coefficients: a={p['a']}, b={p['b']}, c={p['c']}")
        if self.targets:
            lines.append("Targets you can point to: " + ", ".join(self.targets))
        return "\n".join(lines)

# module-level singleton for the demo (one room per worker process is fine)
board = BoardContext()
```

## 7. `tools.py` — function tools that draw

Each tool is **async**, builds a Command, forwards it via RPC, and returns a short string so
the model keeps talking. The RPC target (the learner's identity) and room are captured from
the running context.

```python
from livekit.agents import function_tool, RunContext
from . import commands as C
from .board_context import board

# We stash the user identity + room on the session userdata at start (see agent.py).

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
```

> Async-tool note: the LiveKit `perform_rpc` awaits the client ack (≤5 s). Because the client
> handler _returns as soon as it kicks off the animation_ (it does NOT await the animation),
> the round-trip is a few ms and the model's speech is not stalled. If you ever add a slow
> tool, use the LiveKit "async tools" pattern (`ctx.session.say(...)` / status update first).

## 8. `agent.py` — entrypoint & model wiring

```python
import os, json
from dotenv import load_dotenv
from livekit import agents, rtc
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions
from livekit.plugins import google, openai, silero

from .prompts import SYSTEM_PROMPT, GREETING
from .tools import ALL_TOOLS
from .board_context import board

load_dotenv(".env.local")

def build_model():
    backend = os.getenv("LUMEN_MODEL_BACKEND", "gemini")
    if backend == "openai":
        # Fallback speech-to-speech
        return openai.realtime.RealtimeModel(voice="alloy")
    # Default: Gemini Live native audio
    return google.beta.realtime.RealtimeModel(
        model="gemini-2.5-flash-native-audio-preview-12-2025",
        voice="Puck",
        temperature=0.7,
    )

async def entrypoint(ctx: JobContext):
    await ctx.connect()

    # Wait for the learner to appear so we know the RPC destination identity.
    participant = await ctx.wait_for_participant()

    # Ingest board-state deltas the client sends over the data channel (topic "lumen.board").
    @ctx.room.on("data_received")
    def _on_data(pkt: rtc.DataPacket):
        if pkt.topic != "lumen.board":
            return
        try:
            data = json.loads(pkt.data.decode())
        except Exception:
            return
        board.module_id = data.get("moduleId", board.module_id)
        board.step_index = data.get("stepIndex", board.step_index)
        board.step_total = data.get("stepTotal", board.step_total)
        board.step_title = data.get("stepTitle", board.step_title)
        board.equation = data.get("equation", board.equation)
        board.parabola = data.get("parabola", board.parabola)
        board.targets = data.get("targets", board.targets)

    session = AgentSession(
        llm=build_model(),
        vad=silero.VAD.load(),               # turn-detection safety net
        userdata={"room": ctx.room, "user_identity": participant.identity},
    )

    agent = Agent(instructions=SYSTEM_PROMPT, tools=ALL_TOOLS)
    await session.start(agent=agent, room=ctx.room)

    # Greet with current board context appended so the first turn is grounded.
    await session.generate_reply(
        instructions=f"{GREETING}\n\n[board]\n{board.as_prompt()}"
    )

if __name__ == "__main__":
    agents.cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
```

## 9. Running the worker

```bash
cd agent
uv run agent.py dev        # dev mode: hot-reload, verbose logs, connects to LIVEKIT_URL
# or: uv run agent.py console   # terminal-only voice test, no browser needed
```

`console` mode is the fastest way to validate voice + tools before the frontend exists — it
prints tool calls so you can confirm the model emits `draw_axis_of_symmetry()` etc.

## 10. Model-backend swap (fallback)

Flip one env var and restart the worker:

```bash
LUMEN_MODEL_BACKEND=openai uv run agent.py dev
```

`build_model()` returns OpenAI Realtime; everything else (tools, RPC, prompt) is unchanged
because the tool layer is model-agnostic. See `09` for auto-fallback on quota errors.

## 11. Verification checklist (backend only)

- [ ] `uv run agent.py console` → you can talk and it answers in voice.
- [ ] Ask "circle the vertex" → console logs a `circle_point` tool call returning `error:` (no
      client yet) — proves the tool fires.
- [ ] `get_board_state` returns the injected summary.
- [ ] Swapping `LUMEN_MODEL_BACKEND=openai` still answers in voice.

Next: `03` mints the tokens the browser needs to join the room.
