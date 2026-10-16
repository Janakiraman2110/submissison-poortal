# BureauPulse - Credit Bureau Submission & Exceptions Tracker

A comprehensive Python Flask web application designed for financial institutions and credit management teams to configure, screen exceptions, and track Credit Bureau Submissions across **CIBIL**, **Highmark**, **Experian**, and **Equifax**.

---

## 🌟 Key Features & Workflow

### 1. Request Page (`/request`)
- **Submission Type Selection**: Toggle between **Commercial** (Corporate entities, LLPs, Working Capital loans) and **Consumer** (Retail individuals, Housing, Auto, Credit cards).
- **Credit Bureau Selection**: Select target bureau (**CIBIL**, **Highmark**, **Experian**, **Equifax**).
- **Submission Date & Metadata**: Set cycle dates and batch descriptions.

### 2. Exceptions Page (`/exceptions` and embedded in the Wizard)
- **Account Screening**: Displays real-time lists of accounts with **Account Number**, **Customer Name**, **Entity Type / GSTIN / PAN**, **Facility**, **Balance**, **DPD**, and **Audit Exception Reason**.
- **Exclusion Checkboxes**: Check or uncheck accounts to exclude them from the active submission batch.
- **Bulk Filters**: Exclude high-risk accounts (DPD > 30), "Select All to Exclude", or "Clear Exclusions".
- **Dynamic Counters**: Instant calculation of Total Eligible Accounts, Active in Submission, and Excluded Exceptions.

### 3. Consolidated Request & Simulated Azure Function App Pipeline
- Both the **Request Parameters** and **Excluded Exceptions** constitute a unified submission request.
- When submitted:
  1. Registers the request record in the database (`data/requests.json`).
  2. Invokes the simulated Azure Function App (`func-bureau-<bureau>-<type>-prod`).
  3. Filters out excluded exceptions and compiles bureau transmission segments (`HDR`, detail lines, `TRL`).
  4. Generates formatted transmission files (`.DAT`, `.TXT`, `.CSV`) and writes them to simulated Azure Blob Storage (`storage_mock/`).
  5. Computes the Azure Blob Storage SAS URL and assigns it back to the original request record in the app.

### 4. Submission Tracker Dashboard (`/tracker`)
- Full audit list of all requests with status badges, bureau indicators, and exclusion counters.
- **Azure Blob Storage SAS URLs** with one-click copy.
- **Direct Downloads**:
  - Download official bureau transmission file (`.dat` / `.txt` / `.csv`).
  - Download detailed audit & compliance log (`.txt`).

### 5. Azure Blob Storage Explorer (`/blob-storage`)
- Visual container browser for `azsubtrackprod/bureau-submissions`.
- Inspect file names, sizes, formats, timestamps, and download files directly.

---

## 🚀 Running the Application

### Prerequisites
- Python 3.10+
- Flask (`pip install Flask`)

### Start Server
```bash
python app.py
```
Open your browser and visit:
👉 **[http://127.0.0.1:5000](http://127.0.0.1:5000)**

---

## 📁 Project Structure

```
submissison poortal/
├── app.py                      # Flask backend (routes, REST APIs, dummy Azure Function generator)
├── requirements.txt            # Python dependencies
├── README.md                   # Documentation
├── data/
│   ├── accounts.json           # Commercial & Consumer portfolio accounts sample data
│   └── requests.json           # Persistent request records with Azure Blob URLs
├── storage_mock/               # Simulated Azure Blob Storage container directory
├── static/
│   ├── css/
│   │   └── style.css           # Modern dark-theme design system with glassmorphism
│   └── js/
│       └── main.js             # Wizard controller, exceptions selection, and simulation stepper
└── templates/
    ├── base.html               # Shared navigation & layout
    ├── request_wizard.html     # Consolidated Request & Exceptions Wizard
    ├── exceptions.html         # Master Exceptions Management Page
    ├── tracker.html            # Submission Tracker Dashboard
    └── blob_storage.html       # Azure Blob Storage Container Explorer
```

---

## Live demo (GitHub Pages)

A static build of the app is published from the `docs/` folder. GitHub Pages cannot run Flask, so
`static/js/static-api.js` emulates the `/api/*` endpoints in the browser using the bundled seed data;
requests created in the demo are stored in the visitor's browser (localStorage).

Rebuild the static site after changing templates, styles or data:

```bash
python build_static.py
```
