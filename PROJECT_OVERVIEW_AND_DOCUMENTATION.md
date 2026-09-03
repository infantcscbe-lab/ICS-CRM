# ICS Service Manager — Comprehensive Platform Documentation

## Executive Overview
**ICS Service Manager (ICS CRM)** is an enterprise-grade, cloud-based **Field Service Management & Fleet Dispatch CRM** designed to streamline field operations, engineer dispatching, attendance tracking, and customer service delivery. 

It bridges the gap between central operations dispatchers, on-field service engineers, and corporate clients through real-time communication, automated GPS road tracking, and digital service workflow automation.

---

## 1. Target Audience: Who is this platform useful for?

The platform provides dedicated role-based portals for three primary stakeholders:

```
                  ┌─────────────────────────────────────┐
                  │        ICS SERVICE MANAGER          │
                  └──────────────────┬──────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   ADMIN / TEAM   │       │  FIELD SERVICE   │       │    CORPORATE     │
│   COORDINATOR    │       │    ENGINEERS     │       │ CLIENTS / USERS  │
└──────────────────┘       └──────────────────┘       └──────────────────┘
│ Live Fleet Dispatch      │ Mobile App / PWA         │ Self-Service Web 
│ Workforce Attendance     │ Punch-In / Punch-Out     │ Book Service Calls
│ Service Job Allocation   │ GPS Road Tracking        │ Track Visiting Eng.
│ Billing & Part Reports   │ Job Diagnosis & Parts    │ View Service History
│ Revenue & KPI Analytics  │ Digital Sign-Off Slip    │ Download PDF Slips
```

### A. Operations Managers & System Administrators (Admin Portal)
- **Central Dispatchers**: Assign emergency breakdown and preventive maintenance calls to the nearest available engineer based on live GPS location and status.
- **Service Supervisors**: Monitor field progress, inspect photos taken before/after repair, approve vendor parts, and track turnaround time (TAT).
- **HR & Payroll Managers**: Review geofenced attendance records, shift compliance, punch-in/out timestamps, overtime, travel allowance claims, and approve leaves.
- **Accounts & Executives**: Analyze collected payments (Cash, UPI, Cheque, Credit, Warranty), generated inspection charges, part replacements, and export executive PDF reports.

### B. Field Service Engineers & Technicians (Engineer Portal)
- **Daily Shift Tracking**: Punch-in and punch-out with GPS location detection and shift validation directly from their smartphone.
- **Job Navigation**: Receive job assignments, view client address, contact phone numbers, machine issues, and initiate turn-by-turn navigation.
- **Uber/Swiggy-Grade Live Tracking**: Real-time road navigation tracking with screen-off and pocket keepalive support, logging true kilometers traveled for accurate conveyance claims.
- **Digital Job Execution**: Log diagnosis, replacement parts, earth checking, inspection charges, upload machine photos, and collect client digital sign-offs.

### C. Corporate Clients & Direct Customers (Client / Customer Portal)
- **Self-Service Booking**: Log service breakdown calls, select equipment, specify symptoms, and upload failure photos.
- **Live Engineer Arrival Tracking**: See which technician is assigned, their phone contact, and track when they are en route to the site.
- **Transparency & Invoicing**: Review full service history, download signed ICS call slips in PDF, and check warranty status.

---

## 2. Core Functionalities & Key Features

### 🗺️ Live GPS Fleet Tracking & Dispatch (`/admin/tracking`)
- **Real-Time Fleet Overview**: Interactive map displaying all registered engineers with live status pills (`On Duty`, `In Transit`, `At Client Place`, `Standing By`).
- **Immediate Punch-In Tracking**: Background GPS tracking begins the moment an engineer punches in, broadcasting live location updates to the dispatcher even if no job has started yet.
- **Smart Map-Matched Breadcrumbs**: Uses high-precision GPS tracking and OSRM (Open Source Routing Machine) map matching to draw the exact roads traveled rather than straight lines.
- **Stationary Drift & Teleport Filtering**: Advanced filters eliminate false GPS jitter while stopped at traffic signals or inside buildings, ensuring the odometer distance matches reality.
- **Quick Dispatch Actions**: One-click direct phone calling, location focus, and Google Maps cross-navigation.

### 📱 Screen-Off & Background Travel Engine (Mobile PWA)
- **Silent Audio Keepalive Engine**: Mobile OSes (Android & iOS) freeze browser tabs when the screen locks. ICS CRM uses an inaudible audio loop session, prompting Android/iOS to treat the tab like an active media player (e.g. Spotify), keeping the JS runtime and GPS hardware active while the phone is locked in the engineer's pocket.
- **Lock Screen MediaSession Status**: Displays live tracking status directly on the locked phone's lock screen (`ICS Job #... Live Tracking Active`).
- **Web Worker Heartbeat**: Independent thread ticks every 5 seconds to ensure position checks continue if main DOM timers are throttled.
- **PWA Installation**: Installable as a standalone native-like application on Android and iOS home screens.
- **Instant State Recovery**: If the device restarts or browser closes, all kilometers and waypoints cached in `localStorage` and Supabase instantly resume without data loss.

### ⏱️ Duty Attendance & Workforce Management (`/admin/attendance`, `/engineer/attendance`)
- **Geofenced Punch-In & Punch-Out**: Records exact GPS coordinates and human-readable physical addresses at check-in.
- **Shift & Policy Compliance**: Auto-calculates late arrival based on configurable grace periods (e.g. 09:00 AM shift with 15-minute grace).
- **Overtime & Work Hours**: Tracks total working minutes, break periods, and overtime hours.
- **Leave Management & Regularization**: Engineers can submit leave requests (Casual, Sick, Half-day, Regularization); admins approve or reject with remark logs.
- **Conveyance & Allowance Claims**: Auto-calculates daily travel allowance based on verified GPS trip kilometers.

