import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Course } from "@/lib/course-gen/types";
import type { LessonScript } from "@/lib/types";

const generation = vi.hoisted(() => ({
  streamLesson: vi.fn(),
  repairLesson: vi.fn(),
  repairLessonContent: vi.fn(),
  streamRoadmap: vi.fn(),
}));

vi.mock("../generate", () => generation);

import { retryCourseModule } from "../orchestrator";

const script: LessonScript = {
  moduleId: "what-is-a-quadratic",
  title: "What is a quadratic?",
  steps: [
    {
      kind: "explanation",
      title: "The idea",
      body: "A quadratic has a highest variable power of two and forms a curved graph.",
      math: "ax^2 + bx + c",
    },
    { kind: "example", title: "Example", lines: [{ math: "x^2 + 2x + 1" }] },
    {
      kind: "practice",
      title: "Try it",
      prompt: "Which expression is quadratic?",
      options: ["x + 1", "x^2 + 1"],
      answer: "x^2 + 1",
    },
  ],
  visual: {
    kind: "animation",
    title: "See the curve",
    goal: "Connect the squared term to its graph.",
    advance: "step",
    scenes: [
      {
        primitive: "plotFunction",
        narration: "The squared term creates this parabola.",
        fn: "parabola",
        a: 1,
        b: 0,
        c: 0,
      },
    ],
  },
};

describe("course module retry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores an existing valid script without another provider request", async () => {
    generation.streamLesson.mockRejectedValue(new Error("Rate limit exceeded"));
    const course: Course = {
      id: "course-1",
      topic: "Quadratics",
      profile: {
        name: "Learner",
        grade: 9,
        subject: "Math",
        topic: "Quadratics",
        style: "step-by-step",
        audio: "voice",
      },
      modules: [
        {
          id: "what-is-a-quadratic",
          title: "What is a quadratic?",
          blurb: "Recognize quadratic expressions.",
          status: "failed",
          error: "AI_APICallError: Rate limit exceeded",
          script,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };

    const retried = await retryCourseModule(course, "what-is-a-quadratic");

    expect(retried.status).toBe("ready");
    expect(retried.error).toBeUndefined();
    expect(retried.script).toMatchObject({
      moduleId: script.moduleId,
      title: script.title,
      steps: script.steps,
      visual: script.visual,
    });
    expect(generation.streamLesson).not.toHaveBeenCalled();
  });
});
