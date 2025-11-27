// ordersApi.js
import { supabaseClient } from "./supabaseClient.js";

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

// Haal alle orders voor een specifieke datum (YYYY-MM-DD)
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
    // .eq("delivery_date", dateStr) // Temporarily disabled date filter for testing
    .order("delivery_date")
    .order("order_code");

  if (error) {
    console.error("Fout bij laden SAP-orders:", error);
    throw error;
  }

  return (data || []).map((row) => {
    const coord =
      row.lat != null && row.lng != null
        ? { lat: row.lat, lng: row.lng }
        : CITY_COORDS[row.location] || { lat: 52.1, lng: 5.3 };

    return {
      id: row.id,
      label: row.order_code,
      info: row.customer_name,
      createdAt: row.delivery_date,
      location: row.location,
      postcode: row.postcode,
      totalPallets: row.total_pallets,
      lat: coord.lat,
      lng: coord.lng,
      lines: (row.lines || []).map((l) => ({
        article: l.article_number,
        description: l.description,
        boxes: l.boxes,
        pallets: l.pallets,
      })),
    };
  });
}