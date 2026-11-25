/**
 * Landing page inspiration catalog for the Horizon postcard ribbon and mood filter tabs.
 * Separated from `LandingView` so the homepage can eventually load dynamic trending
 * destinations from a backend endpoint without touching UI code.
 */

export type MoodCategory =
  | 'Anywhere'
  | 'Cities'
  | 'Beaches'
  | 'Mountains & Nature'
  | 'Road Trips'
  | 'Family'
  | 'Hidden Gems';

export interface PostcardDestination {
  id: string;
  name: string;
  country: string;
  tag: string;
  moods: MoodCategory[];
  wide?: boolean;
  image: string;
  prompt: string;
}

export const DEMO_VOICE_PROMPT =
  'Hey, Vesper, plan a trip to Mexico City for a weekend on June 18th';

export const ROTATING_PLACEHOLDERS = [
  'Hey, Vesper, plan a trip to Mexico City for a weekend on June 18th',
  '5-day family road trip through Banff & Lake Louise in July',
  'Solo street food & temple week in Tokyo on a comfortable budget',
  'Relaxed coastal beach & wine getaway on the Amalfi Coast',
  '4-day hidden gems & desert art weekend in Santa Fe',
];

export const MOOD_TABS: { id: MoodCategory; samplePrompt?: string }[] = [
  { id: 'Anywhere' },
  {
    id: 'Cities',
    samplePrompt: 'Long weekend of architecture, museums & iconic dining in Mexico City',
  },
  {
    id: 'Beaches',
    samplePrompt: '4-day laid-back surf, sunsets & mezcal getaway in Puerto Escondido',
  },
  {
    id: 'Mountains & Nature',
    samplePrompt: '5-day glacier lakes, scenic hikes & cozy lodges in Reykjavík & South Coast',
  },
  {
    id: 'Road Trips',
    samplePrompt: '6-day scenic coastal road trip through Big Sur with oceanfront stops',
  },
  {
    id: 'Family',
    samplePrompt: '5-day family-friendly adventure in Quebec City with easy pacing',
  },
  {
    id: 'Hidden Gems',
    samplePrompt: '4-day artisan markets, mole & courtyard stays in Oaxaca',
  },
];

export const ROW_1_POSTCARDS: PostcardDestination[] = [
  {
    id: 'mexico-city',
    name: 'Mexico City',
    country: 'Mexico',
    tag: 'Culture & Food',
    moods: ['Cities'],
    wide: true,
    image:
      'https://images.unsplash.com/photo-1585464231875-d9ef1f5ad396?auto=format&fit=crop&w=700&q=80',
    prompt: DEMO_VOICE_PROMPT,
  },
  {
    id: 'big-sur',
    name: 'Big Sur',
    country: 'California',
    tag: 'Road Trip',
    moods: ['Road Trips', 'Mountains & Nature'],
    image:
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day coastal road trip along Big Sur and Carmel',
  },
  {
    id: 'puerto-escondido',
    name: 'Puerto Escondido',
    country: 'Mexico',
    tag: 'Beach & Surf',
    moods: ['Beaches', 'Hidden Gems'],
    image:
      'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a relaxed 4-day beach and surf escape to Puerto Escondido',
  },
  {
    id: 'tokyo',
    name: 'Tokyo',
    country: 'Japan',
    tag: 'Solo & Food',
    moods: ['Cities'],
    wide: true,
    image:
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 5-day solo food and neighborhood trip to Tokyo',
  },
  {
    id: 'reykjavik',
    name: 'Reykjavík',
    country: 'Iceland',
    tag: 'Nature & Drive',
    moods: ['Mountains & Nature', 'Road Trips', 'Family'],
    image:
      'https://images.unsplash.com/photo-1504829857797-ddff29c27927?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 5-day ring road nature trip starting in Reykjavík',
  },
  {
    id: 'oaxaca',
    name: 'Oaxaca',
    country: 'Mexico',
    tag: 'Hidden Gem',
    moods: ['Hidden Gems', 'Cities'],
    image:
      'https://images.unsplash.com/photo-1518105779142-d975f22f1b0a?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day culinary and artisan craft trip to Oaxaca',
  },
  {
    id: 'amalfi',
    name: 'Amalfi Coast',
    country: 'Italy',
    tag: 'Coastal Drive',
    moods: ['Beaches', 'Road Trips'],
    wide: true,
    image:
      'https://images.unsplash.com/photo-1533587851505-d119e13fa0d7?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 5-day coastal road trip along the Amalfi Coast',
  },
  {
    id: 'charleston',
    name: 'Charleston',
    country: 'South Carolina',
    tag: 'Family Weekend',
    moods: ['Family', 'Cities', 'Hidden Gems'],
    image:
      'https://images.unsplash.com/photo-1569389397653-c04fe624e663?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 3-day historic family weekend in Charleston',
  },
  {
    id: 'cape-town',
    name: 'Cape Town',
    country: 'South Africa',
    tag: 'Peaks & Coast',
    moods: ['Mountains & Nature', 'Beaches', 'Road Trips'],
    image:
      'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 6-day mountains, coastline & winelands trip to Cape Town',
  },
];

