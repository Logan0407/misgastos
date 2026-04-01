// ============================================
// MisGastos — App Principal
// ============================================

class MisGastosApp {
  constructor() {
    this.db = new GastosDB();
    this.charts = new GastosCharts();
    this.currentView = 'dashboard';
    this.selectedCategory = null;
    this.editingExpense = null;
    this.swipedItem = null;
  }

  // ---- Inicialización ----

  async init() {
    try {
      await this.db.init();
      this.charts.setupDefaults();
      this.setupNavigation();
      this.setupAddForm();
      this.setupFilters();
      this.setupSettings();
      this.setupEditModal();
      this.updateHeader();
      await this.refreshDashboard();
      this.registerServiceWorker();
      console.log('✅ MisGastos iniciado');
    } catch (err) {
      console.error('Error iniciando app:', err);
      Utils.showToast('Error al iniciar la app', 'error');
    }
  }

  // ---- Service Worker ----

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW registrado:', reg.scope))
        .catch(err => console.warn('SW error:', err));
    }
  }

  // ---- Header ----

  updateHeader() {
    const el = document.getElementById('current-month');
    if (el) {
      el.textContent = Utils.monthName(Utils.currentMonthKey());
    }
  }

  // ---- Navegación ----

  setupNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.navigateTo(view);
      });
    });
  }

  async navigateTo(viewName) {
    if (viewName === this.currentView) return;

    // Update nav
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Switch views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
      target.scrollTop = 0;
    }

    this.currentView = viewName;

    // Refresh data on view change
    if (viewName === 'dashboard') {
      await this.refreshDashboard();
    } else if (viewName === 'history') {
      await this.refreshHistory();
    } else if (viewName === 'add') {
      this.resetAddForm();
    } else if (viewName === 'settings') {
      await this.loadSettings();
    }
  }

  // ---- Dashboard ----

  async refreshDashboard() {
    const monthKey = Utils.currentMonthKey();
    const stats = await this.db.getMonthStats(monthKey);

    // Totales
    document.getElementById('month-total').textContent = Utils.formatCurrency(stats.total);
    document.getElementById('today-total').textContent = Utils.formatCurrency(await this.db.getTodayTotal());
    document.getElementById('week-total').textContent = Utils.formatCurrency(await this.db.getWeekTotal());

    // Budget bar
    const budgetBar = document.getElementById('budget-bar');
    const budgetFill = document.getElementById('budget-fill');
    const budgetLabel = document.getElementById('budget-label');

    if (stats.budget) {
      budgetBar.classList.add('visible');
      const pct = Math.min((stats.total / stats.budget) * 100, 100);
      budgetFill.style.width = pct + '%';

      budgetFill.classList.remove('warning', 'danger');
      if (pct >= 90) {
        budgetFill.classList.add('danger');
      } else if (pct >= 70) {
        budgetFill.classList.add('warning');
      }

      const remaining = stats.budget - stats.total;
      budgetLabel.textContent = remaining > 0
        ? `Quedan ${Utils.formatCurrency(remaining)} de ${Utils.formatCurrency(stats.budget)}`
        : `¡Presupuesto excedido por ${Utils.formatCurrency(Math.abs(remaining))}!`;
    } else {
      budgetBar.classList.remove('visible');
      budgetLabel.textContent = '';
    }

    // Animate total
    const totalEl = document.getElementById('month-total');
    totalEl.classList.remove('saved-pulse');
    void totalEl.offsetWidth; // reflow
    totalEl.classList.add('saved-pulse');

    // Charts
    this.charts.renderCategoryChart('category-chart', stats.byCategory);

    const last7 = Utils.lastNDays(7);
    const byDayLast7 = {};
    last7.forEach(d => byDayLast7[d] = stats.byDay[d] || 0);
    this.charts.renderDailyChart('daily-chart', byDayLast7);

    // Recent expenses
    this.renderRecentExpenses(stats.expenses);
  }

  renderRecentExpenses(expenses) {
    const container = document.getElementById('recent-expenses');
    if (!container) return;

    // Mostrar últimos 5
    const recent = expenses
      .sort((a, b) => b.id - a.id)
      .slice(0, 5);

    if (recent.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💸</div>
          <div class="empty-state-text">No hay gastos este mes<br>¡Empieza registrando uno!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = recent.map(exp => this._expenseItemHTML(exp)).join('');
    this._setupSwipeHandlers(container);
  }

  // ---- Agregar Gasto ----

  setupAddForm() {
    const amountInput = document.getElementById('expense-amount');
    const descInput = document.getElementById('expense-description');
    const dateInput = document.getElementById('expense-date');
    const saveBtn = document.getElementById('save-expense');

    // Formateo de monto en tiempo real
    amountInput.addEventListener('input', () => {
      const formatted = Utils.formatAmountInput(amountInput.value);
      amountInput.value = formatted;
    });

    // Fecha por defecto: hoy
    dateInput.value = Utils.today();

    // Renderizar categorías
    this.renderCategories();

    // Guardar
    saveBtn.addEventListener('click', () => this.saveExpense());
  }

  renderCategories() {
    const grid = document.getElementById('category-grid');
    if (!grid) return;

    grid.innerHTML = DEFAULT_CATEGORIES.map(cat => `
      <button class="category-btn" data-id="${cat.id}" type="button">
        <span class="category-btn-icon">${cat.icon}</span>
        <span class="category-btn-label">${cat.name}</span>
      </button>
    `).join('');

    // Click handler
    grid.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedCategory = btn.dataset.id;
      });
    });
  }

  async saveExpense() {
    const amount = Utils.parseCurrency(document.getElementById('expense-amount').value);
    const description = document.getElementById('expense-description').value.trim();
    const date = document.getElementById('expense-date').value;
    const category = this.selectedCategory;

    // Validaciones
    if (!amount || amount <= 0) {
      Utils.showToast('Ingresa un monto válido', 'error');
      return;
    }
    if (!description) {
      Utils.showToast('Agrega una descripción', 'error');
      return;
    }
    if (!category) {
      Utils.showToast('Selecciona una categoría', 'error');
      return;
    }

    try {
      await this.db.addExpense({ amount, description, date, category });

      // Feedback visual
      const btn = document.getElementById('save-expense');
      btn.classList.add('saved');
      Utils.showToast(`${description} — ${Utils.formatCurrency(amount)} guardado ✓`);

      setTimeout(() => {
        btn.classList.remove('saved');
        this.resetAddForm();
        // Ir al dashboard
        this.navigateTo('dashboard');
      }, 600);

    } catch (err) {
      console.error('Error guardando gasto:', err);
      Utils.showToast('Error al guardar', 'error');
    }
  }

  resetAddForm() {
    document.getElementById('expense-amount').value = '';
    document.getElementById('expense-description').value = '';
    document.getElementById('expense-date').value = Utils.today();
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
    this.selectedCategory = null;

    // Focus on amount for quick entry
    setTimeout(() => {
      if (this.currentView === 'add') {
        document.getElementById('expense-amount').focus();
      }
    }, 350);
  }

  // ---- Historial ----

  setupFilters() {
    const periodFilter = document.getElementById('filter-period');
    const categoryFilter = document.getElementById('filter-category');

    // Populate category filter
    categoryFilter.innerHTML = '<option value="all">Todas</option>' +
      DEFAULT_CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

    periodFilter.addEventListener('change', () => this.refreshHistory());
    categoryFilter.addEventListener('change', () => this.refreshHistory());
  }

  async refreshHistory() {
    const period = document.getElementById('filter-period').value;
    const category = document.getElementById('filter-category').value;

    let expenses;
    const today = Utils.today();

    switch (period) {
      case 'today':
        expenses = await this.db.getExpensesByDate(today);
        break;
      case 'week':
        expenses = await this.db.getExpensesByDateRange(Utils.weekStart(), today);
        break;
      case 'month':
        expenses = await this.db.getExpensesByMonth(Utils.currentMonthKey());
        break;
      case 'all':
      default:
        expenses = await this.db.getAllExpenses();
    }

    // Filter by category
    if (category !== 'all') {
      expenses = expenses.filter(e => e.category === category);
    }

    // Sort by date desc, then by id desc
    expenses.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });

    this.renderHistory(expenses);
  }

  renderHistory(expenses) {
    const container = document.getElementById('history-list');
    if (!container) return;

    if (expenses.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">No hay gastos en este período</div>
        </div>
      `;
      return;
    }

    // Group by date
    const groups = {};
    let total = 0;
    expenses.forEach(e => {
      if (!groups[e.date]) groups[e.date] = [];
      groups[e.date].push(e);
      total += e.amount;
    });

    let html = `
      <div class="history-summary animate-in">
        <span class="history-summary-label">${expenses.length} gasto${expenses.length !== 1 ? 's' : ''}</span>
        <span class="history-summary-amount">${Utils.formatCurrency(total)}</span>
      </div>
    `;

    Object.entries(groups).forEach(([date, items], idx) => {
      const dayTotal = items.reduce((sum, e) => sum + e.amount, 0);
      html += `
        <div class="date-group animate-in" style="animation-delay: ${idx * 0.04}s">
          <div class="date-group-header">
            <span class="date-group-label">${Utils.relativeDate(date)}</span>
            <span class="date-group-total">${Utils.formatCurrency(dayTotal)}</span>
          </div>
          ${items.map(exp => this._expenseItemHTML(exp)).join('')}
        </div>
      `;
    });

    container.innerHTML = html;
    this._setupSwipeHandlers(container);
    this._setupTapToEdit(container);
  }

  _expenseItemHTML(exp) {
    const cat = DEFAULT_CATEGORIES.find(c => c.id === exp.category) || DEFAULT_CATEGORIES[7];
    return `
      <div class="expense-item" data-id="${exp.id}">
        <div class="expense-icon" style="background: ${cat.color}20; color: ${cat.color}">
          ${cat.icon}
        </div>
        <div class="expense-info">
          <div class="expense-description">${exp.description}</div>
          <div class="expense-meta">
            <span>${cat.name}</span>
            <span>•</span>
            <span>${Utils.relativeDate(exp.date)}</span>
          </div>
        </div>
        <div class="expense-amount">${Utils.formatCurrency(exp.amount)}</div>
        <button class="expense-delete-btn" data-id="${exp.id}">🗑️</button>
      </div>
    `;
  }

  // ---- Swipe to Delete ----

  _setupSwipeHandlers(container) {
    const items = container.querySelectorAll('.expense-item');

    items.forEach(item => {
      let startX = 0;
      let currentX = 0;
      let isSwiping = false;

      item.addEventListener('touchstart', (e) => {
        // Close any previously swiped item
        if (this.swipedItem && this.swipedItem !== item) {
          this.swipedItem.classList.remove('swiped');
        }
        startX = e.touches[0].clientX;
        isSwiping = true;
      }, { passive: true });

      item.addEventListener('touchmove', (e) => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX;
        const diff = startX - currentX;

        if (diff > 30) {
          item.classList.add('swiped');
          this.swipedItem = item;
        } else if (diff < -10) {
          item.classList.remove('swiped');
          this.swipedItem = null;
        }
      }, { passive: true });

      item.addEventListener('touchend', () => {
        isSwiping = false;
      }, { passive: true });

      // Delete button click
      const deleteBtn = item.querySelector('.expense-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = Number(deleteBtn.dataset.id);
          await this.deleteExpense(id, item);
        });
      }
    });
  }

  async deleteExpense(id, itemElement) {
    try {
      await this.db.deleteExpense(id);

      // Animate removal
      itemElement.style.transition = 'all 0.3s ease';
      itemElement.style.transform = 'translateX(-100%)';
      itemElement.style.opacity = '0';
      itemElement.style.maxHeight = itemElement.offsetHeight + 'px';

      setTimeout(() => {
        itemElement.style.maxHeight = '0';
        itemElement.style.padding = '0';
        itemElement.style.margin = '0';
        itemElement.style.border = 'none';
      }, 200);

      setTimeout(() => {
        itemElement.remove();
        Utils.showToast('Gasto eliminado');
        // Check if we need to show empty state
        if (this.currentView === 'history') {
          const remaining = document.querySelectorAll('#history-list .expense-item');
          if (remaining.length === 0) this.refreshHistory();
        }
      }, 500);

    } catch (err) {
      console.error('Error eliminando gasto:', err);
      Utils.showToast('Error al eliminar', 'error');
    }
  }

  // ---- Tap to Edit ----

  _setupTapToEdit(container) {
    const items = container.querySelectorAll('.expense-item');
    items.forEach(item => {
      item.addEventListener('click', (e) => {
        // Don't open edit if delete button was clicked or item is swiped
        if (item.classList.contains('swiped')) return;
        if (e.target.closest('.expense-delete-btn')) return;

        const id = Number(item.dataset.id);
        this.openEditModal(id);
      });
    });
  }

  // ---- Edit Modal ----

  setupEditModal() {
    const overlay = document.getElementById('edit-modal');
    if (!overlay) return;

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeEditModal();
    });

    // Cancel button
    document.getElementById('edit-cancel').addEventListener('click', () => this.closeEditModal());

    // Save button
    document.getElementById('edit-save').addEventListener('click', () => this.saveEdit());

    // Delete button
    document.getElementById('edit-delete').addEventListener('click', () => this.deleteFromEdit());

    // Format amount input
    const amountInput = document.getElementById('edit-amount');
    amountInput.addEventListener('input', () => {
      amountInput.value = Utils.formatAmountInput(amountInput.value);
    });
  }

  async openEditModal(id) {
    const expense = await this.db.getExpense(id);
    if (!expense) return;

    this.editingExpense = expense;

    document.getElementById('edit-amount').value = Utils.formatAmountInput(expense.amount.toString());
    document.getElementById('edit-description').value = expense.description;
    document.getElementById('edit-date').value = expense.date;

    // Category select
    const catSelect = document.getElementById('edit-category');
    catSelect.innerHTML = DEFAULT_CATEGORIES.map(c =>
      `<option value="${c.id}" ${c.id === expense.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`
    ).join('');

    const overlay = document.getElementById('edit-modal');
    overlay.classList.add('active');
  }

  closeEditModal() {
    const overlay = document.getElementById('edit-modal');
    overlay.classList.remove('active');
    this.editingExpense = null;
  }

  async saveEdit() {
    if (!this.editingExpense) return;

    const amount = Utils.parseCurrency(document.getElementById('edit-amount').value);
    const description = document.getElementById('edit-description').value.trim();
    const date = document.getElementById('edit-date').value;
    const category = document.getElementById('edit-category').value;

    if (!amount || !description) {
      Utils.showToast('Completa todos los campos', 'error');
      return;
    }

    try {
      const updated = {
        ...this.editingExpense,
        amount,
        description,
        date,
        category,
        month: Utils.monthKeyFromDate(date)
      };

      await this.db.updateExpense(updated);
      this.closeEditModal();
      Utils.showToast('Gasto actualizado ✓');

      if (this.currentView === 'history') {
        await this.refreshHistory();
      } else if (this.currentView === 'dashboard') {
        await this.refreshDashboard();
      }
    } catch (err) {
      console.error('Error actualizando:', err);
      Utils.showToast('Error al actualizar', 'error');
    }
  }

  async deleteFromEdit() {
    if (!this.editingExpense) return;

    this.showConfirm(
      '¿Eliminar gasto?',
      `${this.editingExpense.description} — ${Utils.formatCurrency(this.editingExpense.amount)}`,
      async () => {
        await this.db.deleteExpense(this.editingExpense.id);
        this.closeEditModal();
        Utils.showToast('Gasto eliminado');
        if (this.currentView === 'history') {
          await this.refreshHistory();
        } else {
          await this.refreshDashboard();
        }
      }
    );
  }

  // ---- Settings ----

  async setupSettings() {
    // Budget
    const budgetInput = document.getElementById('budget-amount');
    const saveBudgetBtn = document.getElementById('save-budget');

    budgetInput.addEventListener('input', () => {
      budgetInput.value = Utils.formatAmountInput(budgetInput.value);
    });

    saveBudgetBtn.addEventListener('click', async () => {
      const amount = Utils.parseCurrency(budgetInput.value);
      if (amount > 0) {
        await this.db.setBudget(Utils.currentMonthKey(), amount);
        Utils.showToast(`Presupuesto: ${Utils.formatCurrency(amount)} ✓`);
      } else {
        Utils.showToast('Ingresa un monto válido', 'error');
      }
    });

    // Export
    document.getElementById('export-csv').addEventListener('click', async () => {
      try {
        await this.db.exportToCSV();
        Utils.showToast('CSV exportado ✓');
      } catch (err) {
        Utils.showToast('Error al exportar', 'error');
      }
    });

    // Clear data
    document.getElementById('clear-data').addEventListener('click', () => {
      this.showConfirm(
        '¿Borrar todo?',
        'Se eliminarán todos los gastos y configuraciones. Esta acción no se puede deshacer.',
        async () => {
          await this.db.clearAll();
          Utils.showToast('Datos eliminados');
          await this.refreshDashboard();
        }
      );
    });
  }

  async loadSettings() {
    const budget = await this.db.getBudget(Utils.currentMonthKey());
    const budgetInput = document.getElementById('budget-amount');
    if (budget) {
      budgetInput.value = Utils.formatAmountInput(budget.amount.toString());
    }
  }

  // ---- Confirm Dialog ----

  showConfirm(title, message, onConfirm) {
    const overlay = document.getElementById('confirm-dialog');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;

    overlay.classList.add('active');

    const confirmBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    const cleanup = () => {
      overlay.classList.remove('active');
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    const handleConfirm = () => {
      cleanup();
      onConfirm();
    };

    const handleCancel = () => {
      cleanup();
    };

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
  }
}

// ---- Iniciar la app ----

document.addEventListener('DOMContentLoaded', () => {
  const app = new MisGastosApp();
  app.init();
});
