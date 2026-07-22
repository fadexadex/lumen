import { describe, it, expect } from "vitest";
import { __transcriptTest, type TranscriptTurn } from "@/lib/live/tutor-session";
import {
  __transcriptHistoryTest,
  loadTranscriptHistory,
  saveTranscriptHistory,
} from "@/lib/live/transcript-history";

const {
  isNoiseTranscript,
  appendTranscriptionChunk,
  mergeTutorText,
  shouldMergeTutor,
  suffixPrefixOverlap,
  uniqueTurnId,
  TUTOR_TURN_GAP_MS,
} = __transcriptTest;

describe("LiveKit transcription stream assembly", () => {
  it("accumulates the incremental chunks from one text stream", () => {
    const chunks = ["Hello!", " What", " can", " we", " explore", " today?"];
    expect(chunks.reduce(appendTranscriptionChunk, "")).toBe("Hello! What can we explore today?");
  });
});

describe("persisted live transcript history", () => {
  it("restores the previous turns for the same lesson", () => {
    localStorage.removeItem(__transcriptHistoryTest.STORAGE_KEY);
    const turns: TranscriptTurn[] = [
      { id: "you-1", from: "you", text: "Why does it open upward?", final: true },
      { id: "tutor-1", from: "tutor", text: "Because a is positive.", final: true },
    ];

    saveTranscriptHistory("quad-1", turns);

    expect(loadTranscriptHistory("quad-1")).toEqual(turns);
    expect(loadTranscriptHistory("quad-2")).toEqual([]);
    localStorage.removeItem(__transcriptHistoryTest.STORAGE_KEY);
  });

  it("keeps only the most recent bounded history", () => {
    const turns: TranscriptTurn[] = Array.from({ length: 18 }, (_, index) => ({
      id: `turn-${index}`,
      from: index % 2 ? "tutor" : "you",
      text: `Turn ${index}`,
      final: true,
    }));

    saveTranscriptHistory("quad-1", turns);

    const restored = loadTranscriptHistory("quad-1");
    expect(restored).toHaveLength(__transcriptHistoryTest.MAX_TURNS);
    expect(restored[0]?.id).toBe("turn-6");
    localStorage.removeItem(__transcriptHistoryTest.STORAGE_KEY);
  });
});

describe("transcript noise filter", () => {
  it("drops Gemini noise tokens and bare punctuation", () => {
    expect(isNoiseTranscript("<noise>")).toBe(true);
    expect(isNoiseTranscript("<NOISE>")).toBe(true);
    expect(isNoiseTranscript("<unk>")).toBe(true);
    expect(isNoiseTranscript(".")).toBe(true);
    expect(isNoiseTranscript("...")).toBe(true);
    expect(isNoiseTranscript("!")).toBe(true);
    expect(isNoiseTranscript("   ")).toBe(true);
  });

  it("keeps real learner / tutor phrases", () => {
    expect(isNoiseTranscript("Why does it open upward?")).toBe(false);
    expect(isNoiseTranscript("smaller")).toBe(false);
    expect(isNoiseTranscript("a > 0")).toBe(false);
  });
});

describe("tutor transcript merge (word-stream → one bubble)", () => {
  it("replaces with cumulative text", () => {
    expect(mergeTutorText("See how it gets", "See how it gets wider")).toBe(
      "See how it gets wider",
    );
  });

  it("keeps longer text when a shorter stale chunk arrives", () => {
    expect(mergeTutorText("See how it gets wider", "See how")).toBe("See how it gets wider");
  });

  it("appends word fragments with a space", () => {
    expect(mergeTutorText("See how it gets", "wider")).toBe("See how it gets wider");
    expect(mergeTutorText("opens", "up!")).toBe("opens up!");
  });

  it("does not double-space when punctuation joins", () => {
    expect(mergeTutorText("smaller", "?")).toBe("smaller?");
  });

  it("drops trailing echo duplicates", () => {
    expect(mergeTutorText("the parabola opens upward.", "upward.")).toBe(
      "the parabola opens upward.",
    );
  });

  it("dedupes overlapping suffix/prefix", () => {
    expect(mergeTutorText("What are you hoping to", "to learn today?")).toBe(
      "What are you hoping to learn today?",
    );
    expect(suffixPrefixOverlap("hoping to", "to learn")).toBe(2);
  });

  it("joins consecutive sentences into one paragraph", () => {
    expect(
      mergeTutorText("The parabola opens upward.", "Since a is positive, that makes sense."),
    ).toBe("The parabola opens upward. Since a is positive, that makes sense.");
  });
});

describe("uniqueTurnId (no duplicate React keys)", () => {
  const turn = (id: string): TranscriptTurn => ({ id, from: "tutor", text: "x", final: true });

  it("returns the id unchanged when nothing else uses it", () => {
    expect(uniqueTurnId([turn("SG_a"), turn("SG_b")], "SG_c")).toBe("SG_c");
  });

  it("suffixes a re-emitted LiveKit segment id so keys stay unique", () => {
    const turns = [turn("SG_8d5465622ddf"), turn("SG_other")];
    expect(uniqueTurnId(turns, "SG_8d5465622ddf")).toBe("SG_8d5465622ddf#2");
  });

  it("keeps climbing the suffix until it is actually free", () => {
    const turns = [turn("SG_x"), turn("SG_x#2"), turn("SG_x#3")];
    expect(uniqueTurnId(turns, "SG_x")).toBe("SG_x#4");
  });

  it("ignores the slot being rewritten in place (selfIndex)", () => {
    const turns = [turn("SG_x"), turn("SG_y")];
    // Rewriting index 1 back to its own id must not suffix it.
    expect(uniqueTurnId(turns, "SG_y", 1)).toBe("SG_y");
  });
});

describe("shouldMergeTutor (stable paragraphs)", () => {
  const tutor = (text: string): TranscriptTurn => ({
    id: "t1",
    from: "tutor",
    text,
    final: false,
  });

  it("merges while status is speaking even across sentence finals", () => {
    expect(shouldMergeTutor(tutor("The parabola opens upward."), 50, "speaking")).toBe(true);
    expect(
      shouldMergeTutor(tutor("The parabola opens upward."), TUTOR_TURN_GAP_MS + 500, "speaking"),
    ).toBe(true);
  });

  it("merges short listening gaps mid-reply", () => {
    expect(shouldMergeTutor(tutor("Hello."), 400, "listening")).toBe(true);
    expect(shouldMergeTutor(tutor("Hello."), 2000, "listening")).toBe(true);
  });

  it("starts a new bubble after a long pause while listening", () => {
    expect(
      shouldMergeTutor(tutor("Ready when you are."), TUTOR_TURN_GAP_MS + 100, "listening"),
    ).toBe(false);
  });
});
