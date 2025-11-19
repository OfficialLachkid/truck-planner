// Aantal vakken per vrachtwagen
const NUM_SLOTS = 33;
const SLOTS_PER_ROW = 3;

// Globale state (nu nog volledig in memory)
const state = {
  currentDayIndex: 0,          // 0 = vandaag, +1 = morgen, -1 = gisteren
  days: {},                    // key: dag-string -> { trucks: [...] }
  selectedTruckId: null,
  selectedOrderId: null
};

// DOM referenties
const truckListView = document.getElementById('truck-list-view');
const truckDetailView = document.getElementById('truck-detail-view');

const truckListEl = document.getElementById('truck-list');
const addTruckBtn = document.getElementById('add-truck-btn');

const prevDayBtn = document.getElementById('prev-day-btn');
const nextDayBtn = document.getElementById('next-day-btn');
const dayLabelEl = document.getElementById('day-label');

const dayHeaderEl = document.getElementById('day-header');
const truckHeaderEl = document.getElementById('truck-header');
const truckHeaderLabelEl = document.getElementById('truck-header-label');
const prevTruckBtn = document.getElementById('prev-truck-btn');
const nextTruckBtn = document.getElementById('next-truck-btn');
const deleteTruckBtn = document.getElementById('delete-truck-btn');

const backToListBtn = document.getElementById('back-to-list-btn');
const slotsGridEl = document.getElementById('slots-grid');
const ordersListEl = document.getElementById('orders-list');

// Helpers voor datum

function createDateByIndex(dayIndex) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayIndex);
  return d;
}

