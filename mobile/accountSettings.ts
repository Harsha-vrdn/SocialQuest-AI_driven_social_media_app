export type AccountSettings = {
  location_mode: 'CURRENT' | 'SAVED'; saved_city: string;
  saved_latitude: number | null; saved_longitude: number | null;
  account_state: 'ACTIVE' | 'DEACTIVATED' | 'PENDING_DELETION'; deletion_due_at: string | null;
};
export type LocationPreference = Pick<AccountSettings, 'location_mode' | 'saved_city' | 'saved_latitude' | 'saved_longitude'>;
export type SavedCity = {name: string; latitude: number | null; longitude: number | null};

// Offline suggestions; any other city can be entered without a third-party search.
const cities: SavedCity[] = [
  {name: 'Bengaluru, India', latitude: 12.9716, longitude: 77.5946},
  {name: 'Mumbai, India', latitude: 19.076, longitude: 72.8777},
  {name: 'Delhi, India', latitude: 28.6139, longitude: 77.209},
  {name: 'Hyderabad, India', latitude: 17.385, longitude: 78.4867},
  {name: 'Chennai, India', latitude: 13.0827, longitude: 80.2707},
  {name: 'Pune, India', latitude: 18.5204, longitude: 73.8567},
  {name: 'Kolkata, India', latitude: 22.5726, longitude: 88.3639},
  {name: 'Ahmedabad, India', latitude: 23.0225, longitude: 72.5714},
  {name: 'Jaipur, India', latitude: 26.9124, longitude: 75.7873},
  {name: 'Kochi, India', latitude: 9.9312, longitude: 76.2673},
  {name: 'Singapore', latitude: 1.3521, longitude: 103.8198},
  {name: 'Dubai, United Arab Emirates', latitude: 25.2048, longitude: 55.2708},
  {name: 'London, United Kingdom', latitude: 51.5074, longitude: -0.1278},
  {name: 'New York, United States', latitude: 40.7128, longitude: -74.006},
  {name: 'San Francisco, United States', latitude: 37.7749, longitude: -122.4194},
  {name: 'Sydney, Australia', latitude: -33.8688, longitude: 151.2093},
];
export function citySuggestions(query: string, profileCity = '') {
  const text = query.trim().toLowerCase();
  const options = [...cities];
  if (profileCity.trim() && !options.some(city => city.name.toLowerCase() === profileCity.trim().toLowerCase())) {
    options.unshift({name: profileCity.trim(), latitude: null, longitude: null});
  }
  return options.filter(city => city.name.toLowerCase().includes(text)).slice(0, 6);
}

export async function nearbyEventsPath(preference: LocationPreference, currentLocation: () => Promise<{latitude: number; longitude: number}>) {
  if (preference.location_mode === 'SAVED') return '/events/recommended/'; // Server applies the saved city/coordinates.
  const position = await currentLocation();
  return '/events/recommended/?latitude=' + position.latitude.toFixed(6) + '&longitude=' + position.longitude.toFixed(6);
}
