// ============================================
// MisGastos — App Principal
// ============================================

class MisGastosApp {
  constructor() {
    this.db = new GastosDB();
    this.charts = new GastosCharts();
    this.currentView = 'dashboard';
    this.selectedCategory = null;
    this.selectedPaymentSource = 'debito';
    this.selectedIncomeCategory = null;
    this.editingExpense = null;
    this.editingIncome = null;
    this.editingPayment = null;
    this.editingCCPayment = null;
    this.editingUserCard = null;
    this.selectedBank = null;
    this.selectedCCSource = null;
    this.swipedItem = null;
    this.historyTab = 'expenses';
  }

  // ---- Inicialización ----

  async init() {
    try {
      await this.db.init();
      await this.loadTheme();
      this.charts.setupDefaults();
      this.setupNavigation();
      this.setupAddForm();
      this.setupIncomeForm();
      this.setupPayments();
      this.setupFilters();
      this.setupSettings();
      this.setupEditModal();
      this.setupEditIncomeModal();
      this.setupCCPayments();
      this.setupEditCCModal();
      this.setupUserCards();
      this.setupHistoryTabs();
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
    } else if (viewName === 'income') {
      this.resetIncomeForm();
    } else if (viewName === 'payments') {
      await this.refreshPayments();
    } else if (viewName === 'ccpayments') {
      this.resetCCForm();
      await this.refreshCCPayments();
    } else if (viewName === 'settings') {
      await this.loadSettings();
    }
  }

  // ---- Dashboard ----

  async refreshDashboard() {
    const monthKey = Utils.currentMonthKey();
    const stats = await this.db.getMonthStats(monthKey);

    // Balance
    const balanceEl = document.getElementById('month-balance');
    balanceEl.textContent = Utils.formatCurrency(Math.abs(stats.balance));
    balanceEl.className = 'card-amount ' + (stats.balance >= 0 ? 'balance-positive' : 'balance-negative');
    if (stats.balance < 0) balanceEl.textContent = '-' + balanceEl.textContent;

    // Income & Expense totals
    document.getElementById('month-income-total').textContent = Utils.formatCurrency(stats.totalIncome);
    document.getElementById('month-total').textContent = Utils.formatCurrency(stats.total);

    // CC Payments total in balance card
    const ccRow = document.getElementById('cc-balance-row');
    const ccTotalEl = document.getElementById('month-cc-total');
    const debitRecurringEl = document.getElementById('month-debit-recurring');
    const debitRecurringDetail = document.getElementById('debit-recurring-detail');
    const ccDivider = document.getElementById('cc-divider');

    const hasCC = stats.totalCCPayments > 0;
    const hasDebit = stats.totalDebitRecurring > 0;

    if (hasCC || hasDebit) {
      ccRow.style.display = '';
      ccTotalEl.textContent = Utils.formatCurrency(stats.totalCCPayments);
      document.querySelector('.cc-detail').style.display = hasCC ? '' : 'none';

      if (hasDebit) {
        debitRecurringDetail.style.display = '';
        debitRecurringEl.textContent = Utils.formatCurrency(stats.totalDebitRecurring);
        ccDivider.style.display = hasCC ? '' : 'none';
      } else {
        debitRecurringDetail.style.display = 'none';
        ccDivider.style.display = 'none';
      }
    } else {
      ccRow.style.display = 'none';
    }

    // Today & Week
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
      if (pct >= 90) budgetFill.classList.add('danger');
      else if (pct >= 70) budgetFill.classList.add('warning');
      const remaining = stats.budget - stats.total;
      budgetLabel.textContent = remaining > 0
        ? `Quedan ${Utils.formatCurrency(remaining)} de ${Utils.formatCurrency(stats.budget)}`
        : `¡Presupuesto excedido por ${Utils.formatCurrency(Math.abs(remaining))}!`;
    } else {
      budgetBar.classList.remove('visible');
      budgetLabel.textContent = '';
    }

    // Payments summary
    await this.renderPaymentsSummary(monthKey);

    // Charts
    this.charts.renderCategoryChart('category-chart', stats.byCategory);
    const last7 = Utils.lastNDays(7);
    const byDayLast7 = {};
    last7.forEach(d => byDayLast7[d] = stats.byDay[d] || 0);
    this.charts.renderDailyChart('daily-chart', byDayLast7);

