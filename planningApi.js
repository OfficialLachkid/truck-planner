// planningApi.js
import { supabaseClient } from "./supabaseClient.js";

/** Zorg dat er een day-record bestaat voor een datum (YYYY-MM-DD) */
export async function ensureDayRow(dateStr) {
  const { data, error } = await supabaseClient
    .from("days")
    .select("id")
    .eq("date", dateStr)
    .maybeSingle();

  // PGRST116 = "No rows found"
  if (error && error.code !== "PGRST116") {
    console.error("Fout bij ophalen day:", error);
    throw error;
  }

  if (data) return data.id;

  // Nog geen day → aanmaken
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

/**
 * Haal voor een dag alle trucks + trips + slots op.
 * Structuur:
 * [
 *   {
 *     id, name,
 *     trips: [
 *       {
 *         id, sequence,
 *         slots: [{ index, shape, sap_order_id }, ...]
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 */
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
    console.error("Fout bij loadPlanningForDay:", error);
    throw error;
  }

  return data || [];
}

/**
 * Maak een truck + eerste trip (sequence = 0) voor een dag.
 * Geeft { truck, trip } terug.
 */
export async function createTruckForDay(dayId, name) {
  const { data: truckData, error: truckError } = await supabaseClient
    .from("trucks")
    .insert({ day_id: dayId, name })
    .select("id, name")
    .single();

  if (truckError) {
    console.error("Fout bij aanmaken truck:", truckError);
    throw truckError;
  }

  const { data: tripData, error: tripError } = await supabaseClient
    .from("trips")
    .insert({ truck_id: truckData.id, sequence: 0 })
    .select("id, truck_id, sequence")
    .single();

  if (tripError) {
    console.error("Fout bij aanmaken eerste trip:", tripError);
    throw tripError;
  }

  return {
    truck: truckData,
    trip: tripData,
  };
}

/**
 * Maak een extra rit voor een bestaande truck.
 * sequence = volgnummer (0,1,2,...)
 */
export async function createTripForTruck(truckId, sequence) {
  const { data, error } = await supabaseClient
    .from("trips")
    .insert({ truck_id: truckId, sequence })
    .select("id, truck_id, sequence")
    .single();

  if (error) {
    console.error("Fout bij aanmaken trip:", error);
    throw error;
  }

  return data;
}

/**
 * Batch upsert van slot-rijen.
 * rows: [{ trip_id, index, shape, sap_order_id }, ...]
 */
export async function upsertSlotsBatch(rows) {
  if (!rows || rows.length === 0) return;

  const { error } = await supabaseClient
    .from("slots")
    .upsert(rows, { onConflict: "trip_id,index" });

  if (error) {
    console.error("Fout bij upsertSlotsBatch:", error);
    throw error;
  }
}

/**
 * Verwijder een trip + bijbehorende slots uit de database.
 */
export async function deleteTrip(tripId) {
  if (!tripId) return;

  // Eerst slots weggooien (veilig als er geen cascade is)
  const { error: slotsError } = await supabaseClient
    .from("slots")
    .delete()
    .eq("trip_id", tripId);

  if (slotsError) {
    console.error("Fout bij verwijderen slots van trip:", slotsError);
    throw slotsError;
  }

  // Daarna de trip zelf
  const { error: tripError } = await supabaseClient
    .from("trips")
    .delete()
    .eq("id", tripId);

  if (tripError) {
    console.error("Fout bij verwijderen trip:", tripError);
    throw tripError;
  }
}