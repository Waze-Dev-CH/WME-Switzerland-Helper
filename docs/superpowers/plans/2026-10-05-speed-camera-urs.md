# Fermeture des UR « radar fixe » : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un onglet « CH · Radars » qui liste les UR radar ouverts à l'écran, envoie à l'utilisateur la consigne officielle dans sa langue et ferme l'UR en *Non identifié*, un par un ou en lot (niveau 3+).

**Architecture:** nouveau module `src/speed-camera-urs/`, calqué sur `src/house-number-importer/` : SDK et `scriptId` propres, instance i18next propre, dialogues injectables. Un `Scanner` suit le modèle de données et l'emprise de la carte, `detect.ts` reconnaît et trie, `close.ts` est le seul module qui écrit, `ui/tab.ts` affiche.

**Tech Stack:** TypeScript, WME SDK (`wme-sdk-typings`), i18next, Vitest, Rollup.

**Spec:** `docs/superpowers/specs/2026-10-05-speed-camera-urs-design.md` (à lire avant de commencer).

**Écarts assumés par rapport au tableau de la spec (section 4) :**
- `classify.ts` est fondu dans `detect.ts` (`triage()`) : une fonction d'une ligne ne justifie pas un module.
- `scanner.ts` porte l'analyse de la section 4.1, que la spec attribuait à `index.ts` sans fichier dédié.
- `ui/format.ts` (pur, testé) et `fake-sdk.ts` (aide de test) s'ajoutent, sur le modèle de l'importeur.

## Global Constraints

- Préfixe de détection : `MISSING_STATIC_SPEED_CAMERA`, testé avec `startsWith` sur `description`.
- État de fermeture : `"not-identified"`.
- `BATCH_MIN_RANK = 2` (niveau 3 affiché, `rank + 1`). Bouton de lot **caché** en dessous, jamais grisé. Vérification refaite dans `closeMany`. Rang inconnu = insuffisant.
- `BATCH_CAP = 50`, appliqué dans `closeMany`.
- Ordre d'écriture : `addComment` d'abord, `updateResolutionState` seulement si l'envoi a réussi.
- Tout commentaire exclut l'UR du lot. Un UR déjà messagé dans la session (`wasMessaged`) aussi.
- Langue du message : `userPreferences.language` en minuscules, préfixe `fr` / `de` / `it`, sinon `en`.
- Rien n'est jamais sauvegardé automatiquement.
- Nouvelles chaînes dans les **quatre** `locales/<lang>/common.json`, sous `speedCameraUrs`. Allemand en « Sie », sans `ß`. Italien en « voi ».
- Commentaires de code en anglais, ils expliquent le pourquoi. Pas de tiret cadratin (—) nulle part.
- Commits en Conventional Commits, **sans aucune mention de Claude** (ni `Co-Authored-By`, ni « Generated with »).
- Vérification avant chaque commit : `npx prettier --write src/speed-camera-urs`, puis `npx vitest run src/speed-camera-urs`, `npx tsc --noEmit`, `npx eslint src/speed-camera-urs`. Les blocs de code du plan ne sont pas forcément au format Prettier : c'est Prettier qui tranche.

## Review Focus

1. **Ctrl+Z après une fermeture, puis « Tout traiter ».** L'UR est rouvert, le message est déjà parti, et la conversation en mémoire peut ne pas montrer notre commentaire. Attendu : pas de second message. Test : Task 4, « refuses to message twice after an undo ».
2. **UR fermé par un autre éditeur entre l'affichage et le clic.** Attendu : sauté, rien n'est envoyé. Test : Task 4, « skips a UR closed in the meantime ».
3. **Un commentaire arrive pendant que la confirmation est ouverte.** Attendu : l'envoi est annulé (sauté). Test : Task 5, « skips when a comment arrives while the dialog is open ».
4. **Double clic, ou un UR seul pendant qu'un lot tourne.** Attendu : le second flux ne fait rien. Test : Task 5, « refuses a second flow while one is running ».
5. **La lecture de la conversation échoue pour un UR.** Attendu : il reste « en vérification », sans bouton, hors du lot, et il est retenté au scan suivant. Test : Task 6, « keeps a UR pending when its details fail, and retries ».

Hors tests unitaires, à vérifier au test manuel (Task 9) : l'unité de `reportedOn` (millisecondes supposées, la date affichée doit être plausible) et le message affiché quand la couche des UR est masquée.

---

### Task 1: i18n et chaînes dans les quatre langues

