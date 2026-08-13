/**
 * The one seeded course, built properly. Depth over breadth.
 *
 * Deliberately NOT "Balinese Deep Tissue" — that exact phrase is the pre-filled
 * AI-draft prompt in the builder (see public/index.html). If the seed course
 * were the same subject, drafting it live in the demo would look like a
 * duplicate rather than a fresh generation. Hot Stone is a different enough
 * treatment to keep that moment honest.
 *
 * Authored by trainer "Ratna" — deliberately NOT the trainer you switch into.
 * Rule 3 says a trainer cannot take their own course, so if the seed course
 * were authored by the current user it would vanish from the learner view and
 * the demo would look broken.
 */

export const USERS = {
  trainer: { id: "u-trainer-you", name: "You", role: "trainer" },
  therapist: { id: "u-therapist-you", name: "You", role: "therapist" },
};

const AUTHOR = "u-trainer-ratna"; // a different trainer. see note above.

export function seedState() {
  return {
    courses: [hotStoneLevel1()],
    progress: {},
  };
}

function hotStoneLevel1() {
  return {
    id: "c-hotstone-1",
    title: "Hot Stone Massage · Level 1",
    summary:
      "Stone temperature, placement and the contraindications that actually " +
      "matter — the full 60-minute protocol from warmer to close.",
    level: "Level 1",
    duration: "60 min treatment",
    status: "published",
    createdBy: AUTHOR,
    createdByName: "Ratna",
    publishedAt: "2026-07-15",
    modules: [
      {
        id: "m1",
        title: "Before the client arrives",
        steps: [
          {
            id: "s1",
            type: "text",
            title: "The warmer is a guide, not a guarantee",
            html:
              "<p>Stone warmers hold water at <strong>50–55°C</strong>, but a stone " +
              "pulled straight from the base of the unit runs hotter than one from " +
              "the top, and a stone that has sat against the heating element can be " +
              "hotter still.</p>" +
              "<p><strong>Test every stone on the inside of your own forearm before it " +
              "touches a client — every time, no exceptions.</strong> If it is " +
              "uncomfortable on you in under two seconds, it is too hot for their " +
              "back.</p>" +
              "<p>A client will often not tell you a stone is too hot. They associate " +
              "heat with the treatment working, and by the time it visibly reddens " +
              "the skin you have already caused a burn.</p>",
          },
          {
            id: "s2",
            type: "task",
            title: "Room and warmer setup",
            instructions:
              "Set the room as you would for a real client, then confirm each item.",
            items: [
              "Warmer at 50–55°C, checked with the unit's own thermometer",
              "Stones sorted by size: large for the back, small for hands and feet",
              "Oil decanted and within reach of the warmer, not the client's face",
              "Towels laid out to transfer stones without dripping on the client",
              "A cool-down tray of room-temperature water at the table",
              "Client's jewellery removed and stored before they lie down",
            ],
          },
          {
            id: "s3",
            type: "image",
            title: "Stone placement along the spine",
            url: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1200&q=80",
            caption:
              "Stones sit either side of the spine, never directly on it. Even " +
              "spacing lets the heat spread through the erectors without pooling " +
              "on the vertebrae.",
          },
        ],
      },
      {
        id: "m2",
        title: "The protocol",
        steps: [
          {
            id: "s4",
            type: "video",
            title: "Full back placement, demonstrated",
            url: "https://www.youtube.com/watch?v=nlKzMfxNkkA",
            note:
              "Watch how long each stone stays in one place before the therapist " +
              "moves it — a stone that has stopped feeling hot to the client has " +
              "already done its work in that spot.",
          },
          {
            id: "s5",
            type: "text",
            title: "Sequence and timings",
            html:
              "<p>The 60-minute treatment runs:</p><ol>" +
              "<li><strong>Placement, 5 min</strong> — stones set along the back, palms, " +
              "and soles while you begin the client's shoulders by hand</li>" +
              "<li><strong>Back massage with stones, 20 min</strong> — worked as an " +
              "extension of your hand, gliding rather than pressing static</li>" +
              "<li><strong>Legs, 15 min</strong> — smaller stones, lighter pressure than " +
              "the back</li>" +
              "<li><strong>Arms and hands, 10 min</strong></li>" +
              "<li><strong>Neck, scalp and close, 10 min</strong> — stones removed, hands " +
              "only from here</li></ol>" +
              "<p><em>Check in on stone temperature against your own hand every few " +
              "minutes — they cool faster than you expect.</em> A cooling stone still " +
              "worked as if hot is a wasted stone, not a gentler one.</p>",
          },
          {
            id: "s6",
            type: "task",
            title: "Practise the glide",
            instructions:
              "With a colleague or a bolster, practise moving a warm (not hot) stone " +
              "as an extension of your palm. Confirm each.",
            items: [
              "Stone held so your own fingers never contact the skin directly",
              "Continuous gliding strokes, no static press-and-hold on bone",
              "Stone re-checked against your forearm every few passes",
              "Partner confirms even, predictable pressure throughout",
            ],
          },
        ],
      },
      {
        id: "m3",
        title: "Safety and sign-off",
        steps: [
          {
            id: "s7",
            type: "text",
            title: "When you do not proceed",
            html:
              "<p>Stop, and speak to a senior therapist, if the client discloses:</p><ul>" +
              "<li>A pacemaker or any implanted metal device</li>" +
              "<li>Pregnancy at any stage</li>" +
              "<li>Diabetes with reduced sensation in the treatment area</li>" +
              "<li>Recent sunburn, rashes, or open skin in the treatment area</li>" +
              "<li>Blood thinners, or a history of blood clots</li></ul>" +
              "<p><strong>Heat is not a small risk to wave off.</strong> A burn from a " +
              "stone left in one place too long is entirely preventable, and it is " +
              "always the therapist's responsibility, never the client's for not " +
              "saying something.</p>",
          },
          {
            id: "s8",
            type: "quiz",
            title: "Level 1 competence check",
            passMark: 75,
            questions: [
              {
                id: "q1",
                q: "A client mentions a pacemaker just before you start. You:",
                options: [
                  "Proceed, the stones themselves are not metal",
                  "Stop — hot stone is contraindicated, refer to a senior therapist",
                  "Proceed but use fewer stones",
                  "Ask them to sign a waiver and continue",
                ],
                correct: 1,
              },
              {
                id: "q2",
                q: "How do you check a stone is safe before it touches the client?",
                options: [
                  "Trust the warmer's displayed temperature",
                  "Test it on the inside of your own forearm every time",
                  "Ask the client if it feels too hot once placed",
                  "Check it once at the start of the treatment",
                ],
                correct: 1,
              },
              {
                id: "q3",
                q: "Where should stones sit relative to the spine?",
                options: [
                  "Directly along the spine for maximum heat",
                  "Either side of the spine, never on it",
                  "Only at the base of the back",
                  "Position doesn't matter as long as they're warm",
                ],
                correct: 1,
              },
              {
                id: "q4",
                q: "A stone has cooled but you keep using it as if it were still hot. This is:",
                options: [
                  "Fine — cooler stones are gentler and still effective",
                  "A wasted stone; swap it, don't just keep working with it",
                  "Only a problem on the back, not the legs",
                  "The client's cue to ask for a fresh one",
                ],
                correct: 1,
              },
            ],
          },
        ],
      },
    ],
  };
}
