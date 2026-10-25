/** Reused from dsh ui-primitives/ImageLightbox; only icon, CSS scope and shadow focus are adapted. */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {Icon} from './Icon'
import styles from './ImageLightbox.css'
const css={backdrop:'suedama-image-backdrop',stage:'suedama-image-stage',mask:'suedama-image-mask',image:'suedama-image-original',close:'suedama-image-close'}

/** Lightbox strings the owner resolves from its own locale namespace. */
export interface ImageLightboxLabels {
  /** Accessible name of the preview dialog. */
  dialog: string
  /** Accessible label of the close control. */
  close: string
}

/**
 * Document-level original-image preview opened by clicking a thumbnail.
 * Closes on Escape, backdrop press, or the close control, and restores focus
 * to the opener on unmount. Rendered through a body portal: an opener inside
 * a transformed or filtered ancestor would otherwise trap the fixed backdrop
 * in that ancestor's box instead of covering the viewport.
 *
 * @param props.src - the original image URL.
 * @param props.alt - the image's alt text.
 * @param props.labels - dialog and close-control strings.
 * @param props.onClose - dismiss callback owned by the opener.
 * @returns the modal preview dialog.
 */
export function ImageLightbox({ src, alt, labels, onClose }: {
  src: string
  alt: string
  labels: ImageLightboxLabels
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const active=document.getElementById('suedama-deepseek-root')?.shadowRoot?.activeElement??document.activeElement
    restoreRef.current=active instanceof HTMLElement?active:null
    closeRef.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus() }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      restoreRef.current?.focus()
    }
  }, [onClose])

  return createPortal(
    <div
      data-suedama="image-lightbox" className={css.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialog}
    >
      <style>{styles}</style>
      <div className={css.stage}>
        <div className={css.mask} aria-hidden="true" onMouseDown={onClose} />
        <img className={css.image} src={src} alt={alt} />
        <button ref={closeRef} type="button" className={css.close} aria-label={labels.close} onClick={onClose}>
          <Icon name="close"/>
        </button>
      </div>
    </div>,
    document.body,
  )
}
