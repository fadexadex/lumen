import os
import json

from dotenv import load_dotenv

from livekit import agents, rtc
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions
from livekit.plugins import google, openai, silero

from prompts import SYSTEM_PROMPT, GREETING
from tools import ALL_TOOLS
from board_context import board

# Shared secrets live in sparklearn-ai/.env. Load that first, then let an optional
# agent/.env.local override/add to it for agent-only settings.
_here = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_here, "..", "sparklearn-ai", ".env"))
load_dotenv(os.path.join(_here, ".env.local"), override=True)

# The LiveKit Google plugin reads GOOGLE_API_KEY; the repo only defines GEMINI_API_KEY.
os.environ.setdefault("GOOGLE_API_KEY", os.environ.get("GEMINI_API_KEY", ""))

# Verified against the installed livekit-plugins-google==1.6.6 source
# (livekit/plugins/google/realtime/realtime_api.py): this is the plugin's own default
# model id for the Gemini API (non-Vertex) path. Overridable via env for future swaps.
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"


def build_model():
    backend = os.getenv("LUMEN_MODEL_BACKEND", "gemini")
    if backend == "openai":
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError(
                "LUMEN_MODEL_BACKEND=openai but OPENAI_API_KEY is not set. "
                "Add it to sparklearn-ai/.env or agent/.env.local, or unset "
                "LUMEN_MODEL_BACKEND to use the default gemini backend."
            )
        # Fallback speech-to-speech
        return openai.realtime.RealtimeModel(voice="alloy")
    # Default: Gemini Live native audio
    return google.beta.realtime.RealtimeModel(
        model=os.getenv("LUMEN_GEMINI_MODEL", DEFAULT_GEMINI_MODEL),
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
        vad=silero.VAD.load(),  # turn-detection safety net
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