export const ROW_2_POSTCARDS: PostcardDestination[] = [
  {
    id: 'kyoto',
    name: 'Kyoto',
    country: 'Japan',
    tag: 'Calm & Culture',
    moods: ['Cities', 'Hidden Gems'],
    image:
      'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day gardens, tea & architecture trip to Kyoto',
  },
  {
    id: 'bali',
    name: 'Bali',
    country: 'Indonesia',
    tag: 'Beach & Wellness',
    moods: ['Beaches', 'Mountains & Nature', 'Family'],
    wide: true,
    image:
      'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 7-day beach, rice terraces & wellness trip to Bali',
  },
  {
    id: 'san-sebastian',
    name: 'San Sebastián',
    country: 'Spain',
    tag: 'Food & Bay',
    moods: ['Beaches', 'Cities', 'Hidden Gems'],
    image:
      'https://images.unsplash.com/photo-1558642084-fd07fae5282e?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 3-day pintxos and bay weekend in San Sebastián',
  },
  {
    id: 'quebec',
    name: 'Quebec City',
    country: 'Canada',
    tag: 'Family Classic',
    moods: ['Family', 'Cities'],
    image:
      'https://images.unsplash.com/photo-1519178614-68673b201f36?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day walkable family trip to Old Quebec City',
  },
  {
    id: 'santa-fe',
    name: 'Santa Fe',
    country: 'New Mexico',
    tag: 'Desert & Art',
    moods: ['Road Trips', 'Hidden Gems', 'Mountains & Nature'],
    wide: true,
    image:
      'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day desert road trip and art weekend in Santa Fe',
  },
  {
    id: 'marrakesh',
    name: 'Marrakesh',
    country: 'Morocco',
    tag: 'Riads & Markets',
    moods: ['Hidden Gems', 'Cities'],
    image:
      'https://images.unsplash.com/photo-1597212618440-806262de4f6b?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day riad, souks & Atlas Mountains trip to Marrakesh',
  },
  {
    id: 'tofino',
    name: 'Tofino',
    country: 'Canada',
    tag: 'Wild Coast',
    moods: ['Beaches', 'Mountains & Nature', 'Family', 'Road Trips'],
    image:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day family cabin and wild-coast trip to Tofino',
  },
  {
    id: 'seoul',
    name: 'Seoul',
    country: 'South Korea',
    tag: 'City & Design',
    moods: ['Cities'],
    wide: true,
    image:
      'https://images.unsplash.com/photo-1538485399081-7191377e8241?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 5-day food, cafés and modern design trip to Seoul',
  },
  {
    id: 'santorini',
    name: 'Santorini',
    country: 'Greece',
    tag: 'Island Escape',
    moods: ['Beaches'],
    image:
      'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=700&q=80',
    prompt: 'Hey, Vesper, plan a 4-day sunset and sailing escape in Santorini',
  },
];

export const ALL_POSTCARDS: PostcardDestination[] = [...ROW_1_POSTCARDS, ...ROW_2_POSTCARDS];
