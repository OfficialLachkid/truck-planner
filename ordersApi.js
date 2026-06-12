// ordersApi.js
import { loadOfflineStore } from "./offlineStore.js";
import { CITY_COORDS } from "./locationCoords.js";

function normalizeLines(lines) {
  if (Array.isArray(lines)) return lines;
  if (lines == null) return [];
  return [lines];
}

// De planner draait offline en toont de seed/orders uit localStorage.
export async function fetchOrderTemplatesForDate(_dateStr) {
  const store = loadOfflineStore();

  return [...(store.orders || [])]
    .sort((a, b) => {
      const byDate = String(a.createdAt || "").localeCompare(
        String(b.createdAt || "")
      );

      if (byDate !== 0) return byDate;

      return String(a.label || "").localeCompare(String(b.label || ""));
    })
    .map((row) => {
      const coord =
        row.lat != null && row.lng != null
          ? { lat: row.lat, lng: row.lng }
          : CITY_COORDS[row.location] || { lat: 52.1, lng: 5.3 };

      return {
        id: row.id,
        label: row.label,
        info: row.info,
        createdAt: row.createdAt,
        location: row.location,
        postcode: row.postcode,
        totalPallets: row.totalPallets,
        lat: coord.lat,
        lng: coord.lng,
        lines: normalizeLines(row.lines).map((line) => ({
          article: line.article,
          description: line.description,
          boxes: line.boxes,
          pallets: line.pallets,
        })),
      };
    });
}