**Files:**
- Create: `src/speed-camera-urs/i18n.ts`
- Create: `src/speed-camera-urs/log.ts`
- Create: `src/speed-camera-urs/i18n.test.ts`
- Modify: `locales/en/common.json`, `locales/fr/common.json`, `locales/de/common.json`, `locales/it/common.json` (nouvelle clé de premier niveau `speedCameraUrs`)
- Modify: `i18next-parser.config.js` (exclure le module de l'extraction)

**Interfaces:**
- Produces: `type LocaleCode = "en" | "fr" | "de" | "it"`, `type StringKey`, `normalizeLocale(code: string | undefined): LocaleCode`, `setLocale(code: LocaleCode): void`, `getLocale(): LocaleCode`, `t(key: StringKey, params?: Record<string, string | number>): string`, `tIn(lng: LocaleCode, key: StringKey, params?): string`, `log.info/warn/error`.

- [ ] **Step 1: Ajouter les chaînes aux quatre catalogues**

Créer quatre fichiers temporaires dans le scratchpad (`en.json`, `fr.json`, `de.json`, `it.json`) avec le contenu ci-dessous, puis les injecter (`SCRATCH` = chemin du scratchpad) :

```bash
SCRATCH=<chemin du scratchpad>
for l in en fr de it; do
  node -e '
    const fs = require("fs");
    const [file, extra] = process.argv.slice(1);
    const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
    catalog.speedCameraUrs = JSON.parse(fs.readFileSync(extra, "utf8"));
    fs.writeFileSync(file, JSON.stringify(catalog, null, 2) + "\n");
  ' "locales/$l/common.json" "$SCRATCH/$l.json"
done
git diff --stat locales
```

Attendu : seules des lignes ajoutées (si `git diff` montre d'autres lignes réécrites, le fichier n'était pas au format `JSON.stringify(…, null, 2)` : annuler et insérer le bloc à la main avant la dernière accolade).

`en.json` :

```json
{
  "appName": "Speed cameras",
  "tabNote": "Lists the open URs on screen that report a fixed speed camera. Swiss law forbids showing them in Waze: each one gets the official explanation in the reporter's language and is closed as Not identified.",
  "stateNone": "No speed-camera UR on screen. URs must be shown on the map to be found.",
  "stateFound": "{{count}} speed-camera UR(s) on screen",
  "statePending": "checking {{count}}",
  "sectionReady": "To handle ({{count}})",
  "sectionConversation": "Already a conversation ({{count}})",
  "conversationNote": "These URs already carry a comment. They are left out of Handle all: check each one before closing it.",
  "rowTitle": "Centre the map on this UR",
  "rowPending": "checking",
  "btnCloseOne": "Close with message",
  "btnCloseAll": "Handle all ({{count}})",
  "btnCloseAllCapped": "Handle {{cap}} of {{count}}",
  "confirmOne": "Send this message to the reporter (language: {{lang}}) and close the UR as Not identified?\n\nThe message is sent immediately and cannot be withdrawn.\n\n{{message}}",
  "confirmOneConversation": "This UR already has a conversation. Send this message anyway (language: {{lang}}) and close the UR as Not identified?\n\nThe message is sent immediately and cannot be withdrawn.\n\n{{message}}",
  "confirmAll": "{{count}} messages will be sent now ({{languages}}) and {{count}} URs closed as Not identified.\n\nThe messages cannot be withdrawn. Message in your language:\n\n{{message}}",
  "summary": "{{closed}} closed, {{skipped}} skipped, {{failed}} failed.",
  "summaryLine": "UR #{{id}}: {{reason}}",
  "saveReminder": "Save to record the closures. The messages are already sent.",
  "errBatchRank": "Handling all URs at once requires editor level {{level}}.",
  "errNotAllowed": "editing is not allowed right now",
  "errDetails": "the conversation could not be read",
  "errComment": "the message could not be sent",
  "errClose": "the message was sent, but the UR could not be closed",
  "skipGone": "already closed or no longer editable",
  "skipConversation": "a conversation started in the meantime",
  "dialogConfirm": "Send and close",
  "dialogCancel": "Cancel",
  "dialogOk": "OK",
  "messageIntro": "Thank you for your report. Fixed speed cameras cannot be shown in Waze in Switzerland and Liechtenstein.",
  "messageBody": "To comply with local regulations, Waze has disabled police reporting for users navigating in Switzerland and Liechtenstein. All other navigation features, including hazard alerts, traffic information and road closures, remain fully functional."
}
```

`fr.json` :

```json
{
  "appName": "Radars",
  "tabNote": "Liste les UR ouverts à l'écran qui signalent un radar fixe. La loi suisse interdit de les afficher dans Waze : chacun reçoit l'explication officielle dans la langue de l'utilisateur et est fermé en Non identifié.",
  "stateNone": "Aucun UR radar à l'écran. Les UR doivent être affichés sur la carte pour être trouvés.",
  "stateFound": "{{count}} UR radar à l'écran",
  "statePending": "{{count}} en vérification",
  "sectionReady": "À traiter ({{count}})",
  "sectionConversation": "Déjà une conversation ({{count}})",
  "conversationNote": "Ces UR portent déjà un commentaire. Ils sont exclus de « Tout traiter » : vérifiez chacun avant de le fermer.",
  "rowTitle": "Centrer la carte sur cet UR",
  "rowPending": "en vérification",
  "btnCloseOne": "Fermer avec message",
  "btnCloseAll": "Tout traiter ({{count}})",
  "btnCloseAllCapped": "Traiter {{cap}} sur {{count}}",
  "confirmOne": "Envoyer ce message à l'utilisateur (langue : {{lang}}) et fermer l'UR en Non identifié ?\n\nLe message part immédiatement et ne peut pas être retiré.\n\n{{message}}",
  "confirmOneConversation": "Cet UR a déjà une conversation. Envoyer quand même ce message (langue : {{lang}}) et fermer l'UR en Non identifié ?\n\nLe message part immédiatement et ne peut pas être retiré.\n\n{{message}}",
  "confirmAll": "{{count}} messages vont être envoyés maintenant ({{languages}}) et {{count}} UR fermés en Non identifié.\n\nLes messages ne peuvent pas être retirés. Message dans votre langue :\n\n{{message}}",
  "summary": "{{closed}} fermé(s), {{skipped}} sauté(s), {{failed}} échec(s).",
  "summaryLine": "UR n° {{id}} : {{reason}}",
  "saveReminder": "Sauvegardez pour enregistrer les fermetures. Les messages sont déjà envoyés.",
  "errBatchRank": "Traiter tous les UR d'un coup demande le niveau d'éditeur {{level}}.",
  "errNotAllowed": "l'édition n'est pas autorisée pour le moment",
  "errDetails": "la conversation n'a pas pu être lue",
  "errComment": "le message n'a pas pu être envoyé",
  "errClose": "le message est parti, mais l'UR n'a pas pu être fermé",
  "skipGone": "déjà fermé ou plus modifiable",
  "skipConversation": "une conversation a commencé entre-temps",
  "dialogConfirm": "Envoyer et fermer",
  "dialogCancel": "Annuler",
  "dialogOk": "OK",
  "messageIntro": "Merci pour votre signalement. Les radars fixes ne peuvent pas être affichés dans Waze en Suisse et au Liechtenstein.",
  "messageBody": "Afin de respecter la réglementation locale, Waze a désactivé le signalement de la police pour les utilisateurs naviguant en Suisse et au Liechtenstein. Toutes les autres fonctionnalités de navigation, notamment les alertes de danger, les informations sur le trafic et les fermetures de routes, restent pleinement fonctionnelles."
}
```

`de.json` :

```json
{
  "appName": "Radare",
  "tabNote": "Listet die offenen URs im Bildausschnitt, die ein fest installiertes Radar melden. Das Schweizer Recht verbietet, sie in Waze anzuzeigen: Jede erhält die offizielle Erklärung in der Sprache der meldenden Person und wird als «Nicht identifiziert» geschlossen.",
  "stateNone": "Keine Radar-UR im Bildausschnitt. URs müssen auf der Karte angezeigt werden, damit sie gefunden werden.",
  "stateFound": "{{count}} Radar-UR(s) im Bildausschnitt",
  "statePending": "{{count}} in Prüfung",
  "sectionReady": "Zu bearbeiten ({{count}})",
  "sectionConversation": "Bereits eine Unterhaltung ({{count}})",
  "conversationNote": "Diese URs haben bereits einen Kommentar. Sie sind von «Alle bearbeiten» ausgenommen: Prüfen Sie jede einzeln, bevor Sie sie schliessen.",
  "rowTitle": "Karte auf diese UR zentrieren",
  "rowPending": "in Prüfung",
  "btnCloseOne": "Mit Nachricht schliessen",
  "btnCloseAll": "Alle bearbeiten ({{count}})",
  "btnCloseAllCapped": "{{cap}} von {{count}} bearbeiten",
  "confirmOne": "Diese Nachricht an die meldende Person senden (Sprache: {{lang}}) und die UR als «Nicht identifiziert» schliessen?\n\nDie Nachricht wird sofort gesendet und kann nicht zurückgezogen werden.\n\n{{message}}",
  "confirmOneConversation": "Diese UR hat bereits eine Unterhaltung. Diese Nachricht trotzdem senden (Sprache: {{lang}}) und die UR als «Nicht identifiziert» schliessen?\n\nDie Nachricht wird sofort gesendet und kann nicht zurückgezogen werden.\n\n{{message}}",
  "confirmAll": "{{count}} Nachrichten werden jetzt gesendet ({{languages}}) und {{count}} URs als «Nicht identifiziert» geschlossen.\n\nDie Nachrichten können nicht zurückgezogen werden. Nachricht in Ihrer Sprache:\n\n{{message}}",
  "summary": "{{closed}} geschlossen, {{skipped}} übersprungen, {{failed}} fehlgeschlagen.",
  "summaryLine": "UR Nr. {{id}}: {{reason}}",
  "saveReminder": "Speichern Sie, um die Schliessungen zu übernehmen. Die Nachrichten sind bereits gesendet.",
  "errBatchRank": "Alle URs auf einmal zu bearbeiten erfordert Editor-Level {{level}}.",
  "errNotAllowed": "Bearbeiten ist im Moment nicht erlaubt",
  "errDetails": "die Unterhaltung konnte nicht gelesen werden",
  "errComment": "die Nachricht konnte nicht gesendet werden",
  "errClose": "die Nachricht wurde gesendet, aber die UR konnte nicht geschlossen werden",
  "skipGone": "bereits geschlossen oder nicht mehr bearbeitbar",
  "skipConversation": "inzwischen hat eine Unterhaltung begonnen",
  "dialogConfirm": "Senden und schliessen",
  "dialogCancel": "Abbrechen",
  "dialogOk": "OK",
  "messageIntro": "Danke für Ihre Meldung. Fest installierte Radare können in Waze in der Schweiz und in Liechtenstein nicht angezeigt werden.",
  "messageBody": "Um den lokalen Vorschriften zu entsprechen, hat Waze die Meldung von Polizeikontrollen für Nutzer deaktiviert, die in der Schweiz und in Liechtenstein navigieren. Alle anderen Navigationsfunktionen, einschliesslich Gefahrenmeldungen, Verkehrsinformationen und Strassensperrungen, bleiben weiterhin uneingeschränkt verfügbar."
}
```

`it.json` :

```json
{
  "appName": "Autovelox",
  "tabNote": "Elenca le UR aperte sullo schermo che segnalano un autovelox fisso. La legge svizzera vieta di mostrarli in Waze: ognuna riceve la spiegazione ufficiale nella lingua di chi l'ha segnalata e viene chiusa come Non identificata.",
  "stateNone": "Nessuna UR autovelox sullo schermo. Le UR devono essere visibili sulla mappa per essere trovate.",
  "stateFound": "{{count}} UR autovelox sullo schermo",
  "statePending": "{{count}} in verifica",
  "sectionReady": "Da trattare ({{count}})",
  "sectionConversation": "Già una conversazione ({{count}})",
  "conversationNote": "Queste UR hanno già un commento. Sono escluse da «Tratta tutte»: verificatele una per una prima di chiuderle.",
  "rowTitle": "Centrare la mappa su questa UR",
  "rowPending": "in verifica",
  "btnCloseOne": "Chiudi con messaggio",
  "btnCloseAll": "Tratta tutte ({{count}})",
  "btnCloseAllCapped": "Tratta {{cap}} su {{count}}",
  "confirmOne": "Inviare questo messaggio a chi ha segnalato (lingua: {{lang}}) e chiudere la UR come Non identificata?\n\nIl messaggio parte subito e non può essere ritirato.\n\n{{message}}",
  "confirmOneConversation": "Questa UR ha già una conversazione. Inviare comunque questo messaggio (lingua: {{lang}}) e chiudere la UR come Non identificata?\n\nIl messaggio parte subito e non può essere ritirato.\n\n{{message}}",
  "confirmAll": "{{count}} messaggi stanno per essere inviati ({{languages}}) e {{count}} UR chiuse come Non identificate.\n\nI messaggi non possono essere ritirati. Messaggio nella vostra lingua:\n\n{{message}}",
  "summary": "{{closed}} chiuse, {{skipped}} saltate, {{failed}} fallite.",
  "summaryLine": "UR n. {{id}}: {{reason}}",
  "saveReminder": "Salvate per registrare le chiusure. I messaggi sono già stati inviati.",
  "errBatchRank": "Trattare tutte le UR in una volta richiede il livello di editor {{level}}.",
  "errNotAllowed": "la modifica non è consentita al momento",
  "errDetails": "non è stato possibile leggere la conversazione",
  "errComment": "non è stato possibile inviare il messaggio",
  "errClose": "il messaggio è stato inviato, ma la UR non ha potuto essere chiusa",
  "skipGone": "già chiusa o non più modificabile",
  "skipConversation": "nel frattempo è iniziata una conversazione",
  "dialogConfirm": "Invia e chiudi",
  "dialogCancel": "Annullare",
  "dialogOk": "OK",
  "messageIntro": "Grazie per la segnalazione. Gli autovelox fissi non possono essere visualizzati in Waze in Svizzera e Liechtenstein.",
  "messageBody": "Per conformarsi alle normative locali, Waze ha disattivato la segnalazione della polizia per gli utenti che navigano in Svizzera e Liechtenstein. Tutte le altre funzioni di navigazione, comprese le segnalazioni di pericoli, le informazioni sul traffico e le chiusure stradali, rimangono pienamente operative."
}
```

- [ ] **Step 2: Exclure le module de l'extraction i18next**

Dans `i18next-parser.config.js`, après la ligne `"!src/house-number-importer/**/*.{js,ts,jsx,tsx}",`, ajouter :

```js
    // Same arrangement for the speed-camera URs: keys under speedCameraUrs.*, bare t() names.
    "!src/speed-camera-urs/**/*.{js,ts,jsx,tsx}",
```

- [ ] **Step 3: Écrire le test qui échoue**

`src/speed-camera-urs/i18n.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import deCommon from "../../locales/de/common.json";
import enCommon from "../../locales/en/common.json";
import frCommon from "../../locales/fr/common.json";
import itCommon from "../../locales/it/common.json";
import { normalizeLocale, t, tIn } from "./i18n";

const CATALOGS = { fr: frCommon, de: deCommon, it: itCommon };

describe("speedCameraUrs catalogs", () => {
  const expected = Object.keys(enCommon.speedCameraUrs).sort();

  it.each(Object.keys(CATALOGS))("%s carries exactly the English keys", (locale) => {
    // A missing key falls back to English silently, so only a test catches it.
    const catalog = CATALOGS[locale as keyof typeof CATALOGS];
    expect(Object.keys(catalog.speedCameraUrs).sort()).toEqual(expected);
  });

  it.each(Object.keys(CATALOGS))("%s translates the strings rather than copying them", (locale) => {
    const catalog = CATALOGS[locale as keyof typeof CATALOGS];
    const english = enCommon.speedCameraUrs as Record<string, string>;
    const translated = catalog.speedCameraUrs as Record<string, string>;
    // "OK" is legitimately identical in all four languages; nothing else should be.
    const copied = expected.filter((key) => key !== "dialogOk" && translated[key] === english[key]);
    expect(copied).toEqual([]);
  });

  it("keeps the interpolation placeholders of every language", () => {
    const english = enCommon.speedCameraUrs as Record<string, string>;
    for (const key of expected) {
      const placeholders = [...(english[key] ?? "").matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
      for (const [locale, catalog] of Object.entries(CATALOGS)) {
        const value = (catalog.speedCameraUrs as Record<string, string>)[key] ?? "";
        const found = [...value.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
        expect(found, `${locale}.${key}`).toEqual(placeholders);
      }
    }
  });

  it("writes Swiss German, without the sharp s", () => {
    const values = Object.values(deCommon.speedCameraUrs as Record<string, string>);
    expect(values.filter((value) => value.includes("ß"))).toEqual([]);
  });
});

describe("t and tIn", () => {
  it("resolves a key in the UI language", () => {
    expect(t("appName")).toBe(enCommon.speedCameraUrs.appName);
  });

  it("resolves a key in another language without changing the UI language", () => {
    expect(tIn("de", "appName")).toBe(deCommon.speedCameraUrs.appName);
    expect(t("appName")).toBe(enCommon.speedCameraUrs.appName);
  });
});

describe("normalizeLocale", () => {
  it("keeps the four supported languages and falls back to English", () => {
    expect(normalizeLocale("fr-CH")).toBe("fr");
    expect(normalizeLocale("de")).toBe("de");
    expect(normalizeLocale("pt-BR")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });
});
```

- [ ] **Step 4: Vérifier qu'il échoue**

Run: `npx vitest run src/speed-camera-urs/i18n.test.ts`
Expected: FAIL, `Failed to resolve import "./i18n"`.

- [ ] **Step 5: Écrire `i18n.ts` et `log.ts`**

`src/speed-camera-urs/i18n.ts` :

```ts
/**
 * i18n for the speed-camera URs. Strings live in `locales/<lang>/common.json` under the
 * `speedCameraUrs` key.
 *
 * A dedicated i18next instance, like the two other features: their language preferences
 * are per feature, and sharing the host singleton would let one flip the others.
 *
 * Two kinds of strings live here. The UI follows the editor's WME language (`t`); the
 * message sent to a reporter follows the REPORTER's language (`tIn`), whatever the UI shows.
 */
import i18next from "i18next";
import deCommon from "../../locales/de/common.json";
import enCommon from "../../locales/en/common.json";
import frCommon from "../../locales/fr/common.json";
import itCommon from "../../locales/it/common.json";

const i18n = i18next.createInstance();
void i18n.init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: { common: enCommon },
    fr: { common: frCommon },
    it: { common: itCommon },
    de: { common: deCommon },
  },
  // Everything goes to textContent or to a UR comment, so i18next's HTML escaping would be
  // shown verbatim ("l&#39;UR") instead of being applied.
  interpolation: { escapeValue: false },
});

export type LocaleCode = "en" | "fr" | "de" | "it";

/** Keys of the `speedCameraUrs` section, derived from the English source. */
export type StringKey = keyof (typeof enCommon)["speedCameraUrs"];

const SUPPORTED: readonly LocaleCode[] = ["en", "fr", "de", "it"];

/** A WME locale code ("fr-CH", "de") reduced to one of ours; anything else is English. */
export function normalizeLocale(code: string | undefined): LocaleCode {
  const prefix = (code ?? "en").toLowerCase().slice(0, 2);
  return (SUPPORTED as readonly string[]).includes(prefix) ? (prefix as LocaleCode) : "en";
}

export function setLocale(code: LocaleCode): void {
  void i18n.changeLanguage(code);
}

export function getLocale(): LocaleCode {
  return normalizeLocale(i18n.language);
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  // Explicit `common:` namespace: the init above does not set a defaultNS.
  return i18n.t(`common:speedCameraUrs.${key}`, params) as string;
}

export function tIn(
  lng: LocaleCode,
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  return i18n.t(`common:speedCameraUrs.${key}`, { ...params, lng }) as string;
}
```

`src/speed-camera-urs/log.ts` :

```ts
const PREFIX = "[CH Radars]";

export const log = {
  info: (...args: unknown[]): void => console.log(PREFIX, ...args),
  warn: (...args: unknown[]): void => console.warn(PREFIX, ...args),
  error: (...args: unknown[]): void => console.error(PREFIX, ...args),
};
```

- [ ] **Step 6: Vérifier que ça passe**

Run: `npx vitest run src/speed-camera-urs/i18n.test.ts && npx tsc --noEmit`
Expected: PASS, aucune erreur de type.

- [ ] **Step 7: Commit**

```bash
git add locales i18next-parser.config.js src/speed-camera-urs/i18n.ts src/speed-camera-urs/log.ts src/speed-camera-urs/i18n.test.ts
git commit -m "feat(speed-camera-urs): strings and i18n in four languages"
```

---

### Task 2: détection et tri (`detect.ts`) avec l'aide de test `fake-sdk.ts`

**Files:**
- Create: `src/speed-camera-urs/detect.ts`
- Create: `src/speed-camera-urs/fake-sdk.ts`
- Test: `src/speed-camera-urs/detect.test.ts`

**Interfaces:**
- Produces: `SPEED_CAMERA_PREFIX`, `isSpeedCameraUr(ur): boolean`, `isInExtent(ur, extent: readonly number[]): boolean`, `type Triage = "ready" | "conversation"`, `triage(comments: readonly ConversationElement[], messagedBySelf: boolean): Triage`.
- Produces (tests seulement): `makeUr(id, overrides?)`, `makeSdk(urs, options?)` → `{ sdk, calls, sent }`, `type FakeOptions`.

- [ ] **Step 1: Écrire l'aide de test**

`src/speed-camera-urs/fake-sdk.ts` :

```ts
/**
 * A stand-in for the few SDK calls this feature makes, shared by its test files. Never
 * imported by production code, so it stays out of the bundle.
 */
import { vi } from "vitest";
import type { ConversationElement, MapUpdateRequest, WmeSDK } from "wme-sdk-typings";

export function makeUr(id: number, overrides: Partial<MapUpdateRequest> = {}): MapUpdateRequest {
  return {
    id,
    description: "MISSING_STATIC_SPEED_CAMERA: The user reported a fixed speed camera.",
    isOpen: true,
    isEditable: true,
    isRead: false,
    isStarred: false,
    reportedOn: 1_760_000_000_000,
    resolutionState: "open",
    resolvedBy: null,
    resolvedOn: null,
    severity: "low",
    source: "MOBILE_CLIENT",
    updateRequestType: "INCORRECT_GENERAL_ERROR",
    geometry: { type: "Point", coordinates: [6.6, 46.5] },
    userPreferences: { language: "francais" } as MapUpdateRequest["userPreferences"],
    ...overrides,
  };
}

export interface FakeOptions {
  /** Editor rank (0-based). `null` means no user info at all. Defaults to 2 (level 3). */
  rank?: number | null;
  editingAllowed?: boolean;
  /** Read at call time, so a test can add a comment while a flow is running. */
  comments?: Record<number, ConversationElement[]>;
  failDetails?: number[];
  failComment?: number[];
  failClose?: number[];
  extent?: number[];
}

export function makeSdk(urs: MapUpdateRequest[], options: FakeOptions = {}) {
  const calls: string[] = [];
  const sent: Array<{ id: number; text: string }> = [];
  const byId = (id: number) => urs.find((ur) => ur.id === id) ?? null;
  type IdArgs = { mapUpdateRequestId: number };

  const sdk = {
    Editing: { isEditingAllowed: () => options.editingAllowed ?? true },
    State: {
      getUserInfo: () => (options.rank === null ? null : { rank: options.rank ?? 2 }),
    },
    Map: {
      getMapExtent: () => options.extent ?? [6, 46, 7, 47],
      setMapCenter: vi.fn(),
    },
    Events: { on: vi.fn(), trackDataModelEvents: vi.fn() },
    DataModel: {
      MapUpdateRequests: {
        getAll: () => urs,
        getById: ({ mapUpdateRequestId }: IdArgs) => byId(mapUpdateRequestId),
        getUpdateRequestDetails: vi.fn(async ({ mapUpdateRequestId: id }: IdArgs) => {
          calls.push(`details:${id}`);
          if (options.failDetails?.includes(id)) throw new Error("details failed");
          if (!byId(id)) return null;
          return { id, comments: options.comments?.[id] ?? [], driveGeometry: null };
        }),
        addComment: vi.fn(async ({ mapUpdateRequestId: id, text }: IdArgs & { text: string }) => {
          calls.push(`comment:${id}`);
          if (options.failComment?.includes(id)) throw new Error("comment failed");
          sent.push({ id, text });
          return { createdOn: 0, text, userName: "editor" };
        }),
        updateResolutionState: vi.fn(
          ({ mapUpdateRequestId: id, resolutionState }: IdArgs & { resolutionState: string }) => {
            calls.push(`close:${id}:${resolutionState}`);
            if (options.failClose?.includes(id)) throw new Error("close failed");
            const ur = byId(id);
            if (ur) {
              ur.isOpen = false;
              ur.resolutionState = resolutionState as MapUpdateRequest["resolutionState"];
            }
          },
        ),
      },
    },
  } as unknown as WmeSDK;

  return { sdk, calls, sent };
}
```

- [ ] **Step 2: Écrire le test qui échoue**

`src/speed-camera-urs/detect.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { isInExtent, isSpeedCameraUr, triage } from "./detect";
import { makeUr } from "./fake-sdk";

describe("isSpeedCameraUr", () => {
  it("accepts an open, editable UR whose description starts with the marker", () => {
    expect(isSpeedCameraUr(makeUr(1))).toBe(true);
  });

  it("ignores the free text after the marker, whatever its language", () => {
    const portuguese = makeUr(1, { description: "MISSING_STATIC_SPEED_CAMERA: Radar fixo" });
    expect(isSpeedCameraUr(portuguese)).toBe(true);
  });

  it("rejects a marker that is not at the start", () => {
    const quoted = makeUr(1, { description: "see MISSING_STATIC_SPEED_CAMERA" });
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
    const onEdge = makeUr(1, { geometry: { type: "Point", coordinates: [7, 47] } });
    expect(isInExtent(onEdge, extent)).toBe(true);
  });

  it("drops a UR outside the extent", () => {
    const outside = makeUr(1, { geometry: { type: "Point", coordinates: [8.5, 47.3] } });
    expect(isInExtent(outside, extent)).toBe(false);
  });
});

describe("triage", () => {
  it("is ready without any comment", () => {
    expect(triage([], false)).toBe("ready");
  });

  it("is a conversation as soon as there is one comment, whoever wrote it", () => {
    expect(triage([{ createdOn: 0, text: "hello", userName: null }], false)).toBe("conversation");
    expect(triage([{ createdOn: 0, text: "hi", userName: "editor" }], false)).toBe("conversation");
  });

  it("is a conversation when this session already sent the message", () => {
    expect(triage([], true)).toBe("conversation");
  });
});
```

- [ ] **Step 3: Vérifier qu'il échoue**

Run: `npx vitest run src/speed-camera-urs/detect.test.ts`
Expected: FAIL, `Failed to resolve import "./detect"`.

- [ ] **Step 4: Écrire `detect.ts`**

```ts
import type { ConversationElement, MapUpdateRequest } from "wme-sdk-typings";

/**
 * Every speed-camera UR observed in WME starts its description with this marker, followed
 * by free text whose wording and language vary. Their type is always
 * INCORRECT_GENERAL_ERROR, so the type cannot tell them apart from anything else.
 */
export const SPEED_CAMERA_PREFIX = "MISSING_STATIC_SPEED_CAMERA";

type UrFields = Pick<MapUpdateRequest, "description" | "isOpen" | "isEditable">;

export function isSpeedCameraUr(ur: UrFields): boolean {
  const description = ur.description ?? "";
  return ur.isOpen && ur.isEditable && description.startsWith(SPEED_CAMERA_PREFIX);
}

/** `extent` is the map's GeoJSON bbox: [west, south, east, north]. */
export function isInExtent(ur: Pick<MapUpdateRequest, "geometry">, extent: readonly number[]): boolean {
  const [lon, lat] = ur.geometry.coordinates;
  const [west, south, east, north] = extent;
  if (lon === undefined || lat === undefined) return false;
  if (west === undefined || south === undefined || east === undefined || north === undefined) {
    return false;
  }
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

export type Triage = "ready" | "conversation";

/**
 * Whether a UR may go into a batch.
 *
 * ANY comment counts, not only an editor's. None of the URs observed while designing this
 * carried a comment, so nobody has seen how `userName` tells the reporter from an editor;
 * guessing wrong would mean messaging over someone's ongoing conversation. The common case
 * (no comment) still goes through the batch, the rest is seen by a human.
 */
export function triage(comments: readonly ConversationElement[], messagedBySelf: boolean): Triage {
  if (messagedBySelf) return "conversation";
  return comments.length > 0 ? "conversation" : "ready";
}
```

- [ ] **Step 5: Vérifier que ça passe**

Run: `npx vitest run src/speed-camera-urs/detect.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/speed-camera-urs/detect.ts src/speed-camera-urs/detect.test.ts src/speed-camera-urs/fake-sdk.ts
git commit -m "feat(speed-camera-urs): recognise and triage speed-camera URs"
```

---

### Task 3: langue et texte du message (`message.ts`)

**Files:**
- Create: `src/speed-camera-urs/message.ts`
- Test: `src/speed-camera-urs/message.test.ts`

**Interfaces:**
- Consumes: `tIn`, `LocaleCode` (Task 1).
- Produces: `messageLanguage(raw: string | null | undefined): LocaleCode`, `buildMessage(lang: LocaleCode): string`, `describeLanguages(langs: readonly LocaleCode[]): string`.

- [ ] **Step 1: Écrire le test qui échoue**

`src/speed-camera-urs/message.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { buildMessage, describeLanguages, messageLanguage } from "./message";

describe("messageLanguage", () => {
  it("reads the Waze app ids observed in WME", () => {
    expect(messageLanguage("francais")).toBe("fr");
    expect(messageLanguage("eng")).toBe("en");
    expect(messageLanguage("portuguese_pt")).toBe("en");
  });

  it("reads the likely German and Italian ids, whatever their case", () => {
    expect(messageLanguage("deutsch")).toBe("de");
    expect(messageLanguage("Italiano")).toBe("it");
    expect(messageLanguage("FRANCAIS")).toBe("fr");
  });

  it("falls back to English when the language is unknown or missing", () => {
    expect(messageLanguage("dansk")).toBe("en");
    expect(messageLanguage(null)).toBe("en");
    expect(messageLanguage(undefined)).toBe("en");
    expect(messageLanguage("")).toBe("en");
  });
});

describe("buildMessage", () => {
  it("puts the speed-camera sentence before the official text, in French", () => {
    expect(buildMessage("fr")).toBe(
      "Merci pour votre signalement. Les radars fixes ne peuvent pas être affichés dans Waze " +
        "en Suisse et au Liechtenstein. Afin de respecter la réglementation locale, Waze a " +
        "désactivé le signalement de la police pour les utilisateurs naviguant en Suisse et au " +
        "Liechtenstein. Toutes les autres fonctionnalités de navigation, notamment les alertes " +
        "de danger, les informations sur le trafic et les fermetures de routes, restent " +
        "pleinement fonctionnelles.",
    );
  });

  it("speaks each of the four languages", () => {
    expect(buildMessage("de")).toMatch(/^Danke für Ihre Meldung\./);
    expect(buildMessage("it")).toMatch(/^Grazie per la segnalazione\./);
    expect(buildMessage("en")).toMatch(/^Thank you for your report\./);
  });
});

describe("describeLanguages", () => {
  it("counts per language, most frequent first", () => {
    expect(describeLanguages(["de", "fr", "fr", "it", "fr", "de"])).toBe("3 FR, 2 DE, 1 IT");
  });

  it("keeps a fixed order on a tie and omits absent languages", () => {
    expect(describeLanguages(["en", "fr"])).toBe("1 FR, 1 EN");
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run src/speed-camera-urs/message.test.ts`
Expected: FAIL, `Failed to resolve import "./message"`.

- [ ] **Step 3: Écrire `message.ts`**

```ts
import { tIn, type LocaleCode } from "./i18n";

/**
 * The reporter's language, from `userPreferences.language`.
 *
 * That field is the Waze app's own language id, NOT an ISO code: "francais", "eng" and
 * "portuguese_pt" were observed in WME. The German and Italian ids were not, so this
 * matches on the prefix ("deutsch", "italiano" being the likely values) rather than on a
 * closed table that would silently send English to every German speaker.
 */
export function messageLanguage(raw: string | null | undefined): LocaleCode {
  const value = (raw ?? "").toLowerCase();
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("de")) return "de";
  if (value.startsWith("it")) return "it";
  return "en";
}

/**
 * The text sent to the reporter: one sentence tying the answer to the speed camera they
 * reported, then the official wording verbatim. The official text speaks of police reports
 * only, and on its own a reporter would not connect it to their speed camera.
 */
export function buildMessage(lang: LocaleCode): string {
  return `${tIn(lang, "messageIntro")} ${tIn(lang, "messageBody")}`;
}

const ORDER: readonly LocaleCode[] = ["fr", "de", "it", "en"];

/** "3 FR, 2 DE, 1 IT": what a batch is about to send, for its confirmation. */
export function describeLanguages(langs: readonly LocaleCode[]): string {
  return ORDER.map((lang) => ({ lang, count: langs.filter((l) => l === lang).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((entry) => `${entry.count} ${entry.lang.toUpperCase()}`)
    .join(", ");
}
```

- [ ] **Step 4: Vérifier que ça passe**

Run: `npx vitest run src/speed-camera-urs/message.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/speed-camera-urs/message.ts src/speed-camera-urs/message.test.ts
git commit -m "feat(speed-camera-urs): pick the reporter's language for the message"
```

---

### Task 4: écriture (`close.ts` : `closeOne`, `closeMany`, `summarize`)

**Files:**
- Create: `src/speed-camera-urs/close.ts`
- Test: `src/speed-camera-urs/close.test.ts`

**Interfaces:**
- Consumes: `isSpeedCameraUr`, `triage` (Task 2), `messageLanguage`, `buildMessage` (Task 3), `t` (Task 1), `log`.
- Produces: `BATCH_MIN_RANK = 2`, `BATCH_CAP = 50`, `type SkipReason`, `type FailReason`, `type CloseOutcome`, `wasMessaged(id): boolean`, `noteMessaged(id): void`, `resetMessagedForTests(): void`, `canBatch(sdk): boolean`, `closeOne(sdk, id, { allowConversation }): Promise<CloseOutcome>`, `closeMany(sdk, ids): Promise<CloseOutcome[] | null>`, `summarize(outcomes): string`.

- [ ] **Step 1: Écrire le test qui échoue**

`src/speed-camera-urs/close.test.ts` :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  BATCH_CAP,
  canBatch,
  closeMany,
  closeOne,
  resetMessagedForTests,
  summarize,
  wasMessaged,
} from "./close";
import { makeSdk, makeUr } from "./fake-sdk";
import { buildMessage } from "./message";

