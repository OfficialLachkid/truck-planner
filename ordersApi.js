// ordersApi.js
import { supabaseClient } from "./supabaseClient.js";

/**
 * Toggle om geocoding in/uit te schakelen.
 * Zet op TRUE zodra je een backend/proxy gebruikt.
 */
const ENABLE_GEOCODING = false;

/**
 * Handmatige coordinatenlijst (fallback-first)
 */
const CITY_COORDS = {
  // --- Nederland ---
  Amsterdam: { lat: 52.3728, lng: 4.8936 },
  Rotterdam: { lat: 51.9225, lng: 4.4792 },
  Utrecht: { lat: 52.0907, lng: 5.1214 },
  Eindhoven: { lat: 51.4416, lng: 5.4697 },
  "Den Haag": { lat: 52.0705, lng: 4.3007 },
  Groningen: { lat: 53.2194, lng: 6.5665 },
  Tilburg: { lat: 51.5555, lng: 5.0913 },
  Almere: { lat: 52.3508, lng: 5.2647 },
  Nijmegen: { lat: 51.8420, lng: 5.8526 },

  // --- België ---
  Brussel: { lat: 50.8503, lng: 4.3517 },
  Antwerpen: { lat: 51.2194, lng: 4.4025 },
  Gent: { lat: 51.0543, lng: 3.7174 },
  Brugge: { lat: 51.2094, lng: 3.2248 },
  Luik: { lat: 50.6326, lng: 5.5797 },

  // --- Luxemburg ---
  Luxemburg: { lat: 49.6116, lng: 6.1319 },

  // --- Duitsland ---
  Düsseldorf: { lat: 51.2277, lng: 6.7735 },
  Duisburg: { lat: 51.4344, lng: 6.7623 },
  Essen: { lat: 51.4556, lng: 7.0116 },
  Dortmund: { lat: 51.5136, lng: 7.4653 },
  Keulen: { lat: 50.9375, lng: 6.9603 },
  Frankfurt: { lat: 50.1109, lng: 8.6821 },
  Hamburg: { lat: 53.5511, lng: 9.9937 },

  // --- Frankrijk ---
  Parijs: { lat: 48.8566, lng: 2.3522 },
};

/**
 * Frontend geocoding DISABLED (CORS restricties).
 * Dit is placeholder; alleen actief als ENABLE_GEOCODING true wordt.
 */
async function geocodeLocation(city, postcode) {
  if (!ENABLE_GEOCODING) return null; // Browser-server geocoding uit

  if (!city) return null;

  const qParts = [city];
  if (postcode) qParts.push(postcode);
  qParts.push("Netherlands Belgium Germany France Luxembourg");

  const query = encodeURIComponent(qParts.join(" "));
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "dimensio-truck-planner/1.0",
        "Accept-Language": "nl",
      },
    });

    if (!res.ok) return null;

    const results = await res.json();
    if (!results?.length) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };
  } catch {
    return null;
  }
}

/**
 * Haal alle orders + automatische lat/lng fallback.
 */
export async function fetchOrderTemplatesForDate(dateStr) {
  const { data, error } = await supabaseClient
    .from("sap_orders")
    .select(`
      id,
      order_code,
      customer_name,
      delivery_date,
      location,
      postcode,
      total_pallets,
      lat,
      lng,
      lines:sap_order_lines (
        article_number,
        description,
        boxes,
        pallets
      )
    `)
    // .eq("delivery_date", dateStr) // wanneer je klaar bent met testen
    .order("delivery_date")
    .order("order_code");

  if (error) {
    console.error("Fout bij laden SAP-orders:", error);
    throw error;
  }

  const mapped = await Promise.all(
    (data || []).map(async (row) => {
      let lat = row.lat;
      let lng = row.lng;

      // 1) Bestaande lat/lng (prima)
      // 2) CITY_COORDS fallback
      // 3) Bij ENABLE_GEOCODING true → dynamisch geocoden (momenteel OFF)
      // 4) Fallback naar midden NL

      if (lat == null || lng == null) {
        const fallback = CITY_COORDS[row.location];
        if (fallback) {
          lat = fallback.lat;
          lng = fallback.lng;
        } else if (ENABLE_GEOCODING) {
          const geo = await geocodeLocation(row.location, row.postcode);
          if (geo) {
            lat = geo.lat;
            lng = geo.lng;

            // cache in Supabase
            try {
              await supabaseClient
                .from("sap_orders")
                .update({ lat, lng })
                .eq("id", row.id);
            } catch (e) {
              console.warn("Kon geocode niet opslaan:", e);
            }
          }
        }

        // fallback default
        if (lat == null || lng == null) {
          lat = 52.1;
          lng = 5.3;
        }
      }

      return {
        id: row.id,
        label: row.order_code,
        info: row.customer_name,
        createdAt: row.delivery_date,
        location: row.location,
        postcode: row.postcode,
        totalPallets: row.total_pallets,
        lat,
        lng,
        lines: (row.lines || []).map((l) => ({
          article: l.article_number,
          description: l.description,
          boxes: l.boxes,
          pallets: l.pallets,
        })),
      };
    })
  );

  return mapped;
}