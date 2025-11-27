import { fetchOrderTemplatesForDate } from "./ordersApi.js";
import {
  ensureDayRow,
  loadPlanningForDay,
  createTruckForDay,
  createTripForTruck,
  upsertSlotsBatch,
} from "./planningApi.js";

let orderTemplates = [];

// Aantal vakken per vrachtwagen (per rit)
const NUM_SLOTS = 33;
const SLOTS_PER_ROW = 3;

// Startlocatie van de truck
const START_LOCATION = {
  lat: 52.3508, // Almere in jouw voorbeeld
  lng: 5.2647,
  label: "Start: Almere – Wittevrouwen 1",
};

// Dummy coördinaten per stad (kan later echte geocoding worden)
const CITY_COORDS = {
  Amsterdam: { lat: 52.3728, lng: 4.8936 },
  Rotterdam: { lat: 51.9225, lng: 4.4792 },
  Utrecht: { lat: 52.0907, lng: 5.1214 },
  Eindhoven: { lat: 51.4416, lng: 5.4697 },
  "Den Haag": { lat: 52.0705, lng: 4.3007 },
};

// Globale state
const state = {
  currentDayIndex: 0,
  days: {},
  selectedTruckId: null,
  selectedOrderId: null,
  pendingPlacement: null, // {truckId, tripIndex, orderId, startSlotIndex}
  pendingShapeSelection: null, // {truckId, tripIndex, slotIndex}
};

// welke rit is actief in de kaart-overlay
let activeMapTripIndex = 0;
// nieuw: welke tab is actief: 'default' (basisroute) of 'trip'
let activeMapTabType = "default";

// DOM referenties
const truckListView = document.getElementById("truck-list-view");
const truckDetailView = document.getElementById("truck-detail-view");

const truckListEl = document.getElementById("truck-list");
const addTruckBtn = document.getElementById("add-truck-btn");

const prevDayBtn = document.getElementById("prev-day-btn");
const nextDayBtn = document.getElementById("next-day-btn");
const dayLabelEl = document.getElementById("day-label");
const dayContextEl = document.getElementById("day-context-label");

const dayHeaderEl = document.getElementById("day-header");
const truckHeaderEl = document.getElementById("truck-header");
const truckHeaderLabelEl = document.getElementById("truck-header-label");
const prevTruckBtn = document.getElementById("prev-truck-btn");
const nextTruckBtn = document.getElementById("next-truck-btn");
const deleteTruckBtn = document.getElementById("delete-truck-btn");

const backToListBtn = document.getElementById("back-to-list-btn");
const openMapBtn = document.getElementById("open-map-btn");

// linker kolom (alle ritten van een truck komen hierin)
const slotsContainerEl = document.querySelector(".slots-container");

const ordersListEl = document.getElementById("orders-list");

// Order detail overlay
const orderDetailOverlay = document.getElementById("order-detail-overlay");
const orderDetailMetaEl = document.getElementById("order-detail-meta");
const orderDetailBodyEl = document.getElementById("order-detail-body");
const orderDetailCloseBtn = document.getElementById("order-detail-close");

// Kaart overlay
const mapOverlay = document.getElementById("map-overlay");
const mapCloseBtn = document.getElementById("map-close-btn");
let nlMap = null;
let routeLayer = null;

// Slot-count overlay
const slotCountOverlay = document.getElementById("slot-count-overlay");
const slotCountInput = document.getElementById("slot-count-input");
const slotCountDecrease = document.getElementById("slot-count-decrease");
const slotCountIncrease = document.getElementById("slot-count-increase");
const slotCountCancel = document.getElementById("slot-count-cancel");
const slotCountConfirm = document.getElementById("slot-count-confirm");

// hint-element voor max pallets
const slotCountMaxHint = document.getElementById("slot-count-max");
const slotCountMaxBtn = document.getElementById("slot-count-max-btn");

// Shape-selectie overlay
const shapeOverlay = document.getElementById("shape-overlay");
const shapeSquareBtn = document.getElementById("shape-square-btn");
const shapeRectBtn   = document.getElementById("shape-rect-btn");
const shapeCancelBtn = document.getElementById("shape-cancel-btn");

// Helpers datum

function createDateByIndex(dayIndex) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

