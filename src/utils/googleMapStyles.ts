/**
 * Bespoke Google Maps visual style matched to Vesper's Twilight Editorial palette:
 * crisp warm-ivory editorial minimalism with soft sage parks and muted slate water.
 */
const TWILIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f3efe6' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#445063' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#faf8f3' }, { weight: 3 }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#dce6d8' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4d6b53' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fbfaf6' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e6dccb' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d4c5ad' }] },
  { featureType: 'transit.station', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#c8dce8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5c7a8c' }] },
];

export function getGoogleMapStyles(): google.maps.MapTypeStyle[] {
  return TWILIGHT_STYLE;
}
