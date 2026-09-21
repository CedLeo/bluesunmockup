/*
 * BlueSun Systems Mockup — shared data layer
 * All "persistence" is fake: everything lives in localStorage so the demo
 * survives a page refresh without needing a real backend/database.
 */

const STORAGE_KEYS = {
  inventory: "bluesun_inventory",
  orders: "bluesun_orders",
  surveys: "bluesun_surveys",
  seeded: "bluesun_seeded",
};

const ORDER_STATUSES = [
  { key: "pending", label: "Pending" },
  { key: "preparing", label: "Preparing" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "installation", label: "Installation" },
  { key: "completed", label: "Completed" },
];

// ---------- generic storage helpers ----------

function loadList(key) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;
}

function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return (
    "$" +
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysBetween(fromDateStr, toDateStr) {
  const from = new Date(fromDateStr);
  const to = toDateStr ? new Date(toDateStr) : new Date();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

// ---------- Inventory ----------

const Inventory = {
  all() {
    return loadList(STORAGE_KEYS.inventory);
  },
  get(id) {
    return this.all().find((i) => i.id === id);
  },
  save(item) {
    const items = this.all();
    const idx = items.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      items[idx] = item;
    } else {
      items.push(item);
    }
    saveList(STORAGE_KEYS.inventory, items);
  },
  remove(id) {
    saveList(
      STORAGE_KEYS.inventory,
      this.all().filter((i) => i.id !== id),
    );
  },
  adjustStock(id, delta, reason, staff) {
    const item = this.get(id);
    if (!item) return;
    item.quantity = Math.max(0, (Number(item.quantity) || 0) + Number(delta));
    item.adjustments = item.adjustments || [];
    item.adjustments.unshift({
      date: new Date().toISOString(),
      delta,
      reason,
      staff: staff || "Staff",
    });
    this.save(item);
    return item;
  },
};

// ---------- Orders ----------

const Orders = {
  all() {
    return loadList(STORAGE_KEYS.orders);
  },
  get(id) {
    return this.all().find((o) => o.id === id);
  },
  save(order) {
    const orders = this.all();
    const idx = orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
      orders[idx] = order;
    } else {
      orders.push(order);
    }
    saveList(STORAGE_KEYS.orders, orders);
  },
  remove(id) {
    saveList(
      STORAGE_KEYS.orders,
      this.all().filter((o) => o.id !== id),
    );
  },
  computeTotal(order) {
    const lineTotal = (order.lineItems || []).reduce(
      (sum, li) => sum + Number(li.qty) * Number(li.unitPrice),
      0,
    );
    const addonTotal = (order.addons || []).reduce(
      (sum, a) => sum + Number(a.amount),
      0,
    );
    return lineTotal + addonTotal;
  },
  downPaymentDue(order) {
    return this.computeTotal(order) / 2;
  },
  completionPaymentDue(order) {
    return this.computeTotal(order) / 2;
  },
  amountPaid(order) {
    return (order.payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
  },
  isDownPaymentConfirmed(order) {
    return (order.payments || []).some(
      (p) => p.milestone === "down" && Number(p.amount) > 0,
    );
  },
  isCompletionPaymentConfirmed(order) {
    return (order.payments || []).some(
      (p) => p.milestone === "completion" && Number(p.amount) > 0,
    );
  },
  statusIndex(order) {
    return ORDER_STATUSES.findIndex((s) => s.key === order.status);
  },
  canAdvance(order) {
    // Payment validation: block moving into/through "preparing" without down payment confirmed.
    const idx = this.statusIndex(order);
    const nextStatus = ORDER_STATUSES[idx + 1];
    if (!nextStatus)
      return { ok: false, reason: "Order is already completed." };
    if (nextStatus.key === "preparing" && !this.isDownPaymentConfirmed(order)) {
      return {
        ok: false,
        reason:
          "Down payment (50%) must be confirmed before moving to Preparing.",
      };
    }
    if (
      nextStatus.key === "completed" &&
      !this.isCompletionPaymentConfirmed(order)
    ) {
      return {
        ok: false,
        reason:
          "Completion payment (50%) must be confirmed before marking Completed.",
      };
    }
    return { ok: true };
  },
  advance(order) {
    const check = this.canAdvance(order);
    if (!check.ok) return check;
    const idx = this.statusIndex(order);
    const nextStatus = ORDER_STATUSES[idx + 1];
    order.status = nextStatus.key;
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: nextStatus.key,
      date: new Date().toISOString(),
    });
    order.statusChangedAt = new Date().toISOString();
    this.save(order);
    return { ok: true };
  },
};

