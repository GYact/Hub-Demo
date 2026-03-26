import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import { upsertLocalRow } from "../lib/offlineStore";

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_DISTANCE_M = 200; // skip if moved less than 200m

type Coord = { lat: number; lng: number };

function haversineMeters(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&accept-language=ja`,
      { headers: { "User-Agent": "HubApp/1.0" } },
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const addr = data.address;
    if (!addr) return data.display_name?.split(",")[0];
    // Build a short name: neighbourhood/road + city
    const place =
      addr.amenity ||
      addr.building ||
      addr.neighbourhood ||
      addr.road ||
      addr.suburb;
    const city = addr.city || addr.town || addr.village || addr.county;
    if (place && city) return `${place}, ${city}`;
    return place || city || data.display_name?.split(",")[0];
  } catch {
    return undefined;
  }
}

/**
 * Periodically captures GPS position and stores to location_logs.
 * Runs every 15 min while the app is open. Deduplicates by distance.
 */
export const useLocationTracker = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const lastCoordRef = useRef<Coord | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!("geolocation" in navigator)) return;

    const capture = () => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng, accuracy } = pos.coords;

          // Skip if barely moved
          if (lastCoordRef.current) {
            const dist = haversineMeters(lastCoordRef.current, { lat, lng });
            if (dist < MIN_DISTANCE_M) return;
          }
          lastCoordRef.current = { lat, lng };

          const id = crypto.randomUUID();
          const now = new Date().toISOString();

          // Reverse geocode (best-effort, only when online)
          let name: string | undefined;
          if (isOnline) {
            name = await reverseGeocode(lat, lng);
          }

          await upsertLocalRow("location_logs", {
            id,
            user_id: user.id,
            lat,
            lng,
            accuracy: accuracy ?? null,
            name: name ?? null,
            logged_at: now,
            created_at: now,
            updated_at: now,
          });
        },
        (err) => {
          // Permission denied or unavailable — silently ignore
          if (err.code !== err.PERMISSION_DENIED) {
            console.warn("[location-tracker] geolocation error:", err.message);
          }
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      );
    };

    // Capture immediately on mount, then every INTERVAL_MS
    capture();
    intervalRef.current = setInterval(capture, INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user, isOnline]);
};