const comment = { createdOn: 0, text: "is it fixed?", userName: null };

beforeEach(() => resetMessagedForTests());

describe("closeOne", () => {
  it("sends the message in the reporter's language, then closes as not-identified", async () => {
    const ur = makeUr(1, { userPreferences: { language: "deutsch" } as never });
    const { sdk, calls, sent } = makeSdk([ur]);

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(calls).toEqual(["details:1", "comment:1", "close:1:not-identified"]);
    expect(sent).toEqual([{ id: 1, text: buildMessage("de") }]);
    expect(wasMessaged(1)).toBe(true);
  });

  it("does not close when the message fails to go out", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { failComment: [1] });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "failed", reason: "errComment" });
    expect(calls).toEqual(["details:1", "comment:1"]);
    expect(wasMessaged(1)).toBe(false);
  });

  it("reports a closure failure after a successful send", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)], { failClose: [1] });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "failed", reason: "errClose" });
    expect(sent).toHaveLength(1);
  });

  it("sends nothing when the conversation cannot be read", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { failDetails: [1] });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "failed", reason: "errDetails" });
    expect(calls).toEqual(["details:1"]);
  });

  it("skips a UR that already has a comment, unless told otherwise", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { comments: { 1: [comment] } });

    const skipped = await closeOne(sdk, 1, { allowConversation: false });
    expect(skipped).toEqual({ id: 1, result: "skipped", reason: "skipConversation" });
    expect(calls).toEqual(["details:1"]);

    const forced = await closeOne(sdk, 1, { allowConversation: true });
    expect(forced).toEqual({ id: 1, result: "closed" });
  });

  it("skips a UR closed in the meantime, without reading or sending anything", async () => {
    const { sdk, calls } = makeSdk([makeUr(1, { isOpen: false })]);

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "skipped", reason: "skipGone" });
    expect(calls).toEqual([]);
  });

  it("skips a UR that no longer exists in the data model", async () => {
    const { sdk } = makeSdk([]);
    expect(await closeOne(sdk, 9, { allowConversation: false })).toEqual({
      id: 9,
      result: "skipped",
      reason: "skipGone",
    });
  });

  it("refuses when editing is not allowed", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { editingAllowed: false });

    const outcome = await closeOne(sdk, 1, { allowConversation: false });

    expect(outcome).toEqual({ id: 1, result: "failed", reason: "errNotAllowed" });
    expect(calls).toEqual([]);
  });

  it("refuses to message twice after an undo", async () => {
    // Ctrl+Z reopens the UR, but the comment is already out and the cached conversation
    // (empty in this fake) does not show it.
    const ur = makeUr(1);
    const { sdk, sent } = makeSdk([ur]);
    await closeOne(sdk, 1, { allowConversation: false });
    ur.isOpen = true;

    const again = await closeOne(sdk, 1, { allowConversation: false });

    expect(again).toEqual({ id: 1, result: "skipped", reason: "skipConversation" });
    expect(sent).toHaveLength(1);
  });
});

