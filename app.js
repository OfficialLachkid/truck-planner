// Aantal vakken per vrachtwagen
const NUM_SLOTS = 33;

// Globale state (in een echte app komt dit straks uit Supabase)
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

const backToListBtn = document.getElementById('back-to-list-btn');
const detailTruckNameEl = document.getElementById('detail-truck-name');
const slotsGridEl = document.getElementById('slots-grid');
const ordersListEl = document.getElementById('orders-list');

// Helpers voor dagen

function getDayKey(dayIndex) {
  const d = new Date();
  d.setDate(d.getDate() + dayIndex);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getDayLabel(dayIndex) {
  if (dayIndex === 0) return 'Vandaag';
  if (dayIndex === 1) return 'Morgen';
  if (dayIndex === -1) return 'Gisteren';
  return dayIndex > 0 ? `Over ${dayIndex} dagen` : `${Math.abs(dayIndex)} dagen geleden`;
}

// Dag initialiseren als hij nog niet bestaat

function ensureDayExists(dayIndex) {
  const key = getDayKey(dayIndex);
  if (!state.days[key]) {
    // Maak een nieuwe dag met 4 trucks en wat dummy orders
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
  // standaard 4 trucks
  for (let i = 1; i <= 4; i++) {
    trucks.push(createTruck(`Truck ${i}`));
  }
  return trucks;
}

function createTruck(name) {
  const truckId = nextTruckId++;
  // lege slots (null = leeg, anders: orderId)
  const slots = Array(NUM_SLOTS).fill(null);

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

function openTruckDetail(truckId) {
  state.selectedTruckId = truckId;
  state.selectedOrderId = null;

  const truck = getTruckById(truckId);
  if (!truck) return;

  detailTruckNameEl.textContent = truck.name || truckId;

  renderSlots(truck);
  renderOrders(truck);

  // switch view
  truckListView.classList.remove('active-view');
  truckDetailView.classList.add('active-view');
}

function renderSlots(truck) {
  slotsGridEl.innerHTML = '';

  truck.slots.forEach((orderId, index) => {
    const slotEl = document.createElement('div');
    slotEl.classList.add('slot');
    slotEl.dataset.index = index;

    if (orderId === null) {
      slotEl.classList.add('empty');
    } else {
      slotEl.classList.add('filled');
      // laat bijvoorbeeld korte tekst zien
      const order = truck.orders.find(o => o.id === orderId);
      slotEl.textContent = order ? order.label.replace('Order ', '') : '?';
    }

    slotEl.addEventListener('click', () => {
      handleSlotClick(truck, index);
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
  // select/deselect logica
  if (state.selectedOrderId === orderId) {
    state.selectedOrderId = null;
  } else {
    state.selectedOrderId = orderId;
  }

  const truck = getTruckById(state.selectedTruckId);
  if (!truck) return;
  renderOrders(truck);
  renderSlots(truck); // eventueel highlight van mogelijke targets later
}

function handleSlotClick(truck, slotIndex) {
  const currentOrderId = truck.slots[slotIndex];

  // CASE 1: Slot is gevuld en er is geen order geselecteerd -> order terug naar lijst
  if (currentOrderId !== null && state.selectedOrderId === null) {
    const order = truck.orders.find(o => o.id === currentOrderId);
    if (order) {
      order.assignedSlotIndex = null;
    }
    truck.slots[slotIndex] = null;
  }
  // CASE 2: Slot is leeg en er is een order geselecteerd -> plaats de order
  else if (currentOrderId === null && state.selectedOrderId !== null) {
    const order = truck.orders.find(o => o.id === state.selectedOrderId);
    if (order) {
      order.assignedSlotIndex = slotIndex;
      truck.slots[slotIndex] = order.id;
      state.selectedOrderId = null;
    }
  }
  // (optioneel: extra logica voor vervangen/swap als je wilt)

  renderSlots(truck);
  renderOrders(truck);
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

// VIEW HELPERS

function showListView() {
  truckDetailView.classList.remove('active-view');
  truckListView.classList.add('active-view');
}

// INIT

function init() {
  ensureDayExists(0);
  renderTruckList();
}

init();