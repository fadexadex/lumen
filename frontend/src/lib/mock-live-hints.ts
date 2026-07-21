export interface HintTurn {
  from: "tutor" | "you";
  text: string;
}

const generic: HintTurn[] = [
  { from: "tutor", text: "What's the very first thing you notice about this problem?" },
  { from: "you", text: "Hmm, I'm not sure where to start." },
  {
    from: "tutor",
    text: "That's okay. Try naming the pieces first — what is a, what is b, what is c?",
  },
  { from: "tutor", text: "Once you have them, we can plug in and simplify one step at a time." },
];

const scripted: Record<string, HintTurn[]> = {
  "quad-3": [
    { from: "tutor", text: "We want two numbers. What do they need to multiply to?" },
    { from: "you", text: "12?" },
    { from: "tutor", text: "Right! And what do they need to add to?" },
    {
      from: "tutor",
      text: "Try listing pairs that multiply to 12: 1·12, 2·6, 3·4… which pair adds to −7?",
    },
  ],
  "quad-5": [
    { from: "tutor", text: "Let's identify a, b, and c first. What are they here?" },
    { from: "tutor", text: "Now compute b² − 4ac carefully — that's the tricky bit." },
    {
      from: "tutor",
      text: "If the number under the square root is positive, you'll get two real answers.",
    },
  ],
};

export function getHints(moduleId: string): HintTurn[] {
  return scripted[moduleId] ?? generic;
}