function formatDate(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function getDayKey(dayIndex) {
  const d = createDateByIndex(dayIndex);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getDayLabel(dayIndex) {
  const d = createDateByIndex(dayIndex);
  const base = formatDate(d);

  if (dayIndex === 0) return `Vandaag - ${base}`;
  if (dayIndex === 1) return `Morgen - ${base}`;
  if (dayIndex === -1) return `Gisteren - ${base}`;
  return base;
}

// Dag initialiseren als hij nog niet bestaat

function ensureDayExists(dayIndex) {
  const key = getDayKey(dayIndex);
  if (!state.days[key]) {
    // Nieuwe dag met 1 truck en wat dummy orders
    state.days[key] = {
      trucks: createInitialTrucks()
    };
  }
  return state.days[key];
}

let nextTruckId = 1;
let nextOrderId = 1;

function createInitialTrucks() {
  const trucks = [];
  // standaard 1 truck
  trucks.push(createTruck('Truck 1'));
  return trucks;
}

function createTruck(name) {
  const truckId = nextTruckId++;

  // slots: elk slot heeft een orderId en een shape (square/rect)
  const slots = Array.from({ length: NUM_SLOTS }, () => ({
    orderId: null,
    shape: 'square'
  }));

  // dummy orders voor deze truck
  const orders = [
    { id: nextOrderId++, label: 'Order A', info: 'Klant X' },
    { id: nextOrderId++, label: 'Order B', info: 'Klant Y' },
    { id: nextOrderId++, label: 'Order C', info: 'Klant Z' },
    { id: nextOrderId++, label: 'Order D', info: 'Klant X' },
    { id: nextOrderId++, label: 'Order E', info: 'Klant Y' }
  ].map(o => ({ ...o, truckId, assignedSlotIndex: null }));

  return {
    id: truckId,
    name,
    slots,
    orders
  };
}

function getCurrentDay() {
  const key = getDayKey(state.currentDayIndex);
  return state.days[key];
}

function getTruckById(truckId) {
  const day = getCurrentDay();
  return day.trucks.find(t => t.id === truckId);
}

function getTruckIndex(truckId) {
  const day = getCurrentDay();
  return day.trucks.findIndex(t => t.id === truckId);
}

// Helper voor rijen

function getRowIndex(slotIndex) {
  return Math.floor(slotIndex / SLOTS_PER_ROW);
}

function getRowSlotIndices(rowIndex) {
  const base = rowIndex * SLOTS_PER_ROW;
  return [base, base + 1, base + 2].filter(i => i < NUM_SLOTS);
}

// RENDERING

function renderDayHeader() {
  dayLabelEl.textContent = getDayLabel(state.currentDayIndex);
}

function renderTruckList() {
  const day = ensureDayExists(state.currentDayIndex);
  renderDayHeader();

  truckListEl.innerHTML = '';

  day.trucks.forEach((truck, index) => {
    const card = document.createElement('div');
    card.className = 'truck-card';
    card.dataset.truckId = truck.id;

    const roof = document.createElement('div');
    roof.className = 'truck-roof';

    const body = document.createElement('div');
    body.className = 'truck-body';
    body.textContent = index + 1; // nummer zoals in jouw design

    card.appendChild(roof);
    card.appendChild(body);

    card.addEventListener('click', () => {
      openTruckDetail(truck.id);
    });

    truckListEl.appendChild(card);
  });
}

// Truck detail scherm

function updateTruckHeader() {
  const day = getCurrentDay();
  if (!day || state.selectedTruckId == null) return;

  const idx = getTruckIndex(state.selectedTruckId);
  if (idx === -1) return;

  const dLabel = getDayLabel(state.currentDayIndex);
  truckHeaderLabelEl.textContent = `Truck ${idx + 1} van ${day.trucks.length} - ${dLabel}`;
}

function openTruckDetail(truckId) {
  state.selectedTruckId = truckId;
  state.selectedOrderId = null;

  const truck = getTruckById(truckId);
  if (!truck) return;

  renderSlots(truck);
  renderOrders(truck);
  updateTruckHeader();

  // switch view + headers
  truckListView.classList.remove('active-view');
  truckDetailView.classList.add('active-view');
  dayHeaderEl.classList.add('hidden');       // dag-navigatie verbergen
  truckHeaderEl.classList.remove('hidden');  // truck-navigatie tonen
}

function renderSlots(truck) {
  slotsGridEl.innerHTML = '';

  truck.slots.forEach((slotObj, index) => {
    const { orderId, shape } = slotObj;

    const slotEl = document.createElement('div');
    slotEl.classList.add('slot');
    slotEl.dataset.index = index;

    if (orderId === null) {
      slotEl.classList.add('empty');
    } else {
      slotEl.classList.add('filled');
      const order = truck.orders.find(o => o.id === orderId);
      slotEl.textContent = order ? order.label.replace('Order ', '') : '?';
    }

    if (shape === 'rect') {
      slotEl.classList.add('rect');
    }

    slotEl.addEventListener('click', (e) => {
      handleSlotClick(truck, index, e);
    });

    slotsGridEl.appendChild(slotEl);
  });
}

function renderOrders(truck) {
  ordersListEl.innerHTML = '';

  const availableOrders = truck.orders.filter(o => o.assignedSlotIndex === null);

  if (availableOrders.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Geen vrije orders.';
    li.style.fontSize = '12px';
    li.style.color = '#777';
    ordersListEl.appendChild(li);
    return;
  }

  availableOrders.forEach(order => {
    const li = document.createElement('li');
    li.className = 'order-item';
    li.dataset.orderId = order.id;

    if (state.selectedOrderId === order.id) {
      li.classList.add('selected');
    }

    li.innerHTML = `<span>${order.label}</span><br><small>${order.info}</small>`;

    li.addEventListener('click', () => {
      handleOrderClick(order.id);
    });

    ordersListEl.appendChild(li);
  });
}

// INTERACTIE

function handleOrderClick(orderId) {
  // select/deselect
  if (state.selectedOrderId === orderId) {
    state.selectedOrderId = null;
  } else {
    state.selectedOrderId = orderId;
  }

  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;
  renderOrders(truck);
  renderSlots(truck);
}

/**
 * Controle: mag er in deze rij nog een order bij?
 * Regel:
 *  - als er een rechthoekige slot in de rij is, dan max 2 bezette slots in die rij.
 */
function canPlaceOrderInRow(truck, targetSlotIndex) {
  const rowIndex = getRowIndex(targetSlotIndex);
  const rowIndices = getRowSlotIndices(rowIndex);
  const rowSlots = rowIndices.map(i => truck.slots[i]);

  const hasRect = rowSlots.some(s => s && s.shape === 'rect');
  const occupiedCount = rowSlots.filter(s => s && s.orderId !== null).length;

  if (hasRect && occupiedCount >= 2) {
    return false;
  }
  return true;
}

/**
 * Slot vorm aanpassen: vierkant of rechthoek
 */
function setSlotShape(truck, slotIndex, newShape) {
  const slot = truck.slots[slotIndex];
  if (!slot) return;

  if (slot.shape === newShape) return; // niks te doen

  // Als we naar rechthoek gaan, controleren of dit mag qua capaciteit
  if (newShape === 'rect') {
    const rowIndex = getRowIndex(slotIndex);
    const rowIndices = getRowSlotIndices(rowIndex);
    const rowSlots = rowIndices.map(i => truck.slots[i]);
    const occupiedCount = rowSlots.filter(s => s && s.orderId !== null).length;

    if (occupiedCount >= 3) {
      alert(
        'In deze rij staan al 3 pallets. ' +
        'Je kunt deze positie niet rechthoekig maken zonder eerst een slot leeg te maken.'
      );
      return;
    }
  }

  slot.shape = newShape;
}

/**
 * Klik op een slot:
 * - Als slot gevuld & geen order-selected -> order terug naar lijst
 * - Als slot leeg & er is een geselecteerde order -> probeer order te plaatsen
 * - Als slot leeg & géén geselecteerde order -> vorm (vierkant/rechthoek) kiezen
 */
function handleSlotClick(truck, slotIndex, event) {
  const slot = truck.slots[slotIndex];
  const currentOrderId = slot.orderId;

  // CASE A: Leeg slot, geen geselecteerde order -> vorm kiezen
  if (currentOrderId === null && state.selectedOrderId === null) {
    const makeRect = window.confirm(
      'Wil je deze slot rechthoekig maken?\n\n' +
      'OK = Rechthoek\nAnnuleer = Vierkant'
    );
    const newShape = makeRect ? 'rect' : 'square';
    setSlotShape(truck, slotIndex, newShape);
    renderSlots(truck);
    return;
  }

  // CASE B: Slot is gevuld en er is geen order geselecteerd -> order terug naar lijst
  if (currentOrderId !== null && state.selectedOrderId === null) {
    const order = truck.orders.find(o => o.id === currentOrderId);
    if (order) {
      order.assignedSlotIndex = null;
    }
    slot.orderId = null;

    renderSlots(truck);
    renderOrders(truck);
    return;
  }

  // CASE C: Slot is leeg en er is een order geselecteerd -> plaats de order (mits toegestaan)
  if (currentOrderId === null && state.selectedOrderId !== null) {
    if (!canPlaceOrderInRow(truck, slotIndex)) {
      alert(
        'In deze rij is al een rechthoekige slot en er staan al 2 pallets.\n' +
        'Er past geen derde pallet meer in deze rij.'
      );
      return;
    }

    const order = truck.orders.find(o => o.id === state.selectedOrderId);
    if (order) {
      order.assignedSlotIndex = slotIndex;
      slot.orderId = order.id;
      state.selectedOrderId = null;
    }

    renderSlots(truck);
    renderOrders(truck);
    return;
  }

  // CASE D: Slot is gevuld én er is ook een order geselecteerd -> hier kun je later swap-logica maken
}

// TRUCK-NAVIGATIE IN DETAIL-VIEW

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
    alert('Je moet minimaal één vrachtwagen per dag hebben.');
    return;
  }

  const confirmed = window.confirm('Weet je zeker dat je deze vrachtwagen wilt verwijderen?');
  if (!confirmed) return;

  const idx = getTruckIndex(state.selectedTruckId);
  if (idx === -1) return;

  day.trucks.splice(idx, 1); // verwijder truck

  if (day.trucks.length === 0) {
    state.selectedTruckId = null;
    showListView();
    renderTruckList();
  } else {
    const newIndex = Math.min(idx, day.trucks.length - 1);
    const newTruck = day.trucks[newIndex];
    openTruckDetail(newTruck.id);
    renderTruckList(); // lijst ook updaten voor als je teruggaat
  }
}

