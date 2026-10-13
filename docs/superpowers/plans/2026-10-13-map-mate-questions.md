# Map Mate questions and tab rename — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask Map Mate reporters a case-specific question (traffic light, route, speed limit, turn, general) in their language, leaving the UR open. Then rename the tab to a general UR assistant, with an (i) tooltip on each family checkbox.

**Architecture:** Everything stays in `src/speed-camera-urs/`. A pure `mapMateKind(ur)` reads the code before the first `:` of the description. The `Scanner` lists candidates and reads their conversation only when the box is checked. `close.ts` gains `askMapMate`, which comments and never closes, and a third batch family. Confirmations may now quote several texts, and the tab gets a fourth checkbox, a Map Mate section, (i) tooltips and new wording.

**Tech Stack:** TypeScript, WME SDK (`wme-sdk-typings`), i18next, Vitest (node environment, fake DOM in `src/ui/fake-dom.ts`), Rollup.

**Spec:** `docs/superpowers/specs/2026-10-13-map-mate-questions-design.md` (binding). It extends `docs/superpowers/specs/2026-10-12-stale-urs-design.md`, already implemented on this branch.

## Global Constraints

- Branch: `feat/stale-urs` (continue on it). **Never stage** `header-dev.js`, `.claude/`, `sitn/`; always `git add` explicit paths.
- Map Mate UR: `source === "REPORTING_AGENT"` **and** `updateRequestType === "INCORRECT_GENERAL_ERROR"`, open, editable. The case is the description text **before the first `:`**, compared with strict equality.
- Codes → kinds: `MISSING_TRAFFIC_LIGHT` → `trafficLight`, `INCORRECT_ROUTE` → `route`, `INCORRECT_SPEED_LIMIT` → `speedLimit`, `INCORRECT_TURN` → `turn`, `GENERAL_MAP_UPDATE` → `general`. Any other code → no question.
- `trafficLight` only when `isKnownOffFreeway` (closest loaded road known and not a freeway). The other kinds ignore the road.
- **No question once anyone but Map_Team has commented** (`hasDiscussion`, which already treats `userName === null` as Map_Team), neither in a batch nor one by one. There is no override.
- Never asked twice: `wasMessaged(id)` (session) or one of our question bodies found in any comment (`isMapMateQuestion`).
- `askMapMate` calls `addComment` only. It **never** calls `updateResolutionState`; the UR stays open. Its outcome is `"asked"`.
- Batch: same single button, `BATCH_MIN_RANK` (level 3) for Map Mate, order speed cameras → Map Mate → abandoned, `BATCH_CAP` (50) for the whole batch.
- Checkbox `criteria.mapMate`, default `false`; the localStorage key and `version: 1` stay unchanged.
- Kept on purpose: folder `src/speed-camera-urs/`, i18n section `speedCameraUrs`, `SCRIPT_ID`, the `groupScriptTab` key `"speed-camera-urs"`, and the settings key.
- New strings go into **all four** `locales/<lang>/common.json`; `i18n.test.ts` rejects a missing key, an untranslated copy or a lost placeholder.
- Lint is `npx eslint src/speed-camera-urs` (there is no `npm run lint` script). Type-check is `npx tsc --noEmit -p . 2>&1 | grep "^src/"`, which must print nothing (`sitn/` errors are not ours).
- Commits: Conventional Commits, scope `speed-camera-urs`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nothing is ever saved automatically.

## Review Focus

1. **A description whose code is an `Object.prototype` name** (`constructor: …`, `toString: …`): it must give no kind. A plain object lookup would return a function and send a question. Pinned in Task 1.
2. **Our own earlier question comes back with `userName: null`**, as Map_Team's do. `hasDiscussion` would then not see it, and the UR would be asked again after a reload. Pinned in Task 5 (`isMapMateQuestion`).
3. **A comment arriving while the single-UR confirmation is open**: the send must be blocked. Pinned in Task 6.
4. **A Map Mate traffic light whose road is not loaded, or was re-typed as a freeway** after listing: it gets no question. Pinned in Task 5.
5. **Settings saved by the previous build (no `mapMate` field)**: they load with `mapMate: false`, never true. Pinned in Task 3.

---

### Task 1: Detect Map Mate cases

**Files:**
- Modify: `src/speed-camera-urs/detect.ts` (after `MAP_MATE_SOURCE`)
- Modify: `src/speed-camera-urs/fake-sdk.ts` (test helper)
- Test: `src/speed-camera-urs/detect.test.ts`

**Interfaces:**
- Produces:
  - `export type MapMateKind = "trafficLight" | "route" | "speedLimit" | "turn" | "general"`
  - `export const MAP_MATE_KINDS: readonly MapMateKind[]` (fixed order, used to order quotes)
  - `export function descriptionCode(description: string | null): string`
  - `export function mapMateKind(ur: Pick<MapUpdateRequest, "description" | "isOpen" | "isEditable" | "source" | "updateRequestType">): MapMateKind | null`
  - test helper `makeMapMateUr(id: number, code?: string, overrides?: Partial<MapUpdateRequest>): MapUpdateRequest` in `fake-sdk.ts`

- [ ] **Step 1: Add the test helper**

In `src/speed-camera-urs/fake-sdk.ts`, after `makeTrafficLightUr`:

```ts
/** A Map Mate voice report: description starting with `code`, type INCORRECT_GENERAL_ERROR. */
export function makeMapMateUr(
  id: number,
  code = "MISSING_TRAFFIC_LIGHT",
  overrides: Partial<MapUpdateRequest> = {},
): MapUpdateRequest {
  return makeUr(id, {
    source: "REPORTING_AGENT",
    description: `${code}: L'utilisateur a signalé un problème.`,
    ...overrides,
  });
}
```

- [ ] **Step 2: Write the failing tests**

In `src/speed-camera-urs/detect.test.ts`, add `descriptionCode`, `mapMateKind` to the `./detect` import and `makeMapMateUr` to the `./fake-sdk` import, then append:

```ts
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
    expect(mapMateKind(makeMapMateUr(1, "GENERAL_MAP_UPDATE"))).toBe(
      "general",
    );
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/speed-camera-urs/detect.test.ts`
Expected: FAIL, `descriptionCode` / `mapMateKind` are not functions.

- [ ] **Step 4: Implement**

In `src/speed-camera-urs/detect.ts`, after `MAP_MATE_SOURCE`:

```ts
export type MapMateKind =
  | "trafficLight"
  | "route"
  | "speedLimit"
  | "turn"
  | "general";

/** The order quotes and labels follow. */
export const MAP_MATE_KINDS: readonly MapMateKind[] = [
  "trafficLight",
  "route",
  "speedLimit",
  "turn",
  "general",
];

/**
 * Codes Map Mate puts before the first ":" of its description. A Map rather than an
 * object literal: "constructor" or "toString" must not look up a prototype function.
 */
const MAP_MATE_CODES = new Map<string, MapMateKind>([
  [TRAFFIC_LIGHT_PREFIX, "trafficLight"],
  ["INCORRECT_ROUTE", "route"],
  ["INCORRECT_SPEED_LIMIT", "speedLimit"],
  ["INCORRECT_TURN", "turn"],
  ["GENERAL_MAP_UPDATE", "general"],
]);

export function descriptionCode(description: string | null): string {
  return (description ?? "").split(":")[0] ?? "";
}

/**
 * Which question a Map Mate report gets, or null for none. An unknown code gets nothing:
 * a generic question would be worse than silence. The road is not checked here; a traffic
 * light also needs isKnownOffFreeway, which the caller applies.
 */
