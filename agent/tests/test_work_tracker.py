import unittest

from work_tracker import WorkTracker


class WorkTrackerTests(unittest.TestCase):
    def test_incomplete_solution_gets_bounded_resume_attempts(self):
        tracker = WorkTracker()
        tracker.update(
            job_id="solution",
            lines=["Solve: $x^2 - 1 = 0$", "Find the roots."],
            work_status="in_progress",
        )

        self.assertEqual(tracker.claim_resume(), "solution")
        self.assertEqual(tracker.claim_resume(), "solution")
        self.assertIsNone(tracker.claim_resume())

    def test_final_solution_clears_pending_resume(self):
        tracker = WorkTracker()
        tracker.update(
            job_id="solution",
            lines=["Solve: $x^2 - 1 = 0$"],
            work_status="in_progress",
        )
        tracker.update(
            job_id="solution",
            lines=["Solve: $x^2 - 1 = 0$", "Solution set: $\\{-1, 1\\}$"],
            work_status="standalone",
        )

        self.assertFalse(tracker.active)
        self.assertIsNone(tracker.claim_resume())

    def test_user_turn_blocks_stale_automatic_resume_until_work_continues(self):
        tracker = WorkTracker()
        tracker.update(
            job_id="solution",
            lines=["Inequality: $x^2 \\ge 1$"],
            work_status="in_progress",
        )
        tracker.on_user_turn()
        self.assertIsNone(tracker.claim_resume())

        tracker.update(
            job_id="solution",
            lines=["Inequality: $x^2 \\ge 1$", "Test the intervals."],
            work_status="in_progress",
        )
        self.assertEqual(tracker.claim_resume(), "solution")

    def test_agent_answer_rearms_resume_after_an_interruption(self):
        tracker = WorkTracker()
        tracker.update(
            job_id="solution",
            lines=["Solve: $x^2 - 1 = 0$"],
            work_status="in_progress",
        )
        tracker.on_user_turn()
        tracker.on_agent_turn()

        self.assertEqual(tracker.claim_resume(), "solution")

    def test_previous_writing_exposes_precise_line_targets(self):
        tracker = WorkTracker()
        tracker.update(
            job_id="vertex-work",
            lines=["Vertex x-coordinate", "$x = \\frac{-b}{2a}$", "$x = 2.5$"],
            work_status="complete",
        )

        prompt = tracker.target_prompt()
        self.assertIn("work.vertex-work.line2", prompt)
        self.assertIn("$x = \\frac{-b}{2a}$", prompt)
        self.assertEqual(
            tracker.target_names(),
            {
                "work.vertex-work",
                "work.vertex-work.line1",
                "work.vertex-work.line2",
                "work.vertex-work.line3",
            },
        )


if __name__ == "__main__":
    unittest.main()
