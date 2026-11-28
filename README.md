# Walvoil DPR Digitisation Tool (Phase 2)

Web application to digitise Walvoil handwritten Daily Production Reports (ASLY-DPR-REV01) and export them directly into official formatted Excel sheets.

Built using FastAPI for the backend, React + Vite + Tailwind for the UI, and Google Gemini Vision for handwriting recognition.

---

## What it does

1. **Uploads DPR Scans & Multi-Page PDFs**: Takes mobile photos, single images (JPG/PNG/WEBP), or entire multi-page PDF scans (containing 10–15+ reports). The app automatically splits every PDF page into high-resolution report sheets.
2. **Vision Extraction**: Transcribes handwritten text, operator names, part numbers, quantities, batches, and remarks in about 5 seconds.
3. **Interactive Review**: Split screen viewer where operators can review the extracted table side-by-side with the scanned photo, click on cells to inspect bounding boxes, and make quick edits.
4. **Excel Export**: Generates an exact `.xlsx` file matching the Walvoil paper layout (proper column widths, row heights, headers, and footer) directly to your Downloads folder.
5. **Privacy First**: Zero database storage. Everything is processed in memory and deleted when done.

---

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide icons, xlsx-js-style
- **Backend**: Python 3.12, FastAPI, OpenCV (layout alignment and deskew), Requests, Pydantic v2
- **AI Engine**: Google Gemini 3.5 Flash Vision (with 15 RPM sliding-window rate tracking)

---

## Setup & Running Locally

### Prerequisites
- Node.js (v18+)
- Python 3.10+
- A Google Gemini API key

### 1. Backend Setup

Open a terminal in the project root:

```bash
cd backend
python -m venv .venv
```

Activate virtual environment:
- Windows (PowerShell):
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- Linux/Mac:
  ```bash
  source .venv/bin/activate
  ```

Install dependencies:
```bash
pip install -r requirements.txt
```

Create a `.env` file inside `backend/`:
```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

Start the FastAPI server:
```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```
Backend runs at `http://localhost:8000`.

---

### 2. Frontend Setup

Open a second terminal in the project root:

```bash
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

---

## Rate Limits & Usage Notes

- The recognition engine runs on Gemini's Free Tier (15 requests per minute).
- The UI tracks this limit and shows an active status pill on the review page (`Quota: 15 Scans / Min`).
- If you hit the 15 req/min cap, the app shows a clear 1-minute cooldown warning with a Retry button instead of crashing or falling back to slow local OCR.

---

## Project Structure

```text
├── backend/
│   ├── app/
│   │   ├── api/routes.py              # API endpoints (/upload, /recognize, /layout)
│   │   ├── core/config.py             # Server config and CORS
│   │   ├── schemas/recognition.py     # Pydantic models for tables and fields
│   │   └── services/
│   │       ├── gemini_service.py      # Vision extraction & 15 RPM rate tracker
│   │       ├── layout_detection.py    # OpenCV deskew and cell bounding boxes
│   │       └── image_preprocessing.py # Bilateral filtering and contrast (CLAHE)
│   └── requirements.txt
├── src/
│   ├── components/
│   │   ├── review/                    # ScanViewer & ReportTable split view
│   │   └── stages/                    # Upload, Review, and Export stages
│   ├── services/                      # API client functions
│   └── utils/                         # Excel generation & data adapters
├── package.json
└── README.md
```
