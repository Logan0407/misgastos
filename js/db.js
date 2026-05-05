// ============================================
// MisGastos — Base de Datos (IndexedDB)
// ============================================

const DB_NAME = 'MisGastosDB';
const DB_VERSION = 4;

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

        // v3: Store de ingresos
        if (!db.objectStoreNames.contains('income')) {
          const incomeStore = db.createObjectStore('income', { keyPath: 'id', autoIncrement: true });
          incomeStore.createIndex('date', 'date', { unique: false });
          incomeStore.createIndex('month', 'month', { unique: false });
          incomeStore.createIndex('category', 'category', { unique: false });
        }

        // v3: Store de pagos recurrentes
        if (!db.objectStoreNames.contains('recurring_payments')) {
          const recurringStore = db.createObjectStore('recurring_payments', { keyPath: 'id', autoIncrement: true });
          recurringStore.createIndex('type', 'type', { unique: false });
        }

        // v3: Store de estado de pagos (por mes)
        if (!db.objectStoreNames.contains('payment_status')) {
          const statusStore = db.createObjectStore('payment_status', { keyPath: 'id' });
          statusStore.createIndex('month', 'month', { unique: false });
          statusStore.createIndex('paymentId', 'paymentId', { unique: false });
        }

        // v4: Store de pagos de tarjeta de crédito
        if (!db.objectStoreNames.contains('cc_payments')) {
          const ccStore = db.createObjectStore('cc_payments', { keyPath: 'id', autoIncrement: true });
          ccStore.createIndex('date', 'date', { unique: false });
          ccStore.createIndex('month', 'month', { unique: false });
          ccStore.createIndex('bank', 'bank', { unique: false });
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

  // ---- Ingresos (CRUD) ----

  async addIncome(income) {
    const store = this._transaction('income', 'readwrite');
    const data = {
      ...income,
      month: Utils.monthKeyFromDate(income.date),
      createdAt: new Date().toISOString()
    };
    return this._promisify(store.add(data));
  }

  async updateIncome(income) {
    const store = this._transaction('income', 'readwrite');
    return this._promisify(store.put(income));
  }

  async deleteIncome(id) {
    const store = this._transaction('income', 'readwrite');
    return this._promisify(store.delete(id));
  }

  async getIncome(id) {
    const store = this._transaction('income');
    return this._promisify(store.get(id));
  }

  async getAllIncome() {
    const store = this._transaction('income');
    return this._promisify(store.getAll());
  }

  async getIncomeByMonth(monthKey) {
    const store = this._transaction('income');
    const index = store.index('month');
    return this._promisify(index.getAll(monthKey));
  }

  async getIncomeStats(monthKey) {
    const incomes = await this.getIncomeByMonth(monthKey);
    const total = incomes.reduce((sum, i) => sum + i.amount, 0);

    const byCategory = {};
    incomes.forEach(i => {
      if (!byCategory[i.category]) byCategory[i.category] = 0;
      byCategory[i.category] += i.amount;
    });

    return { total, byCategory, count: incomes.length, incomes };
  }

  // ---- Pagos Recurrentes ----

  async addRecurringPayment(payment) {
    const store = this._transaction('recurring_payments', 'readwrite');
    const data = {
      ...payment,
      createdAt: new Date().toISOString()
    };
    return this._promisify(store.add(data));
  }

  async updateRecurringPayment(payment) {
    const store = this._transaction('recurring_payments', 'readwrite');
    return this._promisify(store.put(payment));
  }

  async deleteRecurringPayment(id) {
    const store = this._transaction('recurring_payments', 'readwrite');
    return this._promisify(store.delete(id));
  }

  async getRecurringPayment(id) {
    const store = this._transaction('recurring_payments');
    return this._promisify(store.get(id));
  }

  async getAllRecurringPayments() {
    const store = this._transaction('recurring_payments');
    return this._promisify(store.getAll());
  }

  // ---- Estado de Pagos Recurrentes (por mes) ----

  _paymentStatusId(paymentId, monthKey) {
    return `${paymentId}_${monthKey}`;
  }

  async getPaymentStatus(paymentId, monthKey) {
    const store = this._transaction('payment_status');
    const id = this._paymentStatusId(paymentId, monthKey);
    const result = await this._promisify(store.get(id));
    return result ? result.paid : false;
  }

  async togglePaymentStatus(paymentId, monthKey) {
    const id = this._paymentStatusId(paymentId, monthKey);
    const store = this._transaction('payment_status', 'readwrite');
    const existing = await this._promisify(store.get(id));

    const newStatus = {
      id,
      paymentId,
      month: monthKey,
      paid: existing ? !existing.paid : true,
      paidAt: new Date().toISOString()
    };

    // Need a new transaction since the previous one may have closed
    const writeStore = this._transaction('payment_status', 'readwrite');
    return this._promisify(writeStore.put(newStatus));
  }

  async getMonthPaymentStatuses(monthKey) {
    const store = this._transaction('payment_status');
    const index = store.index('month');
    const statuses = await this._promisify(index.getAll(monthKey));
    const map = {};
    statuses.forEach(s => { map[s.paymentId] = s.paid; });
    return map;
  }

  // ---- Pagos de Tarjeta de Crédito ----

  async addCCPayment(payment) {
    const store = this._transaction('cc_payments', 'readwrite');
    const data = {
      ...payment,
      month: Utils.monthKeyFromDate(payment.date),
      createdAt: new Date().toISOString()
    };
    return this._promisify(store.add(data));
  }

  async updateCCPayment(payment) {
    const store = this._transaction('cc_payments', 'readwrite');
    return this._promisify(store.put(payment));
  }

  async deleteCCPayment(id) {
    const store = this._transaction('cc_payments', 'readwrite');
    return this._promisify(store.delete(id));
  }

  async getCCPayment(id) {
    const store = this._transaction('cc_payments');
    return this._promisify(store.get(id));
  }

  async getAllCCPayments() {
    const store = this._transaction('cc_payments');
    return this._promisify(store.getAll());
  }

  async getCCPaymentsByMonth(monthKey) {
    const store = this._transaction('cc_payments');
    const index = store.index('month');
    return this._promisify(index.getAll(monthKey));
  }

  async getCCPaymentsByBank(bankId) {
    const store = this._transaction('cc_payments');
    const index = store.index('bank');
    return this._promisify(index.getAll(bankId));
  }

  async getCCPaymentStats(monthKey) {
    const payments = await this.getCCPaymentsByMonth(monthKey);
    const total = payments.reduce((sum, p) => sum + p.amount, 0);
    const byBank = {};
    payments.forEach(p => {
      if (!byBank[p.bank]) byBank[p.bank] = 0;
      byBank[p.bank] += p.amount;
    });
    return { total, byBank, count: payments.length, payments };
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
    const incomeStats = await this.getIncomeStats(monthKey);
    const ccStats = await this.getCCPaymentStats(monthKey);

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
      totalIncome: incomeStats.total,
      totalCCPayments: ccStats.total,
      balance: incomeStats.total - total - ccStats.total,
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
    const storeNames = ['expenses', 'budgets', 'settings', 'income', 'recurring_payments', 'payment_status', 'cc_payments'];
    const tx = this.db.transaction(storeNames, 'readwrite');
    storeNames.forEach(name => tx.objectStore(name).clear());
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
