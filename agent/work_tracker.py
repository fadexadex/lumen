from dataclasses import dataclass


_FINAL_MARKERS = ("solution set", "final answer", "answer:")
_WORK_JOB_MARKERS = ("solution", "solve", "calculation", "worked")
_WORK_LINE_MARKERS = ("solve:", "inequality:", "find the roots", "find critical")


@dataclass
class WorkTracker:
    """Small turn guard for board work that the model explicitly leaves unfinished."""

    job_id: str | None = None
    active: bool = False
    blocked_for_user_turn: bool = False
    resume_attempts: int = 0
    visible_job_id: str | None = None
    visible_lines: tuple[str, ...] = ()

    def update(self, *, job_id: str, lines: list[str], work_status: str) -> None:
        # Retain the last writing payload even after completion so a later learner
        # reference such as "that denominator" can resolve to an exact line.
        self.visible_job_id = job_id
        self.visible_lines = tuple(lines)
        text = "\n".join(lines).lower()
        status = work_status.strip().lower()
        complete = status == "complete" or any(marker in text for marker in _FINAL_MARKERS)
        inferred_work = any(marker in job_id.lower() for marker in _WORK_JOB_MARKERS) and any(
            marker in text for marker in _WORK_LINE_MARKERS
        )
        in_progress = status == "in_progress" or (status == "standalone" and inferred_work)

        if complete:
            if not self.job_id or self.job_id == job_id:
                self.active = False
                self.blocked_for_user_turn = False
            self.job_id = job_id
            return

        if not in_progress:
            return

        if self.job_id != job_id:
            self.resume_attempts = 0
        self.job_id = job_id
        self.active = True
        # A post-interruption board update proves the model chose to resume this work.
        self.blocked_for_user_turn = False

    def on_user_turn(self) -> None:
        if self.active:
            self.blocked_for_user_turn = True

    def on_agent_turn(self) -> None:
        """Allow the guard again once the agent has begun handling the interruption."""
        if self.active:
            self.blocked_for_user_turn = False

    def claim_resume(self, max_attempts: int = 2) -> str | None:
        if (
            not self.active
            or self.blocked_for_user_turn
            or not self.job_id
            or self.resume_attempts >= max_attempts
        ):
            return None
        self.resume_attempts += 1
        return self.job_id

    def target_prompt(self) -> str:
        if not self.visible_job_id or not self.visible_lines:
            return ""
        prefix = f"work.{self.visible_job_id}"
        lines = [f"Lumen writing block target: {prefix}"]
        lines.extend(
            f'- {prefix}.line{index}: "{text}"'
            for index, text in enumerate(self.visible_lines, start=1)
        )
        return "\n".join(lines)

    def target_names(self) -> set[str]:
        if not self.visible_job_id or not self.visible_lines:
            return set()
        prefix = f"work.{self.visible_job_id}"
        names = {prefix}
        names.update(f"{prefix}.line{index}" for index in range(1, len(self.visible_lines) + 1))
        return names