describe("canBatch", () => {
  it("needs rank 2 (displayed level 3)", () => {
    expect(canBatch(makeSdk([], { rank: 2 }).sdk)).toBe(true);
    expect(canBatch(makeSdk([], { rank: 1 }).sdk)).toBe(false);
  });

  it("treats an unknown rank as insufficient", () => {
    expect(canBatch(makeSdk([], { rank: null }).sdk)).toBe(false);
  });
});

describe("closeMany", () => {
  it("refuses below level 3, whatever the caller", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { rank: 1 });

    expect(await closeMany(sdk, [1])).toBeNull();
    expect(calls).toEqual([]);
  });

  it(`handles at most ${BATCH_CAP} URs`, async () => {
    const urs = Array.from({ length: BATCH_CAP + 10 }, (_, i) => makeUr(i + 1));
    const { sdk, sent } = makeSdk(urs);

    const outcomes = await closeMany(sdk, urs.map((ur) => ur.id));

    expect(outcomes).toHaveLength(BATCH_CAP);
    expect(sent).toHaveLength(BATCH_CAP);
  });

  it("never sends to a UR with a comment and keeps going after a failure", async () => {
    const { sdk, sent } = makeSdk([makeUr(1), makeUr(2), makeUr(3)], {
      comments: { 2: [comment] },
      failComment: [1],
    });

    const outcomes = await closeMany(sdk, [1, 2, 3]);

    expect(outcomes?.map((o) => o.result)).toEqual(["failed", "skipped", "closed"]);
    expect(sent.map((s) => s.id)).toEqual([3]);
  });
});

