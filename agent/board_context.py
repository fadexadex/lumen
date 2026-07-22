from dataclasses import dataclass, field


@dataclass
class BoardContext:
    module_id: str = ""
    step_index: int = 0
    step_total: int = 0
    step_title: str = ""
    equation: str = ""  # e.g. "y = x^2 - 5x + 6"
    parabola: dict | None = None  # {"a":1,"b":-5,"c":6}
    targets: list[str] = field(default_factory=list)  # ["vertex","axisOfSymmetry","root1",...]
    target_details: list[dict] = field(default_factory=list)

    def as_prompt(self) -> str:
        lines = [
            f"Current step {self.step_index + 1} of {self.step_total}: {self.step_title}",
        ]
        if self.equation:
            lines.append(f"Equation on board: {self.equation}")
        if self.parabola:
            p = self.parabola
            lines.append(f"Parabola coefficients: a={p['a']}, b={p['b']}, c={p['c']}")
        if self.target_details:
            lines.append("Board targets (use the exact name before the colon):")
            for target in self.target_details:
                name = target.get("name")
                text = target.get("text")
                if name and text:
                    lines.append(f'- {name}: "{text}"')
        elif self.targets:
            lines.append("Targets you can point to: " + ", ".join(self.targets))
        return "\n".join(lines)


# module-level singleton for the demo (one room per worker process is fine)
board = BoardContext()
