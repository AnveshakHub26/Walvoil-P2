# Walvoil DPR Industrial Deployment & Operations Guide (Phase 16)

**Project:** Walvoil Daily Production Report (DPR) Handwriting Digitisation System  
**Template Standard:** ASLY-DPR-REV01 (Final Assembly)  
**Target Environments:** Local Windows Factory PC & Corporate Linux Enterprise Server  
**Publication Date:** November 6, 2026  

---

## 1. Deployment Architecture Overview

The Walvoil DPR system features a decoupled, two-tier architecture:
1. **Frontend:** React 19 + TypeScript + Vite SPA generating compliant ASLY-DPR-REV01 Excel workbooks in-browser.
2. **Backend:** FastAPI high-performance Python microservice running OpenCV preprocessing, fixed-template alignment, and hybrid HTR model routing on CPU.

Both tiers can be deployed together on a local Windows shopfloor computer or independently across corporate enterprise infrastructure.

---

## 2. Configuration A: Local Windows Factory PC Deployment

Designed for standalone deployment on an Intel Core i3 assembly station PC running Windows 10/11 without external server dependencies.

### 2.1 Prerequisites
- **Operating System:** Windows 10 (Build 19041+) or Windows 11 (x64)
- **Python:** Python 3.12 (or 3.10+) with pip installed
- **Node.js:** Node.js v18.0+ (Tested with v24.16)
- **RAM:** Minimum 8 GB (16 GB recommended)
- **Disk Space:** 5 GB free on local drive for model cache and dependencies

### 2.2 Step-by-Step Installation

#### Step 1: Open PowerShell as Administrator & Set Execution Policy
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Step 2: Set Up Backend Python Environment
```powershell
# Navigate to the backend directory
cd D:\Walvoil_New_Project\backend

# Create the virtual environment (if not already created)
python -m venv .venv

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Upgrade pip and install pinned production dependencies
python -m pip install --upgrade pip
pip install -r requirements.txt
```

#### Step 3: Configure Backend Environment Variables
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
Ensure `.env` contains:
```ini
HOST=127.0.0.1
PORT=8000
ENVIRONMENT=development
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
MAX_FILE_SIZE_MB=10
CONCURRENCY_LIMIT=4
LOG_LEVEL=INFO
RECOGNITION_DEVICE=cpu
AUTO_DOWNLOAD_MODELS=false
```

#### Step 4: Set Up Frontend Environment
In a second PowerShell terminal at the repository root:
```powershell
cd D:\Walvoil_New_Project

# Install frontend dependencies
npm install

# Copy environment configuration
Copy-Item .env.example .env
```
Ensure root `.env` specifies:
```ini
VITE_API_URL=http://localhost:8000
```

### 2.3 Starting Services Locally

```powershell
# Terminal 1: Launch Backend API
cd D:\Walvoil_New_Project\backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2: Launch Frontend Web UI
cd D:\Walvoil_New_Project
npm run dev
```

Open web browser to: **`http://localhost:5173`**  
API Documentation: **`http://127.0.0.1:8000/docs`**

### 2.4 Windows Automated Startup Script (`start_walvoil_dpr.bat`)
To enable shopfloor operators to launch both services with a single desktop shortcut, create `start_walvoil_dpr.bat` on the Desktop:

```batch
@echo off
title Walvoil DPR Digitisation System
echo Starting Walvoil DPR Backend Service...
start "Walvoil Backend" /min powershell -NoExit -Command "cd D:\Walvoil_New_Project\backend; .\.venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

echo Waiting for backend initialization...
timeout /t 3 /nobreak > nul

echo Starting Walvoil DPR Frontend Web Application...
start "Walvoil Frontend" /min powershell -NoExit -Command "cd D:\Walvoil_New_Project; npm run dev"

timeout /t 2 /nobreak > nul
start http://localhost:5173
exit
```

---

## 3. Configuration B: Future Walvoil Enterprise Server Deployment

Designed for containerised deployment on Walvoil's corporate Linux server (Ubuntu Server 22.04 LTS / RHEL 9) using Docker and Nginx.

