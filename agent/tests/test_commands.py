import json
import unittest

import commands


class CanvasCommandBuilderTests(unittest.TestCase):
    def test_every_agent_canvas_command_has_the_expected_wire_shape(self):
        payloads = [
            (commands.highlight("step2.equation1"), "highlight"),
            (commands.circle("vertex"), "circle"),
            (commands.label("vertex", "minimum"), "label"),
            (commands.arrow("vertex", "root1"), "arrow"),
            (commands.draw_axis(), "drawAxis"),
            (commands.plot_parabola(1, -5, 6), "plotParabola"),
            (commands.set_parabola(1, -5, 6), "setParabola"),
            (commands.set_visual_scene(1), "setVisualScene"),
            (commands.go_to_step(2), "goToStep"),
            (commands.write_block(["$x = 2$"], job_id="solution"), "writeBlock"),
            (commands.cancel_writing("solution"), "cancelWriting"),
            (commands.focus("vertex"), "panTo"),
            (commands.clear(), "clear"),
        ]

        ids = set()
        for raw, expected_op in payloads:
            payload = json.loads(raw)
            self.assertEqual(payload["op"], expected_op)
            self.assertIsInstance(payload["args"], dict)
            self.assertTrue(payload["id"])
            ids.add(payload["id"])
        self.assertEqual(len(ids), len(payloads))


if __name__ == "__main__":
    unittest.main()
