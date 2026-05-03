// ============================================
// MisGastos — Utilidades
// ============================================

const Utils = {

  // ---- Moneda (CLP) ----

  /**
   * Formatea un número como pesos chilenos: $1.800
   */
  formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0';
    const num = Math.round(Number(amount));
    const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `$${formatted}`;
  },

  /**
   * Parsea un string de moneda a número: "$1.800" -> 1800
   */
  parseCurrency(str) {
    if (!str) return 0;
    const cleaned = str.toString().replace(/[$.]/g, '').replace(/,/g, '');
    return parseInt(cleaned, 10) || 0;
  },

  /**
   * Formatea input de monto en tiempo real (mientras se escribe)
   */
  formatAmountInput(value) {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const num = parseInt(digits, 10);
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  },

  // ---- Fechas ----

  /**
   * Retorna fecha actual en formato YYYY-MM-DD
   */
  today() {
    return new Date().toISOString().split('T')[0];
  },

  /**
   * Retorna la clave del mes actual: "2026-03"
   */
  currentMonthKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  /**
   * Retorna la clave del mes para una fecha dada
   */
  monthKeyFromDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },

  /**
   * Nombre del mes en español
   */
  monthName(monthKey) {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const [year, month] = monthKey.split('-');
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  },

  /**
   * Formatea fecha para mostrar: "31 Mar 2026"
   */
  formatDate(dateStr) {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
      'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const d = new Date(dateStr + 'T12:00:00');
    return `${d.getDate()} ${months[d.getMonth()]}`;
  },

  /**
   * Formatea fecha completa: "Lunes 31 de Marzo"
   */
  formatDateFull(dateStr) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const d = new Date(dateStr + 'T12:00:00');
    return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}`;
  },

  /**
   * Retorna fecha relativa: "Hoy", "Ayer", o la fecha formateada
   */
  relativeDate(dateStr) {
    const today = this.today();
    if (dateStr === today) return 'Hoy';

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    if (dateStr === yesterdayStr) return 'Ayer';

    return this.formatDate(dateStr);
  },

  /**
   * Retorna el inicio de la semana actual (Lunes)
   */
  weekStart() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
  },

  /**
   * Retorna los últimos N días como array de strings YYYY-MM-DD
   */
  lastNDays(n) {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }
    return days;
  },

  /**
   * Nombre corto del día: "Lun", "Mar", etc.
   */
  shortDayName(dateStr) {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const d = new Date(dateStr + 'T12:00:00');
    return days[d.getDay()];
  },

  // ---- UI Helpers ----

  /**
   * Muestra un toast notification
   */
  showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span class="toast-message">${message}</span>
    `;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-show');
    });

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },

  /**
   * Genera un ID único
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  /**
   * Debounce function
   */
  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }
};

// Fuentes de pago
const DEFAULT_PAYMENT_SOURCES = [
  { id: 'debito', name: 'Débito', icon: '💳' },
  { id: 'credito', name: 'Crédito', icon: '💳' },
  { id: 'efectivo', name: 'Efectivo', icon: '💵' },
  { id: 'transferencia', name: 'Transferencia', icon: '↔️' }
];

// Categorías por defecto
const DEFAULT_CATEGORIES = [
  { id: 'alimentacion', name: 'Alimentación', icon: '🍔', color: '#ff6b6b' },
  { id: 'transporte', name: 'Transporte', icon: '🚗', color: '#4ecdc4' },
  { id: 'entretenimiento', name: 'Entretenimiento', icon: '🎬', color: '#a855f7' },
  { id: 'salud', name: 'Salud', icon: '💊', color: '#22c55e' },
  { id: 'hogar', name: 'Hogar', icon: '🏠', color: '#f59e0b' },
  { id: 'educacion', name: 'Educación', icon: '📚', color: '#3b82f6' },
  { id: 'ropa', name: 'Ropa', icon: '👕', color: '#ec4899' },
  { id: 'otros', name: 'Otros', icon: '📦', color: '#6b7280' }
];

// Categorías de ingreso
const DEFAULT_INCOME_CATEGORIES = [
  { id: 'sueldo', name: 'Sueldo', icon: '💼', color: '#22c55e' },
  { id: 'bonus', name: 'Bonus', icon: '🎁', color: '#f59e0b' },
  { id: 'freelance', name: 'Freelance', icon: '💻', color: '#3b82f6' },
  { id: 'inversiones', name: 'Inversiones', icon: '📈', color: '#a855f7' },
  { id: 'prestamo', name: 'Préstamo', icon: '🤝', color: '#ec4899' },
  { id: 'otro_ingreso', name: 'Otro', icon: '📦', color: '#6b7280' }
];

// Tipos de pago recurrente
const DEFAULT_RECURRING_TYPES = [
  { id: 'tarjeta', name: 'Tarjeta Crédito', icon: '💳', color: '#ef4444' },
  { id: 'arriendo', name: 'Arriendo', icon: '🏠', color: '#f59e0b' },
  { id: 'celular', name: 'Celular', icon: '📱', color: '#3b82f6' },
  { id: 'streaming', name: 'Streaming', icon: '📺', color: '#a855f7' },
  { id: 'servicios', name: 'Servicios', icon: '🔌', color: '#22c55e' },
  { id: 'seguro', name: 'Seguro', icon: '🛡️', color: '#4ecdc4' },
  { id: 'mensualidad', name: 'Mensualidad', icon: '📅', color: '#ec4899' },
  { id: 'otro_pago', name: 'Otro', icon: '📦', color: '#6b7280' }
];
