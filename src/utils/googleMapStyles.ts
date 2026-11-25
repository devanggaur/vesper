import { VesperTheme } from '../components/common/ThemeSwitcher';

/**
 * Bespoke Google Maps visual themes matched to Vesper's three palettes:
 * - Twilight: crisp warm-ivory editorial minimalism
 * - Nocturne: deep obsidian luxury dark mode with warm champagne labels
 * - Mediterranean (Olive): sunlit parchment roads & sage parks
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

const NOCTURNE_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#141923' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa4b8' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0e1117' }, { weight: 3 }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#e5c585' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#c8b796' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#172321' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#6b9080' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2735' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#121720' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2b3446' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1a202c' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1b2433' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1320' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4b6584' }] },
];

const MEDITERRANEAN_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f4eee2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#52493f' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#faf6ee' }, { weight: 3 }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#d7e0cb' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#466146' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#fffdf8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e8d7be' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d5bea0' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#c4d8d4' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a6b66' }] },
];

export function getGoogleMapStyles(theme: VesperTheme): google.maps.MapTypeStyle[] {
  if (theme === 'nocturne') return NOCTURNE_STYLE;
  if (theme === 'mediterranean') return MEDITERRANEAN_STYLE;
  return TWILIGHT_STYLE;
}