describe("summarize", () => {
  it("counts the results, names each problem and reminds to save", () => {
    const text = summarize([
      { id: 1, result: "closed" },
      { id: 2, result: "skipped", reason: "skipGone" },
      { id: 3, result: "failed", reason: "errComment" },
    ]);

    expect(text).toContain("1 closed, 1 skipped, 1 failed.");
    expect(text).toContain("UR #2: already closed or no longer editable");
    expect(text).toContain("UR #3: the message could not be sent");
    expect(text).toContain("Save to record the closures.");
  });

  it("does not ask to save when nothing was closed", () => {
    const text = summarize([{ id: 2, result: "skipped", reason: "skipGone" }]);
    expect(text).not.toContain("Save");
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run src/speed-camera-urs/close.test.ts`
Expected: FAIL, `Failed to resolve import "./close"`.

- [ ] **Step 3: Écrire `close.ts`**

```ts
import type { ConversationElement, WmeSDK } from "wme-sdk-typings";
import { isSpeedCameraUr, triage } from "./detect";
import { t } from "./i18n";
import { log } from "./log";
import { buildMessage, messageLanguage } from "./message";

/**
 * Lowest rank allowed to handle every UR at once. WME's displayed level is rank + 1, so
 * this is editor level 3, the same gate as GROUP_FIX_MIN_RANK in the street-name checker.
 */
export const BATCH_MIN_RANK = 2;

/**
 * Most URs a single batch may handle. Enforced in closeMany rather than in the button, like
 * IMPORT_CAP: a limit living in the UI is one missed check away from being gone.
 */
export const BATCH_CAP = 50;

export type SkipReason = "skipGone" | "skipConversation";
export type FailReason = "errNotAllowed" | "errDetails" | "errComment" | "errClose";

export type CloseOutcome =
  | { id: number; result: "closed" }
  | { id: number; result: "skipped"; reason: SkipReason }
  | { id: number; result: "failed"; reason: FailReason };

/**
 * URs this session already sent the message to.
 *
 * The closure goes to the undo stack, the comment does not. After a Ctrl+Z the UR is open
 * again while the reporter already has the message, and the conversation WME keeps in
 * memory may not show our comment yet. This set is what stops a second pass from sending
 * it twice.
 */
const messaged = new Set<number>();

export function wasMessaged(id: number): boolean {
  return messaged.has(id);
}

export function noteMessaged(id: number): void {
  messaged.add(id);
}

/** Tests only: module state would otherwise leak from one test into the next. */
export function resetMessagedForTests(): void {
  messaged.clear();
}

/** An unknown rank counts as insufficient. */
export function canBatch(sdk: WmeSDK): boolean {
  const rank = sdk.State.getUserInfo()?.rank;
  return typeof rank === "number" && rank >= BATCH_MIN_RANK;
}

/**
 * Send the official message to one UR's reporter, then close the UR as not-identified.
 *
 * Everything is re-read here, right before writing: the list the editor clicked may be
 * minutes old. The message goes FIRST because it cannot be withdrawn, while the closure
 * lands on the undo stack; a failed send must leave the UR open and untouched, never
 * closed without an explanation. Nothing is saved.
 */
export async function closeOne(
  sdk: WmeSDK,
  id: number,
  options: { allowConversation: boolean },
): Promise<CloseOutcome> {
  if (!sdk.Editing.isEditingAllowed()) return { id, result: "failed", reason: "errNotAllowed" };

  const urs = sdk.DataModel.MapUpdateRequests;
  const ur = urs.getById({ mapUpdateRequestId: id });
  if (!ur || !isSpeedCameraUr(ur)) return { id, result: "skipped", reason: "skipGone" };

  let comments: ConversationElement[];
  try {
    const details = await urs.getUpdateRequestDetails({ mapUpdateRequestId: id });
    if (!details) return { id, result: "failed", reason: "errDetails" };
    comments = details.comments;
  } catch (err) {
    log.warn(`Could not read the conversation of UR ${id}`, err);
    return { id, result: "failed", reason: "errDetails" };
  }

  const hasConversation = triage(comments, wasMessaged(id)) === "conversation";
  if (hasConversation && !options.allowConversation) {
    return { id, result: "skipped", reason: "skipConversation" };
  }

  const text = buildMessage(messageLanguage(ur.userPreferences?.language));
  try {
    await urs.addComment({ mapUpdateRequestId: id, text });
  } catch (err) {
    log.warn(`Could not send the message to UR ${id}`, err);
    return { id, result: "failed", reason: "errComment" };
  }
  noteMessaged(id);

  try {
    urs.updateResolutionState({ mapUpdateRequestId: id, resolutionState: "not-identified" });
  } catch (err) {
    log.warn(`Message sent but UR ${id} could not be closed`, err);
    return { id, result: "failed", reason: "errClose" };
  }
  return { id, result: "closed" };
}

/**
 * The batch. Re-checks the rank itself: two surfaces could call it, and a gate enforced
 * only where the button is drawn would be one missed check away from being gone.
 */
export async function closeMany(
  sdk: WmeSDK,
  ids: readonly number[],
): Promise<CloseOutcome[] | null> {
  if (!canBatch(sdk)) return null;
  const outcomes: CloseOutcome[] = [];
  // One at a time: gentler on the server, and a failure costs one UR rather than a burst.
  for (const id of ids.slice(0, BATCH_CAP)) {
    outcomes.push(await closeOne(sdk, id, { allowConversation: false }));
  }
  return outcomes;
}

/** What the editor reads once a flow ends: counts, each problem by UR, and the save reminder. */
export function summarize(outcomes: readonly CloseOutcome[]): string {
  const count = (result: CloseOutcome["result"]) =>
    outcomes.filter((outcome) => outcome.result === result).length;
  const lines = [
    t("summary", { closed: count("closed"), skipped: count("skipped"), failed: count("failed") }),
  ];
  for (const outcome of outcomes) {
    if (outcome.result === "closed") continue;
    lines.push(t("summaryLine", { id: outcome.id, reason: t(outcome.reason) }));
  }
  if (count("closed") > 0) lines.push("", t("saveReminder"));
  return lines.join("\n");
}
```

- [ ] **Step 4: Vérifier que ça passe**

Run: `npx vitest run src/speed-camera-urs/close.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/speed-camera-urs/close.ts src/speed-camera-urs/close.test.ts
git commit -m "feat(speed-camera-urs): send the message then close, one UR or a batch"
```

---

### Task 5: confirmations et flux (`prompt.ts`, `runCloseOne`, `runCloseAll`)

**Files:**
- Create: `src/speed-camera-urs/prompt.ts`
- Modify: `src/speed-camera-urs/close.ts` (ajout en fin de fichier)
- Test: `src/speed-camera-urs/flows.test.ts`

**Interfaces:**
- Consumes: tout `close.ts` (Task 4), `describeLanguages` (Task 3), `getLocale` (Task 1).
- Produces: `type Confirm`, `type Notify`, `confirmDialog`, `notifyDialog`, `interface Prompts { confirm?: Confirm; notify?: Notify }`, `isCloseInFlight(): boolean`, `runCloseOne(sdk, id, prompts?): Promise<CloseOutcome | null>`, `runCloseAll(sdk, ids, prompts?): Promise<CloseOutcome[] | null>`.

- [ ] **Step 1: Écrire `prompt.ts`**

```ts
import { showWmeDialog } from "../utils";
import { t } from "./i18n";

/** Ask for a yes/no decision. Resolves false when declined or dismissed. */
export type Confirm = (message: string) => Promise<boolean>;
/** Report something the editor must acknowledge. */
export type Notify = (message: string) => Promise<void>;

/**
 * Dialogs through the host helper rather than confirm()/alert(), which look nothing like
 * WME and block the main thread. The flows take them as injectable options so they stay
 * testable without a DOM.
 *
 * Not reused from the other features: their copies are bound to their own i18next
 * instances, so the buttons would be labelled in whatever language those are set to.
 */
export const confirmDialog: Confirm = async (message) => {
  const result = await showWmeDialog({
    message,
    buttons: [
      { label: t("dialogConfirm"), value: "confirm" },
      { label: t("dialogCancel"), value: "cancel" },
    ],
    cancelValue: "cancel",
  });
  return result === "confirm";
};

export const notifyDialog: Notify = async (message) => {
  await showWmeDialog({
    message,
    buttons: [{ label: t("dialogOk"), value: "ok" }],
    cancelValue: "ok",
  });
};
```

- [ ] **Step 2: Écrire le test qui échoue**

`src/speed-camera-urs/flows.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationElement } from "wme-sdk-typings";
import { isCloseInFlight, resetMessagedForTests, runCloseAll, runCloseOne } from "./close";
import { makeSdk, makeUr } from "./fake-sdk";
import { buildMessage } from "./message";

const comment = { createdOn: 0, text: "still there", userName: null };
const accept = () => vi.fn(async (_message: string) => true);
const decline = () => vi.fn(async (_message: string) => false);
const silent = () => vi.fn(async (_message: string) => {});

beforeEach(() => resetMessagedForTests());

describe("runCloseOne", () => {
  it("shows the language and the exact message before sending", async () => {
    const ur = makeUr(1, { userPreferences: { language: "italiano" } as never });
    const { sdk, sent } = makeSdk([ur]);
    const confirm = accept();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(outcome).toEqual({ id: 1, result: "closed" });
    const shown = confirm.mock.calls[0]?.[0] ?? "";
    expect(shown).toContain("language: IT");
    expect(shown).toContain(buildMessage("it"));
    expect(shown).toContain("cannot be withdrawn");
    expect(sent).toHaveLength(1);
  });

  it("warns about an existing conversation and still lets the editor send", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)], { comments: { 1: [comment] } });
    const confirm = accept();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify: silent() });

    expect(confirm.mock.calls[0]?.[0]).toContain("already has a conversation");
    expect(outcome).toEqual({ id: 1, result: "closed" });
    expect(sent).toHaveLength(1);
  });

  it("does nothing when the editor declines", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)]);

    expect(await runCloseOne(sdk, 1, { confirm: decline(), notify: silent() })).toBeNull();
    expect(calls).toEqual(["details:1"]);
  });

  it("skips when a comment arrives while the dialog is open", async () => {
    const comments: Record<number, ConversationElement[]> = {};
    const { sdk, sent } = makeSdk([makeUr(1)], { comments });
    const confirm = vi.fn(async () => {
      comments[1] = [comment];
      return true;
    });
    const notify = silent();

    const outcome = await runCloseOne(sdk, 1, { confirm, notify });

    expect(outcome).toEqual({ id: 1, result: "skipped", reason: "skipConversation" });
    expect(sent).toEqual([]);
    expect(notify).toHaveBeenCalledOnce();
  });

  it("tells the editor when it fails", async () => {
    const { sdk } = makeSdk([makeUr(1)], { failComment: [1] });
    const notify = silent();

    await runCloseOne(sdk, 1, { confirm: accept(), notify });

    expect(notify.mock.calls[0]?.[0]).toContain("the message could not be sent");
  });
});

describe("runCloseAll", () => {
  it("refuses below level 3 without asking anything", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)], { rank: 1 });
    const confirm = accept();
    const notify = silent();

    expect(await runCloseAll(sdk, [1], { confirm, notify })).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    expect(notify.mock.calls[0]?.[0]).toContain("level 3");
    expect(calls).toEqual([]);
  });

  it("states how many messages leave, in which languages, before sending", async () => {
    const urs = [
      makeUr(1),
      makeUr(2),
      makeUr(3, { userPreferences: { language: "deutsch" } as never }),
    ];
    const { sdk, sent } = makeSdk(urs);
    const confirm = accept();
    const notify = silent();

    const outcomes = await runCloseAll(sdk, [1, 2, 3], { confirm, notify });

    const shown = confirm.mock.calls[0]?.[0] ?? "";
    expect(shown).toContain("3 messages will be sent now (2 FR, 1 DE)");
    expect(shown).toContain("cannot be withdrawn");
    expect(outcomes).toHaveLength(3);
    expect(sent).toHaveLength(3);
    expect(notify.mock.calls[0]?.[0]).toContain("3 closed, 0 skipped, 0 failed.");
    expect(notify.mock.calls[0]?.[0]).toContain("Save to record the closures.");
  });

  it("sends nothing when the editor declines", async () => {
    const { sdk, sent } = makeSdk([makeUr(1)]);

    expect(await runCloseAll(sdk, [1], { confirm: decline(), notify: silent() })).toBeNull();
    expect(sent).toEqual([]);
  });

  it("refuses a second flow while one is running", async () => {
    const { sdk, sent } = makeSdk([makeUr(1), makeUr(2)]);
    let release: (value: boolean) => void = () => {};
    const slowConfirm = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)));

    const first = runCloseOne(sdk, 1, { confirm: slowConfirm, notify: silent() });
    expect(isCloseInFlight()).toBe(true);
    const second = await runCloseAll(sdk, [2], { confirm: accept(), notify: silent() });
    // `release` is only assigned once the first flow reaches its dialog.
    await vi.waitFor(() => expect(slowConfirm).toHaveBeenCalled());
    release(true);
    await first;

    expect(second).toBeNull();
    expect(sent.map((s) => s.id)).toEqual([1]);
    expect(isCloseInFlight()).toBe(false);
  });
});
```

- [ ] **Step 3: Vérifier qu'il échoue**

Run: `npx vitest run src/speed-camera-urs/flows.test.ts`
Expected: FAIL, `isCloseInFlight` / `runCloseOne` / `runCloseAll` non exportés.

- [ ] **Step 4: Compléter `close.ts`**

Ajouter aux imports en tête de `close.ts` :

```ts
import { getLocale } from "./i18n";
import { describeLanguages } from "./message";
import { confirmDialog, notifyDialog, type Confirm, type Notify } from "./prompt";
```

(fusionner avec les imports existants de `./i18n` et `./message` plutôt que de dupliquer les lignes), puis ajouter en fin de fichier :

```ts
export interface Prompts {
  confirm?: Confirm;
  notify?: Notify;
}

let inFlight = false;

export function isCloseInFlight(): boolean {
  return inFlight;
}

/**
 * Runs `work` unless another flow is already running, in which case null. The lock is held
 * from the confirmation on, so a double click or a batch started while a single UR's dialog
 * is open cannot send anything twice.
 */
async function withCloseLock<T>(work: () => Promise<T>): Promise<T | null> {
  if (inFlight) return null;
  inFlight = true;
  try {
    return await work();
  } finally {
    inFlight = false;
  }
}

/**
 * One UR, from the tab. Open to every level: closing one by one is how an editor learns.
 * The confirmation shows the exact text and its language, and says when a conversation is
 * already there.
 */
