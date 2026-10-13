import { describe, expect, it } from "vitest";
import {
  ageInDays,
  descriptionCode,
  hasDiscussion,
  isAbandoned,
  isInExtent,
  lastActivity,
  isOnFreeway,
  isSpeedCameraUr,
  isStaleCandidate,
  isTrafficLightUr,
  MAP_TEAM_USER,
  mapMateKind,
  STALE_AGE_DAYS,
  triage,
} from "./detect";
import {
  makeSegment,
  makeTrafficLightUr,
  makeUr,
  makeMapMateUr,
} from "./fake-sdk";

describe("isSpeedCameraUr", () => {
  it("accepts an open, editable UR whose description starts with the marker", () => {
    expect(isSpeedCameraUr(makeUr(1))).toBe(true);
  });

  it("ignores the free text after the marker, whatever its language", () => {
    const portuguese = makeUr(1, {
      description: "MISSING_STATIC_SPEED_CAMERA: Radar fixo",
    });
    expect(isSpeedCameraUr(portuguese)).toBe(true);
  });

  it("rejects a marker that is not at the start", () => {
    const quoted = makeUr(1, {
      description: "see MISSING_STATIC_SPEED_CAMERA",
    });
    expect(isSpeedCameraUr(quoted)).toBe(false);
  });

  it("rejects a closed UR, a UR the editor cannot edit and a UR without description", () => {
    expect(isSpeedCameraUr(makeUr(1, { isOpen: false }))).toBe(false);
    expect(isSpeedCameraUr(makeUr(1, { isEditable: false }))).toBe(false);
    expect(isSpeedCameraUr(makeUr(1, { description: null }))).toBe(false);
  });
});

describe("isInExtent", () => {
  const extent = [6, 46, 7, 47];

  it("keeps a UR inside the extent, edges included", () => {
    expect(isInExtent(makeUr(1), extent)).toBe(true);
    const onEdge = makeUr(1, {
      geometry: { type: "Point", coordinates: [7, 47] },
    });
    expect(isInExtent(onEdge, extent)).toBe(true);
  });

  it("drops a UR outside the extent", () => {
    const outside = makeUr(1, {
      geometry: { type: "Point", coordinates: [8.5, 47.3] },
    });
    expect(isInExtent(outside, extent)).toBe(false);
  });
});

describe("triage", () => {
  it("is ready without any comment", () => {
    expect(triage([], false)).toBe("ready");
  });

  it("is a conversation as soon as there is one comment, whoever wrote it", () => {
    expect(
      triage([{ createdOn: 0, text: "hello", userName: null }], false),
    ).toBe("conversation");
    expect(
      triage([{ createdOn: 0, text: "hi", userName: "editor" }], false),
    ).toBe("conversation");
  });

  it("is a conversation when this session already sent the message", () => {
    expect(triage([], true)).toBe("conversation");
  });
});

describe("isTrafficLightUr", () => {
  it("accepts an open, editable UR whose description starts with the marker", () => {
    expect(isTrafficLightUr(makeTrafficLightUr(1))).toBe(true);
  });

  it("rejects a speed-camera UR, a closed one and one the editor cannot edit", () => {
    expect(isTrafficLightUr(makeUr(1))).toBe(false);
    expect(isTrafficLightUr(makeTrafficLightUr(1, { isOpen: false }))).toBe(
      false,
    );
    expect(isTrafficLightUr(makeTrafficLightUr(1, { isEditable: false }))).toBe(
      false,
    );
  });
});

describe("isOnFreeway", () => {
  const ur = makeTrafficLightUr(1);
  // 0.0001° of latitude is about 11 m.
  const near = 46.5001;
  const far = 46.5005;

  it("is true when the closest loaded segment is a freeway", () => {
    expect(isOnFreeway(ur, [makeSegment(3, near)])).toBe(true);
  });

  it("is false when the closest segment is a ramp, even with a freeway a bit further", () => {
    const segments = [makeSegment(4, 46.50005), makeSegment(3, 46.5002)];
    expect(isOnFreeway(ur, segments)).toBe(false);
  });

  it("is false when the closest freeway is beyond the distance limit", () => {
    expect(isOnFreeway(ur, [makeSegment(3, far)])).toBe(false);
  });

  it("is false when no segment is loaded", () => {
    expect(isOnFreeway(ur, [])).toBe(false);
  });
});

const DAY = 24 * 60 * 60 * 1000;
/** makeUr's default reportedOn. */
const REPORTED = 1_760_000_000_000;
const road = { description: "Missing road" };