### 3.1 Container Architecture

```
[ Walvoil Intranet Clients ]
             │ (HTTPS : 443)
             ▼
┌─────────────────────────────────────────────────────────────┐
│ Walvoil Corporate Reverse Proxy (Nginx / Caddy / Traefik)   │
│  • SSL/TLS 1.3 Termination (Company Certificate)            │
│  • Static File Serving: /dist (Vite Production Build)       │
│  • Proxy Pass: /api/* -> http://127.0.0.1:8000              │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Docker Container: walvoil-dpr-backend:1.0.0 (appuser:10001) │
│  • FastAPI Application on Port 8000                         │
│  • CPU Resource Limits: 2.0 Cores, 4096 MB RAM              │
│  • Model Weights Mount: /app/.cache (Read-Only Volume)      │
│  • Logs Mount: /app/logs (Persistent Volume)                │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Docker Deployment Instructions

#### Step 1: Build the Hardened Backend Docker Image
```bash
cd /opt/walvoil/Walvoil_New_Project
docker build -t walvoil-dpr-backend:1.0.0 ./backend
```

#### Step 2: Configure Production Environment
Copy `backend/.env.production.example` to `backend/.env`:
```bash
cp backend/.env.production.example backend/.env
```

#### Step 3: Launch with Docker Compose
```bash
docker compose up -d
```

Verify container status:
```bash
docker compose ps
docker compose logs -f walvoil-backend
```

### 3.3 Production Frontend Build & Nginx Reverse Proxy Configuration

#### Build Frontend Production Bundle:
```bash
cd /opt/walvoil/Walvoil_New_Project
# Set production backend URL for the build
export VITE_API_URL="https://dpr.walvoil.internal"
npm run build
```
The compiled static assets are output to `/opt/walvoil/Walvoil_New_Project/dist`.

#### Sample Enterprise Nginx Configuration (`/etc/nginx/sites-available/walvoil-dpr.conf`):
```nginx
server {
    listen 80;
    server_name dpr.walvoil.internal;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dpr.walvoil.internal;

    # Corporate SSL Certificates
    ssl_certificate /etc/ssl/certs/walvoil_wildcard.crt;
    ssl_certificate_key /etc/ssl/private/walvoil_wildcard.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Upload limit matching backend (10 MB + margin)
    client_max_body_size 12M;

    # 1. Serve Static Frontend Bundle
    location / {
        root /opt/walvoil/Walvoil_New_Project/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, no-transform";
    }

    # 2. Reverse Proxy to FastAPI Backend Container
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }

    # 3. System Health Proxy
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
    }
}
```

Enable configuration and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/walvoil-dpr.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 4. Troubleshooting & Maintenance

| Symptom / Error | Root Cause | Resolution |
| :--- | :--- | :--- |
| **HTTP 400 "Unsupported extension"** | File uploaded has non-image extension (e.g. `.pdf`). | DPR intake accepts `.jpg`, `.jpeg`, `.png`, and `.webp`. Convert PDF scans to JPEG or PNG before uploading. |
| **HTTP 400 "File exceeds maximum size"** | Scan resolution produced a file $>10$ MB. | Re-scan at 200–300 DPI or increase `MAX_FILE_SIZE_MB` in `.env` if authorized. |
| **HTTP 400 "Dimensions exceed maximum"** | Image resolution exceeds 8192 × 8192 px. | Enforced to prevent decompression bombs. Check camera resolution settings. |
| **HTTP 500 "Connection refused" on UI** | Backend FastAPI server is not running on port 8000. | Check PowerShell Terminal 1 or run `docker compose ps` to ensure backend service is online. |
| **Port 8000 already in use** | Another service occupies port 8000. | Update `PORT=8001` in `backend/.env` and `VITE_API_URL=http://localhost:8001` in root `.env`. |
| **CORS block in browser console** | Origin mismatch between frontend host and backend. | Add the exact frontend origin (e.g. `http://192.168.1.100:5173`) to `CORS_ORIGINS` in `backend/.env`. |