export function runCloseOne(
  sdk: WmeSDK,
  id: number,
  prompts: Prompts = {},
): Promise<CloseOutcome | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  return withCloseLock(async () => {
    const urs = sdk.DataModel.MapUpdateRequests;
    const ur = urs.getById({ mapUpdateRequestId: id });
    if (!ur) return null;
    const lang = messageLanguage(ur.userPreferences?.language);

    let comments: ConversationElement[] = [];
    try {
      comments = (await urs.getUpdateRequestDetails({ mapUpdateRequestId: id }))?.comments ?? [];
    } catch {
      // closeOne reads it again and reports the failure properly.
    }
    const hasConversation = triage(comments, wasMessaged(id)) === "conversation";
    const key = hasConversation ? "confirmOneConversation" : "confirmOne";
    const accepted = await confirm(t(key, { lang: lang.toUpperCase(), message: buildMessage(lang) }));
    if (!accepted) return null;

    // Allowed only when the editor was actually warned: a comment arriving while the dialog
    // was open still stops the send.
    const outcome = await closeOne(sdk, id, { allowConversation: hasConversation });
    if (outcome.result !== "closed") await notify(summarize([outcome]));
    return outcome;
  });
}

/** Every ready UR at once, level 3 and up. The rank is checked before anything is asked. */
export async function runCloseAll(
  sdk: WmeSDK,
  ids: readonly number[],
  prompts: Prompts = {},
): Promise<CloseOutcome[] | null> {
  const confirm = prompts.confirm ?? confirmDialog;
  const notify = prompts.notify ?? notifyDialog;
  if (!canBatch(sdk)) {
    await notify(t("errBatchRank", { level: BATCH_MIN_RANK + 1 }));
    return null;
  }
  const batch = ids.slice(0, BATCH_CAP);
  if (batch.length === 0) return [];

  return withCloseLock(async () => {
    const langs = batch.map((id) =>
      messageLanguage(
        sdk.DataModel.MapUpdateRequests.getById({ mapUpdateRequestId: id })?.userPreferences
          ?.language,
      ),
    );
    const accepted = await confirm(
      t("confirmAll", {
        count: batch.length,
        languages: describeLanguages(langs),
        message: buildMessage(getLocale()),
      }),
    );
    if (!accepted) return null;

    const outcomes = await closeMany(sdk, batch);
    if (outcomes) await notify(summarize(outcomes));
    return outcomes;
  });
}
```

- [ ] **Step 5: Vérifier que ça passe**

Run: `npx vitest run src/speed-camera-urs && npx tsc --noEmit`
Expected: PASS, y compris les tests des Tasks 1 à 4.

- [ ] **Step 6: Commit**

```bash
git add src/speed-camera-urs/prompt.ts src/speed-camera-urs/close.ts src/speed-camera-urs/flows.test.ts
git commit -m "feat(speed-camera-urs): confirm before sending, one UR or all"
```

---

### Task 6: analyse de l'écran (`scanner.ts`)

**Files:**
- Create: `src/speed-camera-urs/scanner.ts`
- Test: `src/speed-camera-urs/scanner.test.ts`

**Interfaces:**
- Consumes: `isSpeedCameraUr`, `isInExtent`, `triage`, `Triage` (Task 2), `messageLanguage` (Task 3), `wasMessaged` (Task 4), `LocaleCode`, `log`.
- Produces: `interface UrEntry { id: number; lon: number; lat: number; reportedOn: number; lang: LocaleCode; triage: Triage | "pending" }`, `interface ScanSnapshot { entries: UrEntry[] }`, `class Scanner` avec `start()`, `onUpdate(listener)`, `getSnapshot()`, `schedule()`, `rescan(): Promise<void>`, `forget(ids)`.

- [ ] **Step 1: Écrire le test qui échoue**

`src/speed-camera-urs/scanner.test.ts` :

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { noteMessaged, resetMessagedForTests } from "./close";
import { makeSdk, makeUr } from "./fake-sdk";
import { Scanner, type ScanSnapshot } from "./scanner";

const comment = { createdOn: 0, text: "hello", userName: null };

beforeEach(() => resetMessagedForTests());

describe("Scanner.rescan", () => {
  it("keeps only open speed-camera URs inside the map extent, oldest first", async () => {
    const urs = [
      makeUr(1, { reportedOn: 300 }),
      makeUr(2, { reportedOn: 100 }),
      makeUr(3, { isOpen: false }),
      makeUr(4, { description: "Missing road" }),
      makeUr(5, { geometry: { type: "Point", coordinates: [8.5, 47.3] } }),
    ];
    const scanner = new Scanner(makeSdk(urs).sdk);

    await scanner.rescan();

    expect(scanner.getSnapshot().entries.map((e) => e.id)).toEqual([2, 1]);
  });

  it("shows URs as pending first, then sorts them once their conversation is read", async () => {
    const { sdk } = makeSdk([makeUr(1), makeUr(2)], { comments: { 2: [comment] } });
    const scanner = new Scanner(sdk);
    const snapshots: ScanSnapshot[] = [];
    scanner.onUpdate((snapshot) => snapshots.push(snapshot));

    await scanner.rescan();

    expect(snapshots[0]?.entries.map((e) => e.triage)).toEqual(["pending", "pending"]);
    expect(scanner.getSnapshot().entries.map((e) => e.triage)).toEqual(["ready", "conversation"]);
  });

  it("reads each conversation once, until the UR is reported as changed", async () => {
    const { sdk, calls } = makeSdk([makeUr(1)]);
    const scanner = new Scanner(sdk);

    await scanner.rescan();
    await scanner.rescan();
    expect(calls).toEqual(["details:1"]);

    scanner.forget([1]);
    await scanner.rescan();
    expect(calls).toEqual(["details:1", "details:1"]);
  });

  it("keeps a UR pending when its details fail, and retries", async () => {
    const failDetails = [1];
    const { sdk, calls } = makeSdk([makeUr(1)], { failDetails });
    const scanner = new Scanner(sdk);

    await scanner.rescan();
    expect(scanner.getSnapshot().entries[0]?.triage).toBe("pending");

    failDetails.length = 0;
    await scanner.rescan();
    expect(calls).toEqual(["details:1", "details:1"]);
    expect(scanner.getSnapshot().entries[0]?.triage).toBe("ready");
  });

  it("puts a UR this session already messaged under conversation, even if cached ready", async () => {
    const { sdk } = makeSdk([makeUr(1)]);
    const scanner = new Scanner(sdk);
    await scanner.rescan();

    noteMessaged(1);
    await scanner.rescan();

    expect(scanner.getSnapshot().entries[0]?.triage).toBe("conversation");
  });

  it("carries the reporter's language and position", async () => {
    const ur = makeUr(1, { userPreferences: { language: "deutsch" } as never });
    const scanner = new Scanner(makeSdk([ur]).sdk);

    await scanner.rescan();

    expect(scanner.getSnapshot().entries[0]).toMatchObject({ lang: "de", lon: 6.6, lat: 46.5 });
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run src/speed-camera-urs/scanner.test.ts`
Expected: FAIL, `Failed to resolve import "./scanner"`.

- [ ] **Step 3: Écrire `scanner.ts`**

```ts
import type { MapUpdateRequest, WmeSDK } from "wme-sdk-typings";
import { wasMessaged } from "./close";
import { isInExtent, isSpeedCameraUr, triage, type Triage } from "./detect";
import type { LocaleCode } from "./i18n";
import { log } from "./log";
import { messageLanguage } from "./message";

export interface UrEntry {
  id: number;
  lon: number;
  lat: number;
  reportedOn: number;
  lang: LocaleCode;
  /** "pending" until the conversation is read: no action is offered on it meanwhile. */
  triage: Triage | "pending";
}

export interface ScanSnapshot {
  entries: UrEntry[];
}

const DEBOUNCE_MS = 300;
const MODEL = "mapUpdateRequests";

/**
 * Keeps the list of speed-camera URs on screen.
 *
 * The data model already holds the URs with their description, so finding them costs
 * nothing; only the conversation needs a server round trip, and only for the URs that
 * matched. Those are read one after the other and remembered until WME reports the UR as
 * changed.
 */
export class Scanner {
  private triageCache = new Map<number, Triage>();
  private snapshot: ScanSnapshot = { entries: [] };
  private listeners: Array<(snapshot: ScanSnapshot) => void> = [];
  /** Bumped by every rescan, so a slow one stops publishing once a newer one started. */
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private sdk: WmeSDK) {}

  start(): void {
    try {
      // Data-model events only fire for tracked models.
      this.sdk.Events.trackDataModelEvents({ dataModelName: MODEL });
    } catch (err) {
      log.warn("Could not track update requests; the list follows map moves only", err);
    }
    const onModelEvent = (changed: boolean) => (payload: { dataModelName: string; objectIds: Array<string | number> }) => {
      if (payload.dataModelName !== MODEL) return;
      // A changed UR may have gained a comment or been reopened by an undo.
      if (changed) this.forget(payload.objectIds);
      this.schedule();
    };
    this.sdk.Events.on({ eventName: "wme-data-model-objects-added", eventHandler: onModelEvent(false) });
    this.sdk.Events.on({ eventName: "wme-data-model-objects-changed", eventHandler: onModelEvent(true) });
    this.sdk.Events.on({ eventName: "wme-data-model-objects-removed", eventHandler: onModelEvent(false) });
    this.sdk.Events.on({ eventName: "wme-map-move-end", eventHandler: () => this.schedule() });
    this.schedule();
  }

  onUpdate(listener: (snapshot: ScanSnapshot) => void): void {
    this.listeners.push(listener);
  }

  getSnapshot(): ScanSnapshot {
    return this.snapshot;
  }

  forget(ids: ReadonlyArray<string | number>): void {
    for (const id of ids) this.triageCache.delete(Number(id));
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.rescan(), DEBOUNCE_MS);
  }

  async rescan(): Promise<void> {
    const generation = ++this.generation;
    const extent = this.sdk.Map.getMapExtent();
    const found = this.sdk.DataModel.MapUpdateRequests.getAll()
      .filter((ur) => isSpeedCameraUr(ur) && isInExtent(ur, extent))
      .sort((a, b) => a.reportedOn - b.reportedOn);
    this.publish(found);

    for (const ur of found) {
      if (this.triageCache.has(ur.id)) continue;
      try {
        const details = await this.sdk.DataModel.MapUpdateRequests.getUpdateRequestDetails({
          mapUpdateRequestId: ur.id,
        });
        // Not cached on failure or absence: the UR stays pending and the next scan retries.
        if (details) this.triageCache.set(ur.id, triage(details.comments, false));
      } catch (err) {
        log.warn(`Could not read the conversation of UR ${ur.id}`, err);
      }
      if (generation !== this.generation) return;
      this.publish(found);
    }
  }

  private publish(found: MapUpdateRequest[]): void {
    this.snapshot = { entries: found.map((ur) => this.toEntry(ur)) };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private toEntry(ur: MapUpdateRequest): UrEntry {
    const [lon = 0, lat = 0] = ur.geometry.coordinates;
    // Checked at every publish rather than cached: a Ctrl+Z reopens a UR we already messaged.
    const cached = wasMessaged(ur.id) ? "conversation" : this.triageCache.get(ur.id);
    return {
      id: ur.id,
      lon,
      lat,
      reportedOn: ur.reportedOn,
      lang: messageLanguage(ur.userPreferences?.language),
      triage: cached ?? "pending",
    };
  }
}
```

- [ ] **Step 4: Vérifier que ça passe**

Run: `npx vitest run src/speed-camera-urs && npx tsc --noEmit && npx eslint src/speed-camera-urs`
Expected: PASS. Si `tsc` refuse le type du `payload` dans `eventHandler`, typer `onModelEvent` avec le type d'événement du SDK (`dataModelName: DataModelName`) en l'important depuis `wme-sdk-typings` s'il est exporté, sinon garder `string` et caster à l'appel, sans changer le comportement.

- [ ] **Step 5: Commit**

```bash
git add src/speed-camera-urs/scanner.ts src/speed-camera-urs/scanner.test.ts
git commit -m "feat(speed-camera-urs): track the speed-camera URs on screen"
```

---

