import unittest

from prompts import SYSTEM_PROMPT


class PromptCompletionContractTests(unittest.TestCase):
    def test_worked_solutions_must_reach_a_final_answer_before_yielding(self):
        self.assertIn("Complete it through the final answer or solution set", SYSTEM_PROMPT)
        self.assertIn('A tool result of "ok" means continue the solution', SYSTEM_PROMPT)
        self.assertNotIn(
            "Keep responses to 1-3 full sentences before pausing for the learner",
            SYSTEM_PROMPT,
        )

    def test_interrupted_work_resumes_without_a_continue_prompt(self):
        self.assertIn("resume the unfinished worked solution", SYSTEM_PROMPT)
        self.assertIn('make the learner say "continue"', SYSTEM_PROMPT)


if __name__ == "__main__":
    unittest.main()
