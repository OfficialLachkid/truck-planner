// planningApi.js
import { supabaseClient } from "./supabaseClient.js";

/** Zorg dat er een day-record bestaat voor een datum (YYYY-MM-DD) */
export async function ensureDayRow(dateStr) {
  const { data, error } = await supabaseClient
    .from("days")
    .select("id")
    .eq("date", dateStr)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("Fout bij ophalen day:", error);
    throw error;
  }

  if (data) return data.id;

  const { data: inserted, error: insertError } = await supabaseClient
    .from("days")
    .insert({ date: dateStr })
    .select("id")
    .single();

  if (insertError) {
    console.error("Fout bij aanmaken day:", insertError);
    throw insertError;
  }

  return inserted.id;
}

/** Haal trucks+trips+slots voor een day-id op */
export async function loadPlanningForDay(dayId) {
  const { data, error } = await supabaseClient
    .from("trucks")
    .select(`
      id,
      name,
      trips:trips (
        id,
        sequence,
        slots:slots (
          index,
          shape,
          sap_order_id
        )
      )
    `)
    .eq("day_id", dayId)
    .order("name", { ascending: true });

  if (error) {
    console.error("Fout bij laden planning:", error);
    throw error;
  }

  return data || [];
}

/** Maak één nieuwe truck voor een dag */
export async function createTruckForDay(dayId, name) {
  const { data, error } = await supabaseClient
    .from("trucks")
    .insert({ day_id: dayId, name })
    .select("id, name")
    .single();

  if (error) {
    console.error("Fout bij aanmaken truck:", error);
    throw error;
  }

  // Maak meteen eerste trip
  const { data: trip, error: tripError } = await supabaseClient
    .from("trips")
    .insert({ truck_id: data.id, sequence: 0 })
    .select("id, sequence")
    .single();

  if (tripError) {
    console.error("Fout bij aanmaken eerste trip:", tripError);
    throw tripError;
  }

  return { truck: data, trip };
}

/** Upsert één slot (vakje) */
export async function upsertSlot(tripId, index, shape, sapOrderId) {
  const { error } = await supabaseClient
    .from("slots")
    .upsert(
      {
        trip_id: tripId,
        index,
        shape,
        sap_order_id: sapOrderId || null,
      },
      { onConflict: "trip_id,index" }
    );

  if (error) {
    console.error("Fout bij upsert slot:", error);
    throw error;
  }
}

export async function upsertSlotsBatch(rows) {
  if (!rows || rows.length === 0) return;

  const { error } = await supabaseClient
    .from("slots")
    .upsert(rows, { onConflict: "trip_id,index" });

  if (error) {
    console.error("Fout bij batch upsert slots:", error);
    throw error;
  }
}

export async function createTripForTruck(truckId, sequence) {
  const { data, error } = await supabaseClient
    .from("trips")
    .insert({ truck_id: truckId, sequence })
    .select("id, sequence")
    .single();

  if (error) {
    console.error("Fout bij aanmaken trip:", error);
    throw error;
  }

  return data; // { id, sequence }
}