### Task 7: textes de l'onglet (`ui/format.ts`)

**Files:**
- Create: `src/speed-camera-urs/ui/format.ts`
- Test: `src/speed-camera-urs/ui/format.test.ts`

**Interfaces:**
- Consumes: `UrEntry` (Task 6), `BATCH_CAP` (Task 4), `t`, `LocaleCode` (Task 1).
- Produces: `interface Lists { ready: UrEntry[]; conversation: UrEntry[]; pending: UrEntry[] }`, `splitEntries(entries): Lists`, `formatStatus(entries): string`, `formatRowLabel(entry, locale): string`, `formatCloseAllButton(readyCount): string`, `shouldShowCloseAll(allowed, readyCount): boolean`.

- [ ] **Step 1: Écrire le test qui échoue**

`src/speed-camera-urs/ui/format.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { BATCH_CAP } from "../close";
import type { UrEntry } from "../scanner";
import {
  formatCloseAllButton,
  formatRowLabel,
  formatStatus,
  shouldShowCloseAll,
  splitEntries,
} from "./format";

const entry = (id: number, triage: UrEntry["triage"]): UrEntry => ({
  id,
  lon: 6.6,
  lat: 46.5,
  reportedOn: Date.UTC(2026, 9, 1),
  lang: "de",
  triage,
});

describe("splitEntries", () => {
  it("sorts entries into the three groups, keeping their order", () => {
    const lists = splitEntries([entry(1, "ready"), entry(2, "pending"), entry(3, "conversation"), entry(4, "ready")]);
    expect(lists.ready.map((e) => e.id)).toEqual([1, 4]);
    expect(lists.pending.map((e) => e.id)).toEqual([2]);
    expect(lists.conversation.map((e) => e.id)).toEqual([3]);
  });
});

describe("formatStatus", () => {
  it("says when nothing is on screen, and why that may be", () => {
    expect(formatStatus([])).toContain("must be shown on the map");
  });

  it("counts the URs and the ones still being checked", () => {
    expect(formatStatus([entry(1, "ready"), entry(2, "pending")])).toBe(
      "2 speed-camera UR(s) on screen, checking 1",
    );
    expect(formatStatus([entry(1, "ready")])).toBe("1 speed-camera UR(s) on screen");
  });
});

describe("formatRowLabel", () => {
  it("shows the id, the reporter's language and the date", () => {
    const label = formatRowLabel(entry(27011214, "ready"), "fr");
    expect(label).toMatch(/^#27011214 · DE · /);
    expect(label).toContain("2026");
  });
});

describe("formatCloseAllButton", () => {
  it("names the count, and the cap when there are more", () => {
    expect(formatCloseAllButton(12)).toBe("Handle all (12)");
    expect(formatCloseAllButton(BATCH_CAP + 5)).toBe(`Handle ${BATCH_CAP} of ${BATCH_CAP + 5}`);
  });
});

describe("shouldShowCloseAll", () => {
  it("hides the batch below the level and when there is nothing to do", () => {
    expect(shouldShowCloseAll(true, 3)).toBe(true);
    expect(shouldShowCloseAll(false, 3)).toBe(false);
    expect(shouldShowCloseAll(true, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `npx vitest run src/speed-camera-urs/ui/format.test.ts`
Expected: FAIL, `Failed to resolve import "./format"`.

- [ ] **Step 3: Écrire `ui/format.ts`**

```ts
import { BATCH_CAP } from "../close";
import { t, type LocaleCode } from "../i18n";
import type { UrEntry } from "../scanner";

/** The tab's wording, kept free of DOM so it can be tested. */

export interface Lists {
  ready: UrEntry[];
  conversation: UrEntry[];
  pending: UrEntry[];
}

export function splitEntries(entries: readonly UrEntry[]): Lists {
  return {
    ready: entries.filter((e) => e.triage === "ready"),
    conversation: entries.filter((e) => e.triage === "conversation"),
    pending: entries.filter((e) => e.triage === "pending"),
  };
}

export function formatStatus(entries: readonly UrEntry[]): string {
  if (entries.length === 0) return t("stateNone");
  const found = t("stateFound", { count: entries.length });
  const pending = entries.filter((e) => e.triage === "pending").length;
  return pending > 0 ? `${found}, ${t("statePending", { count: pending })}` : found;
}

export function formatRowLabel(entry: UrEntry, locale: LocaleCode): string {
  const date = new Date(entry.reportedOn).toLocaleDateString(locale);
  return `#${entry.id} · ${entry.lang.toUpperCase()} · ${date}`;
}

export function formatCloseAllButton(readyCount: number): string {
  if (readyCount > BATCH_CAP) return t("btnCloseAllCapped", { cap: BATCH_CAP, count: readyCount });
  return t("btnCloseAll", { count: readyCount });
}

/** Hidden, not greyed, below the level: a greyed button still invites the click. */
export function shouldShowCloseAll(allowed: boolean, readyCount: number): boolean {
  return allowed && readyCount > 0;
}
```

- [ ] **Step 4: Vérifier que ça passe**

Run: `npx vitest run src/speed-camera-urs && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/speed-camera-urs/ui/format.ts src/speed-camera-urs/ui/format.test.ts
git commit -m "feat(speed-camera-urs): wording of the tab"
```

---

### Task 8: onglet, point d'entrée et branchement

**Files:**
- Create: `src/speed-camera-urs/ui/styles.ts`
- Create: `src/speed-camera-urs/ui/tab.ts`
- Create: `src/speed-camera-urs/index.ts`
- Modify: `main.user.ts` (import en tête, appel après `void initHouseNumberImporter();`)

**Interfaces:**
- Consumes: `Scanner`, `UrEntry` (Task 6), `canBatch`, `isCloseInFlight`, `runCloseOne`, `runCloseAll`, `summarize`, `CloseOutcome` (Tasks 4-5), tout `ui/format.ts` (Task 7), `getLocale`, `normalizeLocale`, `setLocale`, `t` (Task 1), `el`, `button`, `icon`, `buildSection` (`src/ui/dom.ts`), `componentRules` (`src/ui/components.ts`), `tokenRules` (`src/ui/tokens.ts`), `injectStyleOnce` (`src/ui/inject.ts`), `groupScriptTab`, `tabLabelText` (`src/ui/tab-group.ts`), `applyThemeClass`, `watchTheme` (`src/ui/theme.ts`).
- Produces: `initSpeedCameraUrs(): Promise<void>`.

Pas de test unitaire ici : c'est du DOM et du câblage SDK, couvert par le test manuel (Task 9).

- [ ] **Step 1: Écrire `ui/styles.ts`**

```ts
import { componentRules } from "../../ui/components";
import { injectStyleOnce } from "../../ui/inject";
import { tokenRules } from "../../ui/tokens";

/** Everything generic comes from src/ui; only the list rows are specific to this tab. */
const CSS = `
${tokenRules("scu", [".scu-pane"])}
${componentRules("scu")}

.scu-list { display: flex; flex-direction: column; gap: 4px; }
.scu-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.scu-row-label { font-variant-numeric: tabular-nums; }
/* The summary carries one problem per line. */
.scu-warn { white-space: pre-line; }
`;

export function injectStyles(): void {
  injectStyleOnce("speed-camera-urs", CSS);
}
```

- [ ] **Step 2: Écrire `ui/tab.ts`**

```ts
import type { WmeSDK } from "wme-sdk-typings";
import { buildSection, button, el, icon } from "../../ui/dom";
import { groupScriptTab, tabLabelText } from "../../ui/tab-group";
import { applyThemeClass, watchTheme } from "../../ui/theme";
import {
  canBatch,
  isCloseInFlight,
  runCloseAll,
  runCloseOne,
  summarize,
  type CloseOutcome,
} from "../close";
import { getLocale, t } from "../i18n";
import { log } from "../log";
import type { Scanner, UrEntry } from "../scanner";
import {
  formatCloseAllButton,
  formatRowLabel,
  formatStatus,
  shouldShowCloseAll,
  splitEntries,
} from "./format";
import { injectStyles } from "./styles";

/** The title span of a section built by buildSection: the icon is an <i>, the title a <span>. */
function setSectionTitle(section: HTMLDetailsElement, text: string): void {
  const title = section.querySelector("summary span");
  if (title) title.textContent = text;
}

/**
 * The sidebar tab: state, last result, batch button, then the two lists.
 *
 * The skeleton is built once and only the live parts are rewritten, so the editor's
 * expand/collapse of a section survives the rescans that every map move triggers.
 */
export class TabUI {
  private tabPane: HTMLElement | null = null;
  private banner = el("div", "scu-banner");
  private bannerText = el("span", "scu-banner-text");
  private result = el("div", "scu-warn");
  private actions = el("div", "scu-actions");
  private readyList = el("div", "scu-list");
  private conversationList = el("div", "scu-list");
  private readySection: HTMLDetailsElement | null = null;
  private conversationSection: HTMLDetailsElement | null = null;

  constructor(
    private sdk: WmeSDK,
    private scanner: Scanner,
  ) {}

  async init(): Promise<void> {
    injectStyles();
    try {
      const { tabLabel, tabPane } = await this.sdk.Sidebar.registerScriptTab();
      this.tabPane = tabPane;
      tabLabel.textContent = tabLabelText(t("appName"));
      groupScriptTab(tabLabel, tabPane, "speed-camera-urs");
    } catch (err) {
      log.error("Could not register the sidebar tab", err);
      return;
    }
    applyThemeClass(this.tabPane);
    watchTheme(this.tabPane);
    this.buildSkeleton();
    this.scanner.onUpdate(() => this.render());
    this.render();
  }

  private buildSkeleton(): void {
    if (!this.tabPane) return;
    const pane = el("div", "scu-pane");

    const brand = el("div", "scu-brand");
    brand.append(icon("warning", "scu-brand-icon"), el("span", "scu-brand-title", t("appName")));

    this.banner.replaceChildren(this.bannerText);
    this.result.hidden = true;
    this.readySection = buildSection(
      "scu",
      "location",
      t("sectionReady", { count: 0 }),
      [this.readyList],
      true,
    );
    this.conversationSection = buildSection(
      "scu",
      "warning",
      t("sectionConversation", { count: 0 }),
      [el("div", "scu-note", t("conversationNote")), this.conversationList],
    );

    pane.append(
      brand,
      el("div", "scu-note", t("tabNote")),
      this.banner,
      this.result,
      this.actions,
      this.readySection,
      this.conversationSection,
    );
    this.tabPane.replaceChildren(pane);
  }

  private render(): void {
    if (!this.tabPane || !this.readySection || !this.conversationSection) return;
    const entries = this.scanner.getSnapshot().entries;
    const lists = splitEntries(entries);
    this.bannerText.textContent = formatStatus(entries);

    // Pending URs sit with the ready ones, without a button until their conversation is read.
    const readyRows = [...lists.ready, ...lists.pending].map((entry) => this.row(entry));
    this.readyList.replaceChildren(...readyRows);
    this.conversationList.replaceChildren(...lists.conversation.map((entry) => this.row(entry)));
    setSectionTitle(this.readySection, t("sectionReady", { count: lists.ready.length + lists.pending.length }));
    setSectionTitle(this.conversationSection, t("sectionConversation", { count: lists.conversation.length }));

    this.actions.replaceChildren();
    if (shouldShowCloseAll(canBatch(this.sdk), lists.ready.length)) {
      const ids = lists.ready.map((entry) => entry.id);
      const all = button(
        formatCloseAllButton(lists.ready.length),
        () => void this.handle(() => runCloseAll(this.sdk, ids)),
        "scu-btn scu-btn-primary",
      );
      all.disabled = isCloseInFlight();
      this.actions.appendChild(all);
    }
  }

