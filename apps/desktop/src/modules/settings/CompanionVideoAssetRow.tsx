import { SlidersHorizontal, Trash2 } from 'lucide-react'
import type { Asset, CompanionVideoPlacement } from '../../domain/models'
import { CompanionVideoPreviewEditor, type CompanionVideoCalibrationAsset } from './CompanionVideoPreviewEditor'

interface CompanionVideoAssetRowProps {
  asset: Asset
  busy: boolean
  open: boolean
  placement?: CompanionVideoPlacement
  onToggle: () => void
  referenceAssets: CompanionVideoCalibrationAsset[]
  onRemove: () => void
  onPlacementChange: (placement: CompanionVideoPlacement) => void
}

export function CompanionVideoAssetRow({ asset, busy, open, placement, referenceAssets, onToggle, onRemove, onPlacementChange }: CompanionVideoAssetRowProps) {
  return <div className={open ? 'editing' : ''}>
    <span title={asset.fileName}>
      {asset.fileName}
      <small>{asset.width && asset.height ? `${asset.width}×${asset.height}` : 'WebM'}</small>
    </span>
    <span className="video-slot-asset-actions">
      <button type="button" aria-label={`预览并调整 ${asset.fileName}`} aria-expanded={open} onClick={onToggle}>
        <SlidersHorizontal size={12} />
      </button>
      <button type="button" aria-label={`移除 ${asset.fileName}`} disabled={busy} onClick={onRemove}>
        <Trash2 size={12} />
      </button>
    </span>
    {open && <CompanionVideoPreviewEditor
      asset={asset}
      placement={placement}
      referenceAssets={referenceAssets}
      onCommit={onPlacementChange}
    />}
  </div>
}