function formatDate(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Kleine labeltekst ("Vandaag", "Morgen", etc.)
function getRelativeLabel(dayIndex) {
  if (dayIndex === 0) return "Vandaag";
  if (dayIndex === 1) return "Morgen";
  if (dayIndex === -1) return "Gisteren";
  return "";
}

// Grote datum-tekst
function getDayLabel(dayIndex) {
  const d = createDateByIndex(dayIndex);
  return formatDate(d);
}

function getDayKey(dayIndex) {
  const d = createDateByIndex(dayIndex);
  return d.toISOString().slice(0, 10);
}

function getDayDate(dayIndex) {
  return createDateByIndex(dayIndex);
}

// Dag initialiseren

async function ensureDayExists(dayIndex) {
  const key = getDayKey(dayIndex);
  if (state.days[key]) return state.days[key];

  const dateObj = getDayDate(dayIndex);             // jouw bestaande helper
  const dateStr = dateObj.toISOString().slice(0, 10);

  // Haal of maak day-row
  const dayId = await ensureDayRow(dateStr);

  // Haal planning uit DB
  const dbTrucks = await loadPlanningForDay(dayId);

  let trucks = [];

  if (dbTrucks.length === 0) {
    // Nog geen trucks → maak default truck in DB
    const { truck, trip } = await createTruckForDay(dayId, "Truck 1");

    trucks = [
      {
        id: truck.id,         // gebruik uuid overal als id
        name: truck.name,
        trips: [createEmptyTripWithDbId(trip.id)],
        orders: createOrdersForTruck(truck.id),
      },
    ];
  } else {
    // Map DB-trucks naar huidige state-structuur
    trucks = dbTrucks.map((t) => mapDbTruckToState(t));
  }

  state.days[key] = { trucks };
  return state.days[key];
}

let nextTruckId = 1;
let nextOrderId = 1;

function createInitialTrucks() {
  const trucks = [];
  trucks.push(createTruck("Truck 1"));
  return trucks;
}

// Helpers voor ritten/slots

function createEmptySlots() {
  return Array.from({ length: NUM_SLOTS }, () => ({
    orderId: null,
    shape: "square",
  }));
}

function createEmptyTrip() {
  return {
    slots: createEmptySlots(),
  };
}

function createEmptyTripWithDbId(dbId) {
  return {
    id: dbId, // db trip id
    slots: Array.from({ length: NUM_SLOTS }, () => ({
      orderId: null,
      shape: "square",
    })),
  };
}

// maak orders voor een truck op basis van orderTemplates
function createOrdersForTruck(truckId) {
  return (orderTemplates || []).map((tpl) => ({
    id: tpl.id,
    label: tpl.label,
    info: tpl.info,
    truckId,
    tripIndex: null,
    occupiedSlots: [],
    createdAt: tpl.createdAt,
    postcode: tpl.postcode,
    location: tpl.location,
    totalPallets: tpl.totalPallets,
    lat: tpl.lat,
    lng: tpl.lng,
    lines: tpl.lines,
  }));
}

// DB-truck → state-truck
function mapDbTruckToState(dbTruck) {
  const truckId = dbTruck.id;

  // maak lege trips
  const trips = dbTruck.trips
    .sort((a, b) => a.sequence - b.sequence)
    .map((tripRow) => createEmptyTripWithDbId(tripRow.id));

  // bouw orderMap op o.b.v. slots
  const orderMap = new Map();

  dbTruck.trips.forEach((tripRow, tripIndex) => {
    tripRow.slots.forEach((slotRow) => {
      const trip = trips[tripIndex];
      const idx = slotRow.index;

      trip.slots[idx].shape = slotRow.shape || "square";

      if (!slotRow.sap_order_id) return;

      const orderTpl = (orderTemplates || []).find(
        (o) => o.id === slotRow.sap_order_id
      );
      if (!orderTpl) return;

      let order = orderMap.get(orderTpl.id);
      if (!order) {
        order = {
          ...orderTpl,
          truckId,
          tripIndex,
          occupiedSlots: [],
        };
        orderMap.set(orderTpl.id, order);
      }

      trip.slots[idx].orderId = order.id;
      order.occupiedSlots.push(idx);
      order.tripIndex = tripIndex;
    });
  });

    // 1. Geplaatste orders (al in orderMap)
    const placedOrders = [...orderMap.values()];

    // 2. Vrije orders: alle templates die nog niet in placedOrders zitten
    const placedIds = new Set(placedOrders.map(o => o.id));
    const freeOrders = (orderTemplates || [])
    .filter(tpl => !placedIds.has(tpl.id))
    .map(tpl => ({
        id: tpl.id,
        label: tpl.label,
        info: tpl.info,
        truckId,
        tripIndex: null,
        occupiedSlots: [],
        createdAt: tpl.createdAt,
        postcode: tpl.postcode,
        location: tpl.location,
        totalPallets: tpl.totalPallets,
        lat: tpl.lat,
        lng: tpl.lng,
        lines: tpl.lines,
    }));

    return {
    id: truckId,
    name: dbTruck.name,
    trips,
    orders: [...placedOrders, ...freeOrders],
    };
}

// Dummy order-details met locatie + coördinaten
function createDummyOrderDetails(orderId, label, info) {
  const today = formatDate(new Date());
  const cityOptions = ["Amsterdam", "Rotterdam", "Utrecht", "Eindhoven", "Den Haag"];
  const location = cityOptions[orderId % cityOptions.length];
  const postcode = `10${(orderId % 90 + 10).toString().padStart(2, "0")}AB`;

  const coord = CITY_COORDS[location] || { lat: 52.1, lng: 5.3 }; // midden NL
  const totalPallets = ((orderId % 3) + 1) * 1;

  const lines = [
    {
      article: `ART-${orderId}01`,
      description: `Doos type 1 voor ${label}`,
      boxes: 4 + (orderId % 5),
      pallets: 1,
    },
    {
      article: `ART-${orderId}02`,
      description: `Doos type 2 voor ${label}`,
      boxes: 8 + (orderId % 7),
      pallets: 1,
    },
    {
      article: `ART-${orderId}03`,
      description: `Doos type 3 voor ${label}`,
      boxes: 10 + (orderId % 9),
      pallets: 2,
    },
  ];

  return {
    createdAt: today,
    postcode,
    location,
    totalPallets,
    lat: coord.lat,
    lng: coord.lng,
    lines,
  };
}

function createTruck(name) {
  const truckId = nextTruckId++;

  // Als we Supabase-orders hebben geladen, gebruik die
  if (orderTemplates && orderTemplates.length > 0) {
    const orders = orderTemplates.map((tpl) => ({
      // gebruik het id uit Supabase als order-id
      id: tpl.id,
      label: tpl.label,
      info: tpl.info,
      truckId,
      tripIndex: null,
      occupiedSlots: [],
      createdAt: tpl.createdAt,
      postcode: tpl.postcode,
      location: tpl.location,
      totalPallets: tpl.totalPallets,
      lat: tpl.lat,
      lng: tpl.lng,
      lines: tpl.lines,
    }));

    return {
      id: truckId,
      name,
      trips: [createEmptyTrip()],
      orders,
    };
  }

  // Fallback: oude dummy-orders als Supabase nog niets teruggeeft
  console.warn("Geen orderTemplates geladen, gebruik dummy-orders.");
  const baseOrders = [
    { label: "Order A", info: "Klant X" },
    { label: "Order B", info: "Klant Y" },
    { label: "Order C", info: "Klant Z" },
    { label: "Order D", info: "Klant X" },
    { label: "Order E", info: "Klant Y" },
    { label: "Order F", info: "Klant X" },
    { label: "Order G", info: "Klant Y" },
    { label: "Order H", info: "Klant Z" },
    { label: "Order I", info: "Klant X" },
    { label: "Order J", info: "Klant Y" },
  ];

  const orders = baseOrders.map((tpl) => {
    const id = nextOrderId++;
    const details = createDummyOrderDetails(id, tpl.label, tpl.info);
    return {
      id,
      label: tpl.label,
      info: tpl.info,
      truckId,
      tripIndex: null,
      occupiedSlots: [],
      createdAt: details.createdAt,
      postcode: details.postcode,
      location: details.location,
      totalPallets: details.totalPallets,
      lat: details.lat,
      lng: details.lng,
      lines: details.lines,
    };
  });

  return {
    id: truckId,
    name,
    trips: [createEmptyTrip()],
    orders,
  };
}

function getCurrentDay() {
  const key = getDayKey(state.currentDayIndex);
  return state.days[key];
}

function getTruckById(truckId) {
  const day = getCurrentDay();
  return day.trucks.find((t) => t.id === truckId);
}

function getTruckIndex(truckId) {
  const day = getCurrentDay();
  return day.trucks.findIndex((t) => t.id === truckId);
}

// Helpers rijen

function getRowIndex(slotIndex) {
  return Math.floor(slotIndex / SLOTS_PER_ROW);
}

function getRowSlotIndices(rowIndex) {
  const base = rowIndex * SLOTS_PER_ROW;
  return [base, base + 1, base + 2].filter((i) => i < NUM_SLOTS);
}

// Rendering

function renderDayHeader() {
  dayContextEl.textContent = getRelativeLabel(state.currentDayIndex);
  dayLabelEl.textContent = getDayLabel(state.currentDayIndex);
}

function isTruckCompletelyFull(truck) {
  return truck.trips.every((trip) =>
    trip.slots.every((slot) => slot.orderId !== null)
  );
}

async function renderTruckList() {
  const day = await ensureDayExists(state.currentDayIndex);
  renderDayHeader();

  // oude kaarten weghalen
  truckListEl.querySelectorAll(".truck-card").forEach((el) => el.remove());

  day.trucks.forEach((truck, index) => {
    const card = document.createElement("div");
    card.className = "truck-card";
    card.dataset.truckId = truck.id;

    if (isTruckCompletelyFull(truck)) {
      card.classList.add("truck-full");
    }

    const inner = document.createElement("div");
    inner.className = "truck-card-inner";

    const img = document.createElement("img");
    img.src = "truck.png";
    img.alt = `Truck ${index + 1}`;
    img.className = "truck-icon";

    const numberLabel = document.createElement("div");
    numberLabel.className = "truck-number-label";
    numberLabel.textContent = index + 1;

    inner.appendChild(img);
    inner.appendChild(numberLabel);
    card.appendChild(inner);

    card.addEventListener("click", () => {
      openTruckDetail(truck.id);
    });

    truckListEl.insertBefore(card, addTruckBtn);
  });
}

// Truck-detail header

function updateTruckHeader() {
  const day = getCurrentDay();
  if (!day || state.selectedTruckId == null) return;

  const idx = getTruckIndex(state.selectedTruckId);
  if (idx === -1) return;

  const dLabel = getDayLabel(state.currentDayIndex);
  truckHeaderLabelEl.textContent = `Truck ${idx + 1} - ${dLabel}`;
}

// Views schakelen

function showListView() {
  hideOrderDetail();
  hideMap();
  closeSlotCountOverlay();

  truckListView.classList.add("active-view");
  truckDetailView.classList.remove("active-view");

  dayHeaderEl.classList.remove("hidden");
  truckHeaderEl.classList.add("hidden");
}

function showDetailView() {
  truckListView.classList.remove("active-view");
  truckDetailView.classList.add("active-view");

  dayHeaderEl.classList.add("hidden");
  truckHeaderEl.classList.remove("hidden");
}

// Animatie helpers

function playSwipeIn(element, direction) {
  if (!element) return;
  element.classList.remove("view-swipe-in-left", "view-swipe-in-right");
  void element.offsetWidth;
  const cls = direction === "right" ? "view-swipe-in-right" : "view-swipe-in-left";
  element.classList.add(cls);
}

function animateSlots(tripIndex, indices, className, duration = 400) {
  if (!Array.isArray(indices)) return;
  const gridEl = slotsContainerEl.querySelector(
    `.slots-grid[data-trip-index="${tripIndex}"]`
  );
  if (!gridEl) return;

  indices.forEach((idx) => {
    const el = gridEl.querySelector(`.slot[data-index="${idx}"]`);
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => {
      el.classList.remove(className);
    }, duration);
  });
}

