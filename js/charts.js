// ============================================
// MisGastos — Gráficos (Chart.js)
// ============================================

class GastosCharts {
  constructor() {
    this.categoryChart = null;
    this.dailyChart = null;
    this.colors = {
      grid: 'rgba(255, 255, 255, 0.06)',
      text: '#8888aa',
      tooltip: '#1a1a2e'
    };
  }

  // ---- Defaults de Chart.js ----

  setupDefaults() {
    Chart.defaults.color = this.colors.text;
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
  }

  // ---- Gráfico de Dona (por categoría) ----

  renderCategoryChart(canvasId, byCategory) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (this.categoryChart) {
      this.categoryChart.destroy();
    }

    const entries = Object.entries(byCategory);
    if (entries.length === 0) {
      this._showEmpty(canvas, 'Sin gastos este mes');
      return;
    }

    // Ordenar de mayor a menor
    entries.sort((a, b) => b[1] - a[1]);

    const labels = entries.map(([catId]) => {
      const cat = DEFAULT_CATEGORIES.find(c => c.id === catId);
      return cat ? `${cat.icon} ${cat.name}` : catId;
    });

    const data = entries.map(([, amount]) => amount);
    const colors = entries.map(([catId]) => {
      const cat = DEFAULT_CATEGORIES.find(c => c.id === catId);
      return cat ? cat.color : '#6b7280';
    });

    const ctx = canvas.getContext('2d');

    this.categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors,
          borderColor: 'rgba(13, 13, 26, 0.8)',
          borderWidth: 3,
          hoverBorderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              padding: 16,
              usePointStyle: true,
              pointStyle: 'circle',
              font: { size: 11, weight: '500' },
              color: '#c0c0d0'
            }
          },
          tooltip: {
            backgroundColor: this.colors.tooltip,
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleFont: { weight: '600' },
            bodyFont: { size: 13 },
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                const pct = Math.round((ctx.raw / total) * 100);
                return ` ${Utils.formatCurrency(ctx.raw)} (${pct}%)`;
              }
            }
          }
        },
        animation: {
          animateRotate: true,
          duration: 800,
          easing: 'easeOutQuart'
        }
      }
    });
  }

  // ---- Gráfico de Barras (últimos 7 días) ----

  renderDailyChart(canvasId, byDay) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    if (this.dailyChart) {
      this.dailyChart.destroy();
    }

    const last7 = Utils.lastNDays(7);
    const labels = last7.map(d => Utils.shortDayName(d));
    const data = last7.map(d => byDay[d] || 0);

    const maxVal = Math.max(...data, 1);
    const ctx = canvas.getContext('2d');

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(0, 229, 160, 0.8)');
    gradient.addColorStop(1, 'rgba(0, 229, 160, 0.1)');

    this.dailyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: data.map((val) =>
            val === maxVal ? 'rgba(0, 229, 160, 0.9)' : 'rgba(0, 229, 160, 0.35)'
          ),
          borderRadius: 8,
          borderSkipped: false,
          maxBarThickness: 40
        }]
      },
      options: {
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11, weight: '500' }
            }
          },
          y: {
            grid: {
              color: this.colors.grid,
              drawBorder: false
            },
            ticks: {
              callback: (val) => Utils.formatCurrency(val),
              maxTicksLimit: 4,
              font: { size: 10 }
            },
            beginAtZero: true
          }
        },
        plugins: {
          tooltip: {
            backgroundColor: this.colors.tooltip,
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return Utils.formatDate(last7[idx]);
              },
              label: (ctx) => ` ${Utils.formatCurrency(ctx.raw)}`
            }
          }
        },
        animation: {
          duration: 600,
          easing: 'easeOutQuart'
        }
      }
    });
  }

  // ---- Helper: canvas vacío ----

  _showEmpty(canvas, message) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#8888aa';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  }

  // ---- Destruir todo ----

  destroyAll() {
    if (this.categoryChart) this.categoryChart.destroy();
    if (this.dailyChart) this.dailyChart.destroy();
  }
}
