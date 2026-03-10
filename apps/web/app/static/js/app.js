/* MCbN XP Tracker — Client-side interactivity */

document.addEventListener('DOMContentLoaded', function () {

    // ── Sortable tables ──────────────────────────────────────────────
    document.querySelectorAll('th[data-sort]').forEach(function (th) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', function () {
            var table = th.closest('table');
            var tbody = table.querySelector('tbody');
            var rows = Array.from(tbody.querySelectorAll('tr'));
            var col = th.cellIndex;
            var type = th.dataset.sort; // 'text', 'number', 'date'
            var asc = th.dataset.dir !== 'asc';

            rows.sort(function (a, b) {
                var aVal = a.cells[col].textContent.trim();
                var bVal = b.cells[col].textContent.trim();

                if (type === 'number') {
                    return asc
                        ? parseFloat(aVal) - parseFloat(bVal)
                        : parseFloat(bVal) - parseFloat(aVal);
                }
                return asc
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            });

            // Reset all sort indicators in this table
            table.querySelectorAll('th[data-sort]').forEach(function (h) {
                h.dataset.dir = '';
            });
            th.dataset.dir = asc ? 'asc' : 'desc';

            rows.forEach(function (row) {
                tbody.appendChild(row);
            });
        });
    });

    // ── Table search/filter ──────────────────────────────────────────
    var searchInput = document.getElementById('table-search');
    if (searchInput) {
        searchInput.addEventListener('input', function () {
            var filter = this.value.toLowerCase();
            var tbody = document.querySelector('table tbody');
            if (!tbody) return;

            tbody.querySelectorAll('tr').forEach(function (row) {
                var text = row.textContent.toLowerCase();
                row.style.display = text.includes(filter) ? '' : 'none';
            });
        });
    }

    // ── Confirmation modals ──────────────────────────────────────────
    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
        form.addEventListener('submit', function (e) {
            if (!confirm(form.dataset.confirm)) {
                e.preventDefault();
            }
        });
    });
    document.querySelectorAll('button[data-confirm], input[type="submit"][data-confirm]').forEach(function (el) {
        el.addEventListener('click', function (e) {
            if (!confirm(el.dataset.confirm)) {
                e.preventDefault();
            }
        });
    });

    // ── Auto-calculate XP claimed (for claim review) ─────────────────
    var checkboxes = document.querySelectorAll('.xp-category-check');
    var xpTotal = document.getElementById('approved-xp-input');
    if (checkboxes.length && xpTotal) {
        function updateTotal() {
            var total = 0;
            checkboxes.forEach(function (cb) {
                if (cb.checked) total++;
            });
            xpTotal.value = total;
        }
        checkboxes.forEach(function (cb) {
            cb.addEventListener('change', updateTotal);
        });
    }

    // ── Clickable table rows ─────────────────────────────────────────
    document.querySelectorAll('tr[data-href]').forEach(function (row) {
        row.addEventListener('click', function (e) {
            // Don't navigate if user clicked a button, link, or form inside the row
            if (e.target.closest('a, button, input, select, textarea, form')) return;
            window.location.href = row.dataset.href;
        });
    });

    // ── Form submit spinner ──────────────────────────────────────────
    document.querySelectorAll('form').forEach(function (form) {
        form.addEventListener('submit', function () {
            var btn = form.querySelector('button[type="submit"], input[type="submit"]');
            if (!btn || btn.classList.contains('no-spinner')) return;
            var original = btn.innerHTML;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> ' + (btn.dataset.loadingText || 'Submitting…');
            btn.classList.add('btn-loading');
            btn.disabled = true;
            // Re-enable after 8s as a safety fallback
            setTimeout(function () {
                btn.innerHTML = original;
                btn.classList.remove('btn-loading');
                btn.disabled = false;
            }, 8000);
        });
    });
});
