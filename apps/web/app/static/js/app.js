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
});
