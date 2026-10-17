import { useCallback, useEffect, useState } from 'react';
import type { ReportMedia } from './types';

export interface MediaOptions {
  /** `<img>`/`<video>` не загрузились (например, протухла presigned-ссылка). */
  onMediaError?: (media: ReportMedia) => void;
  /** Показать в лайтбоксе ссылку «Открыть оригинал» в новой вкладке. */
  openOriginal?: boolean;
}

interface MediaGalleryProps extends MediaOptions {
  media: ReportMedia[];
}

export function MediaGallery({ media, onMediaError, openOriginal }: MediaGalleryProps) {
  const sorted = [...media].sort((a, b) => a.orderNo - b.orderNo);
  const photos = sorted.filter((m) => m.kind === 'PHOTO');
  const videos = sorted.filter((m) => m.kind === 'VIDEO');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-2">
      {videos.map((video) => (
        <video
          key={video.id}
          src={video.url}
          controls
          playsInline
          preload="metadata"
          onError={onMediaError && (() => onMediaError(video))}
          className="aspect-video w-full rounded-xl bg-black"
        />
      ))}
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-1.5">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button type="button" onClick={() => setOpenIndex(index)} className="block aspect-square w-full overflow-hidden rounded-lg bg-canvas">
                <img src={photo.url} alt="" loading="lazy" onError={onMediaError && (() => onMediaError(photo))} className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {openIndex !== null && <Lightbox photos={photos} index={openIndex} onChange={setOpenIndex} onMediaError={onMediaError} openOriginal={openOriginal} />}
    </div>
  );
}

interface LightboxProps extends MediaOptions {
  photos: ReportMedia[];
  index: number;
  onChange: (index: number | null) => void;
}

function Lightbox({ photos, index, onChange, onMediaError, openOriginal }: LightboxProps) {
  const photo = photos[index];
  const go = useCallback((delta: number) => onChange((index + delta + photos.length) % photos.length), [index, photos.length, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChange(null);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [go, onChange]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between p-3 text-sm text-white/80">
        <span>
          {index + 1} / {photos.length}
        </span>
        <span className="flex items-center gap-2">
          {openOriginal && (
            <a href={photo.url} target="_blank" rel="noopener noreferrer" className="rounded-full px-3 py-1 text-white underline underline-offset-4">
              Открыть оригинал
            </a>
          )}
          <button type="button" onClick={() => onChange(null)} className="rounded-full px-3 py-1 text-white" aria-label="Закрыть">
            ✕
          </button>
        </span>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <img src={photo.url} alt="" onError={onMediaError && (() => onMediaError(photo))} className="max-h-full max-w-full object-contain" />
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="absolute inset-y-0 left-0 w-1/3" aria-label="Предыдущее фото" />
            <button type="button" onClick={() => go(1)} className="absolute inset-y-0 right-0 w-1/3" aria-label="Следующее фото" />
          </>
        )}
      </div>
    </div>
  );
}
