import catalog from './data/location-photos.json'

export type PhotoPlace = {
  id: string
  name: string
  building?: string | null
  building_code?: string | null
  photo_url?: string | null
  source_url?: string | null
}
export type LocationPhoto = {
  src: string
  caption: string
  alt: string
  source: string
  author: string
  license: string
  licenseUrl: string
  framing: 'spot' | 'building'
  position?: string
}
const photos = catalog.photos as Record<string, LocationPhoto>
const assignments = catalog.assignments as Record<string, string>
const buildings = catalog.buildings as Record<string, string>
export function locationPhoto(place: PhotoPlace): LocationPhoto | undefined {
  if (place.photo_url?.startsWith('https://'))
    return {
      src: place.photo_url,
      alt: place.name,
      caption: place.name,
      source: place.source_url ?? place.photo_url,
      author: 'Team-provided photo',
      license: 'Source',
      licenseUrl: place.source_url ?? place.photo_url,
      framing: 'spot',
    }
  const id = place.id.replace(/^demo-/, '')
  const key = assignments[id] ?? buildings[place.building_code ?? '']
  return photos[key]
}
