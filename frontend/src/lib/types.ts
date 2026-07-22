export type LearningStyle = "stories" | "examples" | "step-by-step" | "challenge";
export type AudioPref = "off" | "music" | "voice";

export interface LearnerProfile {
  name: string;
  grade: number;
  subject: string;
  topic: string;
  style: LearningStyle;
  audio: AudioPref;
}

/** Display-only starter pack entitlement after Monnify checkout. Credits are not spent in-app yet. */
export interface Subscription {
  status: "active";
  credits: number;
  paymentReference: string;
  paidAt: string;
}

export interface RoadmapModule {
  id: string;
  title: string;
  blurb: string;
}

export interface Roadmap {
  topic: string;
  modules: RoadmapModule[];
}

export type StepKind = "explanation" | "example" | "practice";

export interface LessonStepExplanation {
  kind: "explanation";
  title: string;
  body: string;
  math?: string;
}
export interface LessonStepExample {
  kind: "example";
  title: string;
  lines: { text?: string; math?: string }[];
}
export interface LessonStepPractice {
  kind: "practice";
  title: string;
  prompt: string;
  math?: string;
  options?: string[];
  answer: string;
  hint?: string;
}
export type LessonStep = LessonStepExplanation | LessonStepExample | LessonStepPractice;

export interface LessonScript {
  moduleId: string;
  title: string;
  steps: LessonStep[];
  diagram?: LessonDiagram;
  /** Trusted, model-parameterized UI. Optional here for legacy hand-authored lessons. */
  visual?: LessonVisual;
}

export interface ConceptAnimation {
  kind: "animation";
  title: string;
  goal: string;
  /** The lesson step remains the single playback authority. */
  advance: "step";
  scenes: ConceptScene[];
}

export interface NoLessonVisual {
  kind: "none";
  reason: string;
}

export type LessonVisual = ConceptAnimation | NoLessonVisual;

type SceneBase = { narration: string };

export type ConceptScene =
  | (SceneBase & {
      primitive: "plotFunction";
      fn: "parabola" | "line" | "absolute" | "cubic";
      a: number;
      b: number;
      c: number;
      highlight?: ("vertex" | "roots" | "intercept")[];
    })
  | (SceneBase & {
      primitive: "numberLineWalk";
      range: [number, number];
      start: number;
      hops: { to: number; label?: string }[];
    })
  | (SceneBase & {
      primitive: "algebraTiles";
      xSquared: number;
      x: number;
      unit: number;
      factored?: [string, string];
    })
  | (SceneBase & {
      primitive: "balanceScale";
      left: { label: string; weight: number }[];
      right: { label: string; weight: number }[];
      operation?: string;
    })
  | (SceneBase & {
      primitive: "partitionGrid";
      rows: number;
      cols: number;
      shaded: number;
      rowLabel?: string;
      colLabel?: string;
    })
  | (SceneBase & {
      primitive: "fractionBar";
      parts: number;
      shaded: number;
      compareTo?: { parts: number; shaded: number };
    })
  | (SceneBase & {
      primitive: "countObjects";
      shape: "dot" | "square" | "star";
      total: number;
      groups: number;
    })
  | (SceneBase & {
      primitive: "geometryTransform";
      shape: "triangle" | "square" | "rectangle";
      transform: "translate" | "rotate" | "reflect" | "scale";
      amount: number;
    })
  | (SceneBase & {
      primitive: "stepReveal";
      lines: { text?: string; math?: string }[];
    });

export interface LessonDiagram {
  /** For a parabola y = ax² + bx + c */
  parabola?: { a: number; b: number; c: number; roots?: number[]; vertex?: [number, number] };
  /** Algebra-tile decomposition: x² count, x count, unit count, plus factored form. */
  tiles?: { xSquared: number; x: number; unit: number; factored?: [string, string] };
  /** Points to mark on a number line, plus range. */
  numberLine?: { points: { x: number; label?: string }[]; range: [number, number] };
  /** Optional per-step captions used by the storyboard/diagram concepts. */
  captions?: string[];
}
