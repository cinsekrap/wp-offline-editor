import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { Loader2, RotateCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

interface ImageCropDialogProps {
  open: boolean
  src: string
  mediaId: string
  onApply: (mediaId: string, buffer: ArrayBuffer) => Promise<void>
  onClose: () => void
}

type AspectOption = { label: string; value: number | undefined }

const ASPECT_OPTIONS: AspectOption[] = [
  { label: 'Free', value: undefined },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 }
]

async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  rotation: number
): Promise<Blob> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  const radians = (rotation * Math.PI) / 180

  // Bounding box of the rotated image
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const rotW = image.width * cos + image.height * sin
  const rotH = image.width * sin + image.height * cos

  // Draw rotated full image onto a temp canvas
  canvas.width = rotW
  canvas.height = rotH
  ctx.translate(rotW / 2, rotH / 2)
  ctx.rotate(radians)
  ctx.drawImage(image, -image.width / 2, -image.height / 2)

  // Extract the cropped area
  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height)
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height
  ctx.putImageData(data, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas toBlob failed'))
    }, 'image/png')
  })
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', (e) => reject(e))
    img.src = url
  })
}

export function ImageCropDialog({
  open,
  src,
  mediaId,
  onApply,
  onClose
}: ImageCropDialogProps): JSX.Element {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [aspect, setAspect] = useState<number | undefined>(undefined)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [applying, setApplying] = useState(false)

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  const handleApply = async (): Promise<void> => {
    if (!croppedAreaPixels) return
    setApplying(true)
    try {
      const blob = await getCroppedBlob(src, croppedAreaPixels, rotation)
      const buffer = await blob.arrayBuffer()
      await onApply(mediaId, buffer)
    } finally {
      setApplying(false)
    }
  }

  const handleRotate90 = (): void => {
    setRotation((prev) => (prev + 90) % 360)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !applying) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Image</DialogTitle>
          <DialogDescription>Crop, zoom, and rotate your image</DialogDescription>
        </DialogHeader>

        {/* Cropper area */}
        <div className="relative w-full h-[400px] bg-muted rounded-md overflow-hidden">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controls */}
        <div className="space-y-3">
          {/* Aspect ratio buttons */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16 shrink-0">Aspect</span>
            <div className="flex gap-1">
              {ASPECT_OPTIONS.map((opt) => (
                <Button
                  key={opt.label}
                  variant={aspect === opt.value ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs px-3"
                  onClick={() => setAspect(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16 shrink-0">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-1.5 accent-primary"
            />
            <span className="text-xs text-muted-foreground w-10 text-right">{zoom.toFixed(1)}x</span>
          </div>

          {/* Rotation slider + 90-degree button */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-16 shrink-0">Rotate</span>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={rotation}
              onChange={(e) => setRotation(Number(e.target.value))}
              className="flex-1 h-1.5 accent-primary"
            />
            <span className="text-xs text-muted-foreground w-10 text-right">{rotation}°</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleRotate90}
              title="Rotate 90°"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={applying} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={applying || !croppedAreaPixels} onClick={handleApply}>
            {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
