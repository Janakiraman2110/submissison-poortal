/**
 * BureauPulse - Submission & Exceptions Tracker Frontend Engine
 */

// Toast notification helper
function showToast(message, type = 'info') {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;

  const bg = type === 'error' ? 'var(--danger)' : '#18181b';
  toast.innerHTML = `
    <div style="background: ${bg}; color: white; padding: 0.85rem 1.4rem; border-radius: 6px; box-shadow: 0 10px 25px rgba(15,23,42,0.18); font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.65rem;">
      <span>${message}</span>
    </div>
  `;
  toast.style.display = 'block';
  toast.style.animation = 'fadeIn 0.2s ease';

  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

// =========================================================================
// 1. WIZARD CONTROLLER (NEW REQUEST & EXCEPTIONS SCREENING)
// =========================================================================

const wizard = {
  currentStep: 1,
  submissionType: 'Commercial',
  bureau: 'CIBIL',
  submissionDate: '',
  allAccounts: [],
  filteredAccounts: [],
  excludedAccounts: new Set(),
  lastCreatedRequest: null,

  async init() {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('submissionDate');
    if (dateInput) {
      dateInput.value = today;
      this.submissionDate = today;
      dateInput.addEventListener('change', (e) => {
        this.submissionDate = e.target.value;
      });
    }

    // Check if pre-selected exclusions were passed from Exceptions page
    const storedPreselected = sessionStorage.getItem('preselected_exclusions');
    if (storedPreselected) {
      try {
        const parsed = JSON.parse(storedPreselected);
        if (Array.isArray(parsed)) {
          parsed.forEach(acc => this.excludedAccounts.add(acc));
        }
      } catch (e) {
        console.error('Failed to parse preselected exceptions', e);
      }
      sessionStorage.removeItem('preselected_exclusions');
    }

    await this.fetchAccounts();
    this.goToStep(1);
  },

  selectType(type) {
    this.submissionType = type;
    document.getElementById('submissionType').value = type;

    document.querySelectorAll('.type-card').forEach(card => {
      if (card.dataset.type === type) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    const typeTag = document.getElementById('currentTypeTag');
    if (typeTag) typeTag.innerText = type;

    this.fetchAccounts();
  },

  selectBureau(bureau) {
    this.bureau = bureau;
    document.getElementById('bureauName').value = bureau;

    document.querySelectorAll('.bureau-pill').forEach(pill => {
      if (pill.dataset.bureau === bureau) {
        pill.classList.add('selected');
      } else {
        pill.classList.remove('selected');
      }
    });

    const bureauTag = document.getElementById('currentBureauTag');
    if (bureauTag) {
      bureauTag.innerText = bureau;
      bureauTag.className = `badge badge-${bureau.toLowerCase()}`;
    }

    this.fetchAccounts();
  },

  async fetchAccounts() {
    try {
      const url = `/api/accounts?type=${encodeURIComponent(this.submissionType)}&bureau=${encodeURIComponent(this.bureau)}`;
      const res = await fetch(url);
      const data = await res.json();
      this.allAccounts = data.accounts || [];
      this.filteredAccounts = [...this.allAccounts];
      this.renderExceptionsTable();
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  },

  goToStep(step) {
    this.currentStep = step;

    // Progress bar
    const progressLine = document.getElementById('stepProgressLine');
    if (progressLine) {
      const pct = step === 1 ? '0%' : (step === 2 ? '50%' : '100%');
      progressLine.style.width = pct;
    }

    // Nodes
    for (let i = 1; i <= 3; i++) {
      const node = document.getElementById(`stepNode${i}`);
      const content = document.getElementById(`stepContent${i}`);
      if (!node || !content) continue;

      if (i === step) {
        node.className = 'step-node active';
        content.style.display = 'block';
      } else if (i < step) {
        node.className = 'step-node completed';
        content.style.display = 'none';
      } else {
        node.className = 'step-node';
        content.style.display = 'none';
      }
    }

    if (step === 2) {
      this.renderExceptionsTable();
    }

    if (step === 3) {
      this.prepareReviewStep();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  renderExceptionsTable() {
    const tbody = document.getElementById('exceptionsTableBody');
    if (!tbody) return;

    if (this.filteredAccounts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No accounts found for ${this.submissionType} - ${this.bureau}.</td></tr>`;
      this.updateStats();
      return;
    }

    tbody.innerHTML = this.filteredAccounts.map(acc => {
      const isExcluded = this.excludedAccounts.has(acc.account_number);
      const rowClass = isExcluded ? 'row-excluded' : '';
      const statusBadge = isExcluded 
        ? `<span class="badge badge-excluded">Excluded</span>` 
        : `<span class="badge badge-included">Active In File</span>`;
      
      const dpdBadge = acc.dpd > 0 
        ? `<span class="text-danger">${acc.dpd}</span> (${acc.status})` 
        : `<span style="color: var(--text-muted);">0</span> (${acc.status})`;

      return `
        <tr class="${rowClass}">
          <td style="text-align: center;">
            <label class="custom-checkbox">
              <input type="checkbox" ${isExcluded ? 'checked' : ''} onchange="wizard.toggleExclude('${acc.account_number}')">
              <span class="checkmark"></span>
            </label>
          </td>
          <td class="mono strong nowrap">
            ${acc.account_number}
          </td>
          <td class="strong">
            ${acc.customer_name}
          </td>
          <td>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${acc.gstin}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${acc.facility}</div>
          </td>
          <td class="num nowrap">
            ₹ ${acc.current_balance.toLocaleString('en-IN')}
          </td>
          <td>${dpdBadge}</td>
          <td>
            <div class="reason-box">
              ${acc.exception_reason}
            </div>
          </td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');

    this.updateStats();
  },

  toggleExclude(accountNumber) {
    if (this.excludedAccounts.has(accountNumber)) {
      this.excludedAccounts.delete(accountNumber);
    } else {
      this.excludedAccounts.add(accountNumber);
    }
    this.renderExceptionsTable();
  },

  bulkExcludeOverdue() {
    let newlyExcluded = 0;
    this.allAccounts.forEach(acc => {
      if (acc.dpd > 30) {
        if (!this.excludedAccounts.has(acc.account_number)) {
          this.excludedAccounts.add(acc.account_number);
          newlyExcluded++;
        }
      }
    });
    this.renderExceptionsTable();
    showToast(`Excluded ${newlyExcluded} accounts with high DPD (>30 days).`, 'success');
  },

  selectAllExceptions(excludeAll) {
    if (excludeAll) {
      this.filteredAccounts.forEach(acc => this.excludedAccounts.add(acc.account_number));
      showToast('All accounts marked as excluded.', 'info');
    } else {
      this.excludedAccounts.clear();
      showToast('Cleared all exclusions. All accounts active.', 'success');
    }
    this.renderExceptionsTable();
  },

  filterAccounts() {
    const q = (document.getElementById('exceptionsSearchInput')?.value || '').toLowerCase().trim();
    if (!q) {
      this.filteredAccounts = [...this.allAccounts];
    } else {
      this.filteredAccounts = this.allAccounts.filter(acc => 
        acc.account_number.toLowerCase().includes(q) ||
        acc.customer_name.toLowerCase().includes(q) ||
        (acc.gstin && acc.gstin.toLowerCase().includes(q)) ||
        (acc.exception_reason && acc.exception_reason.toLowerCase().includes(q))
      );
    }
    this.renderExceptionsTable();
  },

  updateStats() {
    const total = this.allAccounts.length;
    let excluded = 0;
    this.allAccounts.forEach(acc => {
      if (this.excludedAccounts.has(acc.account_number)) excluded++;
    });
    const included = total - excluded;

    const elTotal = document.getElementById('statTotalAccounts');
    const elInc = document.getElementById('statIncludedAccounts');
    const elExc = document.getElementById('statExcludedAccounts');

    if (elTotal) elTotal.innerText = total;
    if (elInc) elInc.innerText = included;
    if (elExc) elExc.innerText = excluded;
  },

  prepareReviewStep() {
    document.getElementById('reviewType').innerText = this.submissionType;
    document.getElementById('reviewBureau').innerText = this.bureau;
    document.getElementById('reviewDate').innerText = document.getElementById('submissionDate').value;

    const excludedListContainer = document.getElementById('reviewExcludedList');
    const excludedCount = this.excludedAccounts.size;
    const total = this.allAccounts.length;
    const includedCount = total - excludedCount;

    document.getElementById('reviewExcludedCount').innerText = `${excludedCount} Accounts`;
    document.getElementById('reviewIncludedBadge').innerText = `${includedCount} of ${total} Included`;

    if (excludedCount === 0) {
      excludedListContainer.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">No accounts excluded. All ${total} records will be submitted to ${this.bureau}.</span>`;
    } else {
      const items = [];
      this.allAccounts.forEach(acc => {
        if (this.excludedAccounts.has(acc.account_number)) {
          items.push(`
            <div style="background: var(--danger-soft); border: 1px solid var(--danger-border); border-radius: 6px; padding: 0.35rem 0.65rem; font-size: 0.78rem;">
              <span style="font-family: monospace; color: var(--danger); font-weight: 600;">${acc.account_number}</span>
              <span style="color: var(--text-secondary); margin-left: 0.35rem;">- ${acc.customer_name}</span>
            </div>
          `);
        }
      });
      excludedListContainer.innerHTML = items.join('');
    }
  },

  async submitRequest() {
    const btn = document.getElementById('btnSubmitRequest');
    btn.disabled = true;

    // Show simulation modal
    const modal = document.getElementById('simulationModal');
    modal.classList.add('show');

    const funcName = `func-bureau-${this.bureau.toLowerCase()}-${this.submissionType.toLowerCase()}-prod`;
    document.getElementById('logFuncName').innerText = funcName;

    // Reset log entries UI
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`logStep${i}`);
      el.className = 'log-entry';
      el.querySelector('.log-icon').innerHTML = '<span class="log-dot"></span>';
    }
    document.getElementById('modalResultBox').style.display = 'none';
    document.getElementById('modalFooter').style.display = 'none';
    document.getElementById('modalSpinner').style.display = 'inline-block';
    document.getElementById('modalTitle').innerText = 'Executing Azure Function App...';

    // Helper to animate step
    const runStep = (num, text, delay) => {
      return new Promise(resolve => {
        const el = document.getElementById(`logStep${num}`);
        el.className = 'log-entry active';
        el.querySelector('.log-icon').innerHTML = '<span class="spinner"></span>';
        
        setTimeout(() => {
          el.className = 'log-entry done';
          el.querySelector('.log-icon').innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          resolve();
        }, delay);
      });
    };

    // Animate Step 1 & 2
    await runStep(1, 'Storing Request in DB...', 600);
    await runStep(2, `Invoking Azure Function App ${funcName}...`, 700);

    // Call Backend
    const payload = {
      submission_type: this.submissionType,
      bureau: this.bureau,
      submission_date: document.getElementById('submissionDate').value,
      excluded_accounts: Array.from(this.excludedAccounts),
      notes: document.getElementById('requestNotes')?.value || 'Scheduled Monthly Bureau Transmittal'
    };

    let resultData = null;
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      resultData = await res.json();
    } catch (err) {
      console.error('Request failed:', err);
    }

    await runStep(3, 'Querying portfolio & filtering excluded exceptions...', 600);
    await runStep(4, 'Generating transmission file format...', 700);
    await runStep(5, 'Uploaded to Azure Blob Storage & SAS URI generated.', 600);

    // Modal Completion UI
    document.getElementById('modalSpinner').style.display = 'none';
    document.getElementById('modalTitle').innerText = 'Transmission Complete!';

    if (resultData && resultData.request) {
      this.lastCreatedRequest = resultData.request;
      document.getElementById('resReqId').innerText = resultData.request.id;
      document.getElementById('resBlobUrl').innerText = resultData.request.blob_url;
      document.getElementById('modalResultBox').style.display = 'block';
    }

    document.getElementById('modalFooter').style.display = 'flex';
    btn.disabled = false;
  },

  downloadFileFromModal() {
    if (this.lastCreatedRequest && this.lastCreatedRequest.blob_file_name) {
      window.location.href = `/api/download/${this.lastCreatedRequest.blob_file_name}`;
    }
  },

  copyBlobUrl() {
    const url = document.getElementById('resBlobUrl').innerText;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Azure Blob URL copied to clipboard!', 'success');
    });
  },

  closeModalAndReset() {
    document.getElementById('simulationModal').classList.remove('show');
    this.goToStep(1);
    this.excludedAccounts.clear();
    this.renderExceptionsTable();
  }
};


// =========================================================================
// 2. EXCEPTIONS MASTER CONTROLLER (/exceptions page)
// =========================================================================

const exceptionsMaster = {
  accounts: [],
  filtered: [],
  selectedExclusions: new Set(),
  currentTypeFilter: 'ALL',

  async init() {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      this.accounts = data.accounts || [];
      this.filtered = [...this.accounts];
      this.render();
    } catch (err) {
      console.error('Error fetching master accounts:', err);
    }
  },

  setTypeFilter(type, btn) {
    this.currentTypeFilter = type;
    document.querySelectorAll('[data-filter-type]').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.filter();
  },

  filter() {
    const q = (document.getElementById('masterSearchInput')?.value || '').toLowerCase().trim();
    this.filtered = this.accounts.filter(acc => {
      const matchesType = this.currentTypeFilter === 'ALL' || acc.type.toLowerCase() === this.currentTypeFilter.toLowerCase();
      const matchesSearch = !q || (
        acc.account_number.toLowerCase().includes(q) ||
        acc.customer_name.toLowerCase().includes(q) ||
        (acc.gstin && acc.gstin.toLowerCase().includes(q)) ||
        (acc.facility && acc.facility.toLowerCase().includes(q)) ||
        (acc.exception_reason && acc.exception_reason.toLowerCase().includes(q))
      );
      return matchesType && matchesSearch;
    });
    this.render();
  },

  render() {
    const tbody = document.getElementById('masterExceptionsTableBody');
    if (!tbody) return;

    if (this.filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">No accounts match criteria.</td></tr>`;
      this.updateCounts();
      return;
    }

    tbody.innerHTML = this.filtered.map(acc => {
      const isSelected = this.selectedExclusions.has(acc.account_number);
      const rowClass = isSelected ? 'row-excluded' : '';
      const typeBadge = acc.type === 'Commercial'
        ? `<span class="badge">Commercial</span>`
        : `<span class="badge">Consumer</span>`;

      return `
        <tr class="${rowClass}">
          <td style="text-align: center;">
            <label class="custom-checkbox">
              <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="exceptionsMaster.toggleSelect('${acc.account_number}')">
              <span class="checkmark"></span>
            </label>
          </td>
          <td class="mono strong nowrap">
            ${acc.account_number}
          </td>
          <td class="strong">
            ${acc.customer_name}
          </td>
          <td>${typeBadge}</td>
          <td>
            <div style="font-size: 0.8rem; color: var(--text-muted);">${acc.gstin}</div>
            <div style="font-size: 0.75rem; color: var(--text-dim);">${acc.facility}</div>
          </td>
          <td class="num nowrap">
            ₹ ${acc.current_balance.toLocaleString('en-IN')}
          </td>
          <td>
            ${acc.dpd > 0 ? `<span class="text-danger">${acc.dpd}</span>` : `<span style="color: var(--text-muted);">0</span>`}
          </td>
          <td>
            <div class="reason-box">
              ${acc.exception_reason}
            </div>
          </td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="exceptionsMaster.toggleSelect('${acc.account_number}')">
              ${isSelected ? 'Include' : 'Exclude'}
            </button>
          </td>
        </tr>
      `;
    }).join('');

    this.updateCounts();
  },

  toggleSelect(accNum) {
    if (this.selectedExclusions.has(accNum)) {
      this.selectedExclusions.delete(accNum);
    } else {
      this.selectedExclusions.add(accNum);
    }
    this.render();
  },

  toggleSelectAll(excludeAll) {
    if (excludeAll) {
      this.filtered.forEach(a => this.selectedExclusions.add(a.account_number));
    } else {
      this.selectedExclusions.clear();
    }
    this.render();
  },

  updateCounts() {
    const total = this.accounts.length;
    const excluded = this.selectedExclusions.size;
    const clean = total - excluded;

    const elTotal = document.getElementById('totalMasterAccounts');
    const elExc = document.getElementById('totalExcludedMarked');
    const elClean = document.getElementById('totalCleanMarked');
    const badgeCount = document.getElementById('selectedExclusionsCountBadge');

    if (elTotal) elTotal.innerText = total;
    if (elExc) elExc.innerText = excluded;
    if (elClean) elClean.innerText = clean;
    if (badgeCount) badgeCount.innerText = excluded;
  },

  launchSubmissionWithSelected() {
    if (this.selectedExclusions.size === 0) {
      showToast('Select at least one account to exclude, or proceed directly to New Request.', 'info');
    }
    sessionStorage.setItem('preselected_exclusions', JSON.stringify(Array.from(this.selectedExclusions)));
    window.location.href = '/request';
  },

  exportExceptionsCSV() {
    const rows = [
      ["Account_Number", "Customer_Name", "Type", "Identifier", "Facility", "Current_Balance", "DPD", "Exception_Reason", "Marked_Excluded"]
    ];

    this.accounts.forEach(a => {
      rows.push([
        a.account_number,
        `"${a.customer_name}"`,
        a.type,
        a.gstin,
        `"${a.facility}"`,
        a.current_balance,
        a.dpd,
        `"${a.exception_reason}"`,
        this.selectedExclusions.has(a.account_number) ? "YES" : "NO"
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `EXCEPTIONS_REPORT_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exceptions CSV report downloaded.', 'success');
  }
};


// =========================================================================
// 3. SUBMISSION TRACKER CONTROLLER (/tracker page)
// =========================================================================

const submissionTracker = {
  requests: [],
  filtered: [],
  activeBureauFilter: 'ALL',
  selectedRequest: null,

  async init() {
    await this.reload();
  },

  async reload() {
    const tbody = document.getElementById('trackerTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);"><span class="spinner" style="display:inline-block; margin-right:8px;"></span> Loading requests from database...</td></tr>`;
    }

    try {
      const res = await fetch('/api/requests');
      const data = await res.json();
      this.requests = data.requests || [];
      this.filtered = [...this.requests];
      this.render();
      this.updateStats();
    } catch (err) {
      console.error('Error fetching requests:', err);
    }
  },

  filterBureau(bureau, btn) {
    this.activeBureauFilter = bureau;
    document.querySelectorAll('.filter-bar .action-pill').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    this.filter();
  },

  filter() {
    const q = (document.getElementById('trackerSearchInput')?.value || '').toLowerCase().trim();
    this.filtered = this.requests.filter(req => {
      const matchesBureau = this.activeBureauFilter === 'ALL' || req.bureau.toLowerCase() === this.activeBureauFilter.toLowerCase();
      const matchesSearch = !q || (
        req.id.toLowerCase().includes(q) ||
        req.submission_type.toLowerCase().includes(q) ||
        req.bureau.toLowerCase().includes(q) ||
        (req.blob_file_name && req.blob_file_name.toLowerCase().includes(q)) ||
        (req.execution_id && req.execution_id.toLowerCase().includes(q))
      );
      return matchesBureau && matchesSearch;
    });
    this.render();
  },

  render() {
    const tbody = document.getElementById('trackerTableBody');
    if (!tbody) return;

    if (this.filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">No submission requests found.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.filtered.map(req => {
      const bureauBadgeClass = `badge badge-${req.bureau.toLowerCase()}`;
      return `
        <tr>
          <td>
            <a href="javascript:void(0)" onclick="submissionTracker.openDetailModal('${req.id}')" class="mono" style="font-weight: 500; color: var(--primary); text-decoration: none; white-space: nowrap;">
              ${req.id}
            </a>
            <div style="font-size: 0.72rem; color: var(--text-dim);">${req.created_at}</div>
          </td>
          <td>
            ${req.submission_type}
          </td>
          <td>
            <span class="${bureauBadgeClass}">${req.bureau}</span>
          </td>
          <td style="color: var(--text-secondary); font-size: 0.85rem;">
            ${req.submission_date}
          </td>
          <td>
            <span class="badge ${req.excluded_count > 0 ? 'badge-excluded' : 'badge-included'}">
              ${req.excluded_count} Excluded
            </span>
          </td>
          <td style="color: var(--text-main); font-variant-numeric: tabular-nums;">
            ${req.included_count}
          </td>
          <td>
            <span class="badge badge-completed">
              <span class="status-dot"></span> Completed
            </span>
          </td>
          <td class="blob-cell">
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <span class="blob-truncate" title="${req.blob_url}">
                ${req.blob_url}
              </span>
              <button class="action-pill" style="padding: 2px 6px; font-size: 0.7rem;" onclick="submissionTracker.copyUrl('${req.blob_url}')" title="Copy Blob URL">
                Copy
              </button>
            </div>
            <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 2px;">
              ${req.blob_file_name} (${req.file_size})
            </div>
          </td>
          <td style="text-align: right;">
            <div class="actions-cell" style="justify-content: flex-end;">
              <a href="/api/download/${req.blob_file_name}" class="btn btn-sm btn-secondary" title="Download Transmission File">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                File
              </a>
              <a href="/api/download-audit/${req.id}" class="btn btn-sm btn-secondary" title="Download Audit Report">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Audit
              </a>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  updateStats() {
    const total = this.requests.length;
    let totalExcluded = 0;
    this.requests.forEach(r => totalExcluded += (r.excluded_count || 0));

    const elTotal = document.getElementById('trackTotalRequests');
    const elCompleted = document.getElementById('trackCompletedRequests');
    const elExc = document.getElementById('trackTotalExcluded');
    const elBlob = document.getElementById('trackBlobFiles');

    if (elTotal) elTotal.innerText = total;
    if (elCompleted) elCompleted.innerText = total;
    if (elExc) elExc.innerText = totalExcluded;
    if (elBlob) elBlob.innerText = total;
  },

  copyUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Azure Blob URL copied!', 'success');
    });
  },

  openDetailModal(reqId) {
    const req = this.requests.find(r => r.id === reqId);
    if (!req) return;
    this.selectedRequest = req;

    const modal = document.getElementById('requestDetailModal');
    const body = document.getElementById('requestDetailBody');

    body.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem;">
        <div style="background: var(--bg-subtle); padding: 0.85rem; border-radius: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-muted);">Request ID</div>
          <div style="font-weight: 700; color: var(--primary); font-family: monospace;">${req.id}</div>
        </div>
        <div style="background: var(--bg-subtle); padding: 0.85rem; border-radius: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-muted);">Submission Type & Bureau</div>
          <div style="font-weight: 700; color: var(--text-main);">${req.submission_type} - ${req.bureau}</div>
        </div>
        <div style="background: var(--bg-subtle); padding: 0.85rem; border-radius: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-muted);">Azure Function App</div>
          <div style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary);">${req.function_app_name}</div>
        </div>
        <div style="background: var(--bg-subtle); padding: 0.85rem; border-radius: 8px;">
          <div style="font-size: 0.72rem; color: var(--text-muted);">Execution Run ID</div>
          <div style="font-family: monospace; font-size: 0.8rem; color: var(--text-secondary);">${req.execution_id}</div>
        </div>
      </div>

      <div style="margin-bottom: 1rem;">
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.4rem;">Azure Blob Storage Location</div>
        <div class="blob-link-box">
          <div class="blob-url-text">${req.blob_url}</div>
          <button class="action-pill" onclick="submissionTracker.copyUrl('${req.blob_url}')">Copy</button>
        </div>
      </div>

      <div style="background: var(--bg-subtle); border: 1px solid var(--border-subtle); padding: 1rem; border-radius: 8px;">
        <div style="font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 0.5rem;">
          Excluded Accounts (${req.excluded_count || 0}):
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 0.45rem;">
          ${(req.excluded_accounts && req.excluded_accounts.length > 0) 
            ? req.excluded_accounts.map(acc => `<span class="badge badge-excluded" style="font-family: monospace;">${acc}</span>`).join('')
            : '<span style="color: var(--text-muted); font-size: 0.8rem;">No exceptions excluded for this batch.</span>'
          }
        </div>
      </div>
    `;

    document.getElementById('btnDetailFileDownload').onclick = () => {
      window.location.href = `/api/download/${req.blob_file_name}`;
    };

    document.getElementById('btnDetailAuditDownload').onclick = () => {
      window.location.href = `/api/download-audit/${req.id}`;
    };

    modal.classList.add('show');
  },

  closeDetailModal() {
    document.getElementById('requestDetailModal')?.classList.remove('show');
  }
};