export function mapMateKind(
  ur: UrFields & Pick<MapUpdateRequest, "source" | "updateRequestType">,
): MapMateKind | null {
  const mapMate =
    ur.isOpen &&
    ur.isEditable &&
    ur.source === MAP_MATE_SOURCE &&
    ur.updateRequestType === "INCORRECT_GENERAL_ERROR";
  if (!mapMate) return null;
  return MAP_MATE_CODES.get(descriptionCode(ur.description)) ?? null;
}
```

(`TRAFFIC_LIGHT_PREFIX` is declared above `MAP_MATE_SOURCE` in this file, so it is in scope.)

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/speed-camera-urs/detect.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/speed-camera-urs/detect.ts src/speed-camera-urs/detect.test.ts src/speed-camera-urs/fake-sdk.ts
git commit -m "feat(speed-camera-urs): recognise the Map Mate report codes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Question texts and new strings

**Files:**
- Modify: `locales/en|fr|de|it/common.json` (add keys only; no existing key changes here)
- Modify: `src/speed-camera-urs/message.ts`
- Test: `src/speed-camera-urs/message.test.ts`, `src/speed-camera-urs/i18n.test.ts` (existing gate)

**Interfaces:**
- Consumes: `MapMateKind`, `MAP_MATE_KINDS` (Task 1), `hasDiscussion` (detect.ts).
- Produces:
  - `buildMapMateQuestion(kind: MapMateKind, lang: LocaleCode): string`
  - `isMapMateQuestion(text: string): boolean`
  - `mayAskMapMate(comments: readonly ConversationElement[]): boolean`: no one but Map_Team wrote, and none of our questions is there
  - `kindLabel(kind: MapMateKind): string` (editor's language)
  - New `StringKey`s: `askIntro`, `askBodyTrafficLight`, `askBodyRoute`, `askBodySpeedLimit`, `askBodyTurn`, `askBodyGeneral`, `kindTrafficLight`, `kindRoute`, `kindSpeedLimit`, `kindTurn`, `kindGeneral`, `criterionMapMate`, `sectionMapMate`, `btnAskMapMate`, `dialogSend`, `dlgTitleAsk`, `dlgFactStaysOpen`, `dlgFactFamilyMapMate`, `dlgQuoteLabelKind`, `summaryAsked`, `askedReminder`, `mapMateInfo`, `speedCameraInfo`, `stateNoFamily`.

- [ ] **Step 1: Add the strings**

Save as `/tmp/claude-1000/-workspaces-WME-Switzerland-Helper/1dd81544-ea76-4da5-baf0-c87ada8670ff/scratchpad/mapmate_keys.py` and run `python3 <that path>` from the repo root. It keeps the files' formatting (2-space indent, non-ASCII kept), and `speedCameraInfo` copies each language's current `tabNote`:

```python
import json
NEW = {
"en": {
 "askIntro": "Hello,\n\nThank you for your report.",
 "askBodyTrafficLight": "Could you tell us more about this traffic light? Where exactly is it (junction, street, direction of travel), and is it a permanent one?\n\nIf it was a temporary roadworks light, it is better to report roadworks in the Waze app: other drivers are warned right away.",
 "askBodyRoute": "Could you tell us more about this trip? Where were you coming from and going to, where were you when the problem happened, which route did you expect and which one did Waze suggest?",
 "askBodySpeedLimit": "Could you tell us more about this speed limit? On which stretch is it wrong (from where to where), what is the correct limit, and do you know whether it changed recently, for example after a local decision?",
 "askBodyTurn": "Could you tell us more about this turn? Which street were you driving on, which street did you want to turn into, and where did you actually turn?",
 "askBodyGeneral": "Could you tell us more? Where exactly is the place concerned, and what change should be made to the map?",
 "kindTrafficLight": "Traffic light", "kindRoute": "Route", "kindSpeedLimit": "Speed limit", "kindTurn": "Turn", "kindGeneral": "General",
 "criterionMapMate": "Map Mate: ask for details",
 "sectionMapMate": "Map Mate reports ({{count}})",
 "btnAskMapMate": "Ask for details",
 "dialogSend": "Send",
 "dlgTitleAsk": "Ask for details · UR #{{id}} · {{kind}}",
 "dlgFactStaysOpen": "The UR stays open for their answer.",
 "dlgFactFamilyMapMate": "{{count}} Map Mate: question sent now, the UR stays open",
 "dlgQuoteLabelKind": "Question sent · {{kind}}",
 "summaryAsked": "{{count}} question(s) sent.",
 "askedReminder": "The questions are already sent; the URs stay open, nothing to save.",
 "mapMateInfo": "Map Mate voice reports get a question suited to their case (traffic light, route, speed limit, turn, general) in the reporter's language. The UR stays open for the answer. Nothing is sent once someone other than Map_Team has commented, and a traffic light whose closest road is a freeway is left to the freeway section.",
 "stateNoFamily": "No family ticked: tick at least one below."},
"fr": {
 "askIntro": "Bonjour,\n\nMerci pour votre signalement.",
 "askBodyTrafficLight": "Pourriez-vous nous en dire plus sur ce feu ? Où se trouve-t-il exactement (carrefour, rue, sens de circulation), et s'agit-il d'un feu permanent ?\n\nS'il s'agissait d'un feu de chantier provisoire, il vaut mieux signaler des travaux dans l'application Waze : les autres conducteurs en sont avertis tout de suite.",
 "askBodyRoute": "Pourriez-vous nous en dire plus sur ce trajet ? D'où veniez-vous et où alliez-vous, où vous trouviez-vous quand le problème est survenu, quel itinéraire attendiez-vous et lequel Waze vous a-t-il proposé ?",
 "askBodySpeedLimit": "Pourriez-vous nous en dire plus sur cette limitation de vitesse ? Sur quel tronçon est-elle fausse (de où à où), quelle est la bonne limitation, et savez-vous si elle a changé récemment, par exemple suite à une décision locale ?",
 "askBodyTurn": "Pourriez-vous nous en dire plus sur ce virage ? Sur quelle rue rouliez-vous, dans quelle rue vouliez-vous tourner, et où avez-vous effectivement tourné ?",
 "askBodyGeneral": "Pourriez-vous nous en dire plus ? Où se trouve exactement l'endroit concerné, et quelle modification faudrait-il apporter à la carte ?",
 "kindTrafficLight": "Feu", "kindRoute": "Itinéraire", "kindSpeedLimit": "Vitesse", "kindTurn": "Virage", "kindGeneral": "Général",
 "criterionMapMate": "Map Mate : demander des précisions",
 "sectionMapMate": "Signalements Map Mate ({{count}})",
 "btnAskMapMate": "Demander des précisions",
 "dialogSend": "Envoyer",
 "dlgTitleAsk": "Demander des précisions · UR n° {{id}} · {{kind}}",
 "dlgFactStaysOpen": "L'UR reste ouvert pour sa réponse.",
 "dlgFactFamilyMapMate": "{{count}} Map Mate : question envoyée maintenant, l'UR reste ouvert",
 "dlgQuoteLabelKind": "Question envoyée · {{kind}}",
 "summaryAsked": "{{count}} question(s) envoyée(s).",
 "askedReminder": "Les questions sont déjà parties ; les UR restent ouverts, rien à sauvegarder.",
 "mapMateInfo": "Les signalements vocaux Map Mate reçoivent une question adaptée à leur cas (feu, itinéraire, vitesse, virage, général) dans la langue du rapporteur. L'UR reste ouvert pour sa réponse. Rien n'est envoyé dès qu'une autre personne que Map_Team a commenté, et un feu dont la route la plus proche est une autoroute reste à la section des feux sur autoroute.",
 "stateNoFamily": "Aucune famille cochée : cochez-en au moins une ci-dessous."},
"de": {
 "askIntro": "Guten Tag,\n\nDanke für Ihre Meldung.",
 "askBodyTrafficLight": "Können Sie uns mehr über diese Ampel sagen? Wo genau steht sie (Kreuzung, Strasse, Fahrtrichtung), und ist sie dauerhaft?\n\nFalls es sich um eine provisorische Baustellenampel handelte, melden Sie besser eine Baustelle in der Waze-App: So werden andere Fahrer sofort gewarnt.",
 "askBodyRoute": "Können Sie uns mehr über diese Fahrt sagen? Woher kamen Sie und wohin wollten Sie, wo befanden Sie sich, als das Problem auftrat, welche Route haben Sie erwartet und welche hat Waze Ihnen vorgeschlagen?",
 "askBodySpeedLimit": "Können Sie uns mehr über diese Geschwindigkeitsbegrenzung sagen? Auf welchem Abschnitt ist sie falsch (von wo bis wo), welche ist die richtige, und wissen Sie, ob sie kürzlich geändert wurde, zum Beispiel durch einen lokalen Entscheid?",
 "askBodyTurn": "Können Sie uns mehr über dieses Abbiegen sagen? Auf welcher Strasse waren Sie unterwegs, in welche Strasse wollten Sie abbiegen, und wo sind Sie tatsächlich abgebogen?",
 "askBodyGeneral": "Können Sie uns mehr dazu sagen? Wo genau befindet sich die betroffene Stelle, und was sollte auf der Karte geändert werden?",
 "kindTrafficLight": "Ampel", "kindRoute": "Strecke", "kindSpeedLimit": "Tempolimit", "kindTurn": "Abbiegen", "kindGeneral": "Allgemein",
 "criterionMapMate": "Map Mate: Details erfragen",
 "sectionMapMate": "Map-Mate-Meldungen ({{count}})",
 "btnAskMapMate": "Details erfragen",
 "dialogSend": "Senden",
 "dlgTitleAsk": "Details erfragen · UR Nr. {{id}} · {{kind}}",
 "dlgFactStaysOpen": "Die UR bleibt für die Antwort offen.",
 "dlgFactFamilyMapMate": "{{count}} Map Mate: Frage wird jetzt gesendet, die UR bleibt offen",
 "dlgQuoteLabelKind": "Gesendete Frage · {{kind}}",
 "summaryAsked": "{{count}} Frage(n) gesendet.",
 "askedReminder": "Die Fragen sind bereits gesendet; die URs bleiben offen, nichts zu speichern.",
 "mapMateInfo": "Sprachmeldungen von Map Mate erhalten eine zum Fall passende Frage (Ampel, Strecke, Tempolimit, Abbiegen, Allgemein) in der Sprache der meldenden Person. Die UR bleibt für die Antwort offen. Es wird nichts gesendet, sobald jemand anderes als Map_Team kommentiert hat, und eine Ampel, deren nächste Strasse eine Autobahn ist, bleibt im Abschnitt der Autobahn-Ampeln.",
 "stateNoFamily": "Keine Gruppe angekreuzt: Kreuzen Sie unten mindestens eine an."},
"it": {
 "askIntro": "Buongiorno,\n\nGrazie per la segnalazione.",
 "askBodyTrafficLight": "Potrebbe dirci di più su questo semaforo? Dove si trova esattamente (incrocio, via, senso di marcia) ed è permanente?\n\nSe si trattava di un semaforo di cantiere provvisorio, è meglio segnalare dei lavori nell'app Waze: gli altri conducenti vengono avvisati subito.",
 "askBodyRoute": "Potrebbe dirci di più su questo tragitto? Da dove veniva e dove andava, dove si trovava quando si è verificato il problema, quale percorso si aspettava e quale le ha proposto Waze?",
 "askBodySpeedLimit": "Potrebbe dirci di più su questo limite di velocità? Su quale tratto è sbagliato (da dove a dove), qual è il limite corretto, e sa se è cambiato di recente, per esempio in seguito a una decisione locale?",
 "askBodyTurn": "Potrebbe dirci di più su questa svolta? Su quale strada stava viaggiando, in quale strada voleva svoltare e dove ha effettivamente svoltato?",
 "askBodyGeneral": "Potrebbe dirci di più? Dove si trova esattamente il luogo interessato e quale modifica andrebbe apportata alla mappa?",
 "kindTrafficLight": "Semaforo", "kindRoute": "Percorso", "kindSpeedLimit": "Velocità", "kindTurn": "Svolta", "kindGeneral": "Generale",
 "criterionMapMate": "Map Mate: chiedere dettagli",
 "sectionMapMate": "Segnalazioni Map Mate ({{count}})",
 "btnAskMapMate": "Chiedere dettagli",
 "dialogSend": "Inviare",
 "dlgTitleAsk": "Chiedere dettagli · UR n. {{id}} · {{kind}}",
 "dlgFactStaysOpen": "La UR resta aperta per la risposta.",
 "dlgFactFamilyMapMate": "{{count}} Map Mate: domanda inviata ora, la UR resta aperta",
 "dlgQuoteLabelKind": "Domanda inviata · {{kind}}",
 "summaryAsked": "{{count}} domanda/e inviata/e.",
 "askedReminder": "Le domande sono già state inviate; le UR restano aperte, niente da salvare.",
 "mapMateInfo": "Le segnalazioni vocali Map Mate ricevono una domanda adatta al caso (semaforo, percorso, velocità, svolta, generale) nella lingua di chi ha segnalato. La UR resta aperta per la risposta. Non viene inviato nulla se qualcuno diverso da Map_Team ha commentato, e un semaforo la cui strada più vicina è un'autostrada resta nella sezione dei semafori in autostrada.",
 "stateNoFamily": "Nessuna famiglia selezionata: selezionatene almeno una qui sotto."},
}
for lang, keys in NEW.items():
    path = f"locales/{lang}/common.json"
    raw = open(path, encoding="utf-8").read()
    data = json.loads(raw)
    section = data["speedCameraUrs"]
    section.update(keys)
    section["speedCameraInfo"] = section["tabNote"]
    out = json.dumps(data, ensure_ascii=False, indent=2) + ("\n" if raw.endswith("\n") else "")
    open(path, "w", encoding="utf-8").write(out)
