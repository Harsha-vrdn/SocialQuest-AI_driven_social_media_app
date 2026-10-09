import * as Location from 'expo-location';

export async function locateHostVenue() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('Location access is off. Enter the venue below, or enable location and try again.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const position = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.Balanced});
        const {latitude, longitude} = position.coords;
        // Coordinates remain useful when the device's geocoder is unavailable.
        const places = await Location.reverseGeocodeAsync({latitude, longitude}).catch(() => []);
        const place = places[0];
        const parts = [place?.name, place?.district, place?.city, place?.region].filter((part): part is string => !!part);
        const name = [...new Set(parts)].slice(0, 3).join(', ');
        return {latitude, longitude, location_name: (name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`).slice(0, 160)};
      })(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Location took too long. Enter a venue or try again.')), 15000); }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}