function triggerSlotMorphAnimation(tripIndex, slotIndex, fromShape, toShape) {
  const gridEl = slotsContainerEl.querySelector(
    `.slots-grid[data-trip-index="${tripIndex}"]`
  );
  if (!gridEl) return;
  const el = gridEl.querySelector(`.slot[data-index="${slotIndex}"]`);
  if (!el) return;

  let cls = null;
  if (fromShape === "square" && toShape === "rect") {
    cls = "slot-morph-square-to-rect";
  } else if (fromShape === "rect" && toShape === "square") {
    cls = "slot-morph-rect-to-square";
  }

  if (!cls) return;

  el.classList.remove("slot-morph-square-to-rect", "slot-morph-rect-to-square");
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => {
    el.classList.remove("slot-morph-square-to-rect", "slot-morph-rect-to-square");
  }, 300);
}

function openTruckDetail(truckId) {
  state.selectedTruckId = truckId;
  state.selectedOrderId = null;
  hideOrderDetail();
  hideMap();
  closeSlotCountOverlay();

  const truck = getTruckById(truckId);
  if (!truck) return;

  renderTrips(truck);
  renderOrders(truck);
  updateTruckHeader();
  showDetailView();

  const detailPageEl = document.querySelector(".detail-page");
  playSwipeIn(detailPageEl, "left");
}

// Alle ritten (sub-vrachtwagens) renderen, verticaal onder elkaar
function renderTrips(truck) {
  if (!slotsContainerEl) return;

  // 1) Huidige scrollpositie bewaren
  let restoreScroll = 0;
  const oldScrollEl = slotsContainerEl.querySelector(".truck-runs-scroll");
  if (oldScrollEl) {
    restoreScroll = oldScrollEl.scrollTop;
  }

  // 2) Container leegmaken
  slotsContainerEl.innerHTML = "";

  // 3) Scroll-container + wrapper
  const scrollEl = document.createElement("div");
  scrollEl.className = "truck-runs-scroll";

  const wrapperEl = document.createElement("div");
  wrapperEl.className = "truck-runs-wrapper";

  const truckIsFull = isTruckCompletelyFull(truck);

  // 4) Alle ritten opbouwen
  truck.trips.forEach((trip, tripIndex) => {
    const tripEl = document.createElement("div");
    tripEl.className = "truck-run";

    // === Truck + "Rit X" + overlay voor slots ===
    const truckWrapper = document.createElement("div");
    truckWrapper.className = "detail-truck-icon-wrapper";
    if (truckIsFull) {
      truckWrapper.classList.add("truck-full");
    }

    const truckImg = document.createElement("img");
    truckImg.src = "truck.png"; // zelfde icoon als in agenda
    truckImg.alt = `Truck – rit ${tripIndex + 1}`;
    truckImg.className = "detail-truck-icon";

    // Label "Rit X" in de gele kap
    const tripLabel = document.createElement("div");
    tripLabel.className = "trip-label";
    tripLabel.textContent = `Rit ${tripIndex + 1}`;

    // 🔴 Overlay in de trailer waar de grid in valt
    const overlay = document.createElement("div");
    overlay.className = "truck-slots-overlay";

    // Slots-grid voor deze rit (komt IN de overlay, niet meer los eronder)
    const gridEl = document.createElement("div");
    gridEl.className = "slots-grid";
    gridEl.dataset.tripIndex = String(tripIndex);
    renderSlotsForTrip(truck, tripIndex, gridEl);

    overlay.appendChild(gridEl);

    // Opbouw volgorde: afbeelding → overlay → label
    truckWrapper.appendChild(truckImg);
    truckWrapper.appendChild(overlay);
    truckWrapper.appendChild(tripLabel);

    tripEl.appendChild(truckWrapper);

    // DELETE BUTTON (alleen tonen als er >1 rit is)
    if (truck.trips.length > 1) {
      const delBtn = document.createElement("button");
      delBtn.className = "delete-trip-btn";
      delBtn.textContent = "Verwijder rit";

      delBtn.addEventListener("click", () => {
        showDeleteTripConfirm(tripIndex);
      });

      tripEl.appendChild(delBtn);
    }

    wrapperEl.appendChild(tripEl);
  });

  // 5) wrapper in scroll-container, scroll-container in slotsContainer
  scrollEl.appendChild(wrapperEl);
  slotsContainerEl.appendChild(scrollEl);

  // 6) + Truck knop onder alle ritten
  const addBtn = document.createElement("button");
  addBtn.id = "add-capacity-btn";
  addBtn.textContent = "+ Truck";
  addBtn.className = "add-capacity-btn";

  addBtn.addEventListener("click", () => {
    addTripForSelectedTruck();
  });

  slotsContainerEl.appendChild(addBtn);

  // 7) Scrollpositie herstellen
  scrollEl.scrollTop = restoreScroll;
}

// Een rit toevoegen aan de geselecteerde truck
async function addTripForSelectedTruck() {
  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;

  // sequence is het huidige aantal trips
  const sequence = truck.trips.length;

  // 1) Nieuwe trip in DB
  const tripRow = await createTripForTruck(truck.id, sequence);

  // 2) Nieuwe trip in state met DB-id
  truck.trips.push(createEmptyTripWithDbId(tripRow.id));
  renderTrips(truck);

  // 3) Scroll naar nieuwe rit
  const scrollEl = slotsContainerEl.querySelector(".truck-runs-scroll");
  const runs = scrollEl ? scrollEl.querySelectorAll(".truck-run") : [];
  if (scrollEl && runs.length) {
    const last = runs[runs.length - 1];
    scrollEl.scrollTo({
      top: last.offsetTop,
      behavior: "smooth",
    });
  }
}

// Rit verwijderen uit geselecteerde truck
function deleteTripForSelectedTruck(tripIndex) {
  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;

  if (truck.trips.length <= 1) {
    alert("Je hebt minimaal één rit nodig.");
    return;
  }

  // Check of er orders in zitten
  const hasOrders = truck.orders.some(o => o.tripIndex === tripIndex);

  if (hasOrders) {
    alert("Deze rit bevat geplaatste orders. Verwijder eerst alle pallets.");
    return;
  }

  // Verwijderen
  truck.trips.splice(tripIndex, 1);

  // indexen herstellen voor orders maar er zijn geen orders meer, dus safe

  renderTrips(truck);
}

// Slots / orders renderen per rit

function renderSlotsForTrip(truck, tripIndex, gridEl) {
  gridEl.innerHTML = "";

  const trip = truck.trips[tripIndex];
  const totalRows = Math.ceil(NUM_SLOTS / SLOTS_PER_ROW);

  for (let row = 0; row < totalRows; row++) {
    const rowDiv = document.createElement("div");
    rowDiv.className = "slots-row";

    const indices = getRowSlotIndices(row);
    const [leftIdx, midIdx, rightIdx] = indices;

    const left = trip.slots[leftIdx];
    const mid = midIdx !== undefined ? trip.slots[midIdx] : null;
    const right = rightIdx !== undefined ? trip.slots[rightIdx] : null;

    const rowHasRect =
      (left && left.shape === "rect") || (right && right.shape === "rect");

    const createSlotEl = (slotObj, idx) => {
      const slotEl = document.createElement("div");
      slotEl.classList.add("slot", slotObj.shape === "rect" ? "rect" : "square");
      slotEl.dataset.index = idx;

      if (slotObj.orderId === null) {
        slotEl.classList.add("empty");
      } else {
        slotEl.classList.add("filled");
        const order = truck.orders.find((o) => o.id === slotObj.orderId);
        slotEl.textContent = order ? order.label.replace("Order ", "") : "?";
      }

      slotEl.addEventListener("click", () => {
        handleSlotClick(truck, tripIndex, idx);
      });

      return slotEl;
    };

    if (left) rowDiv.appendChild(createSlotEl(left, leftIdx));
    if (!rowHasRect && mid) rowDiv.appendChild(createSlotEl(mid, midIdx));
    if (right) rowDiv.appendChild(createSlotEl(right, rightIdx));

    gridEl.appendChild(rowDiv);
  }
}

