/*
 * Copyright (c) 2025 Maël Pedretti
 *
 * This file is part of WME Switzerland Helper.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
  WmeSDK,
  SdkFeature,
  SdkFeatureStyleContext,
  SdkFeatureStyleRule,
} from "wme-sdk-typings";
import { Layer } from "./layer";
import { waitForMapIdle } from "./utils";

interface FeatureLayerConstructorArgs {
  name: string;
  styleContext?: SdkFeatureStyleContext;
  styleRules?: SdkFeatureStyleRule[];
  minZoomLevel?: number;
}

abstract class FeatureLayer extends Layer {
  styleContext?: SdkFeatureStyleContext;
  styleRules?: SdkFeatureStyleRule[];
  features: Map<string | number, unknown>;
  minZoomLevel: number;
  protected visibleFeatureIds: Set<string>;

  constructor(args: FeatureLayerConstructorArgs & { wmeSDK: WmeSDK }) {
    super({ name: args.name, wmeSDK: args.wmeSDK });
    this.styleContext = args.styleContext;
    this.styleRules = args.styleRules;
    this.features = new Map();
    this.visibleFeatureIds = new Set();
    this.minZoomLevel = args.minZoomLevel ?? 15;
  }

  async addToMap(args: { wmeSDK: WmeSDK }): Promise<void> {
    const { wmeSDK } = args;
    wmeSDK.Map.addLayer({
      layerName: this.name,
      styleContext: this.styleContext,
      styleRules: this.styleRules,
    });

    wmeSDK.Events.trackLayerEvents({ layerName: this.name });

    await this.render({ wmeSDK });
  }

  removeFromMap(args: { wmeSDK: WmeSDK }): void {
    super.removeFromMap(args);
    this.visibleFeatureIds.clear();
  }

  abstract featureClicked(args: {
    wmeSDK: WmeSDK;
    featureId: string | number;
  }): Promise<void>;

  abstract getRecordId(args: { record: unknown }): string;

  abstract mapRecordToFeature(args: { record: unknown }): SdkFeature;

  abstract fetchData(args: {
    wmeSDK: WmeSDK;
  }): AsyncGenerator<unknown[], void, unknown>;

  // Optional hook to prepare context used by filtering
  getFilterContext?(args: { wmeSDK: WmeSDK }): unknown;

  abstract shouldDrawRecord(args: {
    wmeSDK: WmeSDK;
    record: unknown;
    context?: unknown;
  }): boolean;

  private drawFeaturesBatch(args: {
    wmeSDK: WmeSDK;
    records: unknown[];
  }): void {
    const { wmeSDK, records } = args;
    const wazeFeatures = records.map((r) =>
      this.mapRecordToFeature({ record: r }),
    );
    wmeSDK.Map.addFeaturesToLayer({
      features: wazeFeatures,
      layerName: this.name,
    });
  }

  removeFeature(args: { wmeSDK: WmeSDK; featureId: string | number }): void {
    const { wmeSDK, featureId } = args;
    const featureIdStr = String(featureId);
    wmeSDK.Map.removeFeatureFromLayer({
      featureId: featureIdStr,
      layerName: this.name,
    });

    this.visibleFeatureIds.delete(featureIdStr);
  }

  refilterFeatures(args: { wmeSDK: WmeSDK }): void {
    const { wmeSDK } = args;

    const checked = wmeSDK.LayerSwitcher.isLayerCheckboxChecked({
      name: this.name,
    });
    if (!checked) {
      return;
    }
    const context = this.getFilterContext?.({ wmeSDK });
    const toHide = Array.from(this.visibleFeatureIds).filter((featureId) => {
      const record = this.features.get(featureId);
      return record && !this.shouldDrawRecord({ wmeSDK, record, context });
    });

    if (toHide.length > 0) {
      wmeSDK.Map.removeFeaturesFromLayer({
        featureIds: toHide,
        layerName: this.name,
      });

      for (const featureId of toHide) {
        this.visibleFeatureIds.delete(featureId);
      }
    }
  }

  async render(args: { wmeSDK: WmeSDK }): Promise<void> {
    const { wmeSDK } = args;

    const checked = wmeSDK.LayerSwitcher.isLayerCheckboxChecked({
      name: this.name,
    });
    if (!checked) {
      return;
    }

    const zoomLevel = wmeSDK.Map.getZoomLevel();
    if (zoomLevel < this.minZoomLevel) {
      return;
    }

    const allRecords: unknown[] = [];
    for await (const batch of this.fetchData({ wmeSDK })) {
      allRecords.push(...batch);
    }

    const newRecordsById = new Map<string, unknown>();
    for (const record of allRecords) {
      const recordId = this.getRecordId({ record });
      newRecordsById.set(recordId, record);
      this.features.set(recordId, record);
    }

    const notYetDrawn = Array.from(newRecordsById.keys()).filter(
      (id) => !this.visibleFeatureIds.has(id),
    );

    const context = this.getFilterContext?.({ wmeSDK });
    const recordsToDraw = notYetDrawn
      .map((id) => newRecordsById.get(id)!)
      .filter((record) => this.shouldDrawRecord({ wmeSDK, record, context }));

    if (recordsToDraw.length > 0) {
      this.drawFeaturesBatch({ wmeSDK, records: recordsToDraw });
      for (const record of recordsToDraw) {
        this.visibleFeatureIds.add(this.getRecordId({ record }));
      }
    }

    // Remove obsolete features
    // We should check if we need to filter existing features out as well
    // because we might have changed filtering context (e.g. map venues) by zooming/panning
    const obsoleteIds = Array.from(this.visibleFeatureIds).filter(
      (id) =>
        !newRecordsById.has(id) ||
        !this.shouldDrawRecord({
          wmeSDK,
          record: this.features.get(id)!,
          context,
        }),
    );

    for (const featureId of obsoleteIds) {
      wmeSDK.Map.removeFeatureFromLayer({
        featureId,
        layerName: this.name,
      });
      this.visibleFeatureIds.delete(featureId);
      this.features.delete(featureId);
    }
  }

  // Register per-layer map events (move-end triggers re-render)
  registerEvents(args: { wmeSDK: WmeSDK }): void {
    const { wmeSDK } = args;
    const cleanupMove = wmeSDK.Events.on({
      eventName: "wme-map-move-end",
      eventHandler: () => this.onMapMoveEnd({ wmeSDK }),
    });
    this.eventCleanups.push(cleanupMove);

    const cleanupClick = wmeSDK.Events.on({
      eventName: "wme-layer-feature-clicked",
      eventHandler: async ({ featureId, layerName }) => {
        if (layerName !== this.name) return;
        await this.featureClicked({ wmeSDK, featureId });
      },
    });
    this.eventCleanups.push(cleanupClick);
  }

  // Reaction to a map move/zoom settling. Override to customise (e.g. debounce).
  protected onMapMoveEnd(args: { wmeSDK: WmeSDK }): void {
    const { wmeSDK } = args;
    waitForMapIdle({ wmeSDK, intervalMs: 50, maxTries: 60 }).then(() => {
      this.render({ wmeSDK });
    });
  }

  // Restore persisted state and ensure events + initial render
  restoreState(args: { wmeSDK: WmeSDK }): void {
    super.restoreState(args);
    const { wmeSDK } = args;
    const checked = wmeSDK.LayerSwitcher.isLayerCheckboxChecked({
      name: this.name,
    });
    if (checked) {
      // Render and register events when restored as enabled
      this.render({ wmeSDK });
      this.registerEvents({ wmeSDK });
    }
  }
}

export { FeatureLayer };