describe("isStaleCandidate", () => {
  it("needs strictly more than 14 days", () => {
    const ur = makeUr(1, road);
    expect(isStaleCandidate(ur, REPORTED + STALE_AGE_DAYS * DAY)).toBe(false);
    expect(isStaleCandidate(ur, REPORTED + STALE_AGE_DAYS * DAY + 1)).toBe(
      true,
    );
  });

  it("takes any type, a missing description included, but never a speed camera", () => {
    const now = REPORTED + 30 * DAY;
    expect(isStaleCandidate(makeTrafficLightUr(1), now)).toBe(true);
    expect(isStaleCandidate(makeUr(2, { description: null }), now)).toBe(true);
    expect(isStaleCandidate(makeUr(3), now)).toBe(false);
  });

  it("rejects a closed UR and one the editor cannot edit", () => {
    const now = REPORTED + 30 * DAY;
    expect(isStaleCandidate(makeUr(1, { ...road, isOpen: false }), now)).toBe(
      false,
    );
    expect(
      isStaleCandidate(makeUr(1, { ...road, isEditable: false }), now),
    ).toBe(false);
  });

  it("never takes a Map Mate voice report: its description often says more", () => {
    const now = REPORTED + 30 * DAY;
    const mapMate = makeUr(1, { ...road, source: "REPORTING_AGENT" });
    expect(isStaleCandidate(mapMate, now)).toBe(false);
  });

  it("rejects a UR reported in the future (clock skew)", () => {
    expect(isStaleCandidate(makeUr(1, road), REPORTED - DAY)).toBe(false);
  });
});

describe("hasDiscussion", () => {
  const mapTeam = { createdOn: 0, text: "auto", userName: MAP_TEAM_USER };
  const someone = { createdOn: 0, text: "hi", userName: "editor" };

  it("is false without comments, and with Map_Team's alone", () => {
    expect(hasDiscussion([])).toBe(false);
    expect(hasDiscussion([mapTeam, mapTeam])).toBe(false);
  });

  it("is true as soon as anyone else wrote", () => {
    expect(hasDiscussion([mapTeam, someone])).toBe(true);
  });

  it("counts a differently-cased or empty author as a discussion", () => {
    expect(hasDiscussion([{ ...mapTeam, userName: "map_team" }])).toBe(true);
    expect(hasDiscussion([{ ...mapTeam, userName: "" }])).toBe(true);
  });

  it("counts the reporter, who comes back without a name, as a discussion", () => {
    expect(hasDiscussion([{ ...mapTeam, userName: null }])).toBe(true);
  });
});

describe("ageInDays", () => {
  it("counts whole days", () => {
    expect(ageInDays(REPORTED, REPORTED + 15 * DAY + 5)).toBe(15);
  });
});

describe("descriptionCode", () => {
  it("is the text before the first colon, or the whole text without one", () => {
    expect(descriptionCode("INCORRECT_ROUTE: a: b")).toBe("INCORRECT_ROUTE");
    expect(descriptionCode("GENERAL_MAP_UPDATE")).toBe("GENERAL_MAP_UPDATE");
    expect(descriptionCode(null)).toBe("");
  });
});

describe("mapMateKind", () => {
  it("recognises each of the five codes", () => {
    expect(mapMateKind(makeMapMateUr(1, "MISSING_TRAFFIC_LIGHT"))).toBe(
      "trafficLight",
    );
    expect(mapMateKind(makeMapMateUr(1, "INCORRECT_ROUTE"))).toBe("route");
    expect(mapMateKind(makeMapMateUr(1, "INCORRECT_SPEED_LIMIT"))).toBe(
      "speedLimit",
    );
    expect(mapMateKind(makeMapMateUr(1, "INCORRECT_TURN"))).toBe("turn");
    expect(mapMateKind(makeMapMateUr(1, "RAILROAD_CROSSING"))).toBe(
      "railroadCrossing",
    );
    expect(mapMateKind(makeMapMateUr(1, "GENERAL_MAP_UPDATE"))).toBe("general");
  });

  it("needs the exact code, and ignores unknown ones and prototype names", () => {
    for (const code of [
      "INCORRECT_TURN_X",
      "UNKNOWN_CODE",
      "constructor",
      "toString",
      "__proto__",
    ]) {
      expect(mapMateKind(makeMapMateUr(1, code))).toBeNull();
    }
    const quoted = makeMapMateUr(1, "x", {
      description: "see INCORRECT_TURN: x",
    });
    expect(mapMateKind(quoted)).toBeNull();
  });

  it("leaves a Map Mate speed camera to the speed-camera family", () => {
    expect(
      mapMateKind(makeMapMateUr(1, "MISSING_STATIC_SPEED_CAMERA")),
    ).toBeNull();
  });

  it("only takes Map Mate's open, editable general-error URs", () => {
    const code = "INCORRECT_ROUTE";
    expect(
      mapMateKind(makeMapMateUr(1, code, { source: "MOBILE_CLIENT" })),
    ).toBeNull();
    expect(
      mapMateKind(
        makeMapMateUr(1, code, { updateRequestType: "INCORRECT_ROUTE" }),
      ),
    ).toBeNull();
    expect(mapMateKind(makeMapMateUr(1, code, { isOpen: false }))).toBeNull();
    expect(
      mapMateKind(makeMapMateUr(1, code, { isEditable: false })),
    ).toBeNull();
  });
});