```

Then run `git diff --stat locales`: four files, only additions.

- [ ] **Step 2: Write the failing message tests**

In `src/speed-camera-urs/message.test.ts`, add `buildMapMateQuestion`, `isMapMateQuestion`, `kindLabel`, `mayAskMapMate` to the `./message` import, `MAP_MATE_KINDS` from `./detect`, and append:

```ts
describe("buildMapMateQuestion", () => {
  it("greets, asks the case's question and signs, in short paragraphs", () => {
    expect(buildMapMateQuestion("turn", "fr")).toBe(
      "Bonjour,\n\nMerci pour votre signalement.\n\n" +
        "Pourriez-vous nous en dire plus sur ce virage ? Sur quelle rue rouliez-vous, dans quelle rue vouliez-vous tourner, et où avez-vous effectivement tourné ?\n\n" +
        "Belle journée et bonne route.\nLa communauté des éditeurs bénévoles",
    );
  });

  it("tells a roadworks light to report roadworks instead", () => {
    expect(buildMapMateQuestion("trafficLight", "de")).toContain(
      "Baustellenampel",
    );
  });

  it("has a distinct text for every case in every language", () => {
    const texts = MAP_MATE_KINDS.flatMap((kind) =>
      (["fr", "de", "it", "en"] as const).map((lang) =>
        buildMapMateQuestion(kind, lang),
      ),
    );
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("isMapMateQuestion", () => {
  it("recognises every case in every language, however the spaces came back", () => {
    for (const kind of MAP_MATE_KINDS) {
      for (const lang of ["fr", "de", "it", "en"] as const) {
        const sent = buildMapMateQuestion(kind, lang).replace(/\n+/g, " ");
        expect(isMapMateQuestion(sent)).toBe(true);
      }
    }
  });

  it("does not take the speed-camera message or a reply for a question", () => {
    expect(isMapMateQuestion(buildMessage("fr"))).toBe(false);
    expect(isMapMateQuestion("C'est au carrefour de la gare")).toBe(false);
  });
});

describe("mayAskMapMate", () => {
  const mapTeam = { createdOn: 0, text: "auto", userName: "Map_Team" };
  const nameless = { createdOn: 0, text: "auto", userName: null };
  const someone = { createdOn: 0, text: "hi", userName: "editor" };

  it("allows an empty conversation, or Map_Team's alone", () => {
    expect(mayAskMapMate([])).toBe(true);
    expect(mayAskMapMate([mapTeam, nameless])).toBe(true);
  });

  it("refuses once someone else wrote", () => {
    expect(mayAskMapMate([mapTeam, someone])).toBe(false);
  });

  it("refuses when our question is already there, even without a name", () => {
    const ours = { ...nameless, text: buildMapMateQuestion("route", "it") };
    expect(mayAskMapMate([ours])).toBe(false);
  });
});

describe("kindLabel", () => {
  it("names the case in the editor's language", () => {
    expect(kindLabel("speedLimit")).toBe("Speed limit");
  });
});
```

(`buildMessage` is already imported in this file.)

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/speed-camera-urs/message.test.ts src/speed-camera-urs/i18n.test.ts`
Expected: message tests FAIL (functions missing); i18n tests PASS.

- [ ] **Step 4: Implement**

In `src/speed-camera-urs/message.ts`:
- imports become:
  ```ts
  import type { ConversationElement } from "wme-sdk-typings";
  import { hasDiscussion, type MapMateKind } from "./detect";
  import { t, tIn, type LocaleCode, type StringKey } from "./i18n";
  ```
- append:

```ts
const ASK_BODY: Record<MapMateKind, StringKey> = {
  trafficLight: "askBodyTrafficLight",
  route: "askBodyRoute",
  speedLimit: "askBodySpeedLimit",
  turn: "askBodyTurn",
  general: "askBodyGeneral",
};

const KIND_LABEL: Record<MapMateKind, StringKey> = {
  trafficLight: "kindTrafficLight",
  route: "kindRoute",
  speedLimit: "kindSpeedLimit",
  turn: "kindTurn",
  general: "kindGeneral",
};

/** Same layout as buildMessage: greeting, the case's question, the community's signature. */
export function buildMapMateQuestion(kind: MapMateKind, lang: LocaleCode): string {
  const intro = tIn(lang, "askIntro");
  const body = tIn(lang, ASK_BODY[kind]);
  const signature = tIn(lang, "messageSignature");
  return `${intro}\n\n${body}\n\n${signature}`;
}

/**
 * Whether a comment holds one of our questions, any case, any language. The body is
 * matched, as in isOfficialMessage. It matters because hasDiscussion does not see a comment
 * that comes back without a name, and ours might.
 */
export function isMapMateQuestion(text: string): boolean {
  const comment = collapseSpaces(text);
  const bodies = Object.values(ASK_BODY);
  return ORDER.some((lang) =>
    bodies.some((key) => comment.includes(collapseSpaces(tIn(lang, key)))),
  );
}

/** Nobody but Map_Team wrote, and our question is not there yet. */
export function mayAskMapMate(
  comments: readonly ConversationElement[],
): boolean {
  const asked = comments.some((comment) => isMapMateQuestion(comment.text));
  return !hasDiscussion(comments) && !asked;
}

export function kindLabel(kind: MapMateKind): string {
  return t(KIND_LABEL[kind]);
}
```

(`collapseSpaces` and `ORDER` already exist in this file. `ORDER` is declared further down, but it is only read when the function runs, so that is fine.)

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/speed-camera-urs/message.test.ts src/speed-camera-urs/i18n.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/speed-camera-urs/message.ts src/speed-camera-urs/message.test.ts locales/en/common.json locales/fr/common.json locales/de/common.json locales/it/common.json
git commit -m "feat(speed-camera-urs): Map Mate questions in four languages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Map Mate checkbox setting

**Files:**
- Modify: `src/speed-camera-urs/settings.ts`
- Test: `src/speed-camera-urs/settings.test.ts`

**Interfaces:**
- Produces: `Criteria.mapMate: boolean`, `DEFAULT_CRITERIA.mapMate === false`.

- [ ] **Step 1: Update and add tests**

In `src/speed-camera-urs/settings.test.ts`:
- in "starts with speed cameras and traffic lights on, abandoned off", the expected criteria becomes `{ speedCamera: true, trafficLight: true, stale: false, mapMate: false }`;
- in "merges a partial save with the defaults", add `mapMate: false` to the expected object;
- in "round-trips through the store", the settings literal's criteria becomes `{ speedCamera: false, trafficLight: true, stale: true, mapMate: true }`;
- append to `describe("loadSettings")`:

```ts
  it("keeps Map Mate off for settings saved before it existed", () => {
    const { store } = memoryStore(
      JSON.stringify({
        version: 1,
        criteria: { speedCamera: true, trafficLight: false, stale: true },
      }),
    );
    expect(loadSettings(store).criteria).toEqual({
      speedCamera: true,
      trafficLight: false,
      stale: true,
      mapMate: false,
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/speed-camera-urs/settings.test.ts`
Expected: FAIL (no `mapMate` field).

- [ ] **Step 3: Implement**

In `src/speed-camera-urs/settings.ts`, add `mapMate: boolean;` to `Criteria` and `mapMate: false,` to `DEFAULT_CRITERIA`. Extend the comment above `DEFAULT_CRITERIA`:

```ts
/**
 * Abandoned starts off: checking it reads the conversation of every old UR on screen, one
 * server round trip each, and widens a lot what a single click can close. Map Mate starts
 * off too: it sends messages that cannot be withdrawn.
 */
```

`loadSettings` already walks `Object.keys(criteria)`, so nothing else changes.

In `src/speed-camera-urs/ui/format.test.ts`, the literal `{ speedCamera: false, trafficLight: true, stale: true }` gets `mapMate: false` (type-check only).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/speed-camera-urs/settings.test.ts src/speed-camera-urs/ui/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/speed-camera-urs/settings.ts src/speed-camera-urs/settings.test.ts src/speed-camera-urs/ui/format.test.ts
git commit -m "feat(speed-camera-urs): a Map Mate checkbox, off by default

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The scanner lists Map Mate reports

**Files:**
- Modify: `src/speed-camera-urs/scanner.ts`
- Test: `src/speed-camera-urs/scanner.test.ts`

**Interfaces:**
- Consumes: `mapMateKind`, `MapMateKind`, `isKnownOffFreeway` (detect.ts); `mayAskMapMate` (Task 2); `wasMessaged` (close.ts).
- Produces:
  - `export interface MapMateEntry extends TrafficLightEntry { kind: MapMateKind; state: "pending" | "ready" }`
  - `ScanSnapshot.mapMate: MapMateEntry[]` (oldest first)
  - `scanner.setReadMapMate(on: boolean): void`: sets the flag only, the caller schedules.

- [ ] **Step 1: Write the failing tests**

In `src/speed-camera-urs/scanner.test.ts`, add `makeMapMateUr` to the `./fake-sdk` import and append (it reuses `NOW`, `road`, `mapTeam`, `comment` defined earlier in the file):

```ts
const kindsOf = (snapshot: ScanSnapshot) =>
  snapshot.mapMate.map((e) => [e.id, e.kind, e.state]);

describe("Scanner Map Mate reports", () => {
  it("reads nothing and lists nothing while the box is unchecked", async () => {
    const { sdk, calls } = makeSdk([makeMapMateUr(1, "INCORRECT_ROUTE")]);
    const scanner = new Scanner(sdk, { now: () => NOW });

    await scanner.rescan();

    expect(calls).toEqual([]);
    expect(scanner.getSnapshot().mapMate).toEqual([]);
  });

  it("lists each case, pending until read, and drops one somebody wrote on", async () => {
    const urs = [
      makeMapMateUr(1, "INCORRECT_ROUTE"),
      makeMapMateUr(2, "INCORRECT_TURN"),
      makeMapMateUr(3, "GENERAL_MAP_UPDATE"),
    ];
    const { sdk } = makeSdk(urs, {
      comments: { 2: [mapTeam], 3: [mapTeam, { ...comment, userName: "x" }] },
    });
    const scanner = new Scanner(sdk, { now: () => NOW });
    scanner.setReadMapMate(true);
    const snapshots: ScanSnapshot[] = [];
    scanner.onUpdate((snapshot) => snapshots.push(snapshot));

    await scanner.rescan();

    expect(kindsOf(snapshots[0]!)).toEqual([
      [1, "route", "pending"],
      [2, "turn", "pending"],
      [3, "general", "pending"],
    ]);
    expect(kindsOf(scanner.getSnapshot())).toEqual([
      [1, "route", "ready"],
      [2, "turn", "ready"],
    ]);
  });

  it("asks about a traffic light only once its road is known and not a freeway", async () => {
    const urs = [
      makeMapMateUr(1),
      makeMapMateUr(2, "MISSING_TRAFFIC_LIGHT", {
        geometry: { type: "Point", coordinates: [6.65, 46.6] },
      }),
      makeMapMateUr(3, "MISSING_TRAFFIC_LIGHT", {
        geometry: { type: "Point", coordinates: [6.8, 46.8] },
      }),
    ];
    const segments = [
      makeSegment(3, 46.5001),
      makeSegment(1, 46.6001, [6.64, 6.66]),
    ];
    const scanner = new Scanner(makeSdk(urs, { segments }).sdk, {
      now: () => NOW,
    });
    scanner.setReadMapMate(true);

    await scanner.rescan();

    // 1 sits on the freeway, 2 on a street, 3 has no road loaded.
    expect(scanner.getSnapshot().trafficLights.map((e) => e.id)).toEqual([1]);
    expect(kindsOf(scanner.getSnapshot())).toEqual([
      [2, "trafficLight", "ready"],
    ]);
  });

  it("does not need a road for the other cases", async () => {
    const scanner = new Scanner(
      makeSdk([makeMapMateUr(1, "INCORRECT_SPEED_LIMIT")]).sdk,
      { now: () => NOW },
    );
    scanner.setReadMapMate(true);

    await scanner.rescan();

    expect(kindsOf(scanner.getSnapshot())).toEqual([
      [1, "speedLimit", "ready"],
    ]);
  });

  it("reads speed cameras, then Map Mate, then abandoned URs", async () => {
    const urs = [
      makeUr(1, road),
      makeMapMateUr(2, "INCORRECT_ROUTE"),
      makeUr(3),
    ];
    const { sdk, calls } = makeSdk(urs);
    const scanner = new Scanner(sdk, { now: () => NOW });
    scanner.setReadMapMate(true);
    scanner.setReadStale(true);

    await scanner.rescan();

    expect(calls).toEqual(["details:3", "details:2", "details:1"]);
  });

  it("drops a report this session already asked", async () => {
    const { sdk } = makeSdk([makeMapMateUr(1, "INCORRECT_ROUTE")]);
    const scanner = new Scanner(sdk, { now: () => NOW });
    scanner.setReadMapMate(true);
    await scanner.rescan();
    expect(kindsOf(scanner.getSnapshot())).toEqual([[1, "route", "ready"]]);

    noteMessaged(1);
    await scanner.rescan();

    expect(scanner.getSnapshot().mapMate).toEqual([]);
  });
});
```

(`noteMessaged` is already imported from `./close` in this file. `makeSegment(1, …)` is a road of type 1, a plain street.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/speed-camera-urs/scanner.test.ts`
Expected: FAIL, `setReadMapMate is not a function`.

- [ ] **Step 3: Implement**

In `src/speed-camera-urs/scanner.ts`:

1. Imports: add `mapMateKind`, `type MapMateKind` to the `./detect` import; change the `./message` import to `import { mayAskMapMate, messageLanguage } from "./message";`.

2. Types, after `StaleEntry`:

```ts
/** A Map Mate report and its case. Once someone wrote, or we asked, it leaves the list. */
export interface MapMateEntry extends TrafficLightEntry {
  kind: MapMateKind;
  state: "pending" | "ready";
}

type MapMateCandidate = { ur: MapUpdateRequest; kind: MapMateKind };
```

and add `mapMate: MapMateEntry[];` to `ScanSnapshot`.

3. Fields: next to `staleCache`, add

```ts
  /** true = nobody but Map_Team wrote and we did not ask yet. */
  private mapMateCache = new Map<number, boolean>();
```

change the snapshot initialiser to `{ entries: [], trafficLights: [], mapMate: [], stale: [] }`, and next to `staleCandidates`/`readStale` add

```ts
  private mapMateCandidates: MapMateCandidate[] = [];
  /** Off by default, like readStale: each report costs a round trip, and it sends messages. */
  private readMapMate = false;
```

4. Methods: next to `setReadStale`,

```ts
  setReadMapMate(on: boolean): void {
    this.readMapMate = on;
  }
```

and in `forget()` add `this.mapMateCache.delete(key);`.

5. In `rescan()`, right after the `this.staleCandidates = …;` statement and before `this.publish(found);`:

```ts
    this.mapMateCandidates = this.readMapMate
      ? onScreen.flatMap((ur) => this.mapMateCandidate(ur, segments))
      : [];
```

Between the speed-camera loop and the stale loop, add the Map Mate reads (and change the comment above the stale loop to `// Last: closing an abandoned UR waits, a reporter's question does not.`):

```ts
    // After the speed cameras: those close, these only ask.
    for (const { ur } of this.mapMateCandidates) {
      if (this.mapMateCache.has(ur.id)) continue;
      const comments = await this.readConversation(ur.id, generation);
      if (comments) this.mapMateCache.set(ur.id, mayAskMapMate(comments));
      if (generation !== this.generation) return;
      this.publish(found);
    }
```

6. In `publish()`, add `mapMate: this.mapMateCandidates.flatMap((c) => this.toMapMateEntry(c)),` after `trafficLights`, and add these private methods next to `toStaleEntry`:

```ts
  /**
   * A traffic light is asked about only on a known road that is not a freeway: on a
   * freeway it is likely a speed camera, and on an unloaded road it may be one.
   */
  private mapMateCandidate(
    ur: MapUpdateRequest,
    segments: Parameters<typeof isKnownOffFreeway>[1],
  ): MapMateCandidate[] {
    const kind = mapMateKind(ur);
    if (!kind) return [];
    const lightOnUnknownRoad =
      kind === "trafficLight" && !isKnownOffFreeway(ur, segments);
    return lightOnUnknownRoad ? [] : [{ ur, kind }];
  }

  private toMapMateEntry({ ur, kind }: MapMateCandidate): MapMateEntry[] {
    const verdict = this.mapMateCache.get(ur.id);
    if (verdict === false || wasMessaged(ur.id)) return [];
    const state = verdict === true ? "ready" : "pending";
    return [{ ...this.basics(ur), kind, state }];
  }
```

(Segments are already loaded whenever a `MISSING_TRAFFIC_LIGHT` UR is on screen, Map Mate ones included, since `isTrafficLightUr` checks only the prefix.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/speed-camera-urs`
Expected: PASS, old and new.

- [ ] **Step 5: Commit**

```bash
git add src/speed-camera-urs/scanner.ts src/speed-camera-urs/scanner.test.ts
git commit -m "feat(speed-camera-urs): list Map Mate reports when asked to

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Asking, and Map Mate in the batch

**Files:**
- Modify: `src/speed-camera-urs/close.ts`
- Test: `src/speed-camera-urs/close.test.ts`, `src/speed-camera-urs/flows.test.ts` (literal updates only)

**Interfaces:**
- Consumes: `mapMateKind` (Task 1), `buildMapMateQuestion`, `mayAskMapMate` (Task 2).
- Produces:
  - `CloseOutcome` gains `{ id: number; result: "asked" }`
  - `askMapMate(sdk: WmeSDK, id: number): Promise<CloseOutcome>`
  - `BatchRequest` becomes `{ speedCamera: readonly number[]; mapMate: readonly number[]; stale: readonly number[] }` (**all required**)
  - `summarize` counts `"asked"` (`summaryAsked`) and ends with `askedReminder` when nothing was closed but questions left

- [ ] **Step 1: Update existing literals**

Every `BatchRequest` literal in `src/speed-camera-urs/close.test.ts` and `src/speed-camera-urs/flows.test.ts` gets `mapMate: []`. List them with `grep -n "speedCamera:" src/speed-camera-urs/close.test.ts src/speed-camera-urs/flows.test.ts` (14 places). Add `mapMate: [],` right after each `speedCamera: …`, including in the `toEqual({ speedCamera: [], stale: [] })` expectation of "treats an unknown rank as insufficient".

- [ ] **Step 2: Write the failing tests**

In `src/speed-camera-urs/close.test.ts`, add `askMapMate` to the `./close` import, `makeMapMateUr` to the `./fake-sdk` import and `buildMapMateQuestion` to the `./message` import. Append (reuses `NOW`, `road`, `mapTeam`, `comment`):

```ts
describe("askMapMate", () => {
  it("sends the case's question in the reporter's language and leaves the UR open", async () => {
    const ur = makeMapMateUr(1, "INCORRECT_ROUTE", {
      userPreferences: { language: "deutsch" } as never,
    });
    const { sdk, calls, sent } = makeSdk([ur]);

    expect(await askMapMate(sdk, 1)).toEqual({ id: 1, result: "asked" });
    expect(calls).toEqual(["details:1", "comment:1"]);
    expect(sent).toEqual([{ id: 1, text: buildMapMateQuestion("route", "de") }]);
    expect(ur.isOpen).toBe(true);
    expect(wasMessaged(1)).toBe(true);
  });

  it("goes ahead with Map_Team's comments, nameless ones included", async () => {
    const nameless = { ...mapTeam, userName: null };
    const { sdk } = makeSdk([makeMapMateUr(1, "INCORRECT_TURN")], {
      comments: { 1: [mapTeam, nameless] },
    });

    expect(await askMapMate(sdk, 1)).toEqual({ id: 1, result: "asked" });
  });

  it("sends nothing once someone else has commented", async () => {
    const { sdk, sent } = makeSdk([makeMapMateUr(1, "INCORRECT_TURN")], {
      comments: { 1: [{ ...comment, userName: "reporter" }] },
    });

    expect(await askMapMate(sdk, 1)).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(sent).toEqual([]);
  });

  it("never asks twice: not in this session, not after a reload", async () => {
    const { sdk, sent } = makeSdk([makeMapMateUr(1, "INCORRECT_ROUTE")]);
    await askMapMate(sdk, 1);
    expect((await askMapMate(sdk, 1)).result).toBe("skipped");
    expect(sent).toHaveLength(1);

    resetMessagedForTests();
    const ours = {
      createdOn: 0,
      text: buildMapMateQuestion("route", "fr"),
      userName: null,
    };
    const reloaded = makeSdk([makeMapMateUr(2, "INCORRECT_ROUTE")], {
      comments: { 2: [ours] },
    });
    expect((await askMapMate(reloaded.sdk, 2)).result).toBe("skipped");
    expect(reloaded.sent).toEqual([]);
  });

  it("asks about a traffic light only on a known road that is not a freeway", async () => {
    const street = makeSdk([makeMapMateUr(1)], {
      segments: [makeSegment(1, 46.5001)],
    });
    expect((await askMapMate(street.sdk, 1)).result).toBe("asked");

    for (const segments of [[], [makeSegment(3, 46.5001)]]) {
      const { sdk, calls } = makeSdk([makeMapMateUr(2)], { segments });
      expect(await askMapMate(sdk, 2)).toEqual({
        id: 2,
        result: "skipped",
        reason: "skipGone",
      });
      expect(calls).toEqual([]);
    }
  });

  it("skips, reading nothing, a UR that is not a Map Mate case any more", async () => {
    const urs = [
      makeMapMateUr(1, "INCORRECT_ROUTE", { isOpen: false }),
      makeUr(2, road),
    ];
    const { sdk, calls } = makeSdk(urs);

    for (const id of [1, 2, 3]) {
      expect(await askMapMate(sdk, id)).toEqual({
        id,
        result: "skipped",
        reason: "skipGone",
      });
    }
    expect(calls).toEqual([]);
  });

  it("writes nothing when editing is not allowed, and reports a failed send", async () => {
    const locked = makeSdk([makeMapMateUr(1, "INCORRECT_ROUTE")], {
      editingAllowed: false,
    });
    expect((await askMapMate(locked.sdk, 1)).result).toBe("failed");
    expect(locked.calls).toEqual([]);

    const failing = makeSdk([makeMapMateUr(1, "INCORRECT_ROUTE")], {
      failComment: [1],
    });
    expect(await askMapMate(failing.sdk, 1)).toEqual({
      id: 1,
      result: "failed",
      reason: "errComment",
    });
    expect(wasMessaged(1)).toBe(false);
  });
});

describe("closeMany with Map Mate reports", () => {
  it("asks at level 3, between speed cameras and abandoned URs", async () => {
    const urs = [makeUr(1), makeMapMateUr(2, "INCORRECT_ROUTE"), makeUr(3, road)];
    const { sdk } = makeSdk(urs, { rank: 3 });

    const outcomes = await closeMany(
      sdk,
      { speedCamera: [1], mapMate: [2], stale: [3] },
      NOW,
    );

    expect(outcomes?.map((o) => [o.id, o.result])).toEqual([
      [1, "closed"],
      [2, "asked"],
      [3, "closed"],
    ]);
  });

  it("refuses a Map Mate batch below level 3", async () => {
    const { sdk, calls } = makeSdk([makeMapMateUr(1, "INCORRECT_ROUTE")], {
      rank: 1,
    });

    expect(
      await closeMany(sdk, { speedCamera: [], mapMate: [1], stale: [] }, NOW),
    ).toBeNull();
    expect(calls).toEqual([]);
  });

  it("shares the cap: speed cameras, then Map Mate, then abandoned", async () => {
    const cameras = Array.from({ length: 45 }, (_, i) => makeUr(i + 1));
    const reports = Array.from({ length: 10 }, (_, i) =>
      makeMapMateUr(i + 101, "INCORRECT_ROUTE"),
    );
    const old = [makeUr(201, road)];
    const { sdk } = makeSdk([...cameras, ...reports, ...old], { rank: 3 });

    const outcomes = await closeMany(
      sdk,
      {
        speedCamera: cameras.map((u) => u.id),
        mapMate: reports.map((u) => u.id),
        stale: [201],
      },
      NOW,
    );

    expect(outcomes).toHaveLength(BATCH_CAP);
    expect(outcomes?.slice(45).map((o) => o.id)).toEqual([
      101, 102, 103, 104, 105,
    ]);
  });
});

describe("summarize with questions", () => {
  it("counts the questions and says there is nothing to save", () => {
    const text = summarize([{ id: 1, result: "asked" }]);
    expect(text).toContain("1 question(s) sent.");
    expect(text).toContain("nothing to save");
    expect(text).not.toContain("UR #1");
  });

  it("still asks to save when something was also closed", () => {
    const text = summarize([
      { id: 1, result: "asked" },
      { id: 2, result: "closed" },
    ]);
    expect(text).toContain("Save to record the closures.");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/speed-camera-urs/close.test.ts`
Expected: FAIL (`askMapMate` missing, `mapMate` ignored by `closeMany`).

- [ ] **Step 4: Implement**

In `src/speed-camera-urs/close.ts`:

1. Imports: add `mapMateKind` to the `./detect` import. Change the `./message` import to `import { buildMapMateQuestion, buildMessage, isOfficialMessage, mayAskMapMate, messageLanguage } from "./message";`.

2. `CloseOutcome`:

```ts
export type CloseOutcome =
  | { id: number; result: "closed" }
  /** A Map Mate report was asked for details; nothing was closed. */
  | { id: number; result: "asked" }
  | { id: number; result: "skipped"; reason: SkipReason }
  | { id: number; result: "failed"; reason: FailReason };
```

3. `BatchRequest`, `allowedBatch`, `capBatch`:

```ts
export interface BatchRequest {
  speedCamera: readonly number[];
  mapMate: readonly number[];
  stale: readonly number[];
}

/** Each family the editor lacks the rank for is emptied, the others go through. */
export function allowedBatch(sdk: WmeSDK, request: BatchRequest): BatchRequest {
  const level3 = canBatch(sdk);
  return {
    speedCamera: level3 ? request.speedCamera : [],
    mapMate: level3 ? request.mapMate : [],
    stale: canBatchStale(sdk) ? request.stale : [],
  };
}

/** Speed cameras first, then the reporters we ask; abandoned URs can wait. */
export function capBatch(request: BatchRequest): BatchRequest {
  const speedCamera = request.speedCamera.slice(0, BATCH_CAP);
  let room = BATCH_CAP - speedCamera.length;
  const mapMate = request.mapMate.slice(0, room);
  room -= mapMate.length;
  const stale = request.stale.slice(0, room);
  return { speedCamera, mapMate, stale };
}

function batchSize(request: BatchRequest): number {
  return (
    request.speedCamera.length + request.mapMate.length + request.stale.length
  );
}
```

4. After `closeStale`, add:

```ts
/**
 * Ask a Map Mate reporter for details: one comment, and the UR stays open for the answer.
 * updateResolutionState is never called here.
 *
 * Everything is re-read right before sending, as in closeOne: the comment cannot be
 * withdrawn. There is no way to force it: once anyone but Map_Team has written, a canned
 * question would talk over them.
 */
export async function askMapMate(
  sdk: WmeSDK,
  id: number,
): Promise<CloseOutcome> {
  if (!sdk.Editing.isEditingAllowed())
    return { id, result: "failed", reason: "errNotAllowed" };

  const urs = sdk.DataModel.MapUpdateRequests;
  const ur = urs.getById({ mapUpdateRequestId: id });
  const kind = ur ? mapMateKind(ur) : null;
  if (!ur || !kind) return { id, result: "skipped", reason: "skipGone" };
  // On a freeway it is likely a speed camera; on an unloaded road it may be one.
  const lightOnUnknownRoad =
    kind === "trafficLight" &&
    !isKnownOffFreeway(ur, sdk.DataModel.Segments.getAll());
  if (lightOnUnknownRoad) return { id, result: "skipped", reason: "skipGone" };

  if (inFlight.has(id))
    return { id, result: "skipped", reason: "skipConversation" };
  inFlight.add(id);
  try {
    let comments: ConversationElement[];
    try {
      const details = await urs.getUpdateRequestDetails({
        mapUpdateRequestId: id,
      });
      if (!details) return { id, result: "failed", reason: "errDetails" };
      comments = details.comments;
    } catch (err) {
      log.warn(`Could not read the conversation of UR ${id}`, err);
      return { id, result: "failed", reason: "errDetails" };
    }
    if (wasMessaged(id) || !mayAskMapMate(comments))
      return { id, result: "skipped", reason: "skipConversation" };

    const lang = messageLanguage(ur.userPreferences?.language);
    try {
      await urs.addComment({
        mapUpdateRequestId: id,
        text: buildMapMateQuestion(kind, lang),
      });
    } catch (err) {
      log.warn(`Could not send the question to UR ${id}`, err);
      return { id, result: "failed", reason: "errComment" };
    }
    noteMessaged(id);
    return { id, result: "asked" };
  } finally {
    inFlight.delete(id);
  }
}
```

5. `closeMany`: replace the `asked`/`kept` lines and the loops:

```ts
  const allowed = allowedBatch(sdk, request);
  if (batchSize(request) > 0 && batchSize(allowed) === 0) return null;

  const batch = capBatch(allowed);
  const outcomes: CloseOutcome[] = [];
  // One at a time: gentler on the server, and a failure costs one UR rather than a burst.
  for (const id of batch.speedCamera) {
    outcomes.push(await closeOne(sdk, id, { allowConversation: false }));
  }
  for (const id of batch.mapMate) {
    outcomes.push(await askMapMate(sdk, id));
  }
  for (const id of batch.stale) {
    outcomes.push(await closeStale(sdk, id, now));
  }
  return outcomes;
```

6. `summarize`:

```ts
export function summarize(
  outcomes: readonly CloseOutcome[],
  { messagesSent = true }: { messagesSent?: boolean } = {},
): string {
  const count = (result: CloseOutcome["result"]) =>
    outcomes.filter((outcome) => outcome.result === result).length;
  const lines = [
    t("summary", {
      closed: count("closed"),
      skipped: count("skipped"),
      failed: count("failed"),
    }),
  ];
  if (count("asked") > 0) lines.push(t("summaryAsked", { count: count("asked") }));
  for (const outcome of outcomes) {
    if (outcome.result === "closed" || outcome.result === "asked") continue;
    lines.push(t("summaryLine", { id: outcome.id, reason: t(outcome.reason) }));
  }
  // A question alone leaves nothing in the edit stack: there is nothing to save.
  const reminder = messagesSent ? "saveReminder" : "saveReminderNoMessage";
  if (count("closed") > 0) lines.push("", t(reminder));
  else if (count("asked") > 0) lines.push("", t("askedReminder"));
  return lines.join("\n");
}
```

7. `runCloseSelected`: replace the `asked`/`kept` lines and the rank message:

```ts
  const allowed = allowedBatch(sdk, request);
  if (batchSize(request) > 0 && batchSize(allowed) === 0) {
    const level3Asked = request.speedCamera.length + request.mapMate.length > 0;
    const minRank = level3Asked ? BATCH_MIN_RANK : STALE_BATCH_MIN_RANK;
    await notify(t("errBatchRank", { level: minRank + 1 }));
    return null;
  }
  const batch = capBatch(allowed);
  if (batchSize(batch) === 0) return [];
```

(The confirmation inside `withCloseLock` is updated in Task 6; leave it as is for now.)

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run src/speed-camera-urs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/speed-camera-urs/close.ts src/speed-camera-urs/close.test.ts src/speed-camera-urs/flows.test.ts
git commit -m "feat(speed-camera-urs): ask Map Mate reporters, alone or in the level-3 batch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Confirmations that quote several texts, and the flows

**Files:**
- Modify: `src/speed-camera-urs/confirm-spec.ts`, `src/speed-camera-urs/ui/dialog.ts`, `src/speed-camera-urs/close.ts`, `locales/*/common.json` (`dlgTitleSelected` text)
- Test: `src/speed-camera-urs/confirm-spec.test.ts`, `src/speed-camera-urs/flows.test.ts`, `src/speed-camera-urs/ui/dialog.test.ts`

**Interfaces:**
- Consumes: `askMapMate`, `BatchRequest` (Task 5); `mapMateKind`, `MapMateKind`, `MAP_MATE_KINDS` (Task 1); `buildMapMateQuestion`, `kindLabel` (Task 2).
- Produces:
  - `export interface QuoteBlock { label: string; hint?: string; options: QuoteOption[] }`; `ConfirmSpec.quotes?: QuoteBlock[]` (**was a single object**)
  - `askMapMateSpec(id: number, kind: MapMateKind, lang: LocaleCode): ConfirmSpec`
  - `closeSelectedSpec(speedCameraLangs: readonly LocaleCode[], mapMate: ReadonlyArray<{ kind: MapMateKind; lang: LocaleCode }>, staleCount: number, editorLang: LocaleCode): ConfirmSpec` (**new 2nd parameter**)
  - `runAskMapMate(sdk: WmeSDK, id: number, prompts?: Prompts): Promise<CloseOutcome | null>`

- [ ] **Step 1: Update existing tests to the new shapes**

```bash
sed -i 's/quotes?\.options/quotes?.[0]?.options/g; s/quotes?\.hint/quotes?.[0]?.hint/g' \
  src/speed-camera-urs/confirm-spec.test.ts src/speed-camera-urs/flows.test.ts
```

Then by hand:
- in `confirm-spec.test.ts`, each `closeSelectedSpec(a, n, lang)` call becomes `closeSelectedSpec(a, [], n, lang)` (6 calls), and `expect(spec.title).toBe("Close 5 UR(s)")` becomes `toBe("Handle 5 UR(s)")`;
- in `ui/dialog.test.ts`, `closeSelectedSpec(["fr", "fr", "de"], 0, "fr")` becomes `closeSelectedSpec(["fr", "fr", "de"], [], 0, "fr")`.

- [ ] **Step 2: Write the failing tests**

`src/speed-camera-urs/confirm-spec.test.ts`: add `askMapMateSpec` to the `./confirm-spec` import and `buildMapMateQuestion` to the `./message` import, then append:

```ts
describe("askMapMateSpec", () => {
  it("names the case, says the UR stays open and quotes the exact question", () => {
    const spec = askMapMateSpec(7, "route", "de");

    expect(spec.title).toBe("Ask for details · UR #7 · Route");
    expect(spec.facts).toEqual([
      "The message below goes to the reporter now.",
      "The UR stays open for their answer.",
    ]);
    expect(spec.quotes?.[0]?.options).toEqual([
      { lang: "de", text: buildMapMateQuestion("route", "de") },
    ]);
    expect(spec.warning).toContain("cannot be withdrawn");
    expect(spec.confirmLabel).toBe("Send");
    expect(spec.previousComment).toBeUndefined();
  });
});

describe("closeSelectedSpec with Map Mate", () => {
  it("adds a family line and one quote per case, in a fixed order", () => {
    const spec = closeSelectedSpec(
      ["fr"],
      [
        { kind: "route", lang: "de" },
        { kind: "trafficLight", lang: "fr" },
        { kind: "route", lang: "fr" },
      ],
      2,
      "fr",
    );

    expect(spec.title).toBe("Handle 6 UR(s)");
    expect(spec.facts).toEqual([
      "1 speed camera(s): message sent now, then closed as Not identified",
      "3 Map Mate: question sent now, the UR stays open",
      "2 abandoned: closed as Not identified, without any message",
    ]);
    expect(spec.quotes?.map((block) => block.label)).toEqual([
      "Message sent",
      "Question sent · Traffic light",
      "Question sent · Route",
    ]);
    expect(spec.quotes?.[2]?.options.map((o) => o.lang)).toEqual(["fr", "de"]);
    expect(spec.warning).toContain("cannot be withdrawn");
  });

  it("labels the button Send when only questions go", () => {
    const spec = closeSelectedSpec([], [{ kind: "turn", lang: "it" }], 0, "fr");

    expect(spec.confirmLabel).toBe("Send");
    expect(spec.warning).toContain("cannot be withdrawn");
  });
});
```

`src/speed-camera-urs/ui/dialog.test.ts`: append inside `describe("showConfirm")`:

```ts
  it("shows one quotation per quoted text", () => {
    const { host, mounted } = makeHost();
    void showConfirm(
      closeSelectedSpec(["fr"], [{ kind: "turn", lang: "fr" }], 0, "fr"),
      host,
    );

    expect(findAll(mounted[0]!, "scu-quote").map((q) => q.textContent)).toEqual([
      buildMessage("fr"),
      buildMapMateQuestion("turn", "fr"),
    ]);
  });
```

(add `buildMapMateQuestion` to its `../message` import).

`src/speed-camera-urs/flows.test.ts`: add `runAskMapMate` to the `./close` import, `makeMapMateUr` to the `./fake-sdk` import and `buildMapMateQuestion` to the `./message` import, then append:

```ts
describe("runAskMapMate", () => {
  it("shows the exact question, sends it and leaves the UR open", async () => {
    const ur = makeMapMateUr(1, "INCORRECT_SPEED_LIMIT");
    const { sdk, sent } = makeSdk([ur]);
    const confirm = accept();

    const outcome = await runAskMapMate(sdk, 1, { confirm, notify: silent() });

    expect(outcome).toEqual({ id: 1, result: "asked" });
    expect(specOf(confirm).quotes?.[0]?.options[0]?.text).toBe(
      buildMapMateQuestion("speedLimit", "fr"),
    );
    expect(sent.map((s) => s.text)).toEqual([
      buildMapMateQuestion("speedLimit", "fr"),
    ]);
    expect(ur.isOpen).toBe(true);
  });

  it("sends nothing when someone comments while the dialog is open", async () => {
    const comments: Record<number, ConversationElement[]> = {};
    const { sdk, sent } = makeSdk([makeMapMateUr(1, "INCORRECT_TURN")], {
      comments,
    });
    const confirm = vi.fn(async () => {
      comments[1] = [{ ...comment, userName: "reporter" }];
      return true;
    });
    const notify = silent();

    const outcome = await runAskMapMate(sdk, 1, { confirm, notify });

    expect(outcome).toEqual({
      id: 1,
      result: "skipped",
      reason: "skipConversation",
    });
    expect(sent).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("does nothing when the editor declines, or for a UR that is no Map Mate case", async () => {
    const { sdk, calls } = makeSdk([makeMapMateUr(1, "INCORRECT_ROUTE"), makeUr(2)]);

    expect(
      await runAskMapMate(sdk, 1, { confirm: decline(), notify: silent() }),
    ).toBeNull();
    expect(
      await runAskMapMate(sdk, 2, { confirm: accept(), notify: silent() }),
    ).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("runCloseSelected with Map Mate", () => {
  it("quotes the question and reports it in the summary", async () => {
    const { sdk, sent } = makeSdk([makeUr(1), makeMapMateUr(2, "INCORRECT_ROUTE")]);
    const confirm = accept();
    const notify = silent();

    await runCloseSelected(
      sdk,
      { speedCamera: [1], mapMate: [2], stale: [] },
      { confirm, notify },
      NOW,
    );

    expect(specOf(confirm).quotes).toHaveLength(2);
    expect(sent.map((s) => s.id)).toEqual([1, 2]);
    expect(notify.mock.calls[0]?.[0]).toContain("1 question(s) sent.");
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/speed-camera-urs`
Expected: FAIL. `askMapMateSpec` and `runAskMapMate` are missing, `quotes?.[0]` is undefined because `quotes` is still an object, and the titles are still "Close …".

- [ ] **Step 4: Implement the confirmations**

In `src/speed-camera-urs/confirm-spec.ts`:

1. Imports:
   ```ts
   import { MAP_MATE_KINDS, type MapMateKind } from "./detect";
   import { t, type LocaleCode } from "./i18n";
   import { buildMapMateQuestion, buildMessage, kindLabel, languageCounts } from "./message";
   ```

2. Types: add

```ts
/** One quoted text, one option per language it leaves in. */
export interface QuoteBlock {
  label: string;
  hint?: string;
  options: QuoteOption[];
}
```

and in `ConfirmSpec` replace the `quotes` line with

```ts
  /** Each text that will leave, in order; within one, the first language is shown first. */
  quotes?: QuoteBlock[];
```

3. In `closeOneSpec`, `quotes: { label: …, options: [...] }` becomes `quotes: [{ label: t("dlgQuoteLabel"), options: [{ lang, text: buildMessage(lang) }] }]`.

4. Add a private helper, and rewrite `closeSelectedSpec`:

```ts
/**
 * Every language of the batch is offered, not only the editor's: the German or Italian
 * text is what those reporters will read. The editor's own language comes first when the
 * batch has it, since it is the one they can proofread.
 */
function languageQuote(
  label: string,
  langs: readonly LocaleCode[],
  editorLang: LocaleCode,
  textIn: (lang: LocaleCode) => string,
): QuoteBlock {
  const counts = languageCounts(langs);
  const ordered = [
    ...counts.filter((entry) => entry.lang === editorLang),
    ...counts.filter((entry) => entry.lang !== editorLang),
  ];
  const options = ordered.map((entry) => ({
    lang: entry.lang,
    count: entry.count,
    text: textIn(entry.lang),
  }));
  const hint = options.length > 1 ? t("dlgQuoteHint") : undefined;
  return { label, hint, options };
}

/**
 * The single batch: one line per family, so the editor reads what happens to each, then
 * every text that will leave, one quotation each. No quote and no warning when nothing is
 * sent.
 */
export function closeSelectedSpec(
  speedCameraLangs: readonly LocaleCode[],
  mapMate: ReadonlyArray<{ kind: MapMateKind; lang: LocaleCode }>,
  staleCount: number,
  editorLang: LocaleCode,
): ConfirmSpec {
  const cameraCount = speedCameraLangs.length;
  const facts: string[] = [];
  if (cameraCount > 0)
    facts.push(t("dlgFactFamilySpeedCamera", { count: cameraCount }));
  if (mapMate.length > 0)
    facts.push(t("dlgFactFamilyMapMate", { count: mapMate.length }));
  if (staleCount > 0)
    facts.push(t("dlgFactFamilyStale", { count: staleCount }));

  const confirmKey =
    cameraCount > 0
      ? "dialogConfirm"
      : mapMate.length > 0
        ? "dialogSend"
        : "dialogCloseOnly";
  const spec: ConfirmSpec = {
    title: t("dlgTitleSelected", {
      count: cameraCount + mapMate.length + staleCount,
    }),
    facts,
    confirmLabel: t(confirmKey),
    cancelLabel: t("dialogCancel"),
  };

  const quotes: QuoteBlock[] = [];
  if (cameraCount > 0)
    quotes.push(
      languageQuote(t("dlgQuoteLabel"), speedCameraLangs, editorLang, buildMessage),
    );
  for (const kind of MAP_MATE_KINDS) {
    const langs = mapMate.filter((m) => m.kind === kind).map((m) => m.lang);
    if (langs.length === 0) continue;
    const label = t("dlgQuoteLabelKind", { kind: kindLabel(kind) });
    quotes.push(
      languageQuote(label, langs, editorLang, (lang) =>
        buildMapMateQuestion(kind, lang),
      ),
    );
  }
  if (quotes.length === 0) return spec;
  spec.quotes = quotes;
  spec.warning = t("dlgWarningAll");
  return spec;
}

/** One Map Mate report: the exact question, and that the UR stays open. */
export function askMapMateSpec(
  id: number,
  kind: MapMateKind,
  lang: LocaleCode,
): ConfirmSpec {
  return {
    title: t("dlgTitleAsk", { id, kind: kindLabel(kind) }),
    facts: [t("dlgFactSendOne"), t("dlgFactStaysOpen")],
    quotes: [
      {
        label: t("dlgQuoteLabel"),
        options: [{ lang, text: buildMapMateQuestion(kind, lang) }],
      },
    ],
    warning: t("dlgWarningOne"),
    confirmLabel: t("dialogSend"),
    cancelLabel: t("dialogCancel"),
  };
}
```

5. `dlgTitleSelected` text in the four locales:

```bash
python3 - <<'EOF'
import json
TEXT = {"en": "Handle {{count}} UR(s)", "fr": "Traiter {{count}} UR",
        "de": "{{count}} URs bearbeiten", "it": "Trattare {{count}} UR"}
for lang, value in TEXT.items():
    path = f"locales/{lang}/common.json"
    raw = open(path, encoding="utf-8").read()
    data = json.loads(raw)
    data["speedCameraUrs"]["dlgTitleSelected"] = value
    open(path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=2) + ("\n" if raw.endswith("\n") else ""))
EOF
```

- [ ] **Step 5: Render several quotations**

In `src/speed-camera-urs/ui/dialog.ts`:
- `quoteSection(quotes: NonNullable<ConfirmSpec["quotes"]>)` becomes `quoteSection(quotes: QuoteBlock)`, importing `type QuoteBlock` from `../confirm-spec` next to the existing imports;
- in `showConfirm`, `if (spec.quotes) content.push(...quoteSection(spec.quotes));` becomes

```ts
  for (const block of spec.quotes ?? []) content.push(...quoteSection(block));
```

- [ ] **Step 6: The flows**

In `src/speed-camera-urs/close.ts`:

1. Import `askMapMateSpec` from `./confirm-spec`.

2. After `runCloseStale`:

```ts
/**
 * One Map Mate report, from the tab. Open to every level. The conversation is not read
 * first: a report with comments is not listed, and askMapMate checks again after the
 * confirmation, so a comment arriving while the dialog is open still stops the send.
 */
export function runAskMapMate(
  sdk: WmeSDK,
  id: number,
  prompts: Prompts = {},
): Promise<CloseOutcome | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  return withCloseLock(async () => {
    const ur = sdk.DataModel.MapUpdateRequests.getById({
      mapUpdateRequestId: id,
    });
    const kind = ur ? mapMateKind(ur) : null;
    if (!ur || !kind) return null;

    const lang = messageLanguage(ur.userPreferences?.language);
    const accepted = await confirm(askMapMateSpec(id, kind, lang));
    if (!accepted) return null;

    const outcome = await askMapMate(sdk, id);
    if (outcome.result !== "asked") await notify(summarize([outcome]));
    return outcome;
  });
}
```

3. In `runCloseSelected`, inside `withCloseLock`, replace the `langs` computation and the `confirm(...)` call:

```ts
    const urs = sdk.DataModel.MapUpdateRequests;
    const langOf = (id: number) =>
      messageLanguage(
        urs.getById({ mapUpdateRequestId: id })?.userPreferences?.language,
      );
    const mapMate = batch.mapMate.flatMap((id) => {
      const ur = urs.getById({ mapUpdateRequestId: id });
      const kind = ur ? mapMateKind(ur) : null;
      return kind ? [{ kind, lang: langOf(id) }] : [];
    });
    const accepted = await confirm(
      closeSelectedSpec(
        batch.speedCamera.map(langOf),
        mapMate,
        batch.stale.length,
        getLocale(),
      ),
    );
```

- [ ] **Step 7: Run tests, lint and types**

Run: `npx vitest run src/speed-camera-urs && npx eslint src/speed-camera-urs && npx tsc --noEmit -p . 2>&1 | grep "^src/"`
Expected: tests PASS, eslint silent. `tsc` may still flag `ui/tab.ts` and `ui/format.ts`, which build `BatchRequest` without `mapMate`. Task 7 fixes those. Any other `src/` error must be fixed here.

- [ ] **Step 8: Commit**

```bash
git add src/speed-camera-urs/confirm-spec.ts src/speed-camera-urs/ui/dialog.ts src/speed-camera-urs/close.ts \
  src/speed-camera-urs/confirm-spec.test.ts src/speed-camera-urs/flows.test.ts src/speed-camera-urs/ui/dialog.test.ts \
  locales/en/common.json locales/fr/common.json locales/de/common.json locales/it/common.json
git commit -m "feat(speed-camera-urs): confirm Map Mate questions, quoting every text that leaves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The tab — new name, (i) tooltips, Map Mate section

**Files:**
- Modify: `src/speed-camera-urs/ui/format.ts`, `src/speed-camera-urs/ui/criteria.ts`, `src/speed-camera-urs/ui/tab.ts`, `src/speed-camera-urs/ui/styles.ts`, `src/speed-camera-urs/index.ts`, `locales/*/common.json`
- Test: `src/speed-camera-urs/ui/format.test.ts`, `src/speed-camera-urs/ui/criteria.test.ts`

**Interfaces:**
- Consumes: `MapMateEntry`, `ScanSnapshot.mapMate`, `setReadMapMate` (Task 4); `runAskMapMate` (Task 6); `canBatch`, `canBatchStale`, `BatchRequest` (Task 5); `kindLabel` (Task 2); `Criteria.mapMate` (Task 3).
- Produces (format.ts):
  - `selectedBatch(criteria: Criteria, allowed: { speedCamera: boolean; mapMate: boolean; stale: boolean }, ready: BatchRequest): BatchRequest`
  - `formatStatus(snapshot: ScanSnapshot, criteria: Criteria): string` (**was** `formatStatus(entries)`)
  - `formatMapMateRowLabel(entry: MapMateEntry, locale: LocaleCode): string`
  - (criteria.ts) `criterionCheckbox(text: string, info: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement`, which now returns the row (box + (i)).

- [ ] **Step 1: Write the failing format tests**

In `src/speed-camera-urs/ui/format.test.ts`:
- import `formatMapMateRowLabel` too, plus `type ScanSnapshot` and `type MapMateEntry` from `../scanner`;
- in `describe("selectedBatch")`: `ready` becomes `{ speedCamera: [1, 2], mapMate: [5], stale: [10] }`, `everyone` becomes `{ speedCamera: true, mapMate: true, stale: true }`, every `allowed` literal gets `mapMate` equal to its `speedCamera` value, and every expected object gets its `mapMate` (`[]`, or `[5]` when `criteria.mapMate` is true and allowed). Add:

```ts
  it("takes the Map Mate reports when ticked and allowed", () => {
    const criteria = { ...DEFAULT_CRITERIA, mapMate: true };
    expect(selectedBatch(criteria, everyone, ready).mapMate).toEqual([5]);
    expect(
      selectedBatch(
        criteria,
        { speedCamera: false, mapMate: false, stale: false },
        ready,
      ).mapMate,
    ).toEqual([]);
  });
```

- replace `describe("formatStatus")` with:

```ts
describe("formatStatus", () => {
  const snapshot = (over: Partial<ScanSnapshot> = {}): ScanSnapshot => ({
    entries: [],
    trafficLights: [],
    mapMate: [],
    stale: [],
    ...over,
  });
  const report = (id: number, state: MapMateEntry["state"]): MapMateEntry => ({
    ...entry(id, "ready"),
    kind: "route",
    state,
  });

  it("says when nothing is on screen, and why that may be", () => {
    expect(formatStatus(snapshot(), DEFAULT_CRITERIA)).toContain(
      "must be shown on the map",
    );
  });

  it("asks to tick a family when none is", () => {
    const none = {
      speedCamera: false,
      trafficLight: false,
      mapMate: false,
      stale: false,
    };
    expect(formatStatus(snapshot(), none)).toBe(
      "No family ticked: tick at least one below.",
    );
  });

  it("counts every ticked family, and the URs still being checked", () => {
    const criteria = { ...DEFAULT_CRITERIA, mapMate: true };
    const status = formatStatus(
      snapshot({
        entries: [entry(1, "ready")],
        mapMate: [report(2, "pending"), report(3, "ready")],
      }),
      criteria,
    );
    expect(status).toBe("3 UR(s) to handle on screen, checking 1");
  });

  it("leaves out the families that are not ticked", () => {
    const status = formatStatus(
      snapshot({ entries: [entry(1, "ready")], mapMate: [report(2, "ready")] }),
      DEFAULT_CRITERIA,
    );
    expect(status).toBe("1 UR(s) to handle on screen");
  });
});
```

- update the button expectations to the new wording: `"Handle the 12 selected UR(s)"` and `` `Handle ${BATCH_CAP} of the ${BATCH_CAP + 5} selected UR(s)` ``;
- append:

```ts
describe("formatMapMateRowLabel", () => {
  it("names the case after the id", () => {
    const label = formatMapMateRowLabel(
      { ...entry(9, "ready"), kind: "speedLimit", state: "ready" },
      "en",
    );
    expect(label).toMatch(/^#9 · Speed limit · DE · /);
  });
});
```

- [ ] **Step 2: Write the failing (i) tests**

In `src/speed-camera-urs/ui/criteria.test.ts`, every `criterionCheckbox(text, checked, onChange)` call becomes `criterionCheckbox(text, "About this family", checked, onChange)`. The returned node is now the row, so:
- in "is a real checkbox inside its label…", `const label = …` becomes `const row = …`, then `const label = row.children[0]!;` and `const input = label.querySelector("input");`;
- in "uses WME's own checkbox when defined…", `const box = …` becomes `const row = …` then `const box = row.children[0]!;`.

Append:

```ts
  it("puts the family's description behind an (i), outside the label", () => {
    const onChange = vi.fn();
    const row = criterionCheckbox(
      "Speed cameras",
      "Closes the speed-camera URs.",
      true,
      onChange,
    ) as unknown as FakeNode;
    const info = row.children[1]!;

    expect(row.className).toBe("scu-criterion-row");
    expect(info.className).toBe("scu-info");
    expect(info.title).toBe("Closes the speed-camera URs.");
    expect(info.getAttribute("aria-label")).toBe("Closes the speed-camera URs.");
    expect(info.getAttribute("tabindex")).toBe("0");
    expect(info.querySelector("i")?.className).toContain("w-icon-info");

    info.dispatch("click");
    expect(onChange).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/speed-camera-urs/ui`
Expected: FAIL (new signatures, new wording).

- [ ] **Step 4: Implement format.ts**

In `src/speed-camera-urs/ui/format.ts`:
- imports: `import type { MapMateEntry, ScanSnapshot, TrafficLightEntry, UrEntry } from "../scanner";` and `import { kindLabel } from "../message";`;
- replace `formatStatus`:

```ts
/** One flag per UR of a ticked family: true while its conversation is still being read. */
export function formatStatus(snapshot: ScanSnapshot, criteria: Criteria): string {
  const anyFamily =
    criteria.speedCamera ||
    criteria.trafficLight ||
    criteria.mapMate ||
    criteria.stale;
  if (!anyFamily) return t("stateNoFamily");

  const pendingFlags = [
    ...(criteria.speedCamera
      ? snapshot.entries.map((e) => e.triage === "pending")
      : []),
    ...(criteria.trafficLight ? snapshot.trafficLights.map(() => false) : []),
    ...(criteria.mapMate
      ? snapshot.mapMate.map((e) => e.state === "pending")
      : []),
    ...(criteria.stale ? snapshot.stale.map((e) => e.state === "pending") : []),
  ];
  if (pendingFlags.length === 0) return t("stateNone");
  const found = t("stateFound", { count: pendingFlags.length });
  const pending = pendingFlags.filter(Boolean).length;
  return pending > 0
    ? `${found}, ${t("statePending", { count: pending })}`
    : found;
}

export function formatMapMateRowLabel(
  entry: MapMateEntry,
  locale: LocaleCode,
): string {
  const date = new Date(entry.reportedOn).toLocaleDateString(locale);
  return `#${entry.id} · ${kindLabel(entry.kind)} · ${entry.lang.toUpperCase()} · ${date}`;
}
```

- replace `selectedBatch`:

```ts
export function selectedBatch(
  criteria: Criteria,
  allowed: { speedCamera: boolean; mapMate: boolean; stale: boolean },
  ready: BatchRequest,
): BatchRequest {
  const takeCameras = criteria.speedCamera && allowed.speedCamera;
  const takeMapMate = criteria.mapMate && allowed.mapMate;
  const takeStale = criteria.stale && allowed.stale;
  return {
    speedCamera: takeCameras ? [...ready.speedCamera] : [],
    mapMate: takeMapMate ? [...ready.mapMate] : [],
    stale: takeStale ? [...ready.stale] : [],
  };
}
```

- [ ] **Step 5: Implement the (i)**

In `src/speed-camera-urs/ui/criteria.ts`, import `icon` with `el` from `../../ui/dom`, rename the current `criterionCheckbox` to a private `checkbox(text, checked, onChange)` (same body), and add:

```ts
/**
 * The family's checkbox with an (i) at the end of the line, whose tooltip describes the
 * family. The (i) sits beside the label, not in it, so clicking it never toggles the box.
 * `title` gives the native tooltip; `aria-label` and tabindex make it reachable by keyboard
 * and screen readers. Touch screens get no tooltip; WME is used with a mouse.
 */
export function criterionCheckbox(
  text: string,
  info: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
): HTMLElement {
  const row = el("div", "scu-criterion-row");
  const hint = el("span", "scu-info");
  hint.title = info;
  hint.setAttribute("aria-label", info);
  hint.setAttribute("tabindex", "0");
  hint.appendChild(icon("info"));
  row.append(checkbox(text, checked, onChange), hint);
  return row;
}
```

In `src/speed-camera-urs/ui/styles.ts`, after `.scu-criterion`:

```css
.scu-criterion-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.scu-info { display: inline-flex; color: var(--scu-muted); cursor: help; }
```

- [ ] **Step 6: Strings: new name, short note, renamed keys**

```bash
python3 - <<'EOF'
import json
SET = {
 "en": {"tabName": "UR assistant", "appName": "Update request assistant",
        "tabNote": "Handles the open URs on screen, by the families ticked below. Nothing is saved automatically.",
        "stateNone": "No UR to handle on screen. URs must be shown on the map to be found.",
        "stateFound": "{{count}} UR(s) to handle on screen",
        "btnCloseSelected": "Handle the {{count}} selected UR(s)",
        "btnCloseSelectedCapped": "Handle {{cap}} of the {{count}} selected UR(s)"},
 "fr": {"tabName": "Assistant UR", "appName": "Assistant des UR",
        "tabNote": "Traite les UR ouverts à l'écran, selon les familles cochées ci-dessous. Rien n'est sauvegardé automatiquement.",
        "stateNone": "Aucun UR à traiter à l'écran. Les UR doivent être affichés sur la carte pour être trouvés.",
        "stateFound": "{{count}} UR à traiter à l'écran",
        "btnCloseSelected": "Traiter les {{count}} UR sélectionnés",
        "btnCloseSelectedCapped": "Traiter {{cap}} des {{count}} UR sélectionnés"},
 "de": {"tabName": "UR-Assistent", "appName": "Assistent für URs",
        "tabNote": "Bearbeitet die offenen URs im Bildausschnitt, nach den unten angekreuzten Gruppen. Nichts wird automatisch gespeichert.",
        "stateNone": "Keine UR zu bearbeiten im Bildausschnitt. URs müssen auf der Karte angezeigt werden, damit sie gefunden werden.",
        "stateFound": "{{count}} URs zu bearbeiten im Bildausschnitt",
        "btnCloseSelected": "Die {{count}} ausgewählten URs bearbeiten",
        "btnCloseSelectedCapped": "{{cap}} der {{count}} ausgewählten URs bearbeiten"},
 "it": {"tabName": "Assistente UR", "appName": "Assistente per le UR",
        "tabNote": "Tratta le UR aperte sullo schermo, secondo le famiglie selezionate qui sotto. Nulla viene salvato automaticamente.",
        "stateNone": "Nessuna UR da trattare sullo schermo. Le UR devono essere visibili sulla mappa per essere trovate.",
        "stateFound": "{{count}} UR da trattare sullo schermo",
        "btnCloseSelected": "Trattare le {{count}} UR selezionate",
        "btnCloseSelectedCapped": "Trattare {{cap}} delle {{count}} UR selezionate"},
}
RENAME = {"trafficLightNote": "trafficLightInfo", "staleNote": "staleInfo"}
for lang, values in SET.items():
    path = f"locales/{lang}/common.json"
    raw = open(path, encoding="utf-8").read()
    data = json.loads(raw)
    section = data["speedCameraUrs"]
    section.update(values)
    for old, new in RENAME.items():
        section[new] = section.pop(old)
    open(path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=2) + ("\n" if raw.endswith("\n") else ""))
EOF
```

- [ ] **Step 7: Wire the tab**

In `src/speed-camera-urs/index.ts`: `SCRIPT_NAME` becomes `"WME CH UR Assistant"`, and after `scanner.setReadStale(settings.criteria.stale);` add `scanner.setReadMapMate(settings.criteria.mapMate);`.

In `src/speed-camera-urs/ui/tab.ts`:

1. Imports: add `runAskMapMate` to the `../close` import, `type MapMateEntry` to the `../scanner` type import, and `formatMapMateRowLabel` to the `./format` import.

2. Fields, next to the stale ones:

```ts
  private mapMateList = el("div", "scu-list");
  private mapMateSection: HTMLDetailsElement | null = null;
```

3. In `buildSkeleton()`:
   - the traffic-light section loses its note: its content becomes `[this.trafficLightList]`;
   - the stale section's content becomes `[this.staleList]`;
   - before `this.buildCriteria();` add:

```ts
    this.mapMateSection = buildSection(
      "scu",
      "warning",
      t("sectionMapMate", { count: 0 }),
      [this.mapMateList],
      true,
    );
```

   - in `pane.append(…)`, insert `this.mapMateSection,` between `this.trafficLightSection,` and `this.staleSection,`.

4. `buildCriteria()`: each `criterionCheckbox(text, checked, toggle)` gains the info text as second argument, and the Map Mate box is inserted third:

```ts
    this.criteria.replaceChildren(
      el("div", "scu-criteria-label", t("criteriaLabel")),
      criterionCheckbox(
        t("criterionSpeedCamera"),
        t("speedCameraInfo"),
        current.speedCamera,
        toggle("speedCamera"),
      ),
      criterionCheckbox(
        t("criterionTrafficLight"),
        t("trafficLightInfo"),
        current.trafficLight,
        toggle("trafficLight"),
      ),
      criterionCheckbox(
        t("criterionMapMate"),
        t("mapMateInfo"),
        current.mapMate,
        toggle("mapMate"),
      ),
      criterionCheckbox(
        t("criterionStale", { days: STALE_AGE_DAYS }),
        t("staleInfo", { days: STALE_AGE_DAYS }),
        current.stale,
        toggle("stale"),
      ),
    );
```

5. `setCriterion()`: after `this.scanner.setReadStale(…)` add `this.scanner.setReadMapMate(this.settings.criteria.mapMate);`, and update its doc comment to `/** Unchecking a family that reads conversations stops the reads from the next scan; cached verdicts stay. */`.

6. `render()`:
   - add `!this.mapMateSection ||` to the guard;
   - `const { entries, trafficLights, mapMate, stale } = this.scanner.getSnapshot();`;
   - `this.bannerText.textContent = formatStatus(this.scanner.getSnapshot(), criteria);`;
   - after the traffic-light block:

```ts
    this.mapMateSection.hidden = !criteria.mapMate;
    this.mapMateList.replaceChildren(
      ...mapMate.map((entry) => this.mapMateRow(entry)),
    );
    setSectionTitle(
      this.mapMateSection,
      t("sectionMapMate", { count: mapMate.length }),
    );
```

   - the `selectedBatch(…)` call becomes:

```ts
    const level3 = canBatch(this.sdk);
    const batch = selectedBatch(
      criteria,
      { speedCamera: level3, mapMate: level3, stale: canBatchStale(this.sdk) },
      {
        speedCamera: lists.ready.map((entry) => entry.id),
        mapMate: mapMate
          .filter((entry) => entry.state === "ready")
          .map((entry) => entry.id),
        stale: stale
          .filter((entry) => entry.state === "stale")
          .map((entry) => entry.id),
      },
    );
    const total =
      batch.speedCamera.length + batch.mapMate.length + batch.stale.length;
```

7. Add `mapMateRow` next to `staleRow`:

```ts
  private mapMateRow(entry: MapMateEntry): HTMLElement {
    const row = el("div", "scu-row");
    const label = button(
      formatMapMateRowLabel(entry, getLocale()),
      () => this.highlight.focus(entry),
      "scu-plain scu-row-label",
    );
    label.title = t("rowTitle");
    row.appendChild(label);

    if (entry.state === "pending") {
      row.appendChild(el("span", "scu-muted", t("rowPending")));
      return row;
    }
    const action = button(
      t("btnAskMapMate"),
      () => void this.handle(() => runAskMapMate(this.sdk, entry.id)),
      "scu-btn",
    );
    action.disabled = isCloseInFlight();
    row.appendChild(action);
    return row;
  }
```

(`handle`'s default `summarize` is right here: it counts the question and gives `askedReminder`.)

- [ ] **Step 8: Run everything**

Run: `npx vitest run && npx eslint src/speed-camera-urs && npx tsc --noEmit -p . 2>&1 | grep "^src/"; npm run build 2>&1 | grep -iE "error|created"`
Expected: every test passes, eslint silent, no `src/` type error, build `created .out/main.user.js`. Also check that `grep -rn "trafficLightNote\|staleNote" src locales` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add src/speed-camera-urs/ui/format.ts src/speed-camera-urs/ui/format.test.ts src/speed-camera-urs/ui/criteria.ts \
  src/speed-camera-urs/ui/criteria.test.ts src/speed-camera-urs/ui/tab.ts src/speed-camera-urs/ui/styles.ts \
  src/speed-camera-urs/index.ts locales/en/common.json locales/fr/common.json locales/de/common.json locales/it/common.json
git commit -m "feat(speed-camera-urs): UR assistant tab with Map Mate section and (i) tooltips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: Manual check in WME (human)**

Load the dev build, open **CH · UR assistant**, and check:
- the (i) icon renders and its tooltip shows on hover, in light and dark theme;
- ticking « Map Mate » lists reports with their case;
- one « Demander des précisions » on a real Map Mate UR: the comment appears in WME, the UR stays open, and it leaves the list.

---

### Task 8: Documentation

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `README.fr.md`, `README.de.md`, `README.it.md`

- [ ] **Step 1: CLAUDE.md**

In the *Speed-camera URs* section:

1. Replace its first paragraph (from "Closes the URs that report a fixed speed camera" to "with its own scriptId for the same reason.") with:

```markdown
The **CH · UR assistant** tab: it handles four families of open URs, each behind a checkbox.
It started as the speed-camera closer, hence the folder, the i18n section `speedCameraUrs`,
the scriptId and the settings key, all kept on purpose so saved choices and the tab's place
survive. Speed cameras are recognised by the `MISSING_STATIC_SPEED_CAMERA` prefix of their
description; their type is always `INCORRECT_GENERAL_ERROR`, so the type cannot filter
them. Entry point: `initSpeedCameraUrs()` (`index.ts`), called from `main.user.ts` after the
importer, with its own scriptId for the same reason.
```

2. After the "Overlaps:" bullet, add:

```markdown
- Map Mate reports (`mapMateKind`, detect.ts): `source === "REPORTING_AGENT"`, type
  `INCORRECT_GENERAL_ERROR`, and the code before the first `:` of the description, matched
  exactly through a `Map` (an object literal would answer `constructor`). Five codes, five
  questions (`message.ts`, `askBody*`); any other code gets nothing. `askMapMate` only
  comments: the UR **stays open** and the outcome is `"asked"`. A `MISSING_TRAFFIC_LIGHT`
  is asked about only when `isKnownOffFreeway`; on a freeway it belongs to the
  traffic-light family, on an unloaded road it waits.
- Map Mate never gets a question once anyone but Map_Team has commented (`mayAskMapMate`),
  with no override, and never twice: `wasMessaged`, plus `isMapMateQuestion` on the
  conversation, because a comment may come back without a name and then `hasDiscussion`
  does not see it.
```

3. In the `settings.ts` bullet, "the three checkboxes" becomes "the four checkboxes", and the defaults become "(speed cameras ☑, traffic lights ☑, Map Mate ☐, abandoned ☐)".

4. In **Safety rules**, the first bullet becomes:

```markdown
- `BATCH_MIN_RANK` (level 3, speed cameras and Map Mate), `STALE_BATCH_MIN_RANK` (level 4)
  and `BATCH_CAP` (50, the whole batch: speed cameras, then Map Mate, then abandoned) live in
  `close.ts` and are enforced in `closeMany`, not only in the tab. One batch button covers
  what is ticked and allowed; it is hidden when that is empty.
```

and "Any comment on a UR keeps it out of the batch." becomes "Any comment keeps a speed camera out of the batch; for Map Mate and abandoned URs, any comment but Map_Team's."

- [ ] **Step 2: READMEs**

In each README:

1. In the *Features* list, the speed-camera item (line ~79) names the old tab. Rewrite it:
   - EN: `Handles the open URs on screen in a dedicated **CH · UR assistant** tab: speed-camera URs (which Swiss law does not allow Waze to show) get the official explanation in the reporter's language and are closed; traffic lights reported on a freeway and abandoned URs are closed without a message; Map Mate voice reports get a question suited to their case. Each family has its own checkbox.`
   - FR: `Traite les UR ouverts à l'écran dans un onglet dédié **CH · Assistant UR** : les UR radar (que la loi suisse interdit d'afficher dans Waze) reçoivent l'explication officielle dans la langue de l'utilisateur et sont fermés ; les feux signalés sur autoroute et les UR abandonnés sont fermés sans message ; les signalements vocaux Map Mate reçoivent une question adaptée à leur cas. Chaque famille a sa case à cocher.`
   - DE: `Bearbeitet die offenen URs im Bildausschnitt in einem eigenen Reiter **CH · UR-Assistent**: Radar-URs (die Waze nach Schweizer Recht nicht anzeigen darf) erhalten die offizielle Erklärung in der Sprache der meldenden Person und werden geschlossen; auf der Autobahn gemeldete Ampeln und verwaiste URs werden ohne Nachricht geschlossen; Sprachmeldungen von Map Mate erhalten eine zum Fall passende Frage. Jede Gruppe hat ihr eigenes Kästchen.`
   - IT: `Tratta le UR aperte sullo schermo in una scheda dedicata **CH · Assistente UR**: le UR autovelox (che la legge svizzera non permette a Waze di mostrare) ricevono la spiegazione ufficiale nella lingua di chi ha segnalato e vengono chiuse; i semafori segnalati in autostrada e le UR abbandonate vengono chiusi senza messaggio; le segnalazioni vocali Map Mate ricevono una domanda adatta al caso. Ogni famiglia ha la sua casella.`

2. Under the unreleased heading's `#### Added` (`Ajouté` / `Hinzugefügt` / `Aggiunto`), after the abandoned-URs entry:
   - EN: `- **Questions to Map Mate reporters.** Map Mate voice reports (traffic light, route, speed limit, turn, general map update) get a question suited to their case in the reporter's language, asking where exactly and what they expected; a traffic light also suggests reporting roadworks if it was a temporary one. The UR stays open for the answer. Nothing is sent once someone other than Map_Team has commented, never twice, and never to a traffic light whose closest road is a freeway. One by one for everyone, in the batch from level 3. Off by default.`
   - FR: `- **Questions aux rapporteurs Map Mate.** Les signalements vocaux Map Mate (feu, itinéraire, limitation de vitesse, virage, modification générale) reçoivent une question adaptée à leur cas dans la langue du rapporteur : où exactement, et ce qu'il attendait ; pour un feu, la question suggère aussi de signaler des travaux s'il était provisoire. L'UR reste ouvert pour la réponse. Rien n'est envoyé dès qu'une autre personne que Map_Team a commenté, jamais deux fois, ni à un feu dont la route la plus proche est une autoroute. Un par un pour tous, en lot dès le niveau 3. Décoché par défaut.`
   - DE: `- **Fragen an Map-Mate-Meldende.** Sprachmeldungen von Map Mate (Ampel, Strecke, Tempolimit, Abbiegen, allgemeine Kartenänderung) erhalten eine zum Fall passende Frage in der Sprache der meldenden Person: wo genau und was erwartet wurde; bei einer Ampel wird zudem empfohlen, eine Baustelle zu melden, falls sie provisorisch war. Die UR bleibt für die Antwort offen. Es wird nichts gesendet, sobald jemand anderes als Map_Team kommentiert hat, nie zweimal und nie an eine Ampel, deren nächste Strasse eine Autobahn ist. Einzeln für alle, gemeinsam ab Level 3. Standardmässig aus.`
   - IT: `- **Domande a chi segnala con Map Mate.** Le segnalazioni vocali Map Mate (semaforo, percorso, limite di velocità, svolta, modifica generale) ricevono una domanda adatta al caso nella lingua di chi ha segnalato: dove esattamente e cosa si aspettava; per un semaforo si suggerisce anche di segnalare dei lavori se era provvisorio. La UR resta aperta per la risposta. Non viene inviato nulla se qualcuno diverso da Map_Team ha commentato, mai due volte, né a un semaforo la cui strada più vicina è un'autostrada. Una per una per tutti, in blocco dal livello 3. Disattivato per impostazione predefinita.`

3. Under the same unreleased heading, add a `#### Changed` (`Modifié` / `Geändert` / `Modificato`) section after `Added`:
   - EN: `- The **CH · Speed-camera UR closer** tab is now **CH · UR assistant**, since it handles every family of URs. Each family's description moved behind an (i) at the end of its checkbox, and the status line counts every ticked family. Your ticked boxes are kept.`
   - FR: `- L'onglet **CH · URs radars closer** devient **CH · Assistant UR**, puisqu'il traite toutes les familles d'UR. La description de chaque famille passe derrière un (i) au bout de sa case, et la ligne d'état compte toutes les familles cochées. Les cases déjà cochées sont conservées.`
   - DE: `- Der Reiter **CH · Radar-UR-Closer** heisst jetzt **CH · UR-Assistent**, da er alle UR-Gruppen bearbeitet. Die Beschreibung jeder Gruppe steht nun hinter einem (i) am Ende ihres Kästchens, und die Statuszeile zählt alle angekreuzten Gruppen. Bereits angekreuzte Kästchen bleiben erhalten.`
   - IT: `- La scheda **CH · UR autovelox closer** diventa **CH · Assistente UR**, poiché tratta tutte le famiglie di UR. La descrizione di ogni famiglia è ora dietro una (i) alla fine della sua casella, e la riga di stato conta tutte le famiglie selezionate. Le caselle già selezionate vengono conservate.`

- [ ] **Step 3: Full verification**

Run: `npx vitest run && npx eslint src/speed-camera-urs && npm run build 2>&1 | grep -iE "error|created"`
Expected: all green, build created.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md README.fr.md README.de.md README.it.md
git commit -m "docs(speed-camera-urs): Map Mate questions and the UR assistant tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
