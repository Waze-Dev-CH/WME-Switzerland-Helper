/**
 * Portions copyright (c) 2020 Francesco Bedini, MIT license.
 * See LICENSE.original.
 *
 * Substantial modifications copyright (c) 2025 Maël Pedretti.
 * These modifications are dual-licensed under the GNU AGPL v3.0 or later,
 * but the file as a whole remains available under the original MIT license.
 *
 * See LICENSE.original and LICENSE for more details.
 */

import { WmeSDK } from "wme-sdk-typings";
import { TileLayer } from "./src/tileLayer";
import { Layer } from "./src/layer";
import { PublicTransportStopsLayer } from "./src/publicTransportStopsLayer";
import i18next from "./locales/i18n";
import {
  SidebarSection,
  SidebarTab,
  Paragraph,
  SidebarItem,
} from "./src/sidebar";

const englishScriptName = "WME Switzerland helper";
let scriptName = englishScriptName;

// the sdk initScript function will be called after the SDK is initialized
unsafeWindow.SDK_INITIALIZED.then(initScript);

function initScript() {
  // initialize the sdk, these should remain here at the top of the script
  if (!unsafeWindow.getWmeSdk) {
    // This block is required for type checking, but it is guaranteed that the function exists.
    throw new Error("SDK not available");
  }
  const wmeSDK: WmeSDK = unsafeWindow.getWmeSdk({
    scriptId: "wme-switzerland-helper", // TODO: replace with your script id and script name
    scriptName: englishScriptName, // TODO
  });

  console.debug(
    `SDK v. ${wmeSDK.getSDKVersion()} on ${wmeSDK.getWMEVersion()} initialized`,
  );
  // --- Initialisation améliorée ---
  const layers = new Map<string, Layer>();

  function activateLanguage() {
    const { localeCode } = wmeSDK.Settings.getLocale();
    i18next.changeLanguage(localeCode);
    scriptName = i18next.t("common:scriptName", englishScriptName);
  }

  function createLayers() {
    const layerList = [
      new TileLayer({
        wmeSDK: wmeSDK,
        name: i18next.t(
          "common:layers.boundaries.municipality",
          "Municipal boundaries",
        ),
        tileHeight: 256,
        tileWidth: 256,
        fileName: "${z}/${x}/${y}.png",
        servers: [
          "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill/default/current/3857",
        ],
        zIndex: 2039,
      }),
      new TileLayer({
        wmeSDK: wmeSDK,
        name: i18next.t(
          "common:layers.boundaries.state",
          "Cantonal boundaries",
        ),
        tileHeight: 256,
        tileWidth: 256,
        fileName: "${z}/${x}/${y}.png",
        servers: [
          "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissboundaries3d-kanton-flaeche.fill/default/current/3857",
        ],
        zIndex: 2038,
      }),
      new TileLayer({
        wmeSDK: wmeSDK,
        name: i18next.t("common:layers.3d", "Geographical Names swissNAMES3D"),
        tileHeight: 256,
        tileWidth: 256,
        fileName: "${z}/${x}/${y}.png",
        servers: [
          "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissnames3d/default/current/3857",
        ],
        zIndex: 2037,
      }),
      new TileLayer({
        wmeSDK: wmeSDK,
        name: i18next.t(
          "common:layers.topo.national_colors",
          "National Maps (color)",
        ),
        tileHeight: 256,
        tileWidth: 256,
        fileName: "${z}/${x}/${y}.jpeg",
        servers: [
          "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857",
        ],
        zIndex: 2036,
      }),
      new TileLayer({
        wmeSDK: wmeSDK,
        name: i18next.t(
          "common:layers.background.swissimage",
          "SWISSIMAGE Background",
        ),
        tileHeight: 256,
        tileWidth: 256,
        fileName: "${z}/${x}/${y}.jpeg",
        servers: [
          "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857",
        ],
      }),
      new PublicTransportStopsLayer({
        wmeSDK: wmeSDK,
        name: i18next.t(
          "common:layers.public_transport_stops",
          "Public Transport Stops",
        ),
      }),
    ];
    for (const layer of layerList) {
      layers.set(layer.name, layer);
    }
  }

  // State restoration delegated to each layer

  // Per-layer events are registered inside each layer class

  async function addScriptTab() {
    const { tabLabel, tabPane } = await wmeSDK.Sidebar.registerScriptTab();
    tabLabel.innerText = scriptName;

    const sidebarTab = new SidebarTab({ scriptName });

    // Introduction paragraph
    sidebarTab.addChild(
      new Paragraph({
        content: i18next.t(
          "common:introduction",
          "This script adds map layers that can be activated from the right navigation bar, at the very bottom.",
        ),
      }),
    );

    // Readme link paragraph
    sidebarTab.addChild(
      new Paragraph({
        content: i18next.t(
          "common:readmeLink",
          "For more information, see the full documentation.",
        ),
        cssClass: "toto",
      }),
    );

    // Notes section with children
    const notesSection = new SidebarSection({
      name: i18next.t("common:note.layers.background.swissimage", "Notes"),
    });

    // Swissimage update note item
    notesSection.addChild(
      new SidebarItem({
        name: i18next.t(
          "common:layers.background.swissimage",
          "SWISSIMAGE Background",
        ),
        icon: "w-icon-map",
        content: i18next.t(
          "common:swissimageUpdateText",
          'This <a href ="https://map.geo.admin.ch/#/map?lang=fr&center=2638909.25,1198316.5&z=1.967&topic=swisstopo&layers=ch.swisstopo.images-swissimage-dop10.metadata&bgLayer=ch.swisstopo.pixelkarte-farbe&featureInfo=default&catalogNodes=swisstopo" target="_blank" rel="noopener noreferrer">map</a> shows when the <b>{{layer}}</b> map was updated for each region.',
          { layer: i18next.t("common:layers.background.swissimage") },
        ),
      }),
    );

    // Public transport stops note item
    notesSection.addChild(
      new SidebarItem({
        name: i18next.t(
          "common:layers.public_transport_stops",
          "Public Transport Stops",
        ),
        icon: "w-icon-bus",
        content: i18next.t(
          "common:publicTransportStopsNote",
          "Public transport stops appear as orange circular icons on the map.",
        ),
      }),
    );

    sidebarTab.addChild(notesSection);

    tabPane.innerHTML = sidebarTab.render();
  }

  async function init() {
    activateLanguage();
    createLayers();
    // Les cases sont ajoutées lors de createLayers
    await addScriptTab();

    // Restore layer state only after WME is fully ready (data loaded, user logged in)
    wmeSDK.Events.once({ eventName: "wme-ready" }).then(() => {
      for (const layer of layers.values()) {
        layer.restoreState({ wmeSDK });
      }
    });
  }

  init();
}