describe("isAbandoned", () => {
  const now = REPORTED + 30 * DAY;
  const at = (daysAgo: number, userName: string | null) => ({
    createdOn: now - daysAgo * DAY,
    text: "…",
    userName,
  });

  it("takes an old UR nobody wrote on", () => {
    expect(isAbandoned([], REPORTED, now)).toBe(true);
  });

  it("takes one where Map_Team or an editor asked and got no answer for 14 days", () => {
    expect(isAbandoned([at(20, MAP_TEAM_USER)], REPORTED, now)).toBe(true);
    expect(
      isAbandoned([at(25, MAP_TEAM_USER), at(15, "editor")], REPORTED, now),
    ).toBe(true);
  });

  it("recognises Map_Team by its text when WME drops the name", () => {
    // Logged in WME: the comment the list read as "Map_Team" came back nameless at closure.
    const nameless = [
      {
        createdOn: 1789363681420,
        text: "Hallo, was war das Problem bitte? \n Bonjour, quel a été le problème SVP? \n Ciao,",
        userName: null,
      },
    ];
    expect(isAbandoned(nameless, 1789361173000, 1791893552858)).toBe(true);
    expect(hasDiscussion(nameless)).toBe(false);
  });

  it("still takes a nameless comment with any other text for the reporter", () => {
    const reply = [
      { createdOn: 1789363681420, text: "Merci, c'est réglé", userName: null },
    ];
    expect(isAbandoned(reply, 1789361173000, 1791893552858)).toBe(false);
    expect(hasDiscussion(reply)).toBe(true);
  });

  it("knows the reporter also as admin (UR 27179414)", () => {
    const conversation = [
      {
        createdOn: Date.parse("2026-09-23T06:54:58.981Z"),
        text: "Hallo, was war das Problem bitte?",
        userName: MAP_TEAM_USER,
      },
      {
        createdOn: Date.parse("2026-09-23T07:43:41.845Z"),
        text: "Bonjour, la route que le GPs demande d'emprunter est fermée",
        userName: "admin",
      },
    ];
    const reportedOn = Date.parse("2026-09-22T12:00:00Z");
    const now = Date.parse("2026-10-13T12:00:00Z");
    expect(isAbandoned(conversation, reportedOn, now)).toBe(false);
  });

  it("never takes one where the reporter has the last word", () => {
    expect(isAbandoned([at(25, "editor"), at(20, null)], REPORTED, now)).toBe(
      false,
    );
  });

  it("waits 14 days after the last comment, whoever wrote it", () => {
    expect(isAbandoned([at(14, "editor")], REPORTED, now)).toBe(false);
    expect(isAbandoned([at(3, MAP_TEAM_USER)], REPORTED, now)).toBe(false);
  });

  it("reads the latest comment by date, whatever the order they came in", () => {
    expect(isAbandoned([at(20, null), at(16, "editor")], REPORTED, now)).toBe(
      true,
    );
    expect(isAbandoned([at(16, "editor"), at(20, null)], REPORTED, now)).toBe(
      true,
    );
  });

  it("needs 14 days since the report too", () => {
    expect(isAbandoned([], now - 10 * DAY, now)).toBe(false);
  });
});

describe("lastActivity", () => {
  it("is the latest comment, or the report without one", () => {
    expect(lastActivity(REPORTED, [])).toBe(REPORTED);
    expect(
      lastActivity(REPORTED, [
        { createdOn: REPORTED + 5, text: "", userName: null },
        { createdOn: REPORTED + 2, text: "", userName: "editor" },
      ]),
    ).toBe(REPORTED + 5);
  });
});