    // Recent expenses
    this.renderRecentExpenses(stats.expenses);
  }

  async renderPaymentsSummary(monthKey) {
    const payments = await this.db.getAllRecurringPayments();
    const card = document.getElementById('payments-summary-card');
    const content = document.getElementById('payments-summary-content');
    if (!payments.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    const statuses = await this.db.getMonthPaymentStatuses(monthKey);
    const paid = payments.filter(p => statuses[p.id]).length;
    const pending = payments.length - paid;
    const pendingAmount = payments.filter(p => !statuses[p.id]).reduce((s, p) => s + p.amount, 0);
    let html = `<div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:10px">${paid}/${payments.length} pagados · Pendiente: <strong style="color:var(--warning)">${Utils.formatCurrency(pendingAmount)}</strong></div>`;
    payments.sort((a, b) => a.dueDay - b.dueDay).slice(0, 5).forEach(p => {
      const isPaid = statuses[p.id] || false;
      const type = DEFAULT_RECURRING_TYPES.find(t => t.id === p.type) || DEFAULT_RECURRING_TYPES[7];
      html += `<div class="payments-summary-item"><div class="payments-summary-left"><span class="payments-summary-status ${isPaid ? 'done' : 'pending'}"></span><span style="font-size:0.85rem">${type.icon} ${p.name}</span></div><span style="font-size:0.85rem;font-weight:600">${Utils.formatCurrency(p.amount)}</span></div>`;
    });
    content.innerHTML = html;
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

    // Renderizar fuentes de pago
    this.renderPaymentSources();

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

  renderPaymentSources() {
    const grid = document.getElementById('payment-source-grid');
    if (!grid) return;

    grid.innerHTML = DEFAULT_PAYMENT_SOURCES.map(source => `
      <button class="payment-source-btn" data-id="${source.id}" type="button">
        <span class="payment-source-btn-icon">${source.icon}</span>
        <span class="payment-source-btn-label">${source.name}</span>
      </button>
    `).join('');

    // Seleccionar débito por defecto
    const defaultBtn = grid.querySelector(`[data-id="${this.selectedPaymentSource}"]`);
    if (defaultBtn) defaultBtn.classList.add('selected');

    // Click handler
    grid.querySelectorAll('.payment-source-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.payment-source-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedPaymentSource = btn.dataset.id;
      });
    });
  }

  async saveExpense() {
    const amount = Utils.parseCurrency(document.getElementById('expense-amount').value);
    const description = document.getElementById('expense-description').value.trim();
    const date = document.getElementById('expense-date').value;
    const category = this.selectedCategory;
    const paymentSource = this.selectedPaymentSource;

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
      await this.db.addExpense({ amount, description, date, category, paymentSource });

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
    document.querySelectorAll('.payment-source-btn').forEach(b => b.classList.remove('selected'));
    this.selectedCategory = null;
    this.selectedPaymentSource = 'debito';

    // Seleccionar débito por defecto
    const defaultBtn = document.querySelector(`#payment-source-grid [data-id="debito"]`);
    if (defaultBtn) defaultBtn.classList.add('selected');

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

    // Payment source filter buttons
    const paymentButtons = document.querySelectorAll('.payment-filter-btn');
    paymentButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        paymentButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.refreshHistory();
      });
    });

    periodFilter.addEventListener('change', () => this.refreshHistory());
    categoryFilter.addEventListener('change', () => this.refreshHistory());
  }

  async refreshHistory() {
    if (this.historyTab === 'income') {
      await this.refreshIncomeHistory();
      return;
    }
    const period = document.getElementById('filter-period').value;
    const category = document.getElementById('filter-category').value;
    const activePaymentBtn = document.querySelector('.payment-filter-btn.active');
    const paymentSource = activePaymentBtn ? activePaymentBtn.dataset.source : 'all';

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

    // Filter by payment source
    if (paymentSource !== 'all') {
      expenses = expenses.filter(e => (e.paymentSource || 'debito') === paymentSource);
    }

    // Sort by date desc, then by id desc
    expenses.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });

    this.renderHistory(expenses, paymentSource);
  }

  renderHistory(expenses, paymentFilter = 'all') {
    const container = document.getElementById('history-list');
    if (!container) return;

    if (expenses.length === 0) {
      let emptyMessage = 'No hay gastos en este período';
      if (paymentFilter !== 'all') {
        const sourceName = DEFAULT_PAYMENT_SOURCES.find(s => s.id === paymentFilter)?.name || paymentFilter;
        emptyMessage = `No hay gastos con ${sourceName}`;
      }
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">${emptyMessage}</div>
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

  async refreshIncomeHistory() {
    const period = document.getElementById('filter-period').value;
    let incomes;
    const today = Utils.today();
    switch (period) {
      case 'today': incomes = (await this.db.getAllIncome()).filter(i => i.date === today); break;
      case 'week': incomes = (await this.db.getAllIncome()).filter(i => i.date >= Utils.weekStart() && i.date <= today); break;
      case 'month': incomes = await this.db.getIncomeByMonth(Utils.currentMonthKey()); break;
      default: incomes = await this.db.getAllIncome();
    }
    incomes.sort((a, b) => { if (a.date !== b.date) return b.date.localeCompare(a.date); return b.id - a.id; });
    const container = document.getElementById('history-list');
    if (!incomes.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💰</div><div class="empty-state-text">No hay ingresos en este período</div></div>`;
      return;
    }
    const total = incomes.reduce((s, i) => s + i.amount, 0);
    const groups = {};
    incomes.forEach(i => { if (!groups[i.date]) groups[i.date] = []; groups[i.date].push(i); });
    let html = `<div class="history-summary animate-in"><span class="history-summary-label">${incomes.length} ingreso${incomes.length !== 1 ? 's' : ''}</span><span class="history-summary-amount">${Utils.formatCurrency(total)}</span></div>`;
    Object.entries(groups).forEach(([date, items], idx) => {
      const dayTotal = items.reduce((s, i) => s + i.amount, 0);
      html += `<div class="date-group animate-in" style="animation-delay:${idx * 0.04}s"><div class="date-group-header"><span class="date-group-label">${Utils.relativeDate(date)}</span><span class="date-group-total">${Utils.formatCurrency(dayTotal)}</span></div>`;
      items.forEach(inc => {
        const cat = DEFAULT_INCOME_CATEGORIES.find(c => c.id === inc.category) || DEFAULT_INCOME_CATEGORIES[5];
        html += `<div class="expense-item" data-id="${inc.id}" data-type="income"><div class="expense-icon" style="background:${cat.color}20;color:${cat.color}">${cat.icon}</div><div class="expense-info"><div class="expense-description">${inc.description}</div><div class="expense-meta"><span>${cat.name}</span></div></div><div class="expense-amount" style="color:#00e5a0">+${Utils.formatCurrency(inc.amount)}</div></div>`;
      });
      html += '</div>';
    });
    container.innerHTML = html;
    // Tap to edit income
    container.querySelectorAll('.expense-item[data-type="income"]').forEach(item => {
      item.addEventListener('click', () => { this.openEditIncomeModal(Number(item.dataset.id)); });
    });
  }

  _expenseItemHTML(exp) {
    const cat = DEFAULT_CATEGORIES.find(c => c.id === exp.category) || DEFAULT_CATEGORIES[7];
    const source = DEFAULT_PAYMENT_SOURCES.find(s => s.id === (exp.paymentSource || 'debito')) || DEFAULT_PAYMENT_SOURCES[0];
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
            <span>${source.icon} ${source.name}</span>
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

    // Payment source select
    const sourceSelect = document.getElementById('edit-payment-source');
    sourceSelect.innerHTML = DEFAULT_PAYMENT_SOURCES.map(s =>
      `<option value="${s.id}" ${s.id === (expense.paymentSource || 'debito') ? 'selected' : ''}>${s.icon} ${s.name}</option>`
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
    const paymentSource = document.getElementById('edit-payment-source').value;

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
        paymentSource,
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

  // ---- Agregar Ingreso ----

  setupIncomeForm() {
    const amountInput = document.getElementById('income-amount');
    const descInput = document.getElementById('income-description');
    const dateInput = document.getElementById('income-date');
    const saveBtn = document.getElementById('save-income');

    amountInput.addEventListener('input', () => {
      amountInput.value = Utils.formatAmountInput(amountInput.value);
    });
    dateInput.value = Utils.today();
    this.renderIncomeCategories();
    saveBtn.addEventListener('click', () => this.saveIncome());
  }

  renderIncomeCategories() {
    const grid = document.getElementById('income-category-grid');
    if (!grid) return;
    grid.innerHTML = DEFAULT_INCOME_CATEGORIES.map(cat => `
      <button class="category-btn" data-id="${cat.id}" type="button">
        <span class="category-btn-icon">${cat.icon}</span>
        <span class="category-btn-label">${cat.name}</span>
      </button>
    `).join('');
    grid.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedIncomeCategory = btn.dataset.id;
      });
    });
  }

  async saveIncome() {
    const amount = Utils.parseCurrency(document.getElementById('income-amount').value);
    const description = document.getElementById('income-description').value.trim();
    const date = document.getElementById('income-date').value;
    const category = this.selectedIncomeCategory;
    if (!amount || amount <= 0) { Utils.showToast('Ingresa un monto válido', 'error'); return; }
    if (!description) { Utils.showToast('Agrega una descripción', 'error'); return; }
    if (!category) { Utils.showToast('Selecciona una categoría', 'error'); return; }
    try {
      await this.db.addIncome({ amount, description, date, category });
      const btn = document.getElementById('save-income');
      btn.classList.add('saved');
      Utils.showToast(`${description} — ${Utils.formatCurrency(amount)} guardado ✓`);
      setTimeout(() => { btn.classList.remove('saved'); this.resetIncomeForm(); this.navigateTo('dashboard'); }, 600);
    } catch (err) { console.error('Error guardando ingreso:', err); Utils.showToast('Error al guardar', 'error'); }
  }

  resetIncomeForm() {
    document.getElementById('income-amount').value = '';
    document.getElementById('income-description').value = '';
    document.getElementById('income-date').value = Utils.today();
    document.querySelectorAll('#income-category-grid .category-btn').forEach(b => b.classList.remove('selected'));
    this.selectedIncomeCategory = null;
    setTimeout(() => { if (this.currentView === 'income') document.getElementById('income-amount').focus(); }, 350);
  }

  // ---- Pagos Recurrentes ----

  setupPayments() {
    document.getElementById('btn-add-payment').addEventListener('click', () => this.openPaymentModal());
    const paymentAmountInput = document.getElementById('payment-amount');
    paymentAmountInput.addEventListener('input', () => { paymentAmountInput.value = Utils.formatAmountInput(paymentAmountInput.value); });
    this.renderPaymentTypeGrid();
    document.getElementById('payment-cancel').addEventListener('click', () => this.closePaymentModal());
    document.getElementById('payment-save').addEventListener('click', () => this.savePayment());

    // Payment method toggle
    document.querySelectorAll('#payment-method-toggle .pm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#payment-method-toggle .pm-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const method = btn.dataset.method;
        const cardContainer = document.getElementById('payment-card-select-container');
        cardContainer.style.display = method === 'credito' ? '' : 'none';
      });
    });
  }

  renderPaymentTypeGrid() {
    const grid = document.getElementById('payment-type-grid');
    if (!grid) return;
    grid.innerHTML = DEFAULT_RECURRING_TYPES.map(t => `
      <button class="category-btn" data-id="${t.id}" type="button">
        <span class="category-btn-icon">${t.icon}</span>
        <span class="category-btn-label">${t.name}</span>
      </button>
    `).join('');
    grid.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      });
    });
  }

  async openPaymentModal(payment = null) {
    this.editingPayment = payment;
    const modal = document.getElementById('add-payment-modal');
    const title = document.getElementById('payment-modal-title');
    title.textContent = payment ? 'Editar Pago Recurrente' : 'Agregar Pago Recurrente';
    document.getElementById('payment-name').value = payment ? payment.name : '';
    document.getElementById('payment-amount').value = payment ? Utils.formatAmountInput(payment.amount.toString()) : '';
    document.getElementById('payment-due-day').value = payment ? payment.dueDay : '';
    document.querySelectorAll('#payment-type-grid .category-btn').forEach(b => b.classList.remove('selected'));
    if (payment) {
      const btn = document.querySelector(`#payment-type-grid [data-id="${payment.type}"]`);
      if (btn) btn.classList.add('selected');
    }

    // Payment method
    const method = payment ? (payment.paymentMethod || 'debito') : 'debito';
    document.querySelectorAll('#payment-method-toggle .pm-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.method === method);
    });
    const cardContainer = document.getElementById('payment-card-select-container');
    cardContainer.style.display = method === 'credito' ? '' : 'none';

    // Populate card select
    const cards = await this.db.getAllUserCards();
    const cardSelect = document.getElementById('payment-card-select');
    cardSelect.innerHTML = '<option value="">Selecciona tarjeta...</option>' +
      cards.map(c => {
        const bank = DEFAULT_BANKS.find(b => b.id === c.bank) || { name: c.bank };
        return `<option value="${c.id}" ${payment && payment.creditCardId === c.id ? 'selected' : ''}>${c.name} (${bank.name})</option>`;
      }).join('');

    modal.classList.add('active');
  }

  closePaymentModal() {
    document.getElementById('add-payment-modal').classList.remove('active');
    this.editingPayment = null;
  }

  async savePayment() {
    const name = document.getElementById('payment-name').value.trim();
    const amount = Utils.parseCurrency(document.getElementById('payment-amount').value);
    const dueDay = parseInt(document.getElementById('payment-due-day').value) || 0;
    const selectedType = document.querySelector('#payment-type-grid .category-btn.selected');
    const type = selectedType ? selectedType.dataset.id : null;
    const activeMethod = document.querySelector('#payment-method-toggle .pm-btn.active');
    const paymentMethod = activeMethod ? activeMethod.dataset.method : 'debito';
    const creditCardId = paymentMethod === 'credito' ? Number(document.getElementById('payment-card-select').value) : null;

    if (!name) { Utils.showToast('Ingresa un nombre', 'error'); return; }
    if (!amount) { Utils.showToast('Ingresa un monto', 'error'); return; }
    if (dueDay < 1 || dueDay > 31) { Utils.showToast('Día inválido (1-31)', 'error'); return; }
    if (!type) { Utils.showToast('Selecciona un tipo', 'error'); return; }
    if (paymentMethod === 'credito' && !creditCardId) { Utils.showToast('Selecciona una tarjeta', 'error'); return; }
    try {
      if (this.editingPayment) {
        await this.db.updateRecurringPayment({ ...this.editingPayment, name, amount, dueDay, type, paymentMethod, creditCardId });
        Utils.showToast('Pago actualizado ✓');
      } else {
        await this.db.addRecurringPayment({ name, amount, dueDay, type, paymentMethod, creditCardId });
        Utils.showToast('Pago agregado ✓');
      }
      this.closePaymentModal();
      await this.refreshPayments();
    } catch (err) { console.error('Error guardando pago:', err); Utils.showToast('Error al guardar', 'error'); }
  }

  async refreshPayments() {
    const payments = await this.db.getAllRecurringPayments();
    const monthKey = Utils.currentMonthKey();
    const statuses = await this.db.getMonthPaymentStatuses(monthKey);
    const container = document.getElementById('recurring-payments-list');
    const userCards = await this.db.getAllUserCards();
    const paid = payments.filter(p => statuses[p.id]).length;
    const pct = payments.length ? (paid / payments.length) * 100 : 0;
    document.getElementById('payments-progress-text').textContent = `${paid} de ${payments.length} pagados`;
    document.getElementById('payments-progress-fill').style.width = pct + '%';
    if (!payments.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No hay pagos recurrentes<br>Agrega tus pagos mensuales</div></div>`;
      return;
    }
    payments.sort((a, b) => a.dueDay - b.dueDay);
    container.innerHTML = payments.map(p => {
      const isPaid = statuses[p.id] || false;
      const type = DEFAULT_RECURRING_TYPES.find(t => t.id === p.type) || DEFAULT_RECURRING_TYPES[7];
      const method = p.paymentMethod || 'debito';
      let methodLabel = '💳 Débito';
      if (method === 'credito') {
        const card = userCards.find(c => c.id === p.creditCardId);
        methodLabel = card ? `💳 ${card.name}` : '💳 Crédito';
      }
      return `
        <div class="recurring-item ${isPaid ? 'paid' : ''}" data-id="${p.id}">
          <div class="recurring-icon" style="background:${type.color}20;color:${type.color}">${type.icon}</div>
          <div class="recurring-info">
            <div class="recurring-name">${p.name}</div>
            <div class="recurring-meta">Vence día ${p.dueDay} · ${type.name} · ${methodLabel}</div>
          </div>
          <div class="recurring-amount">${Utils.formatCurrency(p.amount)}</div>
          <button class="recurring-delete-btn" data-id="${p.id}">🗑️</button>
          <div class="recurring-check" data-id="${p.id}">${isPaid ? '✓' : ''}</div>
        </div>`;
    }).join('');
    container.querySelectorAll('.recurring-check').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const payment = await this.db.getRecurringPayment(id);
        await this.db.togglePaymentStatus(id, monthKey);
        // If credit card and toggling to paid, adjust card balance
        if (payment && payment.paymentMethod === 'credito' && payment.creditCardId) {
          const wasPaid = statuses[id] || false;
          if (!wasPaid) {
            // Marking as paid: deduct from card
            await this.db.adjustCardBalance(payment.creditCardId, -payment.amount);
          } else {
            // Unmarking: restore card balance
            await this.db.adjustCardBalance(payment.creditCardId, payment.amount);
          }
        }
        await this.refreshPayments();
      });
    });
    container.querySelectorAll('.recurring-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        this.showConfirm('¿Eliminar pago?', 'Se eliminará este pago recurrente.', async () => {
          await this.db.deleteRecurringPayment(id);
          Utils.showToast('Pago eliminado');
          await this.refreshPayments();
        });
      });
    });
    container.querySelectorAll('.recurring-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.recurring-check') || e.target.closest('.recurring-delete-btn')) return;
        const id = Number(item.dataset.id);
        const payment = await this.db.getRecurringPayment(id);
        if (payment) this.openPaymentModal(payment);
      });
    });
  }

  // ---- Gestión de Tarjetas del Usuario ----

  setupUserCards() {
    document.getElementById('btn-add-card').addEventListener('click', () => this.openCardModal());
    document.getElementById('card-cancel').addEventListener('click', () => this.closeCardModal());
    document.getElementById('card-save').addEventListener('click', () => this.saveUserCard());

    const limitInput = document.getElementById('card-limit');
    limitInput.addEventListener('input', () => {
      limitInput.value = Utils.formatAmountInput(limitInput.value);
    });

    // Populate bank select
    const bankSelect = document.getElementById('card-bank');
    bankSelect.innerHTML = DEFAULT_BANKS.map(b =>
      `<option value="${b.id}">${b.icon} ${b.name}</option>`
    ).join('');
  }

  openCardModal(card = null) {
    this.editingUserCard = card;
    document.getElementById('card-modal-title').textContent = card ? 'Editar Tarjeta' : 'Agregar Tarjeta';
    document.getElementById('card-name').value = card ? card.name : '';
    document.getElementById('card-bank').value = card ? card.bank : DEFAULT_BANKS[0].id;
    document.getElementById('card-limit').value = card ? Utils.formatAmountInput(card.creditLimit.toString()) : '';
    document.getElementById('add-card-modal').classList.add('active');
  }

  closeCardModal() {
    document.getElementById('add-card-modal').classList.remove('active');
    this.editingUserCard = null;
  }

  async saveUserCard() {
    const name = document.getElementById('card-name').value.trim();
    const bank = document.getElementById('card-bank').value;
    const creditLimit = Utils.parseCurrency(document.getElementById('card-limit').value);

    if (!name) { Utils.showToast('Ingresa un nombre', 'error'); return; }
    if (!creditLimit || creditLimit <= 0) { Utils.showToast('Ingresa un cupo válido', 'error'); return; }

    try {
      if (this.editingUserCard) {
        await this.db.updateUserCard({ ...this.editingUserCard, name, bank, creditLimit });
        Utils.showToast('Tarjeta actualizada ✓');
      } else {
        await this.db.addUserCard({ name, bank, creditLimit, usedAmount: 0 });
        Utils.showToast('Tarjeta agregada ✓');
      }
      this.closeCardModal();
      await this.refreshCCPayments();
    } catch (err) {
      console.error('Error guardando tarjeta:', err);
      Utils.showToast('Error al guardar', 'error');
    }
  }

  async renderUserCards() {
    const cards = await this.db.getAllUserCards();
    const container = document.getElementById('user-cards-list');

    if (!cards.length) {
      container.innerHTML = '<div style="font-size:0.85rem;color:var(--text-muted);text-align:center;padding:12px 0">No tienes tarjetas aún</div>';
      return;
    }

    container.innerHTML = cards.map(card => {
      const bank = DEFAULT_BANKS.find(b => b.id === card.bank) || DEFAULT_BANKS[DEFAULT_BANKS.length - 1];
      const used = card.usedAmount || 0;
      const available = card.creditLimit - used;
      const usedPct = Math.min(Math.round((used / card.creditLimit) * 100), 100);
      let barClass = '';
      if (usedPct >= 90) barClass = 'danger';
      else if (usedPct >= 70) barClass = 'warning';

      return `
        <div class="user-card-item" data-id="${card.id}">
          <div class="user-card-top">
            <div class="user-card-info">
              <span class="user-card-icon" style="background:${bank.color}20;color:${bank.color}">${bank.icon}</span>
              <div>
                <div class="user-card-name">${card.name}</div>
                <div class="user-card-bank">${bank.name}</div>
              </div>
            </div>
            <button class="user-card-delete" data-id="${card.id}">🗑️</button>
          </div>
          <div class="user-card-amounts">
            <div><span class="user-card-label">Cupo Disponible</span><span class="user-card-available">${Utils.formatCurrency(available)}</span></div>
            <div><span class="user-card-label">Cupo Total</span><span class="user-card-limit">${Utils.formatCurrency(card.creditLimit)}</span></div>
          </div>
          <div class="user-card-bar">
            <div class="user-card-bar-fill ${barClass}" style="width:${usedPct}%"></div>
          </div>
          <div class="user-card-pct">${usedPct}% usado</div>
        </div>
      `;
    }).join('');

    // Edit on click
    container.querySelectorAll('.user-card-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.user-card-delete')) return;
        const card = await this.db.getUserCard(Number(item.dataset.id));
        if (card) this.openCardModal(card);
      });
    });

    // Delete
    container.querySelectorAll('.user-card-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        this.showConfirm('¿Eliminar tarjeta?', 'Se eliminará esta tarjeta y sus datos.', async () => {
          await this.db.deleteUserCard(id);
          Utils.showToast('Tarjeta eliminada');
          await this.refreshCCPayments();
        });
      });
    });
  }

  async populateCardSelects() {
    const cards = await this.db.getAllUserCards();
    const ccSelect = document.getElementById('cc-card-select');
    if (ccSelect) {
      ccSelect.innerHTML = '<option value="">Selecciona tarjeta...</option>' +
        cards.map(c => {
          const bank = DEFAULT_BANKS.find(b => b.id === c.bank) || { name: c.bank };
          return `<option value="${c.id}">${c.name} (${bank.name})</option>`;
        }).join('');
    }
  }

  // ---- Pagos de Tarjeta de Crédito ----

  setupCCPayments() {
    const amountInput = document.getElementById('cc-amount');
    amountInput.addEventListener('input', () => {
      amountInput.value = Utils.formatAmountInput(amountInput.value);
    });

    document.getElementById('cc-date').value = Utils.today();
    this.renderCCSourceGrid();
    this.renderBankGrid();

    document.getElementById('save-cc-payment').addEventListener('click', () => this.saveCCPayment());
  }

  async refreshCCPayments() {
    await this.renderUserCards();
    await this.populateCardSelects();
    await this._refreshCCPaymentsList();
  }

  renderCCSourceGrid() {
    const grid = document.getElementById('cc-source-grid');
    if (!grid) return;
    grid.innerHTML = DEFAULT_CC_SOURCES.map(src => `
      <button class="cc-source-btn" data-id="${src.id}" type="button">
        <span class="cc-source-btn-icon">${src.icon}</span>
        <span class="cc-source-btn-label">${src.name}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.cc-source-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.cc-source-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedCCSource = btn.dataset.id;
      });
    });
  }

  renderBankGrid() {
    const grid = document.getElementById('bank-grid');
    if (!grid) return;
    grid.innerHTML = DEFAULT_BANKS.map(bank => `
      <button class="bank-btn" data-id="${bank.id}" type="button">
        <span class="bank-btn-icon" style="color:${bank.color}">${bank.icon}</span>
        <span class="bank-btn-label">${bank.name}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.bank-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        grid.querySelectorAll('.bank-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.selectedBank = btn.dataset.id;
      });
    });
  }

  async saveCCPayment() {
    const amount = Utils.parseCurrency(document.getElementById('cc-amount').value);
    const description = document.getElementById('cc-description').value.trim();
    const date = document.getElementById('cc-date').value;
    const bank = this.selectedBank;
    const source = this.selectedCCSource;

    if (!amount || amount <= 0) { Utils.showToast('Ingresa un monto válido', 'error'); return; }
    if (!source) { Utils.showToast('Selecciona de dónde sale el pago', 'error'); return; }
    if (!bank) { Utils.showToast('Selecciona un banco', 'error'); return; }

    const cardId = Number(document.getElementById('cc-card-select').value) || null;

    try {
      await this.db.addCCPayment({ amount, description: description || 'Pago tarjeta', date, bank, source, cardId });
      // If a card was selected, restore cupo
      if (cardId) {
        await this.db.adjustCardBalance(cardId, amount);
      }
      const btn = document.getElementById('save-cc-payment');
      btn.classList.add('saved');
      const bankName = DEFAULT_BANKS.find(b => b.id === bank)?.name || bank;
      Utils.showToast(`Pago ${bankName} — ${Utils.formatCurrency(amount)} registrado ✓`);
      setTimeout(() => {
        btn.classList.remove('saved');
        this.resetCCForm();
        this.refreshCCPayments();
      }, 600);
    } catch (err) {
      console.error('Error guardando pago CC:', err);
      Utils.showToast('Error al guardar', 'error');
    }
  }

  resetCCForm() {
    document.getElementById('cc-amount').value = '';
    document.getElementById('cc-description').value = '';
    document.getElementById('cc-date').value = Utils.today();
    document.querySelectorAll('#bank-grid .bank-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('#cc-source-grid .cc-source-btn').forEach(b => b.classList.remove('selected'));
    this.selectedBank = null;
    this.selectedCCSource = null;
    // Reset card select
    const ccCardSelect = document.getElementById('cc-card-select');
    if (ccCardSelect) ccCardSelect.value = '';
  }

  async _refreshCCPaymentsList() {
    const monthKey = Utils.currentMonthKey();
    const stats = await this.db.getCCPaymentStats(monthKey);
    const allPayments = await this.db.getAllCCPayments();

    // Summary card
    const summaryCard = document.getElementById('cc-summary-card');
    const summaryContent = document.getElementById('cc-summary-content');

    if (stats.count > 0) {
      summaryCard.style.display = '';
      let summaryHTML = `
        <div class="cc-total-row">
          <span class="cc-total-label">Total pagado este mes</span>
          <span class="cc-total-amount">${Utils.formatCurrency(stats.total)}</span>
        </div>
      `;
      // By bank breakdown
      const bankEntries = Object.entries(stats.byBank).sort((a, b) => b[1] - a[1]);
      if (bankEntries.length > 0) {
        summaryHTML += '<div class="cc-bank-breakdown">';
        bankEntries.forEach(([bankId, amount]) => {
          const bank = DEFAULT_BANKS.find(b => b.id === bankId) || DEFAULT_BANKS[DEFAULT_BANKS.length - 1];
          const pct = Math.round((amount / stats.total) * 100);
          summaryHTML += `
            <div class="cc-bank-row">
              <div class="cc-bank-info">
                <span class="cc-bank-icon" style="background:${bank.color}20;color:${bank.color}">${bank.icon}</span>
                <span class="cc-bank-name">${bank.name}</span>
              </div>
              <div class="cc-bank-right">
                <span class="cc-bank-amount">${Utils.formatCurrency(amount)}</span>
                <span class="cc-bank-pct">${pct}%</span>
              </div>
            </div>
          `;
        });
        summaryHTML += '</div>';
      }
      summaryContent.innerHTML = summaryHTML;
    } else {
      summaryCard.style.display = 'none';
    }

    // Payments list
    const container = document.getElementById('cc-payments-list');
    if (!allPayments.length) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💳</div>
          <div class="empty-state-text">No hay pagos de tarjeta registrados<br>¡Registra tu primer pago!</div>
        </div>
      `;
      return;
    }

    // Sort by date desc
    allPayments.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.id - a.id;
    });

    // Group by date
    const groups = {};
    allPayments.forEach(p => {
      if (!groups[p.date]) groups[p.date] = [];
      groups[p.date].push(p);
    });

    let html = '';
    Object.entries(groups).forEach(([date, items], idx) => {
      const dayTotal = items.reduce((s, p) => s + p.amount, 0);
      html += `
        <div class="date-group animate-in" style="animation-delay:${idx * 0.04}s">
          <div class="date-group-header">
            <span class="date-group-label">${Utils.relativeDate(date)}</span>
            <span class="date-group-total">${Utils.formatCurrency(dayTotal)}</span>
          </div>
      `;
      items.forEach(payment => {
        const bank = DEFAULT_BANKS.find(b => b.id === payment.bank) || DEFAULT_BANKS[DEFAULT_BANKS.length - 1];
        const src = DEFAULT_CC_SOURCES.find(s => s.id === payment.source) || DEFAULT_CC_SOURCES[DEFAULT_CC_SOURCES.length - 1];
        html += `
          <div class="expense-item cc-payment-item" data-id="${payment.id}">
            <div class="expense-icon" style="background:${bank.color}20;color:${bank.color}">
              ${bank.icon}
            </div>
            <div class="expense-info">
              <div class="expense-description">${payment.description || 'Pago tarjeta'}</div>
              <div class="expense-meta">
                <span>${bank.name}</span>
                <span>•</span>
                <span>${src.icon} ${src.name}</span>
              </div>
            </div>
            <div class="expense-amount" style="color:var(--danger)">${Utils.formatCurrency(payment.amount)}</div>
          </div>
        `;
      });
      html += '</div>';
    });

    container.innerHTML = html;

    // Tap to edit
    container.querySelectorAll('.cc-payment-item').forEach(item => {
      item.addEventListener('click', () => {
        this.openEditCCModal(Number(item.dataset.id));
      });
    });
  }

  // ---- Edit CC Payment Modal ----

  setupEditCCModal() {
    const overlay = document.getElementById('edit-cc-modal');
    if (!overlay) return;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeEditCCModal();
    });

    document.getElementById('edit-cc-cancel').addEventListener('click', () => this.closeEditCCModal());
    document.getElementById('edit-cc-save').addEventListener('click', () => this.saveEditCC());
    document.getElementById('edit-cc-delete').addEventListener('click', () => this.deleteFromEditCC());

    const amountInput = document.getElementById('edit-cc-amount');
    amountInput.addEventListener('input', () => {
      amountInput.value = Utils.formatAmountInput(amountInput.value);
    });
  }

  async openEditCCModal(id) {
    const payment = await this.db.getCCPayment(id);
    if (!payment) return;

    this.editingCCPayment = payment;

    document.getElementById('edit-cc-amount').value = Utils.formatAmountInput(payment.amount.toString());
    document.getElementById('edit-cc-description').value = payment.description || '';
    document.getElementById('edit-cc-date').value = payment.date;

    const sourceSelect = document.getElementById('edit-cc-source');
    sourceSelect.innerHTML = DEFAULT_CC_SOURCES.map(s =>
      `<option value="${s.id}" ${s.id === (payment.source || 'sueldo') ? 'selected' : ''}>${s.icon} ${s.name}</option>`
    ).join('');

    const bankSelect = document.getElementById('edit-cc-bank');
    bankSelect.innerHTML = DEFAULT_BANKS.map(b =>
      `<option value="${b.id}" ${b.id === payment.bank ? 'selected' : ''}>${b.icon} ${b.name}</option>`
    ).join('');

    document.getElementById('edit-cc-modal').classList.add('active');
  }

  closeEditCCModal() {
    document.getElementById('edit-cc-modal').classList.remove('active');
    this.editingCCPayment = null;
  }

  async saveEditCC() {
    if (!this.editingCCPayment) return;

    const amount = Utils.parseCurrency(document.getElementById('edit-cc-amount').value);
    const description = document.getElementById('edit-cc-description').value.trim();
    const date = document.getElementById('edit-cc-date').value;
    const bank = document.getElementById('edit-cc-bank').value;
    const source = document.getElementById('edit-cc-source').value;

    if (!amount) { Utils.showToast('Ingresa un monto válido', 'error'); return; }

    try {
      const updated = {
        ...this.editingCCPayment,
        amount,
        description: description || 'Pago tarjeta',
        date,
        bank,
        source,
        month: Utils.monthKeyFromDate(date)
      };

      await this.db.updateCCPayment(updated);
      this.closeEditCCModal();
      Utils.showToast('Pago actualizado ✓');
      await this.refreshCCPayments();
    } catch (err) {
      console.error('Error actualizando pago CC:', err);
      Utils.showToast('Error al actualizar', 'error');
    }
  }

  async deleteFromEditCC() {
    if (!this.editingCCPayment) return;

    this.showConfirm(
      '¿Eliminar pago?',
      `${this.editingCCPayment.description || 'Pago tarjeta'} — ${Utils.formatCurrency(this.editingCCPayment.amount)}`,
      async () => {
        await this.db.deleteCCPayment(this.editingCCPayment.id);
        this.closeEditCCModal();
        Utils.showToast('Pago eliminado');
        await this.refreshCCPayments();
      }
    );
  }

  // ---- Theme ----

  async loadTheme() {
    const theme = await this.db.getSetting('theme') || 'dark';
    this.applyTheme(theme);
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const metaTheme = document.getElementById('meta-theme-color');
    if (metaTheme) metaTheme.content = theme === 'light' ? '#e8e6ef' : '#131320';
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    // Update chart colors
    if (this.charts) this.charts.updateTheme(theme);
  }

  // ---- History Tabs ----

  setupHistoryTabs() {
    document.querySelectorAll('.history-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.history-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.historyTab = tab.dataset.tab;
        const psFilter = document.getElementById('payment-source-filter-container');
        psFilter.style.display = this.historyTab === 'income' ? 'none' : '';
        this.refreshHistory();
      });
    });
  }

  // ---- Edit Income Modal ----

  setupEditIncomeModal() {
    const overlay = document.getElementById('edit-income-modal');
    if (!overlay) return;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeEditIncomeModal(); });
    document.getElementById('edit-income-cancel').addEventListener('click', () => this.closeEditIncomeModal());
    document.getElementById('edit-income-save').addEventListener('click', () => this.saveIncomeEdit());
    document.getElementById('edit-income-delete').addEventListener('click', () => this.deleteFromIncomeEdit());
    const amountInput = document.getElementById('edit-income-amount');
    amountInput.addEventListener('input', () => { amountInput.value = Utils.formatAmountInput(amountInput.value); });
  }

  async openEditIncomeModal(id) {
    const income = await this.db.getIncome(id);
    if (!income) return;
    this.editingIncome = income;
    document.getElementById('edit-income-amount').value = Utils.formatAmountInput(income.amount.toString());
    document.getElementById('edit-income-description').value = income.description;
    document.getElementById('edit-income-date').value = income.date;
    const catSelect = document.getElementById('edit-income-category');
    catSelect.innerHTML = DEFAULT_INCOME_CATEGORIES.map(c =>
      `<option value="${c.id}" ${c.id === income.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`
    ).join('');
    document.getElementById('edit-income-modal').classList.add('active');
  }

  closeEditIncomeModal() {
    document.getElementById('edit-income-modal').classList.remove('active');
    this.editingIncome = null;
  }

  async saveIncomeEdit() {
    if (!this.editingIncome) return;
    const amount = Utils.parseCurrency(document.getElementById('edit-income-amount').value);
    const description = document.getElementById('edit-income-description').value.trim();
    const date = document.getElementById('edit-income-date').value;
    const category = document.getElementById('edit-income-category').value;
    if (!amount || !description) { Utils.showToast('Completa todos los campos', 'error'); return; }
    try {
      await this.db.updateIncome({ ...this.editingIncome, amount, description, date, category, month: Utils.monthKeyFromDate(date) });
      this.closeEditIncomeModal();
      Utils.showToast('Ingreso actualizado ✓');
      if (this.currentView === 'history') await this.refreshHistory();
      else if (this.currentView === 'dashboard') await this.refreshDashboard();
    } catch (err) { console.error('Error actualizando:', err); Utils.showToast('Error al actualizar', 'error'); }
  }

  async deleteFromIncomeEdit() {
    if (!this.editingIncome) return;
    this.showConfirm('¿Eliminar ingreso?', `${this.editingIncome.description} — ${Utils.formatCurrency(this.editingIncome.amount)}`, async () => {
      await this.db.deleteIncome(this.editingIncome.id);
      this.closeEditIncomeModal();
      Utils.showToast('Ingreso eliminado');
      if (this.currentView === 'history') await this.refreshHistory();
      else await this.refreshDashboard();
    });
  }

  // ---- Settings ----

  async setupSettings() {
    // Theme toggle
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', async () => {
        const theme = btn.dataset.theme;
        this.applyTheme(theme);
        await this.db.setSetting('theme', theme);
        Utils.showToast(`Tema ${theme === 'dark' ? 'oscuro' : 'claro'} aplicado`);
      });
    });

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
