import unittest
from unittest.mock import patch

import agent


class GeminiRealtimeConfigTests(unittest.TestCase):
    def test_realtime_vad_uses_gemini_defaults(self):
        with patch.dict("os.environ", {"LUMEN_MODEL_BACKEND": "gemini"}):
            model = agent.build_model()

        # A LOW start sensitivity suppressed normal learner speech in real browser
        # sessions. Leave activity detection unset so Gemini uses its responsive
        # server-side defaults.
        self.assertFalse(model._opts.realtime_input_config)


if __name__ == "__main__":
    unittest.main()
