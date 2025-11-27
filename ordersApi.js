// ordersApi.js
import { supabaseClient } from "./supabaseClient.js";

const CITY_COORDS = {
  Amsterdam: { lat: 52.3728, lng: 4.8936 },
  Rotterdam: { lat: 51.9225, lng: 4.4792 },
  Utrecht: { lat: 52.0907, lng: 5.1214 },
  Eindhoven: { lat: 51.4416, lng: 5.4697 },
  "Den Haag": { lat: 52.0705, lng: 4.3007 },
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
    .eq("delivery_date", dateStr)
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