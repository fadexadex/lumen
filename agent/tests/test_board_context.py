import unittest

from board_context import BoardContext


class BoardContextTests(unittest.TestCase):
    def test_describes_exact_targets_instead_of_only_listing_opaque_names(self):
        board = BoardContext(
            step_index=2,
            step_total=4,
            step_title="Some real quadratics",
            visual="Equation balance; scene 2 of 3; balanceScale: subtract 3 from both sides",
            targets=["step2.equation1", "step2.equation2"],
            target_details=[
                {
                    "name": "step2.equation1",
                    "kind": "equation",
                    "text": "x^2 - 5x + 6 = 0",
                },
                {
                    "name": "step2.equation2",
                    "kind": "equation",
                    "text": "2x^2 + 3x - 2 = 0",
                },
            ],
        )

        prompt = board.as_prompt()
        self.assertIn('step2.equation1: "x^2 - 5x + 6 = 0"', prompt)
        self.assertIn('step2.equation2: "2x^2 + 3x - 2 = 0"', prompt)
        self.assertIn("Visual on board: Equation balance", prompt)


if __name__ == "__main__":
    unittest.main()
