// ============================================
// MisGastos — Base de Datos (IndexedDB)
// ============================================

const DB_NAME = 'MisGastosDB';
const DB_VERSION = 2;

class GastosDB {
  constructor() {
    this.db = null;
  }

  // ---- Inicialización ----

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // Store de gastos
        if (!db.objectStoreNames.contains('expenses')) {
          const store = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('month', 'month', { unique: false });
          store.createIndex('paymentSource', 'paymentSource', { unique: false });
        } else if (oldVersion < 2) {
          // Migración: agregar índice de fuente de pago
          const store = request.transaction.objectStore('expenses');
          if (!store.indexNames.contains('paymentSource')) {
            store.createIndex('paymentSource', 'paymentSource', { unique: false });
          }
        }

        // Store de presupuestos
        if (!db.objectStoreNames.contains('budgets')) {
          db.createObjectStore('budgets', { keyPath: 'month' });
        }

        // Store de configuración
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Error opening DB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ---- Helpers ----

  _transaction(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ---- Gastos (CRUD) ----

  async addExpense(expense) {
    const store = this._transaction('expenses', 'readwrite');
    const data = {
      ...expense,
      paymentSource: expense.paymentSource || 'debito',
      month: Utils.monthKeyFromDate(expense.date),
      createdAt: new Date().toISOString()
    };
    return this._promisify(store.add(data));
  }

  async updateExpense(expense) {
    const store = this._transaction('expenses', 'readwrite');
    return this._promisify(store.put(expense));
  }

  async deleteExpense(id) {
    const store = this._transaction('expenses', 'readwrite');
    return this._promisify(store.delete(id));
  }

  async getExpense(id) {
    const store = this._transaction('expenses');
    return this._promisify(store.get(id));
  }

  async getAllExpenses() {
    const store = this._transaction('expenses');
    return this._promisify(store.getAll());
  }

  async getExpensesByMonth(monthKey) {
    const store = this._transaction('expenses');
    const index = store.index('month');
    return this._promisify(index.getAll(monthKey));
  }

  async getExpensesByDate(dateStr) {
    const store = this._transaction('expenses');
    const index = store.index('date');
    return this._promisify(index.getAll(dateStr));
  }

  async getExpensesByCategory(categoryId) {
    const store = this._transaction('expenses');
    const index = store.index('category');
    return this._promisify(index.getAll(categoryId));
  }

  async getExpensesByPaymentSource(sourceId) {
    const store = this._transaction('expenses');
    const index = store.index('paymentSource');
    return this._promisify(index.getAll(sourceId));
  }

  async getExpensesByDateRange(startDate, endDate) {
    const all = await this.getAllExpenses();
    return all.filter(e => e.date >= startDate && e.date <= endDate);
  }

  // ---- Presupuestos ----

  async setBudget(monthKey, amount) {
    const store = this._transaction('budgets', 'readwrite');
    return this._promisify(store.put({ month: monthKey, amount }));
  }

  async getBudget(monthKey) {
    const store = this._transaction('budgets');
    return this._promisify(store.get(monthKey));
  }

  // ---- Configuración ----

  async setSetting(key, value) {
    const store = this._transaction('settings', 'readwrite');
    return this._promisify(store.put({ key, value }));
  }

  async getSetting(key) {
    const store = this._transaction('settings');
    const result = await this._promisify(store.get(key));
    return result ? result.value : null;
  }

  // ---- Estadísticas ----

  async getMonthStats(monthKey) {
    const expenses = await this.getExpensesByMonth(monthKey);
    const budget = await this.getBudget(monthKey);

    const total = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Por categoría
    const byCategory = {};
    expenses.forEach(e => {
      if (!byCategory[e.category]) {
        byCategory[e.category] = 0;
      }
      byCategory[e.category] += e.amount;
    });

    // Por fuente de pago
    const byPaymentSource = {};
    expenses.forEach(e => {
      const source = e.paymentSource || 'debito';
      if (!byPaymentSource[source]) {
        byPaymentSource[source] = 0;
      }
      byPaymentSource[source] += e.amount;
    });

    // Por día
    const byDay = {};
    expenses.forEach(e => {
      if (!byDay[e.date]) {
        byDay[e.date] = 0;
      }
      byDay[e.date] += e.amount;
    });

    return {
      total,
      budget: budget ? budget.amount : null,
      byCategory,
      byPaymentSource,
      byDay,
      count: expenses.length,
      expenses
    };
  }

  async getTodayTotal() {
    const today = Utils.today();
    const expenses = await this.getExpensesByDate(today);
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  async getWeekTotal() {
    const start = Utils.weekStart();
    const end = Utils.today();
    const expenses = await this.getExpensesByDateRange(start, end);
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  // ---- Limpieza ----

  async clearAllExpenses() {
    const store = this._transaction('expenses', 'readwrite');
    return this._promisify(store.clear());
  }

  async clearAll() {
    const tx = this.db.transaction(['expenses', 'budgets', 'settings'], 'readwrite');
    tx.objectStore('expenses').clear();
    tx.objectStore('budgets').clear();
    tx.objectStore('settings').clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- Exportar ----

  async exportToCSV(startDate, endDate) {
    let expenses;
    if (startDate && endDate) {
      expenses = await this.getExpensesByDateRange(startDate, endDate);
    } else {
      expenses = await this.getAllExpenses();
    }

    // Ordenar por fecha
    expenses.sort((a, b) => a.date.localeCompare(b.date));

    // Encontrar el nombre de la categoría
    const getCategoryName = (catId) => {
      const cat = DEFAULT_CATEGORIES.find(c => c.id === catId);
      return cat ? cat.name : catId;
    };

    // Encontrar el nombre de la fuente de pago
    const getPaymentSourceName = (sourceId) => {
      const source = DEFAULT_PAYMENT_SOURCES.find(s => s.id === (sourceId || 'debito'));
      return source ? source.name : (sourceId || 'Débito');
    };

    const header = 'Fecha,Descripción,Categoría,Fuente de Pago,Monto\n';
    const rows = expenses.map(e =>
      `${e.date},"${e.description}",${getCategoryName(e.category)},${getPaymentSourceName(e.paymentSource)},${e.amount}`
    ).join('\n');

    const csv = header + rows;
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos_${Utils.today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
