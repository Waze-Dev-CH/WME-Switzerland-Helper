import {
  IdbTileStore as GenericIdbTileStore,
  type PersistedTile as GenericPersistedTile,
  type TileStoreLike as GenericTileStoreLike,
} from "../../geoadmin/idb-store";
import type { OfficialStreet } from "./types";

export type PersistedTile = GenericPersistedTile<OfficialStreet>;
export type TileStoreLike = GenericTileStoreLike<OfficialStreet>;

/**
 * The checker's tile cache. This subclass exists to pin the storage identity in one place:
 * v2 drops tiles persisted by 1.1.0, which stored empty entry lists because of the geojson
 * attributes/properties parsing regression.
 */
export class IdbTileStore extends GenericIdbTileStore<OfficialStreet> {
  constructor() {
    super({ dbName: "wme-ch-name-check", storeName: "tiles", version: 2, maxRecords: 2000 });
  }
}
