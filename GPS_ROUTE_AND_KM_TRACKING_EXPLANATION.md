# Mobile GPS Tracking: Route & KM Calculation Issue Analysis

This document provides a comprehensive technical and operational breakdown of why the GPS route appears as a straight line across sections of the map and why the cumulative kilometer (KM) calculation deviates from the actual vehicle odometer distance when engineers use the mobile application.

---

## 1. Visual Incident Summary (Screenshot Breakdown)

* **Job:** #JOB-1018 (SHARP LIQTECH, Foundry Division, Coimbatore)
* **Engineer:** Sreelal
* **Start Point (Green Flag 🚩):** Podanur / DMart area
* **End Point (Checkered Flag 🏁):** Kalapatti / Neelambur area
* **Displayed Metric:** `GPS Route: 17.9 KM • 146 Checkpoints`

### What Appears on the Map:
1. **Podanur to Peelamedu:** The blue trajectory follows the curves of real streets and turns faithfully. Around 145 periodic GPS checkpoints were logged while the engineer was traveling and the phone was active.
2. **Peelamedu to Kalapatti:** The route abruptly transitions into a **single, straight diagonal vector** cutting directly across city blocks, open land, and buildings directly to the destination.

---

## 2. Root Cause Analysis

### A. Mobile Operating System Background Sleep & Doze Mode (The Checkpoint Gap)
* **What happened:** 
  - The engineer started the trip with the phone active.
  - Midway through the ride (around Peelamedu), the engineer locked the phone screen, placed the device into a pocket, switched to Google Maps for turn-by-turn navigation, or took a phone call.
* **Operating System Behavior:**
  - Modern mobile operating systems (Android & iOS) aggressively enforce battery saving policies (such as Android Doze Mode).
  - When the screen is turned off or the browser/app is moved to the background without an active foreground service:
    - JavaScript execution and timers are suspended or heavily throttled.
    - The HTML5 Geolocation API (`navigator.geolocation.watchPosition`) stops receiving real-time GPS updates from hardware satellites.
    - WebSockets and background HTTP network syncs are paused.
* **The Resulting Gap:**
  - Between Peelamedu and Kalapatti (a 7–10 km driving stretch), **zero intermediate checkpoints were recorded**.
  - Upon arrival at the client site in Kalapatti, the engineer unlocked the phone and tapped **"In Client Place" (Reached)**.
  - The application immediately woke up, requested current coordinates, and recorded checkpoint #146 at Kalapatti.
  - Because there was no data between checkpoint #145 and checkpoint #146, the map renderer drew a straight point-to-point line between them.

---

### B. Map-Matching API Breakdown on Sparse Points
* The system utilizes the **OSRM Match API** (`/match/v1/driving/`) to snap raw GPS breadcrumbs to underlying OpenStreetMap roadways.
* The Match API functions within a localized search radius (typically 30–50 meters) to associate sequential pings with street segments.
* When a sudden multi-kilometer gap occurs with no intermediate points:
  - The algorithm cannot bridge the gap with map matching.
  - It treats the trajectory as split segments or falls back to raw polyline connection, resulting in a direct straight line between the two disconnected clusters.

---

### C. Distance (KM) Calculation Discrepancy
* **Straight-Line Displacement vs. Actual Road Distance:**
  - In urban and suburban geography, real road travel involves roundabouts, turns, flyovers, and detours. Road distance is typically **20% to 40% longer** than the straight-line displacement ("as-the-crow-flies").
  - Because the device did not record the twists and turns between Peelamedu and Kalapatti, the odometer algorithm only accounted for the straight Euclidean distance across that gap.
  - Consequently, the total calculated KM was noticeably lower than what the motorcycle or car odometer actually registered.

---

### D. Missing Props in Admin Tracking View (`AdminTracking.tsx`)
* In `src/pages/admin/AdminTracking.tsx`, `<LiveTrackingMap />` was rendered without explicitly passing:
  - `totalKm={selectedFleetItem?.activeJob?.total_km}`
  - `reachedLocation={...}`
* As a result, the admin map fell back entirely to client-side recalculation over the sparse logs rather than utilizing the finalized road distance stored on the job record.

---

## 3. Recommended Remediation Plan

### 1. Intelligent Route "Gap-Stitching" (Code-Level Fix)
In `LiveTrackingMap.tsx` and `src/lib/distance.ts`:
* Detect whenever the distance between two consecutive GPS checkpoints exceeds a threshold (e.g., **> 400 meters**).
* For any detected gap, query the **OSRM Road Driving Route API** (`/route/v1/driving/start;end`) between those two coordinates.
* Splice the resulting road polyline into the trajectory and incorporate the actual road driving distance into the total KM sum.
* **Outcome:** Even if the phone sleeps for 10 kilometers, the map will render the highway/street route and reflect accurate road kilometers instead of a straight diagonal line.

### 2. Admin Tracking View Synchronization
In `src/pages/admin/AdminTracking.tsx`:
* Pass `totalKm` and `reachedLocation` directly to `<LiveTrackingMap />` from `activeJob`.
* Ensure that once a job is marked as "Reached" or "In Progress", the admin view displays the finalized odometer value computed at arrival.

### 3. Engineer Device Configuration & Operational Guidelines
To ensure uninterrupted background GPS logging on mobile devices:
1. **Battery Optimization Settings (Crucial for Android):**
   - Navigate to: **Settings → Apps → Chrome (or the installed ICS App) → Battery**.
   - Change setting from **"Optimized"** to **"Unrestricted"** (or "Don't Optimize").
2. **Location Permission:**
   - Set Location permission to **"Allow all the time"** with **"Use precise location"** enabled.
3. **PWA / Browser Screen State:**
   - If using the web application via Chrome, keeping the screen on using a handlebar phone mount or utilizing the native Android Capacitor build with an ongoing foreground service notification will maintain a continuous GPS stream.