// EVENT LISTENERS

prevDayBtn.addEventListener('click', () => {
  state.currentDayIndex -= 1;
  state.selectedTruckId = null;
  state.selectedOrderId = null;
  ensureDayExists(state.currentDayIndex);
  showListView();
  renderTruckList();
});

nextDayBtn.addEventListener('click', () => {
  state.currentDayIndex += 1;
  state.selectedTruckId = null;
  state.selectedOrderId = null;
  ensureDayExists(state.currentDayIndex);
  showListView();
  renderTruckList();
});

addTruckBtn.addEventListener('click', () => {
  const day = ensureDayExists(state.currentDayIndex);
  const truckNumber = day.trucks.length + 1;
  const newTruck = createTruck(`Truck ${truckNumber}`);
  day.trucks.push(newTruck);
  renderTruckList();
});

backToListBtn.addEventListener('click', () => {
  state.selectedTruckId = null;
  state.selectedOrderId = null;
  showListView();
});

prevTruckBtn.addEventListener('click', goToPrevTruck);
nextTruckBtn.addEventListener('click', goToNextTruck);
deleteTruckBtn.addEventListener('click', deleteCurrentTruck);

// VIEW HELPERS

function showListView() {
  truckDetailView.classList.remove('active-view');
  truckListView.classList.add('active-view');
  dayHeaderEl.classList.remove('hidden');     // dag-navigatie tonen
  truckHeaderEl.classList.add('hidden');      // truck-navigatie verbergen
}

// INIT

function init() {
  ensureDayExists(0);
  renderTruckList();
}

init();