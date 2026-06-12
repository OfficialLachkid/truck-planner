// planningApi.js
import {
  createOfflineId,
  loadOfflineStore,
  saveOfflineStore,
} from "./offlineStore.js";

function getPlanning(store) {
  if (!store.planning) {
    store.planning = {
      days: [],
      trucks: [],
      trips: [],
      slots: [],
    };
  }

  store.planning.days ||= [];
  store.planning.trucks ||= [];
  store.planning.trips ||= [];
  store.planning.slots ||= [];

  return store.planning;
}

function sortBySequence(a, b) {
  return Number(a.sequence || 0) - Number(b.sequence || 0);
}

function sortByIndex(a, b) {
  return Number(a.index || 0) - Number(b.index || 0);
}

function sortByTruckName(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

/** Zorg dat er een day-record bestaat voor een datum (YYYY-MM-DD). */
export async function ensureDayRow(dateStr) {
  const store = loadOfflineStore();
  const planning = getPlanning(store);

  const existing = planning.days.find((day) => day.date === dateStr);
  if (existing) return existing.id;

  const day = {
    id: createOfflineId(),
    date: dateStr,
  };

  planning.days.push(day);
  saveOfflineStore(store);
  return day.id;
}

/** Haal trucks + trips + slots voor een day-id op. */
export async function loadPlanningForDay(dayId) {
  const store = loadOfflineStore();
  const planning = getPlanning(store);

  const tripsByTruckId = new Map();
  planning.trips.forEach((trip) => {
    const list = tripsByTruckId.get(trip.truckId) || [];
    list.push(trip);
    tripsByTruckId.set(trip.truckId, list);
  });

  const slotsByTripId = new Map();
  planning.slots.forEach((slot) => {
    const list = slotsByTripId.get(slot.tripId) || [];
    list.push(slot);
    slotsByTripId.set(slot.tripId, list);
  });

  return planning.trucks
    .filter((truck) => truck.dayId === dayId)
    .sort(sortByTruckName)
    .map((truck) => ({
      id: truck.id,
      name: truck.name,
      trips: (tripsByTruckId.get(truck.id) || [])
        .slice()
        .sort(sortBySequence)
        .map((trip) => ({
          id: trip.id,
          sequence: trip.sequence,
          slots: (slotsByTripId.get(trip.id) || [])
            .slice()
            .sort(sortByIndex)
            .map((slot) => ({
              index: slot.index,
              shape: slot.shape,
              sap_order_id: slot.orderId,
            })),
        })),
    }));
}

/** Maak een truck + eerste trip (sequence = 0) voor een dag. */
export async function createTruckForDay(dayId, name) {
  const store = loadOfflineStore();
  const planning = getPlanning(store);

  const truck = {
    id: createOfflineId(),
    dayId,
    name,
  };

  const trip = {
    id: createOfflineId(),
    truckId: truck.id,
    sequence: 0,
  };

  planning.trucks.push(truck);
  planning.trips.push(trip);
  saveOfflineStore(store);

  return {
    truck: {
      id: truck.id,
      name: truck.name,
    },
    trip: {
      id: trip.id,
      truck_id: truck.id,
      truckId: truck.id,
      sequence: trip.sequence,
    },
  };
}

/** Maak een extra rit voor een bestaande truck. */
export async function createTripForTruck(truckId, sequence) {
  const store = loadOfflineStore();
  const planning = getPlanning(store);

  const trip = {
    id: createOfflineId(),
    truckId,
    sequence,
  };

  planning.trips.push(trip);
  saveOfflineStore(store);

  return {
    id: trip.id,
    truck_id: truckId,
    truckId,
    sequence: trip.sequence,
  };
}

export async function upsertSlot(tripId, index, shape, sapOrderId) {
  return upsertSlotsBatch([
    {
      trip_id: tripId,
      index,
      shape,
      sap_order_id: sapOrderId || null,
    },
  ]);
}

/** Batch upsert van slot-rijen. */
export async function upsertSlotsBatch(rows) {
  if (!rows || rows.length === 0) return;

  const store = loadOfflineStore();
  const planning = getPlanning(store);

  rows.forEach((row) => {
    const tripId = row.trip_id ?? row.tripId;
    const slotIndex = Number(row.index);
    const slotShape = row.shape || "square";
    const orderId = row.sap_order_id ?? row.orderId ?? null;
    const existing = planning.slots.find(
      (slot) => slot.tripId === tripId && Number(slot.index) === slotIndex
    );

    if (existing) {
      existing.shape = slotShape;
      existing.orderId = orderId;
      return;
    }

    planning.slots.push({
      id: createOfflineId(),
      tripId,
      index: slotIndex,
      shape: slotShape,
      orderId,
    });
  });

  saveOfflineStore(store);
}

/** Vervang de volledige slot-state voor een rit. */
export async function replaceSlotsForTrip(tripId, rows) {
  const store = loadOfflineStore();
  const planning = getPlanning(store);

  const existingByIndex = new Map(
    planning.slots
      .filter((slot) => slot.tripId === tripId)
      .map((slot) => [Number(slot.index), slot])
  );

  planning.slots = planning.slots.filter((slot) => slot.tripId !== tripId);

  rows.forEach((row) => {
    const slotIndex = Number(row.index);
    const slotShape = row.shape || "square";
    const orderId = row.sap_order_id ?? row.orderId ?? null;

    if (orderId == null && slotShape === "square") {
      return;
    }

    const existing = existingByIndex.get(slotIndex);

    planning.slots.push({
      id: existing?.id || createOfflineId(),
      tripId,
      index: slotIndex,
      shape: slotShape,
      orderId,
    });
  });

  saveOfflineStore(store);
}

/** Verwijder een rit + bijbehorende slots. */
export async function deleteTripById(tripId) {
  const store = loadOfflineStore();
  const planning = getPlanning(store);
  const trip = planning.trips.find((row) => row.id === tripId);

  if (!trip) return;

  planning.trips = planning.trips.filter((row) => row.id !== tripId);
  planning.slots = planning.slots.filter((slot) => slot.tripId !== tripId);

  planning.trips
    .filter((row) => row.truckId === trip.truckId)
    .sort(sortBySequence)
    .forEach((row, index) => {
      row.sequence = index;
    });

  saveOfflineStore(store);
}

// Compatibiliteitsalias voor development-branch call sites.
export async function deleteTrip(tripId) {
  await deleteTripById(tripId);
}

/** Verwijder een truck + alle onderliggende trips en slots. */
export async function deleteTruckById(truckId) {
  const store = loadOfflineStore();
  const planning = getPlanning(store);

  const tripIds = new Set(
    planning.trips
      .filter((trip) => trip.truckId === truckId)
      .map((trip) => trip.id)
  );

  planning.trucks = planning.trucks.filter((truck) => truck.id !== truckId);
  planning.trips = planning.trips.filter((trip) => trip.truckId !== truckId);
  planning.slots = planning.slots.filter((slot) => !tripIds.has(slot.tripId));

  saveOfflineStore(store);
}
