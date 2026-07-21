export type LessonStep =
  | {
      kind: "text";
      content: string;
      x: number;
      y: number;
      size?: "h1" | "h2" | "body";
    }
  | {
      kind: "equation";
      /** Plain text with `^` for superscripts and `_` for subscripts, e.g. `ax^2 + bx + c`. */
      content: string;
      x: number;
      y: number;
    }
  | {
      kind: "diagram";
      widget: "parabola";
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | { kind: "pause"; ms: number };

export type Lesson = {
  slug: string;
  title: string;
  blurb: string;
  steps: LessonStep[];
};