  private row(entry: UrEntry): HTMLElement {
    const row = el("div", "scu-row");
    const label = button(formatRowLabel(entry, getLocale()), () => this.centerOn(entry), "scu-plain scu-row-label");
    label.title = t("rowTitle");
    row.appendChild(label);

    if (entry.triage === "pending") {
      row.appendChild(el("span", "scu-muted", t("rowPending")));
      return row;
    }
    const action = button(
      t("btnCloseOne"),
      () => void this.handle(() => runCloseOne(this.sdk, entry.id)),
      "scu-btn",
    );
    action.disabled = isCloseInFlight();
    row.appendChild(action);
    return row;
  }

  /**
   * Runs a flow and shows its result. The flow takes its lock synchronously, so rendering
   * right after starting it already greys every button for the duration.
   */
  private async handle(start: () => Promise<CloseOutcome | CloseOutcome[] | null>): Promise<void> {
    const running = start();
    this.render();
    const outcome = await running;
    if (outcome) {
      this.result.textContent = summarize(Array.isArray(outcome) ? outcome : [outcome]);
      this.result.hidden = false;
    }
    this.scanner.schedule();
    this.render();
  }

  private centerOn(entry: UrEntry): void {
    try {
      this.sdk.Map.setMapCenter({ lonLat: { lon: entry.lon, lat: entry.lat } });
    } catch (err) {
      log.warn("Could not centre the map", err);
    }
  }
}
```

- [ ] **Step 3: Écrire `index.ts`**

```ts
/**
 * Speed-camera URs: Swiss law forbids showing fixed speed cameras in Waze, yet reporters
 * keep opening URs for them. This lists the open ones on screen, sends each reporter the
 * official explanation in their language and closes the UR as not-identified.
 *
 * Licensed under the repository's GNU AGPL v3.0 or later (see /src note in README).
 */
import type { WmeSDK } from "wme-sdk-typings";
import { normalizeLocale, setLocale } from "./i18n";
import { log } from "./log";
import { Scanner } from "./scanner";
import { TabUI } from "./ui/tab";

// Own scriptId so this feature gets its own Scripts-sidebar tab: registerScriptTab() throws
// if the host's scriptId already owns a tab.
const SCRIPT_ID = "wme-ch-speed-camera-urs";
const SCRIPT_NAME = "WME CH Speed Camera URs";

export async function initSpeedCameraUrs(): Promise<void> {
  await unsafeWindow.SDK_INITIALIZED;
  if (!unsafeWindow.getWmeSdk) throw new Error("getWmeSdk is not available on the page");
  const sdk: WmeSDK = unsafeWindow.getWmeSdk({ scriptId: SCRIPT_ID, scriptName: SCRIPT_NAME });

  await sdk.Events.once({ eventName: "wme-ready" });
  setLocale(normalizeLocale(sdk.Settings.getLocale().localeCode));

  const scanner = new Scanner(sdk);
  await new TabUI(sdk, scanner).init();
  scanner.start();
  log.info(`ready (SDK ${sdk.getSDKVersion()}, WME ${sdk.getWMEVersion()})`);
}
```

- [ ] **Step 4: Brancher dans `main.user.ts`**

Ajouter l'import à côté des deux autres :

```ts
import { initSpeedCameraUrs } from "./src/speed-camera-urs";
```

Et juste après `void initHouseNumberImporter();` :

```ts

    // Speed-camera URs: same arrangement, own scriptId → own tab.
    void initSpeedCameraUrs();
```

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && npx eslint src/speed-camera-urs main.user.ts && npx vitest run && npx rollup -c`
Expected: aucune erreur, toute la suite passe, `.out/main.user.js` est produit.

- [ ] **Step 6: Commit**

```bash
git add src/speed-camera-urs/ui/styles.ts src/speed-camera-urs/ui/tab.ts src/speed-camera-urs/index.ts main.user.ts
git commit -m "feat(speed-camera-urs): sidebar tab and entry point"
```

---

### Task 9: documentation, build et test manuel

**Files:**
- Modify: `CLAUDE.md` (nouvelle section après « House-number importer »)
- Modify: `README.md`, `README.fr.md`, `README.de.md`, `README.it.md` (section Fonctionnalités et changelog `[Unreleased]`)

- [ ] **Step 1: Section dans `CLAUDE.md`**

Insérer avant `## WME SDK Rules` :

```markdown
### Speed-camera URs (`src/speed-camera-urs/`)

Closes the URs that report a fixed speed camera, which Swiss law forbids showing in Waze.
They are recognised by the `MISSING_STATIC_SPEED_CAMERA` prefix of their description; their
type is always `INCORRECT_GENERAL_ERROR`, so the type cannot filter them. Entry point:
`initSpeedCameraUrs()` (`index.ts`), called from `main.user.ts` after the importer, with its
own scriptId for the same reason.

Pipeline: `Scanner` (scanner.ts: data-model events and map extent) → `detect.ts` (prefix,
triage) → `TabUI`. `close.ts` is the only module that writes.

- `message.ts`: `userPreferences.language` is the Waze app's language id, not ISO
  (`francais`, `eng`, `portuguese_pt` observed), hence a prefix rule with English fallback.
- `addComment` sends **immediately** and cannot be withdrawn, while the closure goes to the
  edit stack. That is why the comment goes first and the closure only follows a successful
  send.

**Safety rules:**

- `BATCH_MIN_RANK` (level 3) and `BATCH_CAP` (50) live in `close.ts` and are enforced in
  `closeMany`, not only in the tab. The batch button is hidden below the level.
- Any comment on a UR keeps it out of the batch. `wasMessaged` covers Ctrl+Z: the closure
  is undone but the message is not, and WME's cached conversation may not show it yet.
- Every UR is re-read right before writing; one closed in the meantime is skipped.
- Nothing is ever saved automatically.

Tests: `npx vitest run src/speed-camera-urs`.
```

- [ ] **Step 2: README anglais**

Dans `README.md`, section `## 🌟 Features`, après le bloc **Official Street-Name Check** :

```markdown

- **Speed-Camera URs**  
  Lists the open URs on screen that report a fixed speed camera, which Swiss law does not allow Waze to show, and closes them with the official explanation in the reporter's language. A dedicated **CH · Speed cameras** sidebar tab holds the list.
```

Sous `### [Unreleased]` :

```markdown

#### Added

- **Closing speed-camera URs.** Swiss law forbids showing fixed speed cameras in Waze, yet reporters keep opening URs for them. A new **CH · Speed cameras** tab lists the open ones on screen, sends each reporter the official explanation in their own language and closes the UR as *Not identified*. Any editor can close them one by one; handling them all at once (up to 50) needs level 3. URs that already carry a comment are left out of the batch. Messages are sent immediately and cannot be withdrawn; the closures still need saving.
```

- [ ] **Step 3: README français, allemand, italien**

Repérer les titres équivalents (`grep -n "^## \|^### \[" README.fr.md README.de.md README.it.md`) et insérer aux mêmes endroits.

`README.fr.md`, fonctionnalité :

```markdown

- **UR radar**  
  Liste les UR ouverts à l'écran qui signalent un radar fixe, que la loi suisse interdit d'afficher dans Waze, et les ferme avec l'explication officielle dans la langue de l'utilisateur. Un onglet dédié **CH · Radars** contient la liste.
```

`README.fr.md`, changelog :

```markdown

#### Ajouté

- **Fermeture des UR radar.** La loi suisse interdit d'afficher les radars fixes dans Waze, mais des utilisateurs continuent d'ouvrir des UR pour les signaler. Un nouvel onglet **CH · Radars** liste ceux qui sont ouverts à l'écran, envoie à chaque utilisateur l'explication officielle dans sa langue et ferme l'UR en *Non identifié*. Tout éditeur peut les fermer un par un ; les traiter tous d'un coup (50 au plus) demande le niveau 3. Les UR qui portent déjà un commentaire sont exclus du lot. Les messages partent immédiatement et ne peuvent pas être retirés ; les fermetures doivent encore être sauvegardées.
```

`README.de.md`, fonctionnalité :

```markdown

- **Radar-URs**  
  Listet die offenen URs im Bildausschnitt, die ein fest installiertes Radar melden, das Waze nach Schweizer Recht nicht anzeigen darf, und schliesst sie mit der offiziellen Erklärung in der Sprache der meldenden Person. Ein eigener Tab **CH · Radare** enthält die Liste.
```

`README.de.md`, changelog :

```markdown

#### Hinzugefügt

- **Schliessen von Radar-URs.** Das Schweizer Recht verbietet, fest installierte Radare in Waze anzuzeigen, trotzdem eröffnen Nutzer immer wieder URs dafür. Ein neuer Tab **CH · Radare** listet die offenen im Bildausschnitt, sendet jeder meldenden Person die offizielle Erklärung in ihrer Sprache und schliesst die UR als *Nicht identifiziert*. Jeder Editor kann sie einzeln schliessen; alle auf einmal zu bearbeiten (höchstens 50) erfordert Level 3. URs mit einem Kommentar sind davon ausgenommen. Die Nachrichten werden sofort gesendet und können nicht zurückgezogen werden; die Schliessungen müssen noch gespeichert werden.
```

`README.it.md`, fonctionnalité :

```markdown

- **UR autovelox**  
  Elenca le UR aperte sullo schermo che segnalano un autovelox fisso, che la legge svizzera non permette a Waze di mostrare, e le chiude con la spiegazione ufficiale nella lingua di chi ha segnalato. Una scheda dedicata **CH · Autovelox** contiene l'elenco.
```

`README.it.md`, changelog :

```markdown

#### Aggiunto

- **Chiusura delle UR autovelox.** La legge svizzera vieta di mostrare gli autovelox fissi in Waze, eppure gli utenti continuano ad aprire UR per segnalarli. Una nuova scheda **CH · Autovelox** elenca quelle aperte sullo schermo, invia a chi ha segnalato la spiegazione ufficiale nella sua lingua e chiude la UR come *Non identificata*. Ogni editor può chiuderle una per una; trattarle tutte in una volta (al massimo 50) richiede il livello 3. Le UR che hanno già un commento sono escluse. I messaggi partono subito e non possono essere ritirati; le chiusure vanno ancora salvate.
```

- [ ] **Step 4: Vérification complète**

Run: `npm run lint && npx tsc --noEmit && npx vitest run && npm run build && ! git diff main -U0 | grep '^+' | grep '—'`
Expected: lint, types, tests et build OK, et le dernier `grep` ne trouve rien (aucun tiret cadratin introduit par la branche).

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md README.fr.md README.de.md README.it.md
git commit -m "docs(speed-camera-urs): document the feature and its safety rules"
```

- [ ] **Step 6: Test manuel dans WME (Yann)**

Installer `releases/release-<version>.user.js` dans Tampermonkey, puis sur une zone avec des UR radar :

1. L'onglet **CH · Radars** apparaît, rangé avec les deux autres onglets `CH ·`.
2. Le nombre affiché correspond aux UR radar ouverts visibles. Masquer la couche des UR : le message « Aucun UR radar… » s'affiche.
3. **Les dates des lignes sont plausibles** (sinon `reportedOn` n'est pas en millisecondes : le signaler).
4. Cliquer sur une ligne centre la carte sur l'UR.
5. « Fermer avec message » sur un UR : la confirmation montre la langue et le texte exact, l'UR disparaît de la liste, le bilan rappelle de sauvegarder. Sauvegarder.
6. Fermer un autre UR, puis Ctrl+Z : il réapparaît sous « Déjà une conversation », et « Tout traiter » ne le compte pas. Le refermer, sauvegarder.
7. Avec un compte de niveau 1 ou 2, si disponible : pas de bouton « Tout traiter ».
8. « Tout traiter » : la confirmation annonce le nombre et la répartition des langues, le bilan s'affiche, sauvegarder.

- [ ] **Step 7: PR**

Ne pas pousser sans le « go » explicite de Yann. Ensuite, suivre le skill `contribute` : `git push -u origin feat/speed-camera-urs`, `gh pr create --base main`, revue demandée à `73VW`, corps de PR sans mention de Claude.
