/*
 * Static-hosting shim for GitHub Pages.
 * Emulates the Flask /api/* endpoints in the browser using seed data
 * (window.__SEED__, from seed-data.js) plus localStorage for anything created here.
 */
(function () {
  const SEED = window.__SEED__ || { accounts: [], requests: [], files: {} };
  const LS_REQUESTS = 'bp_requests';
  const LS_FILES = 'bp_files';

  function readLS(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function writeLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
  }

  function allRequests() {
    return readLS(LS_REQUESTS, []).concat(SEED.requests);
  }
  function allFiles() {
    return Object.assign({}, SEED.files, readLS(LS_FILES, {}));
  }

  const pad = n => String(n).padStart(2, '0');
  function stamp(d, withTime) {
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return withTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : date;
  }
  const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('').slice(0, n);

  function sizeOf(text) {
    return `${Math.max(Math.round(new Blob([text]).size / 1024 * 10) / 10, 0.5)} KB`;
  }

  function json(body, status) {
    return Promise.resolve(new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    }));
  }

  function createRequest(payload) {
    const now = new Date();
    const subType = payload.submission_type || 'Commercial';
    const bureau = payload.bureau || 'CIBIL';
    const subDate = payload.submission_date || stamp(now);
    const excluded = payload.excluded_accounts || [];
    const ym = `${now.getFullYear()}${pad(now.getMonth() + 1)}`;
    const reqId = `REQ-${ym}-${bureau.slice(0, 4).toUpperCase()}-${hex(4).toUpperCase()}`;

    const eligible = SEED.accounts.filter(a =>
      (a.type || '').toLowerCase() === subType.toLowerCase() && (a.bureau_eligible || []).includes(bureau));
    const included = eligible.filter(a => !excluded.includes(a.account_number));

    const slug = `${ym}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const ext = bureau === 'CIBIL' ? 'dat' : (bureau === 'Experian' ? 'csv' : 'txt');
    const filename = `${bureau.toUpperCase()}_${subType.toUpperCase()}_SUBMISSION_${slug}.${ext}`;
    const row = a => [a.account_number, a.customer_name, a.gstin, a.facility, a.sanctioned_amount, a.current_balance, a.dpd, a.status];

    let lines;
    if (ext === 'csv') {
      lines = ['Account_Number,Entity_Name,Identifier_Tax_ID,Facility_Type,Sanctioned_Limit,Current_Balance,DPD,Status']
        .concat(included.map(a => row(a).join(',')))
        .concat([`# Summary: Total Submitted: ${included.length} | Excluded: ${excluded.length} | Date: ${subDate}`]);
    } else {
      lines = [`HDR|${bureau.toUpperCase()}|${subType.toUpperCase()}|${subDate}|${reqId}|BATCH_${slug}|TOTAL_ACCOUNTS:${included.length}`]
        .concat(included.map(a => row(a).join('|')))
        .concat([`TRL|${reqId}|RECORDS:${included.length}|EXCLUDED:${excluded.length}|HASH:${hex(16)}`]);
    }
    const content = lines.join('\n') + '\n';
    const container = `${bureau.toLowerCase()}-${subType.toLowerCase()}-submissions`;

    const req = {
      id: reqId,
      submission_type: subType,
      bureau: bureau,
      submission_date: subDate,
      created_at: stamp(now, true),
      status: 'Completed',
      total_accounts: eligible.length,
      excluded_count: excluded.length,
      included_count: included.length,
      excluded_accounts: excluded,
      function_app_name: `func-bureau-${bureau.toLowerCase()}-${subType.toLowerCase()}-prod`,
      execution_id: `exec-${hex(4)}-${hex(8)}`,
      blob_container: container,
      blob_file_name: filename,
      blob_url: `https://azsubtrackprod.blob.core.windows.net/${container}/${now.getFullYear()}-${pad(now.getMonth() + 1)}/${filename}?sp=r&st=${stamp(now)}&se=2027-12-31&spr=https&sv=2024-11-04&sr=b&sig=SIMULATED_${hex(12)}`,
      file_size: sizeOf(content),
      notes: payload.notes || 'Manual portal submission trigger.'
    };

    writeLS(LS_REQUESTS, [req].concat(readLS(LS_REQUESTS, [])));
    const files = readLS(LS_FILES, {});
    files[filename] = { content: content, modified: stamp(now, true) };
    writeLS(LS_FILES, files);
    return req;
  }

  function auditReport(req) {
    const excluded = SEED.accounts.filter(a => (req.excluded_accounts || []).includes(a.account_number));
    const rule = '-'.repeat(80), heavy = '='.repeat(80);
    let out = `${heavy}\nCREDIT BUREAU SUBMISSION AUDIT & EXCLUSION REPORT\nGenerated on: ${stamp(new Date(), true)}\n${heavy}\n\n` +
      `1. SUBMISSION REQUEST DETAILS\n${rule}\nRequest ID:              ${req.id}\nSubmission Type:         ${req.submission_type}\n` +
      `Target Credit Bureau:    ${req.bureau}\nSubmission Date:         ${req.submission_date}\nCreated At:              ${req.created_at}\n` +
      `Status:                  ${req.status}\n\n2. AZURE FUNCTION APP EXECUTION LOGS\n${rule}\nFunction App Name:       ${req.function_app_name}\n` +
      `Execution Run ID:        ${req.execution_id}\nOutput File:             ${req.blob_file_name}\nFile Size:               ${req.file_size}\n` +
      `Azure Blob Storage URL:  ${req.blob_url}\n\n3. RECONCILIATION SUMMARY\n${rule}\nTotal Portfolio Eligible: ${req.total_accounts}\n` +
      `Active Submitted Records: ${req.included_count}\nExcluded Exceptions:      ${req.excluded_count}\n\n4. EXCLUDED EXCEPTIONS LOG (AUDIT COMPLIANCE)\n${rule}\n`;
    if (excluded.length) {
      excluded.forEach((a, i) => {
        out += `[${i + 1}] Account No: ${a.account_number}\n    Customer Name:    ${a.customer_name}\n    Facility:         ${a.facility}\n` +
          `    Current Balance:  INR ${Number(a.current_balance).toLocaleString('en-IN')}\n    Status / DPD:     ${a.status} / ${a.dpd} DPD\n` +
          `    Exclusion Reason: ${a.exception_reason}\n${rule}\n`;
      });
    } else {
      out += 'No accounts were excluded from this submission cycle.\n';
    }
    return out + `\n${heavy}\nEND OF AUDIT REPORT\n`;
  }

  function saveText(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.staticDownload = function (url) {
    const path = decodeURIComponent(url.split('?')[0]);
    let m = path.match(/\/api\/download-audit\/(.+)$/);
    if (m) {
      const req = allRequests().find(r => r.id === m[1]);
      if (req) saveText(`AUDIT_${req.id}.txt`, auditReport(req));
      return;
    }
    m = path.match(/\/api\/download\/(.+)$/);
    if (m) {
      const f = allFiles()[m[1]];
      saveText(m[1], f ? f.content : `HDR|BUREAU|MOCK|${stamp(new Date())}|${m[1]}\nTRL|RECORDS:0\n`);
    }
  };

  // Route links pointing at /api/download* through the in-browser generator
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href*="/api/download"]');
    if (!a) return;
    e.preventDefault();
    window.staticDownload(a.getAttribute('href'));
  }, true);

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.includes('/api/')) return realFetch(input, init);

    const u = new URL(url, window.location.href);
    const method = ((init && init.method) || 'GET').toUpperCase();
    const path = u.pathname.slice(u.pathname.indexOf('/api/'));

    if (path === '/api/accounts') {
      const type = u.searchParams.get('type');
      const bureau = u.searchParams.get('bureau');
      let accounts = SEED.accounts;
      if (type) accounts = accounts.filter(a => (a.type || '').toLowerCase() === type.toLowerCase());
      if (bureau) accounts = accounts.filter(a => (a.bureau_eligible || []).includes(bureau));
      return json({ status: 'success', total: accounts.length, accounts: accounts });
    }
    if (path === '/api/requests' && method === 'POST') {
      const req = createRequest(JSON.parse((init && init.body) || '{}'));
      return json({ status: 'success', message: 'Submission processed (static demo).', request: req });
    }
    if (path === '/api/requests') {
      const reqs = allRequests();
      return json({ status: 'success', total: reqs.length, requests: reqs });
    }
    if (path === '/api/storage-files') {
      const files = Object.entries(allFiles()).map(([name, f]) => ({
        name: name,
        size: sizeOf(f.content),
        modified: f.modified,
        format: name.split('.').pop().toUpperCase(),
        url: `/api/download/${name}`
      }));
      return json({ status: 'success', container: 'azsubtrackprod/bureau-submissions', files: files });
    }
    return json({ status: 'error', message: 'Not available in static demo' }, 404);
  };

  // Re-render dashboard figures so requests created in this browser are included
  document.addEventListener('DOMContentLoaded', function () {
    const body = document.getElementById('dashRecentBody');
    if (!body) return;
    const reqs = allRequests().slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const sum = k => reqs.reduce((t, r) => t + (r[k] || 0), 0);
    document.getElementById('dashTotal').textContent = reqs.length;
    document.getElementById('dashRecords').textContent = sum('included_count').toLocaleString('en-US');
    document.getElementById('dashExcluded').textContent = sum('excluded_count');

    body.innerHTML = reqs.slice(0, 6).map(r => `
      <tr>
        <td class="mono strong">${r.id}</td>
        <td>${r.bureau}</td>
        <td>${r.submission_type}</td>
        <td>${r.submission_date}</td>
        <td class="num">${r.included_count}</td>
        <td class="num">${r.excluded_count}</td>
        <td><span class="status"><span class="dot dot-green"></span>${r.status}</span></td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty">No submissions yet.</td></tr>';

    const bureaus = ['CIBIL', 'Highmark', 'Experian', 'Equifax'].map(name => {
      const list = reqs.filter(r => r.bureau === name);
      return { name, count: list.length, records: list.reduce((t, r) => t + (r.included_count || 0), 0), last: list[0] && list[0].submission_date };
    });
    const max = Math.max(1, ...bureaus.map(b => b.records));
    document.getElementById('dashBureauList').innerHTML = bureaus.map(b => `
      <li>
        <div class="bureau-row">
          <span class="bureau-name">${b.name}</span>
          <span class="bureau-meta">${b.last ? `${b.count} file${b.count !== 1 ? 's' : ''} &middot; last ${b.last}` : 'No submissions'}</span>
        </div>
        <div class="bar"><span style="width: ${Math.round(b.records / max * 100)}%"></span></div>
        <div class="bureau-records">${b.records} records</div>
      </li>`).join('');
  });
})();
