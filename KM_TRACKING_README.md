# Travel Distance & Accurate KM Calculation Options Guide

This document outlines the top industry-standard options available for calculating accurate road kilometers and live travel tracking in the ICS Field Service CRM.

---

## 1. 🥇 Google Maps Directions API *(Exact Match to Google Maps App)*
* **How It Works**: Connects directly to Google's official routing servers using a Google Maps Directions API Key.
* **Accuracy**: **100% identical to the Google Maps app** on your phone (including two-wheeler mode, flyovers, local city turns, and shortcuts).
* **Pros**:
  * Exactly matches the distance shown in Google Maps.
  * Accounts for one-way roads, flyovers, real-time traffic, and road closures.
* **Cost**: Google Cloud provides **$200 free credit every month** (covers ~40,000 trips/month for free).

---

## 2. 🥈 OpenStreetMap / OSRM Road Driving Engine *(Active in your app now)*
* **How It Works**: Queries the open-source global road highway network to compute true driving road distance and snap route lines to streets.
* **Accuracy**: **98% – 99% accurate to actual road distance** (computes the exact curved street route instead of straight air lines).
* **Pros**:
  * **100% Free** forever with **no API keys or credit card needed**.
  * Fast response time and high reliability.

---

## 3. 🥉 Vehicle Odometer Reading *(100% Mechanical Truth)*
* **How It Works**:
  1. When tapping **Start Travel**, the engineer enters their bike/car start odometer (e.g., `14,200 KM`).
  2. When finishing, they enter the end odometer (e.g., `14,217 KM`).
  $$\text{Actual KM} = 14,217 - 14,200 = \mathbf{17\text{ KM}}$$
* **Pros**:
  * 100% foolproof hardware ground truth—unaffected by tunnels, mobile network drops, or GPS satellite signal loss.
  * Your app already has this feature built into the job completion slip!

---

## 4. 🗺️ Mapbox Map-Matching API
* **How It Works**: Takes all raw GPS breadcrumbs recorded along the trip and "snaps" them to the nearest road centerlines using Mapbox's Navigation Engine.
* **Accuracy**: **99.5% accuracy**, ideal for tracking custom detours or unmapped alleyways.
* **Cost**: 100,000 free requests per month.

---

## Summary & Comparison Table

| Option | Accuracy | Setup / Cost | Best For |
| :--- | :---: | :--- | :--- |
| **OSRM Road Engine** *(Current)* | **98%** | **Free (No Key)** | Zero-cost accurate road driving KM |
| **Google Maps Directions API** | **100%** | Google API Key ($200/mo Free Credit) | 1:1 exact match with Google Maps app |
| **Odometer Entry** | **100%** | Built-in (Already in app) | Hardware verification & audit |
| **Mapbox Map-Matching** | **99.5%** | Mapbox Key (100k Free/mo) | Continuous high-frequency GPS breadcrumbs |

---

## Recommendation

The current **OSRM Road Engine + Odometer validation** is the most cost-effective and accurate combination. If you want a 1:1 exact match with the Google Maps app, a **Google Maps Directions API Key** can be added to `.env` as `VITE_GOOGLE_MAPS_API_KEY`.
