// ordersApi.js
import { loadOfflineStore } from "./offlineStore.js";

const CITY_COORDS = {
  Amsterdam: { lat: 52.3728, lng: 4.8936 },
  Rotterdam: { lat: 51.9225, lng: 4.4792 },
  Utrecht: { lat: 52.0907, lng: 5.1214 },
  Eindhoven: { lat: 51.4416, lng: 5.4697 },
  "Den Haag": { lat: 52.0705, lng: 4.3007 },
  Groningen: { lat: 53.2194, lng: 6.5665 },
  Tilburg: { lat: 51.5555, lng: 5.0913 },
  Almere: { lat: 52.3508, lng: 5.2647 },
  Nijmegen: { lat: 51.842, lng: 5.8526 },
  Brussel: { lat: 50.8503, lng: 4.3517 },
  Antwerpen: { lat: 51.2194, lng: 4.4025 },
  Gent: { lat: 51.0543, lng: 3.7174 },
  Brugge: { lat: 51.2094, lng: 3.2248 },
  Luik: { lat: 50.6326, lng: 5.5797 },
  Luxemburg: { lat: 49.6116, lng: 6.1319 },
  Dusseldorf: { lat: 51.2277, lng: 6.7735 },
  Duisburg: { lat: 51.4344, lng: 6.7623 },
  Essen: { lat: 51.4556, lng: 7.0116 },
  Dortmund: { lat: 51.5136, lng: 7.4653 },
  Keulen: { lat: 50.9375, lng: 6.9603 },
  Frankfurt: { lat: 50.1109, lng: 8.6821 },
  Hamburg: { lat: 53.5511, lng: 9.9937 },
  Parijs: { lat: 48.8566, lng: 2.3522 },
};

function normalizeLines(lines) {
  if (Array.isArray(lines)) return lines;
  if (lines == null) return [];
  return [lines];
}

// De huidige planner toont alle orders, ongeacht de geselecteerde dag.
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
