// Aantal vakken per vrachtwagen
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
  pendingPlacement: null, // {truckId, orderId, startSlotIndex}
};

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

const slotsGridEl = document.getElementById("slots-grid");
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

// Dag initialiseren

function ensureDayExists(dayIndex) {
  const key = getDayKey(dayIndex);
  if (!state.days[key]) {
    state.days[key] = {
      trucks: createInitialTrucks(),
    };
  }
  return state.days[key];
}

let nextTruckId = 1;
let nextOrderId = 1;

function createInitialTrucks() {
  const trucks = [];
  trucks.push(createTruck("Truck 1"));
  return trucks;
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

  const slots = Array.from({ length: NUM_SLOTS }, () => ({
    orderId: null,
    shape: "square",
  }));

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
      occupiedSlots: [], // meerdere slots mogelijk
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
    slots,
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

function renderTruckList() {
  const day = ensureDayExists(state.currentDayIndex);
  renderDayHeader();

  truckListEl.querySelectorAll(".truck-card").forEach((el) => el.remove());

  day.trucks.forEach((truck, index) => {
    const card = document.createElement("div");
    card.className = "truck-card";
    card.dataset.truckId = truck.id;

    const isFull = truck.slots.every((slot) => slot.orderId !== null);
    if (isFull) {
      card.classList.add("truck-full");
    }

    const roof = document.createElement("div");
    roof.className = "truck-roof";

    const body = document.createElement("div");
    body.className = "truck-body";
    body.textContent = index + 1;

    card.appendChild(roof);
    card.appendChild(body);

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

function openTruckDetail(truckId) {
  state.selectedTruckId = truckId;
  state.selectedOrderId = null;
  hideOrderDetail();
  hideMap();
  closeSlotCountOverlay();

  const truck = getTruckById(truckId);
  if (!truck) return;

  renderSlots(truck);
  renderOrders(truck);
  updateTruckHeader();
  showDetailView();
}

// Slots / orders renderen

function renderSlots(truck) {
  slotsGridEl.innerHTML = "";

  const totalRows = Math.ceil(NUM_SLOTS / SLOTS_PER_ROW);

  for (let row = 0; row < totalRows; row++) {
    const rowDiv = document.createElement("div");
    rowDiv.className = "slots-row";

    const indices = getRowSlotIndices(row);
    const [leftIdx, midIdx, rightIdx] = indices;

    const left = truck.slots[leftIdx];
    const mid = midIdx !== undefined ? truck.slots[midIdx] : null;
    const right = rightIdx !== undefined ? truck.slots[rightIdx] : null;

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
        handleSlotClick(truck, idx);
      });

      return slotEl;
    };

    if (left) rowDiv.appendChild(createSlotEl(left, leftIdx));
    if (!rowHasRect && mid) rowDiv.appendChild(createSlotEl(mid, midIdx));
    if (right) rowDiv.appendChild(createSlotEl(right, rightIdx));

    slotsGridEl.appendChild(rowDiv);
  }
}

function renderOrders(truck) {
  ordersListEl.innerHTML = "";

  const availableOrders = truck.orders.filter(
    (o) => !o.occupiedSlots || o.occupiedSlots.length === 0
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
}

function hideOrderDetail() {
  orderDetailOverlay.classList.add("hidden");
  orderDetailMetaEl.innerHTML = "";
  orderDetailBodyEl.innerHTML = "";
}

// Kaart helpers / routeplanning

function buildRouteStops(truck) {
  // Neem alleen orders die in de truck staan (minstens één slot)
  const loaded = truck.orders
    .filter((o) => o.occupiedSlots && o.occupiedSlots.length > 0)
    .map((o) => {
      const deepestSlot = Math.max(...o.occupiedSlots); // hoogste index = achterkant
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

  // Sorteer van achterkant (hoogste index) naar voorkant (laagste index)
  loaded.sort((a, b) => b.deepestSlot - a.deepestSlot);

  return loaded;
}

function showMap() {
  mapOverlay.classList.remove("hidden");

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

  const truck = getTruckById(state.selectedTruckId);
  if (!truck) {
    nlMap.setView([52.1, 5.3], 7);
    return;
  }

  const routeStops = buildRouteStops(truck);

  // Groepeer stops per locatie voor de markers
  const markerGroups = new Map();
  routeStops.forEach((stop, index) => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    let group = markerGroups.get(key);
    if (!group) {
      group = {
        lat: stop.lat,
        lng: stop.lng,
        location: stop.location,
        items: [], // {label, orderIndex, palletCount}
      };
      markerGroups.set(key, group);
    }
    group.items.push({
      label: stop.label,
      orderIndex: index + 1,
      palletCount: stop.palletCount,
    });
  });

  // Startpunt marker (home)
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

  // Polyline-punten in route-volgorde (dubbele locaties één keer)
  const seenPointKeys = new Set();
  routeStops.forEach((stop) => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    if (!seenPointKeys.has(key)) {
      seenPointKeys.add(key);
      points.push([stop.lat, stop.lng]);
    }
  });

  // Markers per unieke locatie met ALLE orders + volgorde + pallets
  markerGroups.forEach((group) => {
    const lines = group.items.map(
      (item) =>
        `${item.label} – ${item.palletCount} pallets (volgorde ${item.orderIndex})`
    );
    const popupHtml = `<strong>${group.location}</strong><br>${lines.join("<br>")}`;

    const orderNumber = Math.min(
      ...group.items.map((i) => i.orderIndex)
    ); // eerste stopnummer
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

function hideMap() {
  mapOverlay.classList.add("hidden");
}

/* ---- Slot-count overlay helpers ---- */

function openSlotCountOverlay(truckId, orderId, startSlotIndex) {
  state.pendingPlacement = { truckId, orderId, startSlotIndex };
  slotCountInput.value = "1";
  slotCountOverlay.classList.remove("hidden");
}

function closeSlotCountOverlay() {
  state.pendingPlacement = null;
  if (slotCountOverlay) slotCountOverlay.classList.add("hidden");
}

/* ---- Helpers voor plaatsing ---- */

/**
 * Geeft true terug als deze slot NIET gebruikt mag worden om pallets in te plaatsen.
 * Dit gebruik je vooral om de 'verborgen' middelste slot in een rij met rechthoek(en)
 * over te slaan bij het zoeken naar aaneengesloten plekken.
 */
function isDisabledForPlacement(truck, slotIndex) {
  const rowIndex = getRowIndex(slotIndex);
  const rowIndices = getRowSlotIndices(rowIndex);
  const [leftIdx, midIdx, rightIdx] = rowIndices;

  const left = truck.slots[leftIdx];
  const right = typeof rightIdx === "number" ? truck.slots[rightIdx] : null;
  const rowHasRect =
    (left && left.shape === "rect") || (right && right.shape === "rect");

  // In een rij met minstens één rect is het middelste vak "verborgen" / niet klikbaar.
  return rowHasRect && slotIndex === midIdx;
}

/* ---- Interactie ---- */

function handleOrderClick(orderId) {
  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;

  const clickedOrder = truck.orders.find((o) => o.id === orderId);
  if (!clickedOrder) return;

  const isFree =
    !clickedOrder.occupiedSlots || clickedOrder.occupiedSlots.length === 0;

  // Tweede klik op dezelfde vrije order -> details
  if (state.selectedOrderId === orderId) {
    if (isFree) {
      showOrderDetail(clickedOrder);
    }
    return;
  }

  // Eerste klik -> selecteren
  state.selectedOrderId = orderId;
  hideOrderDetail();
  closeSlotCountOverlay();

  renderOrders(truck);
  renderSlots(truck);
}

/**
 * Check of er in deze rij nog een slot bij kan,
 * rekening houdend met reeds geplande (nog te plaatsen) indices.
 */
function canPlaceOrderInRowWithPlanned(truck, targetSlotIndex, plannedIndices) {
  const rowIndex = getRowIndex(targetSlotIndex);
  const rowIndices = getRowSlotIndices(rowIndex);
  const rowSlots = rowIndices.map((i) => truck.slots[i]);

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
 * Plaats een order in N aaneengesloten lege slots vanaf startIndex.
 * Retourneert true bij succes, false bij mislukking.
 *
 * BELANGRIJK: alle slots zonder orderId (square of rect) tellen als leeg,
 * maar de "verborgen" middelste slot in een rij met rect wordt overgeslagen.
 */
function placeOrderInAdjacentSlots(truck, order, startIndex, count) {
  if (count < 1) return false;

  const candidateIndices = [];
  let idx = startIndex;

  while (candidateIndices.length < count && idx < NUM_SLOTS) {
    // Midden-slot in een rij met rect? Sla gewoon over (geen barrière).
    if (isDisabledForPlacement(truck, idx)) {
      idx++;
      continue;
    }

    const slot = truck.slots[idx];
    if (!slot) break;

    // moet leeg zijn (vorm maakt niet uit)
    if (slot.orderId !== null) break;

    // mag niet in conflict met rij-regel
    if (!canPlaceOrderInRowWithPlanned(truck, idx, candidateIndices)) break;

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

  // Order in deze slots zetten
  candidateIndices.forEach((slotIndex) => {
    truck.slots[slotIndex].orderId = order.id;
  });

  order.occupiedSlots = [...candidateIndices];
  state.selectedOrderId = null;
  return true;
}

/**
 * Klik op een slot:
 * - Leeg, geen order geselecteerd -> vorm kiezen
 * - Gevuld, geen order -> order (deze slot) vrijmaken
 * - Leeg, wel order geselecteerd -> vraag aantal pallets + plaats
 */
function handleSlotClick(truck, slotIndex) {
  const slot = truck.slots[slotIndex];
  const currentOrderId = slot.orderId;

  // CASE A: Leeg slot, geen geselecteerde order -> vorm kiezen
  if (currentOrderId === null && state.selectedOrderId === null) {
    const makeRect = window.confirm(
      "Wil je deze slot rechthoekig maken?\n\nOK = Rechthoek\nAnnuleer = Vierkant"
    );
    const newShape = makeRect ? "rect" : "square";
    setSlotShape(truck, slotIndex, newShape);
    renderSlots(truck);
    return;
  }

  // CASE B: Slot is gevuld en er is geen order geselecteerd -> slot leeg maken
  if (currentOrderId !== null && state.selectedOrderId === null) {
    const order = truck.orders.find((o) => o.id === currentOrderId);
    if (order) {
      order.occupiedSlots = (order.occupiedSlots || []).filter(
        (idx) => idx !== slotIndex
      );
    }
    slot.orderId = null;

    renderSlots(truck);
    renderOrders(truck);
    return;
  }

  // CASE C: Slot is leeg en er is een order geselecteerd -> vraag aantal pallets
  if (currentOrderId === null && state.selectedOrderId !== null) {
    openSlotCountOverlay(truck.id, state.selectedOrderId, slotIndex);
    return;
  }

  // CASE D: Slot is gevuld én er is ook een order geselecteerd -> (nog geen swap)
}

// Vorm van slot aanpassen (vierkant/rechthoek)
function setSlotShape(truck, slotIndex, newShape) {
  const slot = truck.slots[slotIndex];
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

    // Middelste slot mag niet gevuld zijn; anders eerst leegmaken
    if (midIdx !== undefined) {
      const midSlot = truck.slots[midIdx];
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
}

function goToNextTruck() {
  const day = getCurrentDay();
  if (!day || day.trucks.length === 0 || state.selectedTruckId == null) return;

  const idx = getTruckIndex(state.selectedTruckId);
  if (idx === -1) return;

  const newIndex = (idx + 1) % day.trucks.length;
  const newTruck = day.trucks[newIndex];
  openTruckDetail(newTruck.id);
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

prevDayBtn.addEventListener("click", () => {
  state.currentDayIndex -= 1;
  state.selectedTruckId = null;
  state.selectedOrderId = null;
  ensureDayExists(state.currentDayIndex);
  showListView();
  renderTruckList();
});

nextDayBtn.addEventListener("click", () => {
  state.currentDayIndex += 1;
  state.selectedTruckId = null;
  state.selectedOrderId = null;
  ensureDayExists(state.currentDayIndex);
  showListView();
  renderTruckList();
});

addTruckBtn.addEventListener("click", () => {
  const day = ensureDayExists(state.currentDayIndex);
  const truckNumber = day.trucks.length + 1;
  const newTruck = createTruck(`Truck ${truckNumber}`);
  day.trucks.push(newTruck);
  renderTruckList();
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

slotCountCancel.addEventListener("click", () => {
  closeSlotCountOverlay();
});

slotCountConfirm.addEventListener("click", () => {
  if (!state.pendingPlacement) {
    closeSlotCountOverlay();
    return;
  }
  const count = parseInt(slotCountInput.value || "1", 10);
  const validCount = Number.isNaN(count) ? 1 : Math.max(1, count);

  const { truckId, orderId, startSlotIndex } = state.pendingPlacement;
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

  const ok = placeOrderInAdjacentSlots(truck, order, startSlotIndex, validCount);
  if (ok) {
    closeSlotCountOverlay();
    renderSlots(truck);
    renderOrders(truck);
  }
});

// Init

function init() {
  ensureDayExists(0);
  renderTruckList();
  showListView();
}

init();