// ---------- Surveys ----------

const Surveys = {
  all() {
    return loadList(STORAGE_KEYS.surveys);
  },
  get(id) {
    return this.all().find((s) => s.id === id);
  },
  save(survey) {
    const surveys = this.all();
    const idx = surveys.findIndex((s) => s.id === survey.id);
    if (idx >= 0) {
      surveys[idx] = survey;
    } else {
      surveys.push(survey);
    }
    saveList(STORAGE_KEYS.surveys, surveys);
  },
  remove(id) {
    saveList(
      STORAGE_KEYS.surveys,
      this.all().filter((s) => s.id !== id),
    );
  },
};

// ---------- Seed data (runs once) ----------

function seedDataIfNeeded() {
  if (localStorage.getItem(STORAGE_KEYS.seeded)) return;

  const inventory = [
    {
      id: genId("item"),
      name: "Monocrystalline Panel 400W",
      category: "Panels",
      sku: "PNL-400M",
      unitCost: 120,
      unitPrice: 180,
      quantity: 42,
      reorderThreshold: 15,
      adjustments: [],
    },
    {
      id: genId("item"),
      name: "Polycrystalline Panel 330W",
      category: "Panels",
      sku: "PNL-330P",
      unitCost: 90,
      unitPrice: 140,
      quantity: 8,
      reorderThreshold: 10,
      adjustments: [],
    },
    {
      id: genId("item"),
      name: "Grid-Tie Inverter 5kW",
      category: "Inverters",
      sku: "INV-5KW",
      unitCost: 450,
      unitPrice: 650,
      quantity: 12,
      reorderThreshold: 5,
      adjustments: [],
    },
    {
      id: genId("item"),
      name: "Hybrid Inverter 8kW",
      category: "Inverters",
      sku: "INV-8KWH",
      unitCost: 700,
      unitPrice: 980,
      quantity: 3,
      reorderThreshold: 4,
      adjustments: [],
    },
    {
      id: genId("item"),
      name: "Lithium Battery 5kWh",
      category: "Batteries",
      sku: "BAT-5KWH",
      unitCost: 900,
      unitPrice: 1250,
      quantity: 6,
      reorderThreshold: 5,
      adjustments: [],
    },
    {
      id: genId("item"),
      name: "Roof Mounting Rail (2m)",
      category: "Mounting",
      sku: "MNT-RAIL2",
      unitCost: 15,
      unitPrice: 28,
      quantity: 120,
      reorderThreshold: 30,
      adjustments: [],
    },
    {
      id: genId("item"),
      name: "DC Cable (per meter)",
      category: "Cabling",
      sku: "CBL-DC1",
      unitCost: 1.2,
      unitPrice: 2.5,
      quantity: 300,
      reorderThreshold: 50,
      adjustments: [],
    },
  ];
  saveList(STORAGE_KEYS.inventory, inventory);

  const panel = inventory[0];
  const inverter = inventory[2];
  const rail = inventory[5];

  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  const orders = [
    {
      id: genId("order"),
      clientName: "Maria Santos",
      address: "12 Acacia St, Quezon City",
      status: "preparing",
      createdAt: daysAgo(3),
      statusChangedAt: daysAgo(2),
      statusHistory: [
        { status: "pending", date: daysAgo(3) },
        { status: "preparing", date: daysAgo(2) },
      ],
      lineItems: [
        {
          itemId: panel.id,
          name: panel.name,
          qty: 10,
          unitPrice: panel.unitPrice,
        },
        {
          itemId: inverter.id,
          name: inverter.name,
          qty: 1,
          unitPrice: inverter.unitPrice,
        },
      ],
      addons: [{ description: "Installation labor", amount: 500 }],
      payments: [
        {
          milestone: "down",
          amount: 0,
          method: "bank_transfer",
          date: daysAgo(2),
        },
      ],
    },
    {
      id: genId("order"),
      clientName: "Del Cruz Household",
      address: "45 Mabini Ave, Pasig City",
      status: "pending",
      createdAt: daysAgo(1),
      statusChangedAt: daysAgo(1),
      statusHistory: [{ status: "pending", date: daysAgo(1) }],
      lineItems: [
        {
          itemId: panel.id,
          name: panel.name,
          qty: 6,
          unitPrice: panel.unitPrice,
        },
        { itemId: rail.id, name: rail.name, qty: 8, unitPrice: rail.unitPrice },
      ],
      addons: [],
      payments: [],
    },
    {
      id: genId("order"),
      clientName: "Greenview Apartments",
      address: "8 Ilang-Ilang Rd, Makati City",
      status: "completed",
      createdAt: daysAgo(20),
      statusChangedAt: daysAgo(1),
      statusHistory: [
        { status: "pending", date: daysAgo(20) },
        { status: "preparing", date: daysAgo(18) },
        { status: "out_for_delivery", date: daysAgo(12) },
        { status: "installation", date: daysAgo(9) },
        { status: "completed", date: daysAgo(1) },
      ],
      lineItems: [
        {
          itemId: panel.id,
          name: panel.name,
          qty: 20,
          unitPrice: panel.unitPrice,
        },
        {
          itemId: inverter.id,
          name: inverter.name,
          qty: 2,
          unitPrice: inverter.unitPrice,
        },
      ],
      addons: [{ description: "Installation labor", amount: 900 }],
      payments: [
        {
          milestone: "down",
          amount: 2350,
          method: "bank_transfer",
          date: daysAgo(18),
        },
        {
          milestone: "completion",
          amount: 2350,
          method: "cash",
          date: daysAgo(1),
        },
      ],
    },
  ];

  // fix the correct down payment amount for order #1 based on its own total
  const order1Total =
    orders[0].lineItems.reduce((s, li) => s + li.qty * li.unitPrice, 0) +
    orders[0].addons.reduce((s, a) => s + a.amount, 0);
  orders[0].payments[0].amount = order1Total / 2;

  saveList(STORAGE_KEYS.orders, orders);

  const surveys = [
    {
      id: genId("survey"),
      clientName: "Reyes Family",
      address: "23 Sampaguita St, Antipolo City",
      surveyor: "Jun Bautista",
      visitDate: daysAgo(2).slice(0, 10),
      status: "completed",
      roofType: "Concrete flat roof",
      orientation: "South-facing",
      usableArea: "45 sqm",
      shading: "Minor shading from a mango tree, west side",
      electricalNotes: "Existing 100A panel, has spare breaker slots",
      estimatedPanelCount: 16,
      feasibilityNotes:
        "Good candidate. Recommend trimming tree branches before install.",
      specialRequirements: ["extra_mounting"],
      photos: [],
    },
    {
      id: genId("survey"),
      clientName: "St. Anthony Parish Hall",
      address: "5 Rizal St, Marikina City",
      surveyor: "Jun Bautista",
      visitDate: daysAgo(0).slice(0, 10),
      status: "scheduled",
      roofType: "",
      orientation: "",
      usableArea: "",
      shading: "",
      electricalNotes: "",
      estimatedPanelCount: "",
      feasibilityNotes: "",
      specialRequirements: [],
      photos: [],
    },
  ];
  saveList(STORAGE_KEYS.surveys, surveys);

  localStorage.setItem(STORAGE_KEYS.seeded, "true");
}

function resetAllData() {
  localStorage.removeItem(STORAGE_KEYS.inventory);
  localStorage.removeItem(STORAGE_KEYS.orders);
  localStorage.removeItem(STORAGE_KEYS.surveys);
  localStorage.removeItem(STORAGE_KEYS.seeded);
  seedDataIfNeeded();
}

seedDataIfNeeded();
