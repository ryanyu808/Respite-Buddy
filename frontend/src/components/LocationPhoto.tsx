import { useState } from 'react'
import { Camera } from 'lucide-react'
import { locationPhoto, type PhotoPlace } from '../locationPhotos'
import '../location-cards.css'

export function LocationPhoto({ place }: { place: PhotoPlace }) {
  const photo = locationPhoto(place)
  const [failed, setFailed] = useState('')
  return (
    <figure className="location-photo">
      {photo && failed !== photo.src ? (
        <>
          <img
            src={photo.src}
            alt={photo.alt}
            loading="lazy"
            decoding="async"
            width={800}
            height={500}
            style={{ objectPosition: photo.position ?? 'center' }}
            onError={() => setFailed(photo.src)}
          />
          <figcaption>{photo.caption}</figcaption>
        </>
      ) : (
        <div className="location-photo-empty">
          <Camera size={24} aria-hidden="true" />
          <span>Photo coming soon</span>
        </div>
      )}
    </figure>
  )
}

export function PhotoCredit({ place }: { place: PhotoPlace }) {
  const photo = locationPhoto(place)
  return photo ? (
    <p className="photo-credit">
      {photo.caption}.{' '}
      {photo.framing === 'building'
        ? 'Building exterior, not the exact room or seating area. '
        : ''}
      <a href={photo.source} target="_blank" rel="noreferrer">
        Photo: {photo.author}
      </a>
      {' · '}
      <a href={photo.licenseUrl} target="_blank" rel="noreferrer">
        {photo.license}
      </a>
      . Displayed with a fitted crop. Not a live image.
    </p>
  ) : null
}