function renderOrders(truck) {
  ordersListEl.innerHTML = "";

  // Alleen orders die nog niet aan een rit gekoppeld zijn
  const availableOrders = truck.orders.filter(
    (o) =>
      (o.tripIndex === null || o.occupiedSlots.length === 0)
  );

  if (availableOrders.length === 0) {
    const li = document.createElement("li");
    li.textContent = "Geen vrije orders.";
    li.style.fontSize = "12px";
    li.style.color = "#777";
    ordersListEl.appendChild(li);
    return;
  }

  availableOrders.forEach((order) => {
    const li = document.createElement("li");
    li.className = "order-item";
    li.dataset.orderId = order.id;

    if (state.selectedOrderId === order.id) {
      li.classList.add("selected");
    }

    li.innerHTML = `<span>${order.label}</span><br><small>${order.info}</small>`;

    // let op: GEEN stopPropagation nodig meer; deselect zit nu op ordersListEl
    li.addEventListener("click", () => {
      handleOrderClick(order.id);
    });

    ordersListEl.appendChild(li);
  });
}

// Order detail overlay

function showOrderDetail(order) {
  orderDetailMetaEl.innerHTML = `
    <div><strong>Order:</strong> ${order.label}</div>
    <div><strong>Klant:</strong> ${order.info}</div>
    <div><strong>Datum:</strong> ${order.createdAt}</div>
    <div><strong>Locatie:</strong> ${order.location}</div>
    <div><strong>Postcode:</strong> ${order.postcode}</div>
    <div><strong>Totaal pallets:</strong> ${order.totalPallets}</div>
  `;

  orderDetailBodyEl.innerHTML = "";
  order.lines.forEach((line) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${line.article}</td>
      <td>${line.description}</td>
      <td>${line.boxes}</td>
      <td>${line.pallets}</td>
    `;
    orderDetailBodyEl.appendChild(tr);
  });

  orderDetailOverlay.classList.remove("hidden");
  orderDetailOverlay.classList.add("overlay-open");
}

function hideOrderDetail() {
  orderDetailOverlay.classList.add("hidden");
  orderDetailOverlay.classList.remove("overlay-open");
  orderDetailMetaEl.innerHTML = "";
  orderDetailBodyEl.innerHTML = "";
}

// Kaart helpers / routeplanning

function buildRouteStops(truck, tripIndex) {
  const loaded = truck.orders
    .filter(
      (o) =>
        o.tripIndex === tripIndex &&
        o.occupiedSlots &&
        o.occupiedSlots.length > 0
    )
    .map((o) => {
      const deepestSlot = Math.max(...o.occupiedSlots);
      return {
        id: o.id,
        label: o.label,
        location: o.location,
        lat: o.lat,
        lng: o.lng,
        deepestSlot,
        palletCount: o.occupiedSlots.length,
      };
    });

  loaded.sort((a, b) => b.deepestSlot - a.deepestSlot);

  return loaded;
}

// ======= DEFAULT ROUTE HELPERS (voor alle orders per truck) =======

// Haversine afstand in km tussen twee punten
function distanceKm(a, b) {
  const R = 6371; // aarde in km
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

// Alle stops voor de default route (alle orders, geplaatst of niet)
function buildDefaultRouteStops(truck) {
  if (!truck || !Array.isArray(truck.orders)) return [];

  return truck.orders
    .filter((o) => o && o.lat != null && o.lng != null)
    .map((o) => ({
      id: o.id,
      label: o.label,
      location: o.location,
      lat: o.lat,
      lng: o.lng,
      // gebruik aantal pallets als we het weten; anders 1
      palletCount:
        (o.occupiedSlots && o.occupiedSlots.length) ||
        o.totalPallets ||
        1,
    }));
}

// Nearest-neighbor route vanaf startpunt
function nearestNeighborRoute(startPoint, stops) {
  const remaining = [...stops];
  const route = [];
  let current = startPoint;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = distanceKm(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    route.push(next);
    current = next;
  }

  return route;
}

// 2-opt verbetering bovenop nearest-neighbor
function twoOptImprove(route, startPoint) {
  let improved = true;
  let bestRoute = [...route];
  const n = bestRoute.length;

  if (n < 4) return bestRoute;

  const dist = (p, q) => distanceKm(p, q);

  while (improved) {
    improved = false;

    for (let i = 0; i < n - 2; i++) {
      for (let k = i + 1; k < n - 1; k++) {
        // a-b-...-c-d → kijk of we segment i..k willen omdraaien
        const a = i === 0 ? startPoint : bestRoute[i - 1];
        const b = bestRoute[i];
        const c = bestRoute[k];
        const d = bestRoute[k + 1];

        const current =
          dist(a, b) + dist(c, d);
        const candidate =
          dist(a, c) + dist(b, d);

        if (candidate + 1e-6 < current) {
          // segment i..k omdraaien
          const reversed = bestRoute.slice(i, k + 1).reverse();
          bestRoute = [
            ...bestRoute.slice(0, i),
            ...reversed,
            ...bestRoute.slice(k + 1),
          ];
          improved = true;
        }
      }
    }
  }

  return bestRoute;
}

// Combineer NN + 2-opt voor nette default route
function computeOptimizedDefaultRoute(stops) {
  if (!stops.length) return [];

  const origin = { lat: START_LOCATION.lat, lng: START_LOCATION.lng };
  const nnRoute = nearestNeighborRoute(origin, stops);
  return twoOptImprove(nnRoute, origin);
}

// Teken default route (alle orders) op de kaart
function renderDefaultRouteOnMap(truck) {
  if (!nlMap || !routeLayer) return;

  routeLayer.clearLayers();

  const baseStops = buildDefaultRouteStops(truck);
  if (!baseStops.length) {
    // Geen stops → focus gewoon op startlocatie
    nlMap.setView([START_LOCATION.lat, START_LOCATION.lng], 6);
    return;
  }

  const routeStops = computeOptimizedDefaultRoute(baseStops);

  const points = [];
  const startLatLng = [START_LOCATION.lat, START_LOCATION.lng];

  const homeIcon = L.divIcon({
    className: "route-marker",
    html: `<div class="route-marker-inner home">🏠</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

  const startMarker = L.marker(startLatLng, { icon: homeIcon }).bindPopup(
    START_LOCATION.label
  );
  routeLayer.addLayer(startMarker);
  points.push(startLatLng);

  // Groepeer markers per coördinaat zodat meerdere orders in dezelfde stad netjes samenkomen
  const markerGroups = new Map();

  routeStops.forEach((stop, index) => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    let group = markerGroups.get(key);
    if (!group) {
      group = {
        lat: stop.lat,
        lng: stop.lng,
        location: stop.location || stop.label,
        items: [],
      };
      markerGroups.set(key, group);
    }
    group.items.push({
      label: stop.label,
      orderIndex: index + 1,
      palletCount: stop.palletCount || 1,
    });
  });

  // Polyline volgorde: start → elke unieke marker in routevolgorde
  const seenPointKeys = new Set();
  routeStops.forEach((stop) => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    if (!seenPointKeys.has(key)) {
      seenPointKeys.add(key);
      points.push([stop.lat, stop.lng]);
    }
  });

  markerGroups.forEach((group) => {
    const lines = group.items.map(
      (item) =>
        `${item.label} – ${item.palletCount} pallets (volgorde ${item.orderIndex})`
    );
    const popupHtml = `<strong>${group.location}</strong><br>${lines.join(
      "<br>"
    )}`;

    const orderNumber = Math.min(...group.items.map((i) => i.orderIndex));
    const icon = L.divIcon({
      className: "route-marker",
      html: `<div class="route-marker-inner">${orderNumber}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    const marker = L.marker([group.lat, group.lng], { icon }).bindPopup(
      popupHtml
    );
    routeLayer.addLayer(marker);
  });

  if (points.length > 1) {
    const poly = L.polyline(points, {
      color: "#2b6cb0",
      weight: 4,
      opacity: 0.85,
    });
    routeLayer.addLayer(poly);
    nlMap.fitBounds(poly.getBounds(), { padding: [30, 30] });
  } else {
    nlMap.setView([START_LOCATION.lat, START_LOCATION.lng], 6);
  }
}

function ensureMapInstance() {
  if (!nlMap && typeof L !== "undefined") {
    nlMap = L.map("nl-map").setView([52.1, 5.3], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap-bijdragers",
    }).addTo(nlMap);
  }

  if (!nlMap || typeof L === "undefined") return;

  if (!routeLayer) {
    routeLayer = L.layerGroup().addTo(nlMap);
  } else {
    routeLayer.clearLayers();
  }

  setTimeout(() => nlMap.invalidateSize(), 80);
}

// Teken route voor 1 specifieke rit
function renderTripOnMap(truck, tripIndex) {
  if (!nlMap || !routeLayer) return;

  routeLayer.clearLayers();

  const routeStops = buildRouteStops(truck, tripIndex);

  const points = [];
  const startLatLng = [START_LOCATION.lat, START_LOCATION.lng];

  const homeIcon = L.divIcon({
    className: "route-marker",
    html: `<div class="route-marker-inner home">🏠</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

  const startMarker = L.marker(startLatLng, { icon: homeIcon }).bindPopup(
    START_LOCATION.label
  );
  routeLayer.addLayer(startMarker);
  points.push(startLatLng);

  const markerGroups = new Map();

  routeStops.forEach((stop, index) => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    let group = markerGroups.get(key);
    if (!group) {
      group = {
        lat: stop.lat,
        lng: stop.lng,
        location: stop.location,
        items: [],
      };
      markerGroups.set(key, group);
    }
    group.items.push({
      label: stop.label,
      orderIndex: index + 1,
      palletCount: stop.palletCount,
    });
  });

  const seenPointKeys = new Set();
  routeStops.forEach((stop) => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    if (!seenPointKeys.has(key)) {
      seenPointKeys.add(key);
      points.push([stop.lat, stop.lng]);
    }
  });

  markerGroups.forEach((group) => {
    const lines = group.items.map(
      (item) =>
        `${item.label} – ${item.palletCount} pallets (volgorde ${item.orderIndex})`
    );
    const popupHtml = `<strong>${group.location}</strong><br>${lines.join("<br>")}`;

    const orderNumber = Math.min(...group.items.map((i) => i.orderIndex));
    const icon = L.divIcon({
      className: "route-marker",
      html: `<div class="route-marker-inner">${orderNumber}</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    const marker = L.marker([group.lat, group.lng], { icon }).bindPopup(
      popupHtml
    );
    routeLayer.addLayer(marker);
  });

  if (points.length > 1) {
    const poly = L.polyline(points, {
      color: "#2b6cb0",
      weight: 4,
      opacity: 0.85,
    });
    routeLayer.addLayer(poly);
    nlMap.fitBounds(poly.getBounds(), { padding: [30, 30] });
  } else {
    nlMap.setView([52.1, 5.3], 7);
  }
}

// kies default rit voor kaart (eerste met geplande orders, anders 0)
function getDefaultMapTripIndex(truck) {
  const idxWithOrders = truck.trips.findIndex((_, tripIndex) =>
    truck.orders.some(
      (o) =>
        o.tripIndex === tripIndex &&
        o.occupiedSlots &&
        o.occupiedSlots.length > 0
    )
  );
  return idxWithOrders !== -1 ? idxWithOrders : 0;
}

// kleine helper om tab-styling te zetten
function setActiveMapTab(tabsContainer, mode, tripIndex) {
  activeMapTabType = mode;
  if (mode === "trip" && typeof tripIndex === "number") {
    activeMapTripIndex = tripIndex;
  }

  Array.from(tabsContainer.querySelectorAll(".map-trip-tab")).forEach(
    (btn) => {
      const btnMode = btn.dataset.mode || "trip";
      const btnTripIndex = Number(btn.dataset.tripIndex || "0");
      const isActive =
        btnMode === mode &&
        (btnMode === "default" || btnTripIndex === activeMapTripIndex);

      btn.style.background = isActive ? "#111827" : "#f9fafb";
      btn.style.color = isActive ? "#ffffff" : "#111827";
    }
  );
}

function showMap() {
  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;

  mapOverlay.classList.remove("hidden");
  mapOverlay.classList.add("overlay-open");

  ensureMapInstance();
  if (!nlMap || !routeLayer) return;

  // Tabs-container direct achter de titel plaatsen (eenmalig aanmaken)
  let tabsContainer = document.getElementById("map-trip-tabs");
  if (!tabsContainer) {
    const mapCard = document.querySelector(".map-card");
    const titleEl = mapCard.querySelector("h3");
    tabsContainer = document.createElement("div");
    tabsContainer.id = "map-trip-tabs";
    tabsContainer.className = "map-trip-tabs";

    // simpele styling (inline)
    tabsContainer.style.display = "flex";
    tabsContainer.style.gap = "6px";
    tabsContainer.style.margin = "8px 0 6px";

    titleEl.insertAdjacentElement("afterend", tabsContainer);
  }

  tabsContainer.innerHTML = "";

  // default: we starten op basisroute
  activeMapTabType = "default";
  activeMapTripIndex = getDefaultMapTripIndex(truck);

  // === Basisroute tab ===
  const defaultBtn = document.createElement("button");
  defaultBtn.className = "map-trip-tab";
  defaultBtn.dataset.mode = "default";
  defaultBtn.textContent = "Default";

  defaultBtn.style.flex = "1";
  defaultBtn.style.padding = "6px 8px";
  defaultBtn.style.borderRadius = "999px";
  defaultBtn.style.border = "1px solid #d1d5db";
  defaultBtn.style.fontSize = "0.8rem";
  defaultBtn.style.cursor = "pointer";

  defaultBtn.addEventListener("click", () => {
    setActiveMapTab(tabsContainer, "default");
    renderDefaultRouteOnMap(truck);
  });

  tabsContainer.appendChild(defaultBtn);

  // === Tabs voor elke rit ===
  truck.trips.forEach((_, tripIndex) => {
    const btn = document.createElement("button");
    btn.className = "map-trip-tab";
    btn.dataset.mode = "trip";
    btn.dataset.tripIndex = String(tripIndex);
    btn.textContent = `Rit ${tripIndex + 1}`;

    btn.style.flex = "1";
    btn.style.padding = "6px 8px";
    btn.style.borderRadius = "999px";
    btn.style.border = "1px solid #d1d5db";
    btn.style.fontSize = "0.8rem";
    btn.style.cursor = "pointer";

    btn.addEventListener("click", () => {
      setActiveMapTab(tabsContainer, "trip", tripIndex);
      renderTripOnMap(truck, tripIndex);
    });

    tabsContainer.appendChild(btn);
  });

  // Actieve tab + route tekenen
  setActiveMapTab(
    tabsContainer,
    activeMapTabType,
    activeMapTripIndex
  );

  if (activeMapTabType === "default") {
    renderDefaultRouteOnMap(truck);
  } else {
    renderTripOnMap(truck, activeMapTripIndex);
  }
}

function hideMap() {
  mapOverlay.classList.add("hidden");
  mapOverlay.classList.remove("overlay-open");
}

/* ---- Slot-count overlay helpers ---- */

function openSlotCountOverlay(truckId, tripIndex, orderId, startSlotIndex) {
  state.pendingPlacement = { truckId, tripIndex, orderId, startSlotIndex };
  slotCountInput.value = "1";
  slotCountOverlay.classList.remove("hidden");
  slotCountOverlay.classList.add("overlay-open");

  // Focus/select
  if (slotCountInput) {
    slotCountInput.focus();
    slotCountInput.select();
  }

  // Max bepalen
  const truck = getTruckById(truckId);
  let max = 0;

  if (truck && typeof calculateMaxPalletsFromSlot === "function") {
    max = calculateMaxPalletsFromSlot(truck, tripIndex, startSlotIndex);
  }

  // Hint update
  if (slotCountMaxHint) {
    slotCountMaxHint.textContent =
      max === 0
        ? "Op deze positie zijn geen vrije pallet-plekken beschikbaar."
        : `Maximaal ${max} pallet-plek${max > 1 ? "ken" : ""} vanaf deze positie.`;
  }

  // Max button
  if (slotCountMaxBtn) {
    slotCountMaxBtn.dataset.max = String(max);

    if (max <= 1) {
      slotCountMaxBtn.disabled = true;
      slotCountMaxBtn.classList.add("slot-count-max-btn-disabled");
    } else {
      slotCountMaxBtn.disabled = false;
      slotCountMaxBtn.classList.remove("slot-count-max-btn-disabled");
    }
  }
}

function closeSlotCountOverlay() {
  state.pendingPlacement = null;
  if (slotCountOverlay) {
    slotCountOverlay.classList.add("hidden");
    slotCountOverlay.classList.remove("overlay-open");
  }
}

/* ---- Shape-select overlay helpers ---- */

function openShapeOverlay(truckId, tripIndex, slotIndex) {
  state.pendingShapeSelection = { truckId, tripIndex, slotIndex };

  if (!shapeOverlay) return;

  shapeOverlay.classList.remove("hidden");
  shapeOverlay.classList.add("overlay-open");
}

function closeShapeOverlay() {
  state.pendingShapeSelection = null;

  if (!shapeOverlay) return;

  shapeOverlay.classList.add("hidden");
  shapeOverlay.classList.remove("overlay-open");
}

function handleShapeChoice(newShape) {
  const pending = state.pendingShapeSelection;
  if (!pending) return;

  const { truckId, tripIndex, slotIndex } = pending;
  const truck = getTruckById(truckId);
  if (!truck) {
    closeShapeOverlay();
    return;
  }

  const trip = truck.trips[tripIndex];
  if (!trip) {
    closeShapeOverlay();
    return;
  }

  const slot = trip.slots[slotIndex];
  if (!slot) {
    closeShapeOverlay();
    return;
  }

  const prevShape = slot.shape;

  // Als je dezelfde vorm kiest, gewoon sluiten
  if (prevShape === newShape) {
    closeShapeOverlay();
    return;
  }

  // setSlotShape voert alle validatie uit (bijv. middelste vak mag geen rechthoek)
  const rowIndex = getRowIndex(slotIndex);
  const rowIndices = getRowSlotIndices(rowIndex);

  // We proberen de vorm te zetten; als het niet mag geeft setSlotShape zelf een alert
  setSlotShape(truck, tripIndex, slotIndex, newShape);

  // Als vorm effectief gewijzigd is: animatie + re-render
  if (trip.slots[slotIndex].shape !== prevShape) {
    renderTrips(truck);
    triggerSlotMorphAnimation(tripIndex, slotIndex, prevShape, trip.slots[slotIndex].shape);
  }

  closeShapeOverlay();
}

// === Delete trip overlay ===
const deleteTripOverlay = document.createElement("div");
deleteTripOverlay.id = "delete-trip-overlay";
deleteTripOverlay.className = "slot-count-overlay hidden";
deleteTripOverlay.innerHTML = `
  <div class="slot-count-card" style="max-width:320px; text-align:center;">
    <div class="slot-count-title">Rit verwijderen?</div>
    <div class="slot-count-sub">Weet je het zeker?</div>

    <div style="margin-top:14px; display:flex; gap:10px; justify-content:center;">
      <button id="delete-trip-no" style="
        background:#10b981; color:white; border:none; padding:8px 16px; border-radius:999px;">
        Nee
      </button>

      <button id="delete-trip-yes" style="
        background:#ef4444; color:white; border:none; padding:8px 16px; border-radius:999px;">
        Verwijder
      </button>
    </div>
  </div>
`;
document.body.appendChild(deleteTripOverlay);

let pendingTripDeleteIndex = null;

function showDeleteTripConfirm(tripIndex) {
  pendingTripDeleteIndex = tripIndex;
  deleteTripOverlay.classList.remove("hidden");
  deleteTripOverlay.classList.add("overlay-open");
}

function hideDeleteTripConfirm() {
  deleteTripOverlay.classList.add("hidden");
  deleteTripOverlay.classList.remove("overlay-open");
  pendingTripDeleteIndex = null;
}

document.getElementById("delete-trip-no").addEventListener("click", hideDeleteTripConfirm);
document.getElementById("delete-trip-yes").addEventListener("click", () => {
  const truck = getTruckById(state.selectedTruckId);
  deleteTripForSelectedTruck(pendingTripDeleteIndex);
  hideDeleteTripConfirm();
});

/* ---- Helpers voor plaatsing ---- */

/**
 * Geeft true terug als deze slot NIET gebruikt mag worden om pallets in te plaatsen.
 */
function isDisabledForPlacement(truck, tripIndex, slotIndex) {
  const trip = truck.trips[tripIndex];
  const rowIndex = getRowIndex(slotIndex);
  const rowIndices = getRowSlotIndices(rowIndex);
  const [leftIdx, midIdx] = rowIndices;

  const left = trip.slots[leftIdx];
  const rightIdx = rowIndices[2];
  const right = typeof rightIdx === "number" ? trip.slots[rightIdx] : null;
  const rowHasRect =
    (left && left.shape === "rect") || (right && right.shape === "rect");

  return rowHasRect && slotIndex === midIdx;
}

/* ---- Interactie ---- */

function handleOrderClick(orderId) {
  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;

  const clickedOrder = truck.orders.find((o) => o.id === orderId);
  if (!clickedOrder) return;

  const isFree =
    clickedOrder.tripIndex === null ||
    !clickedOrder.occupiedSlots ||
    clickedOrder.occupiedSlots.length === 0;

  // ✔ BEWAAR SCROLLPOS BEFORE RERENDER
  const scrollEl = slotsContainerEl.querySelector(".truck-runs-scroll");
  const restoreScroll = scrollEl ? scrollEl.scrollTop : 0;

  // tweede klik op dezelfde → toon details
  if (state.selectedOrderId === orderId) {
    if (isFree) showOrderDetail(clickedOrder);

    // ✔ RESTORE SCROLL
    const newScroll = slotsContainerEl.querySelector(".truck-runs-scroll");
    if (newScroll) newScroll.scrollTop = restoreScroll;
    return;
  }

  // nieuwe selectie
  state.selectedOrderId = orderId;
  hideOrderDetail();
  closeSlotCountOverlay();

  renderOrders(truck);
  renderTrips(truck);

  // ✔ RESTORE SCROLL
  const newScroll = slotsContainerEl.querySelector(".truck-runs-scroll");
  if (newScroll) newScroll.scrollTop = restoreScroll;
}

/**
 * Check of er in deze rij nog een slot bij kan,
 * rekening houdend met reeds geplande (nog te plaatsen) indices.
 */
function canPlaceOrderInRowWithPlanned(
  truck,
  tripIndex,
  targetSlotIndex,
  plannedIndices
) {
  const trip = truck.trips[tripIndex];
  const rowIndex = getRowIndex(targetSlotIndex);
  const rowIndices = getRowSlotIndices(rowIndex);
  const rowSlots = rowIndices.map((i) => trip.slots[i]);

  const hasRect = rowSlots.some((s) => s && s.shape === "rect");
  const occupiedCount = rowSlots.filter((s) => s && s.orderId !== null).length;

  const plannedInRow = plannedIndices.filter(
    (idx) => getRowIndex(idx) === rowIndex
  ).length;

  if (hasRect && occupiedCount + plannedInRow >= 2) {
    return false;
  }
  if (!hasRect && occupiedCount + plannedInRow >= 3) {
    return false;
  }
  return true;
}

/**
 * Plaats een order in N aaneengesloten lege slots vanaf startIndex (in 1 rit).
 */
function placeOrderInAdjacentSlots(truck, tripIndex, order, startIndex, count) {
  if (count < 1) return false;

  const trip = truck.trips[tripIndex];
  const candidateIndices = [];
  let idx = startIndex;

  while (candidateIndices.length < count && idx < NUM_SLOTS) {
    if (isDisabledForPlacement(truck, tripIndex, idx)) {
      idx++;
      continue;
    }

    const slot = trip.slots[idx];
    if (!slot) break;

    if (slot.orderId !== null) break;

    if (
      !canPlaceOrderInRowWithPlanned(
        truck,
        tripIndex,
        idx,
        candidateIndices
      )
    )
      break;

    candidateIndices.push(idx);
    idx++;
  }

  if (candidateIndices.length !== count) {
    alert(
      "Er zijn niet genoeg aaneengesloten vrije pallet-plekken vanaf dit vak.\n" +
        "Kies een ander startpunt of een kleiner aantal pallets."
    );
    return false;
  }

  candidateIndices.forEach((slotIndex) => {
    trip.slots[slotIndex].orderId = order.id;
  });

  order.tripIndex = tripIndex;
  order.occupiedSlots = [...candidateIndices];
  state.selectedOrderId = null;
  return true;
}

async function persistOrderPlacement(truck, tripIndex, order, slotIndices) {
  const trip = truck.trips[tripIndex];
  const tripId = trip.id;
  if (!tripId) return;

  const rows = slotIndices.map((idx) => ({
    trip_id: tripId,
    index: idx,
    shape: trip.slots[idx].shape || "square",
    sap_order_id: order.id,
  }));

  await upsertSlotsBatch(rows);
}

// Bepaal hoeveel pallets er maximaal geplaatst kunnen worden
// vanaf een startIndex, volgens dezelfde regels als placeOrderInAdjacentSlots.
function calculateMaxPalletsFromSlot(truck, tripIndex, startIndex) {
  const trip = truck.trips[tripIndex];
  if (!trip) return 0;

  const candidateIndices = [];
  let idx = startIndex;

  while (idx < NUM_SLOTS) {
    // zelfde checks als bij plaatsing
    if (isDisabledForPlacement(truck, tripIndex, idx)) {
      idx++;
      continue;
    }

    const slot = trip.slots[idx];
    if (!slot) break;

    if (slot.orderId !== null) break;

    if (
      !canPlaceOrderInRowWithPlanned(
        truck,
        tripIndex,
        idx,
        candidateIndices
      )
    ) {
      break;
    }

    candidateIndices.push(idx);
    idx++;
  }

  return candidateIndices.length;
}

/**
 * Klik op een slot in een bepaalde rit.
 */
function handleSlotClick(truck, tripIndex, slotIndex) {
  const trip = truck.trips[tripIndex];
  const slot = trip.slots[slotIndex];
  const currentOrderId = slot.orderId;

  // Geen order geselecteerd + leeg slot -> vorm kiezen via overlay
  if (currentOrderId === null && state.selectedOrderId === null) {
    openShapeOverlay(truck.id, tripIndex, slotIndex);
    return;
  }

  // Gevulde slot + geen order geselecteerd -> order verwijderen
  if (currentOrderId !== null && state.selectedOrderId === null) {
    const gridEl = slotsContainerEl.querySelector(
      `.slots-grid[data-trip-index="${tripIndex}"]`
    );
    const slotEl = gridEl
      ? gridEl.querySelector(`.slot[data-index="${slotIndex}"]`)
      : null;

    const performRemoval = () => {
      const order = truck.orders.find((o) => o.id === currentOrderId);
      if (order) {
        order.occupiedSlots = (order.occupiedSlots || []).filter(
          (idx) => idx !== slotIndex
        );
        if (!order.occupiedSlots.length) {
          order.tripIndex = null;
        }
      }
      slot.orderId = null;

      renderTrips(truck);
      renderOrders(truck);
    };

    if (slotEl) {
      slotEl.classList.add("slot-removing");
      setTimeout(performRemoval, 180);
    } else {
      performRemoval();
    }
    return;
  }

  // Leeg slot + een order geselecteerd -> plaatsing overlay
  if (currentOrderId === null && state.selectedOrderId !== null) {
    openSlotCountOverlay(truck.id, tripIndex, state.selectedOrderId, slotIndex);
    return;
  }

  // gevuld + andere order geselecteerd -> nog geen swap
}

// Vorm van slot aanpassen (vierkant/rechthoek)
function setSlotShape(truck, tripIndex, slotIndex, newShape) {
  const trip = truck.trips[tripIndex];
  const slot = trip.slots[slotIndex];
  if (!slot || slot.shape === newShape) return;

  const rowIndex = getRowIndex(slotIndex);
  const rowIndices = getRowSlotIndices(rowIndex);
  const posInRow = rowIndices.indexOf(slotIndex);
  const midIdx = rowIndices[1];

  if (newShape === "rect") {
    if (posInRow === 1) {
      alert(
        "Een rechthoek kan alleen op de linker- of rechterpositie in een rij worden gezet."
      );
      return;
    }

    if (midIdx !== undefined) {
      const midSlot = trip.slots[midIdx];
      if (midSlot && midSlot.orderId !== null) {
        alert(
          "Het middelste vak in deze rij is gevuld. Maak dit vak eerst leeg voordat je een rechthoekige positie gebruikt."
        );
        return;
      }
    }
  }

  slot.shape = newShape;
}

// Truck-navigatie

function goToPrevTruck() {
  const day = getCurrentDay();
  if (!day || day.trucks.length === 0 || state.selectedTruckId == null) return;

  const idx = getTruckIndex(state.selectedTruckId);
  if (idx === -1) return;

  const newIndex = (idx - 1 + day.trucks.length) % day.trucks.length;
  const newTruck = day.trucks[newIndex];
  openTruckDetail(newTruck.id);
  const detailPageEl = document.querySelector(".detail-page");
  playSwipeIn(detailPageEl, "right");
}

function goToNextTruck() {
  const day = getCurrentDay();
  if (!day || day.trucks.length === 0 || state.selectedTruckId == null) return;

  const idx = getTruckIndex(state.selectedTruckId);
  if (idx === -1) return;

  const newIndex = (idx + 1) % day.trucks.length;
  const newTruck = day.trucks[newIndex];
  openTruckDetail(newTruck.id);
  const detailPageEl = document.querySelector(".detail-page");
  playSwipeIn(detailPageEl, "left");
}

function deleteCurrentTruck() {
  const day = getCurrentDay();
  if (!day || state.selectedTruckId == null) return;

  if (day.trucks.length <= 1) {
    alert("Je moet minimaal één vrachtwagen per dag hebben.");
    return;
  }

  const confirmed = window.confirm(
    "Weet je zeker dat je deze vrachtwagen wilt verwijderen?"
  );
  if (!confirmed) return;

  const idx = getTruckIndex(state.selectedTruckId);
  if (idx === -1) return;

  day.trucks.splice(idx, 1);

  if (day.trucks.length === 0) {
    state.selectedTruckId = null;
    showListView();
    renderTruckList();
  } else {
    const newIndex = Math.min(idx, day.trucks.length - 1);
    const newTruck = day.trucks[newIndex];
    openTruckDetail(newTruck.id);
    renderTruckList();
  }
}

// Event listeners

prevDayBtn.addEventListener("click", async () => {
  state.currentDayIndex -= 1;
  state.selectedTruckId = null;
  state.selectedOrderId = null;

  await renderTruckList();
  showListView();
  playSwipeIn(truckListView, "right");
});

nextDayBtn.addEventListener("click", async () => {
  state.currentDayIndex += 1;
  state.selectedTruckId = null;
  state.selectedOrderId = null;

  await renderTruckList();
  showListView();
  playSwipeIn(truckListView, "left");
});

addTruckBtn.addEventListener("click", async () => {
  // 1) Zorg dat de dag in DB bestaat
  const dateObj = getDayDate(state.currentDayIndex);
  const dateStr = dateObj.toISOString().slice(0, 10);
  const dayId = await ensureDayRow(dateStr);

  // 2) Huidige day uit state ophalen (of initialiseren)
  const day = await ensureDayExists(state.currentDayIndex);
  const truckNumber = day.trucks.length + 1;

  // 3) Truck + eerste trip in DB maken
  const { truck, trip } = await createTruckForDay(
    dayId,
    `Truck ${truckNumber}`
  );

  // 4) Deze DB-truck mappen naar je state-structuur
  const stateTruck = {
    id: truck.id,
    name: truck.name,
    trips: [createEmptyTripWithDbId(trip.id)],
    orders: createOrdersForTruck(truck.id),
  };

  day.trucks.push(stateTruck);
  await renderTruckList();
});

backToListBtn.addEventListener("click", () => {
  state.selectedTruckId = null;
  state.selectedOrderId = null;
  showListView();
  renderTruckList();
});

prevTruckBtn.addEventListener("click", () => {
  hideOrderDetail();
  hideMap();
  closeSlotCountOverlay();
  goToPrevTruck();
});

nextTruckBtn.addEventListener("click", () => {
  hideOrderDetail();
  hideMap();
  closeSlotCountOverlay();
  goToNextTruck();
});

deleteTruckBtn.addEventListener("click", () => {
  hideOrderDetail();
  hideMap();
  closeSlotCountOverlay();
  deleteCurrentTruck();
});

/* Shape-select events */
if (shapeSquareBtn) {
  shapeSquareBtn.addEventListener("click", () => {
    handleShapeChoice("square");
  });
}

if (shapeRectBtn) {
  shapeRectBtn.addEventListener("click", () => {
    handleShapeChoice("rect");
  });
}

if (shapeCancelBtn) {
  shapeCancelBtn.addEventListener("click", () => {
    closeShapeOverlay();
  });
}

orderDetailCloseBtn.addEventListener("click", hideOrderDetail);

openMapBtn.addEventListener("click", showMap);
mapCloseBtn.addEventListener("click", hideMap);

/* Slot-count events */

slotCountDecrease.addEventListener("click", () => {
  let value = parseInt(slotCountInput.value || "1", 10);
  if (Number.isNaN(value)) value = 1;
  value = Math.max(1, value - 1);
  slotCountInput.value = String(value);
});

slotCountIncrease.addEventListener("click", () => {
  let value = parseInt(slotCountInput.value || "1", 10);
  if (Number.isNaN(value)) value = 1;
  value = Math.max(1, value + 1);
  slotCountInput.value = String(value);
});

if (slotCountMaxBtn) {
  slotCountMaxBtn.addEventListener("click", () => {
    const max = parseInt(slotCountMaxBtn.dataset.max || "0", 10);
    if (max > 0) {
      slotCountInput.value = String(max);
      slotCountInput.focus();
      slotCountInput.select();
    }
  });
}

slotCountCancel.addEventListener("click", () => {
  closeSlotCountOverlay();
});

slotCountConfirm.addEventListener("click", handleSlotCountConfirm);

async function handleSlotCountConfirm() {
  if (!state.pendingPlacement) {
    closeSlotCountOverlay();
    return;
  }

  const count = parseInt(slotCountInput.value || "1", 10);
  const validCount = Number.isNaN(count) ? 1 : Math.max(1, count);

  const { truckId, tripIndex, orderId, startSlotIndex } = state.pendingPlacement;
  const truck = getTruckById(truckId);
  if (!truck) {
    closeSlotCountOverlay();
    return;
  }
  const order = truck.orders.find((o) => o.id === orderId);
  if (!order) {
    closeSlotCountOverlay();
    return;
  }

  const ok = placeOrderInAdjacentSlots(
    truck,
    tripIndex,
    order,
    startSlotIndex,
    validCount
  );

    if (ok) {
        // eerst UI updaten
        closeSlotCountOverlay();
        renderTrips(truck);
        renderOrders(truck);
        animateSlots(tripIndex, order.occupiedSlots, "slot-placed", 450);

        // daarna Supabase opslaan, zonder de UI te blokkeren
        persistOrderPlacement(truck, tripIndex, order, order.occupiedSlots)
        .catch((err) => {
        console.error("Fout bij opslaan in Supabase:", err);
        // eventueel nog een toast / melding laten zien
        });
    }
}

document.addEventListener("click", (e) => {
  if (!state.selectedOrderId) return;

  // 1 — Klik op (of binnen) een order-item? → NIET deselecten
  const clickedOrderItem = e.target.closest(".order-item");
  if (clickedOrderItem) return;

  // 2 — Klik ergens IN de order-detail-overlay? → NIET deselecten
  //    (werkt ook als hideOrderDetail() tijdens dezelfde klik wordt aangeroepen)
  if (orderDetailOverlay && orderDetailOverlay.contains(e.target)) return;

  // 3 — Klik was buiten orders én buiten overlay → DESELECT
  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;

  const scrollEl = slotsContainerEl.querySelector(".truck-runs-scroll");
  const restoreScroll = scrollEl ? scrollEl.scrollTop : 0;

  state.selectedOrderId = null;
  renderOrders(truck);
  renderTrips(truck);

  const newScroll = slotsContainerEl.querySelector(".truck-runs-scroll");
  if (newScroll) newScroll.scrollTop = restoreScroll;
});

document.addEventListener("keydown", (e) => {
  // Alleen reageren als de pallet-overlay open staat
  if (!slotCountOverlay.classList.contains("overlay-open")) return;

  if (e.key === "Enter") {
    e.preventDefault();           // voorkomt submit/blur
    handleSlotCountConfirm();     // zelfde als op "Bevestig" klikken
  }

  if (e.key === "Escape" || e.key === "Esc") {
    e.preventDefault();
    closeSlotCountOverlay();      // zelfde als "Annuleer"
  }
});

// ===== Supabase test =====

// async function testSupabaseConnection() {
//   if (typeof supabase === "undefined") {
//     console.error("Supabase client is niet beschikbaar. Klopt je index.html include?");
//     return;
//   }

//   try {
//     const { data, error } = await supabase
//       .from("sap_orders")
//       .select(`
//         id,
//         order_code,
//         customer_name,
//         delivery_date,
//         location,
//         postcode,
//         total_pallets,
//         lines:sap_order_lines (
//           article_number,
//           description,
//           boxes,
//           pallets
//         )
//       `)
//       .limit(5);

//     if (error) {
//       console.error("Supabase test error:", error);
//     } else {
//       console.log("✅ Supabase verbonden. Eerste orders:", data);
//     }
//   } catch (err) {
//     console.error("Onverwachte Supabase fout:", err);
//   }
// }

// Init

async function init() {
  const dayDate = getDayDate(0);
  const dateKey = dayDate.toISOString().slice(0, 10);

  orderTemplates = await fetchOrderTemplatesForDate(dateKey);

  await ensureDayExists(0);
  await renderTruckList();
  showListView();
}

init();