### 🛠️ End-to-End Service Job Workflow (`/admin/jobs`, `/engineer/jobs/:id`)
- **Job Status Pipeline**:
  `Assigned` ➔ `Traveling (En Route)` ➔ `Reached (At Site)` ➔ `In Progress` ➔ `Solved / Completed` (or `Vendor / Call Back`).
- **Physical Call Report Slip Digitalization**: Replaces paper service slips with digital inputs:
  - Call Type (`Warranty`, `ASC`, `Repeated`, `Per Call`)
  - Safety Checks (`Earth Checking: Yes/No`, `Physical Damage: Yes/No`)
  - Costing Breakdown (`Inspection Charge`, `Part Charge`, `Service Charge`)
  - Payment Details (`Cash`, `Cheque`, `Online/UPI`, `Credit`, `Amount Received: Yes/No`)
- **Photo Evidence**: Before, During, and After repair photo uploads stored securely in cloud buckets.
- **Digital Signatures & PDF Export**: Client and engineer sign directly on screen; instantly generates an official branded ICS Service Call Slip PDF.

### 🏢 Client & Equipment Management (`/admin/clients`)
- Complete client registry with company names, client codes, primary contacts, addresses, and geocoded GPS pins.
- History of all past service jobs and recurring machine breakdowns linked to each client profile.

### 🔄 Vendor & Component Escalation (`/admin/vendors`)
- Track equipment or motherboards sent out to third-party hardware repair vendors.
- Vendor contact logs, estimated completion dates, vendor notes, and return status tracking.

### 📊 Business Intelligence & Executive Reports (`/admin/reports`)
- **Revenue Analytics**: Total billed service revenue, parts sales, inspection fees, and unpaid credit balances.
- **Workforce Productivity**: Top-performing engineers, average repair completion time, and first-time fix rates.
- **Travel Cost Control**: Accurate kilometer audit comparing engineer odometer claims against true GPS road distance.

---

## 3. How the Website is Running (Technical Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CLIENT TIER                            │
│  React 18  •  TypeScript  •  Tailwind CSS  •  Vite  •  Leaflet.js      │
│  PWA Service Worker  •  Background Keepalive Engine  •  Lucide Icons  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / WSS (WebSockets)
┌───────────────────────────────────▼────────────────────────────────────┐
│                        BACKEND & DATA TIER                             │
│                           (SUPABASE)                                   │
│  ┌────────────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   PostgreSQL Engine    │  │ Supabase Auth   │  │ Realtime Engine │  │
│  │   Row-Level Security   │  │ JWT Tokens      │  │ WebSockets Pub/ │  │
│  │   (RLS Policies)       │  │ Role Enums      │  │ Sub Broadcast   │  │
│  └────────────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Storage Buckets: Job Photos, Machine Slips, Signed Invoices     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API
┌───────────────────────────────────▼────────────────────────────────────┐
│                    EXTERNAL MAPPING & ROUTING APIS                     │
│  • OpenStreetMap Tile Server (Base Maps)                               │
│  • OSRM (Open Source Routing Machine) — Road Map Matching              │
│  • Nominatim Geocoding API — Reverse GPS to Address                    │
└────────────────────────────────────────────────────────────────────────┘
```

### Technical Stack Details
| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **User Interface** | React 18 & TypeScript | Type-safe, component-driven reactive web application |
| **Styling & Design** | Tailwind CSS & Lucide Icons | Responsive modern design system tailored for mobile & desktop |
| **Map Rendering** | Leaflet.js & React-Leaflet | Lightweight hardware-accelerated interactive maps |
| **Road Map Matching** | OSRM Driving Match API | Snaps raw GPS points to true road centerlines |
| **Database & Auth** | Supabase (PostgreSQL 15) | Relational data integrity, schema validations, and JWT session handling |
| **Realtime Sync** | Supabase Realtime (WebSockets) | Sub-second updates for live vehicle movement and call alerts |
| **Security Layer** | Row-Level Security (RLS) | Restricts engineers to their own data while granting admins full visibility |
| **Mobile Integration** | Service Worker + Web Manifest | Standalone mobile PWA installation with offline caching |
| **Keepalive Engine** | HTMLAudioElement + MediaSession | Prevents mobile OS battery saver from stopping GPS when screen is locked |
| **PDF Generation** | html2canvas & jsPDF | Client-side export of branded, print-ready ICS Service Slips |

---

## 4. User Access & Roles Summary

| Role | Access Level | Primary Activities |
| :--- | :--- | :--- |
| **Admin** | Full Platform Access | Dispatch management, live fleet map, HR attendance, reports, billing, user creation |
| **Engineer** | Assigned Field Tools | Mobile attendance check-in, job workflow execution, live GPS tracking, call report slips |
| **Client** | Self-Service Portal | Booking breakdown requests, tracking assigned engineer arrival, viewing signed slips |

---

## 5. Security & Data Integrity Highlights
- **Strict Role Isolation**: Managed via Postgres RLS policies and JWT claims.
- **Tamper-Proof Geolocation**: All GPS coordinates include hardware accuracy metrics ($\pm\text{meters}$), speed, and timestamps.
- **Stationary Drift Mitigation**: Prevents GPS drift from falsely inflating kilometers while a technician is parked or inside a building.
- **Fail-Safe Data Caching**: Offline `localStorage` mirroring ensures network drops in rural basements do not lose active job inputs.
