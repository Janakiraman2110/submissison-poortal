import os
import json
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for, abort

app = Flask(__name__)
app.config['SECRET_KEY'] = 'credit-bureau-submission-tracker-secret-key-2026'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
STORAGE_DIR = os.path.join(BASE_DIR, 'storage_mock')

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(STORAGE_DIR, exist_ok=True)

ACCOUNTS_FILE = os.path.join(DATA_DIR, 'accounts.json')
REQUESTS_FILE = os.path.join(DATA_DIR, 'requests.json')


def load_accounts():
    if not os.path.exists(ACCOUNTS_FILE):
        return []
    with open(ACCOUNTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_requests():
    if not os.path.exists(REQUESTS_FILE):
        return []
    with open(REQUESTS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_requests(requests_data):
    with open(REQUESTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(requests_data, f, indent=2)


def generate_submission_file(req_id, sub_type, bureau, sub_date, included_accounts, excluded_account_ids):
    """
    Simulates Azure Function App generating the standard credit bureau transmission file.
    Creates .dat, .txt, or .csv based on the bureau standards.
    """
    timestamp_slug = datetime.now().strftime('%Y%m%d_%H%M%S')
    ext = "dat" if bureau in ["CIBIL"] else ("csv" if bureau == "Experian" else "txt")
    filename = f"{bureau.upper()}_{sub_type.upper()}_SUBMISSION_{timestamp_slug}.{ext}"
    filepath = os.path.join(STORAGE_DIR, filename)

    content_lines = []
    
    if ext == "csv":
        content_lines.append("Account_Number,Entity_Name,Identifier_Tax_ID,Facility_Type,Sanctioned_Limit,Current_Balance,DPD,Status")
        for acc in included_accounts:
            content_lines.append(
                f"{acc.get('account_number')},{acc.get('customer_name')},{acc.get('gstin')},{acc.get('facility')},{acc.get('sanctioned_amount')},{acc.get('current_balance')},{acc.get('dpd')},{acc.get('status')}"
            )
        content_lines.append(f"# Summary: Total Submitted: {len(included_accounts)} | Excluded: {len(excluded_account_ids)} | Date: {sub_date}")
    else:
        # Standard bureau fixed/pipe format
        content_lines.append(f"HDR|{bureau.upper()}|{sub_type.upper()}|{sub_date}|{req_id}|BATCH_{timestamp_slug}|TOTAL_ACCOUNTS:{len(included_accounts)}")
        for acc in included_accounts:
            content_lines.append(
                f"{acc.get('account_number')}|{acc.get('customer_name')}|{acc.get('gstin')}|{acc.get('facility')}|{acc.get('sanctioned_amount')}|{acc.get('current_balance')}|{acc.get('dpd')}|{acc.get('status')}"
            )
        content_lines.append(f"TRL|{req_id}|RECORDS:{len(included_accounts)}|EXCLUDED:{len(excluded_account_ids)}|HASH:{uuid.uuid4().hex[:16]}")

    file_content = "\n".join(content_lines) + "\n"
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(file_content)

    file_size_kb = f"{max(round(os.path.getsize(filepath) / 1024, 1), 0.5)} KB"
    container_name = f"{bureau.lower()}-{sub_type.lower()}-submissions"
    
    blob_url = f"https://azsubtrackprod.blob.core.windows.net/{container_name}/{datetime.now().strftime('%Y-%m')}/{filename}?sp=r&st={datetime.now().strftime('%Y-%m-%d')}&se=2027-12-31&spr=https&sv=2024-11-04&sr=b&sig=SIMULATED_{uuid.uuid4().hex[:12]}"
    
    return filename, blob_url, file_size_kb, container_name


@app.route('/')
@app.route('/dashboard')
def dashboard_page():
    requests_data = load_requests()
    accounts = load_accounts()

    recent = sorted(requests_data, key=lambda r: r.get('created_at', ''), reverse=True)

    bureaus = []
    for name in ['CIBIL', 'Highmark', 'Experian', 'Equifax']:
        reqs = [r for r in recent if r.get('bureau') == name]
        bureaus.append({
            "name": name,
            "count": len(reqs),
            "records": sum(r.get('included_count', 0) for r in reqs),
            "last": reqs[0].get('submission_date') if reqs else None,
        })
    max_records = max([b["records"] for b in bureaus] + [1])

    flagged = [a for a in accounts if a.get('exception_reason')]
    top_exceptions = sorted(flagged, key=lambda a: a.get('dpd', 0), reverse=True)[:5]

    stats = {
        "total_requests": len(requests_data),
        "records_sent": sum(r.get('included_count', 0) for r in requests_data),
        "excluded": sum(r.get('excluded_count', 0) for r in requests_data),
        "flagged": len(flagged),
        "accounts": len(accounts),
    }

    return render_template(
        'dashboard.html',
        active_page='dashboard',
        stats=stats,
        recent=recent[:6],
        bureaus=bureaus,
        max_records=max_records,
        top_exceptions=top_exceptions,
    )


@app.route('/request')
@app.route('/new-request')
def request_page():
    return render_template('request_wizard.html', active_page='request')


@app.route('/exceptions')
def exceptions_page():
    return render_template('exceptions.html', active_page='exceptions')


@app.route('/tracker')
def tracker_page():
    return render_template('tracker.html', active_page='tracker')


@app.route('/blob-storage')
def blob_storage_page():
    return render_template('blob_storage.html', active_page='blob_storage')


# ==========================================
# REST API ENDPOINTS
# ==========================================

@app.route('/api/accounts')
def get_accounts():
    sub_type = request.args.get('type')
    bureau = request.args.get('bureau')
    
    accounts = load_accounts()
    
    if sub_type:
        accounts = [a for a in accounts if a.get('type', '').lower() == sub_type.lower()]
    if bureau:
        accounts = [a for a in accounts if bureau in a.get('bureau_eligible', [])]
        
    return jsonify({
        "status": "success",
        "total": len(accounts),
        "accounts": accounts
    })


@app.route('/api/requests', methods=['GET'])
def get_requests():
    requests_data = load_requests()
    return jsonify({
        "status": "success",
        "total": len(requests_data),
        "requests": requests_data
    })


@app.route('/api/requests', methods=['POST'])
def create_request():
    payload = request.get_json() or {}
    
    sub_type = payload.get('submission_type', 'Commercial')
    bureau = payload.get('bureau', 'CIBIL')
    sub_date = payload.get('submission_date', datetime.now().strftime('%Y-%m-%d'))
    excluded_accounts = payload.get('excluded_accounts', [])
    notes = payload.get('notes', 'Manual portal submission trigger.')
    
    # Generate sequential or unique Request ID
    seq = uuid.uuid4().hex[:4].upper()
    req_id = f"REQ-{datetime.now().strftime('%Y%m')}-{bureau[:4].upper()}-{seq}"
    
    # Filter eligible accounts
    all_accounts = load_accounts()
    eligible_accounts = [
        a for a in all_accounts
        if a.get('type', '').lower() == sub_type.lower() and bureau in a.get('bureau_eligible', [])
    ]
    
    included_accounts = [
        a for a in eligible_accounts
        if a.get('account_number') not in excluded_accounts
    ]
    
    # Azure Function App Simulation
    function_app_name = f"func-bureau-{bureau.lower()}-{sub_type.lower()}-prod"
    execution_id = f"exec-{uuid.uuid4().hex[:4]}-{uuid.uuid4().hex[:8]}"
    
    filename, blob_url, file_size_kb, container_name = generate_submission_file(
        req_id, sub_type, bureau, sub_date, included_accounts, excluded_accounts
    )
    
    new_request = {
        "id": req_id,
        "submission_type": sub_type,
        "bureau": bureau,
        "submission_date": sub_date,
        "created_at": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        "status": "Completed",
        "total_accounts": len(eligible_accounts),
        "excluded_count": len(excluded_accounts),
        "included_count": len(included_accounts),
        "excluded_accounts": excluded_accounts,
        "function_app_name": function_app_name,
        "execution_id": execution_id,
        "blob_container": container_name,
        "blob_file_name": filename,
        "blob_url": blob_url,
        "file_size": file_size_kb,
        "notes": notes
    }
    
    existing_requests = load_requests()
    existing_requests.insert(0, new_request)
    save_requests(existing_requests)
    
    return jsonify({
        "status": "success",
        "message": "Submission request processed successfully by simulated Azure Function App and uploaded to Blob Storage.",
        "request": new_request
    })


@app.route('/api/download/<filename>')
def download_file(filename):
    filepath = os.path.join(STORAGE_DIR, filename)
    if not os.path.exists(filepath):
        # Fallback if file doesn't exist yet, create a quick mock
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(f"HDR|BUREAU|MOCK|{datetime.now().strftime('%Y-%m-%d')}|{filename}\nTRL|RECORDS:0\n")
    return send_file(filepath, as_attachment=True, download_name=filename)


@app.route('/api/download-audit/<req_id>')
def download_audit_report(req_id):
    requests_data = load_requests()
    req = next((r for r in requests_data if r.get('id') == req_id), None)
    if not req:
        abort(404, description="Request not found")
        
    all_accounts = load_accounts()
    excluded_details = [
        a for a in all_accounts if a.get('account_number') in req.get('excluded_accounts', [])
    ]
    
    report_content = f"""================================================================================
CREDIT BUREAU SUBMISSION AUDIT & EXCLUSION REPORT
Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
================================================================================

1. SUBMISSION REQUEST DETAILS
--------------------------------------------------------------------------------
Request ID:              {req.get('id')}
Submission Type:         {req.get('submission_type')}
Target Credit Bureau:    {req.get('bureau')}
Submission Date:         {req.get('submission_date')}
Created At:              {req.get('created_at')}
Status:                  {req.get('status')}

2. AZURE FUNCTION APP EXECUTION LOGS
--------------------------------------------------------------------------------
Function App Name:       {req.get('function_app_name')}
Execution Run ID:        {req.get('execution_id')}
Output File:             {req.get('blob_file_name')}
File Size:               {req.get('file_size')}
Azure Blob Storage URL:  {req.get('blob_url')}

3. RECONCILIATION SUMMARY
--------------------------------------------------------------------------------
Total Portfolio Eligible: {req.get('total_accounts')}
Active Submitted Records: {req.get('included_count')}
Excluded Exceptions:      {req.get('excluded_count')}

4. EXCLUDED EXCEPTIONS LOG (AUDIT COMPLIANCE)
--------------------------------------------------------------------------------
"""
    if excluded_details:
        for idx, acc in enumerate(excluded_details, 1):
            report_content += f"""[{idx}] Account No: {acc.get('account_number')}
    Customer Name:    {acc.get('customer_name')}
    Facility:         {acc.get('facility')}
    Current Balance:  INR {acc.get('current_balance'):,}
    Status / DPD:     {acc.get('status')} / {acc.get('dpd')} DPD
    Exclusion Reason: {acc.get('exception_reason')}
--------------------------------------------------------------------------------
"""
    else:
        report_content += "No accounts were excluded from this submission cycle.\n"

    report_content += "\n================================================================================\nEND OF AUDIT REPORT\n"

    report_filename = f"AUDIT_{req.get('id')}.txt"
    audit_filepath = os.path.join(STORAGE_DIR, report_filename)
    with open(audit_filepath, 'w', encoding='utf-8') as f:
        f.write(report_content)
        
    return send_file(audit_filepath, as_attachment=True, download_name=report_filename)


@app.route('/api/storage-files')
def get_storage_files():
    files = []
    if os.path.exists(STORAGE_DIR):
        for fname in os.listdir(STORAGE_DIR):
            fpath = os.path.join(STORAGE_DIR, fname)
            if os.path.isfile(fpath):
                stat = os.stat(fpath)
                ext = fname.split('.')[-1].upper()
                files.append({
                    "name": fname,
                    "size": f"{max(round(stat.st_size / 1024, 1), 0.5)} KB",
                    "modified": datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
                    "format": ext,
                    "url": f"/api/download/{fname}"
                })
    return jsonify({
        "status": "success",
        "container": "azsubtrackprod/bureau-submissions",
        "files": files
    })


if __name__ == '__main__':
    print("Starting Credit Bureau Submission Tracker on http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
