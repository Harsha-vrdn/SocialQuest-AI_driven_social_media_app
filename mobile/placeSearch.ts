import {useEffect, useState} from 'react';

export type Place = {id: string; title: string; subtitle: string; label: string; latitude: number; longitude: number};

type NominatimResult = {place_id: number | string; lat: string; lon: string; display_name: string; name?: string};

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MIN_CHARS = 3;
// The public Nominatim service asks for at most one request per second.
const DEBOUNCE_MS = 800;
const TIMEOUT_MS = 8000;
const cache = new Map<string, Place[]>();

export function toPlace(row: NominatimResult, maxLength: number): Place | null {
  const latitude = Number(row.lat), longitude = Number(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !row.display_name) return null;
  const parts = row.display_name.split(', ').map(part => part.trim()).filter(Boolean);
  const title = row.name?.trim() || parts[0] || row.display_name;
  const rest = parts[0] === title ? parts.slice(1) : parts;
  return {
    id: String(row.place_id), title, subtitle: rest.slice(0, 3).join(', '),
    // Keep what gets saved short and readable: name plus the next few address parts.
    label: [title, ...rest.slice(0, 3)].join(', ').slice(0, maxLength),
    latitude, longitude,
  };
}

export async function searchPlaces(query: string, maxLength: number, signal?: AbortSignal): Promise<Place[]> {
  const url = `${ENDPOINT}?format=jsonv2&limit=5&dedupe=1&q=${encodeURIComponent(query)}`;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  const abort = () => timeout.abort();
  signal?.addEventListener('abort', abort);
  try {
    const response = await fetch(url, {signal: timeout.signal, headers: {Accept: 'application/json', 'Accept-Language': 'en'}});
    if (!response.ok) throw new Error('Place search failed.');
    const rows = await response.json() as NominatimResult[];
    const seen = new Set<string>();
    return (Array.isArray(rows) ? rows : []).map(row => toPlace(row, maxLength)).filter((place): place is Place => {
      if (!place || seen.has(place.label)) return false;
      seen.add(place.label);
      return true;
    });
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

type State = {query: string; places: Place[]; loading: boolean; failed: boolean};
const idle: State = {query: '', places: [], loading: false, failed: false};

// Debounced, cancellable search that remembers earlier answers.
export function usePlaceSuggestions(query: string, enabled: boolean, maxLength: number) {
  const [state, setState] = useState<State>(idle);
  useEffect(() => {
    const text = query.trim();
    if (!enabled || text.length < MIN_CHARS) { setState(current => current === idle ? current : idle); return; }
    const key = text.toLowerCase();
    const cached = cache.get(key);
    if (cached) { setState({query: text, places: cached, loading: false, failed: false}); return; }
    setState(current => ({...current, loading: true, failed: false}));
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(text, maxLength, controller.signal).then(places => {
        cache.set(key, places);
        if (!controller.signal.aborted) setState({query: text, places, loading: false, failed: false});
      }).catch(() => {
        if (!controller.signal.aborted) setState({query: text, places: [], loading: false, failed: true});
      });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, enabled, maxLength]);
  return state;
}

