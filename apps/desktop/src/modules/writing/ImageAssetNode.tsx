/* eslint-disable react/only-export-components */
import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from 'lucide-react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { AssetImage } from '../assets/AssetImage'

function ImageAssetView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const asset = useLibraryStore((state) => state.data.assets.find((item) => item.id === node.attrs.assetId))
  if (!asset) return <NodeViewWrapper className="image-asset missing" data-drag-handle>图片素材已丢失 · {node.attrs.assetId}</NodeViewWrapper>
  const align = node.attrs.align ?? 'center'
  return <NodeViewWrapper className={`image-asset align-${align}${selected ? ' selected' : ''}`} data-drag-handle>
    <figure style={{ width: `${node.attrs.width ?? 72}%` }}><AssetImage asset={asset} thumbnail={false} alt={node.attrs.alt} /><figcaption contentEditable={false}>{node.attrs.caption || asset.caption || ''}</figcaption></figure>
    {selected && <div className="image-asset-tools" contentEditable={false}><button onClick={() => updateAttributes({ align: 'left' })}><AlignLeft size={14} /></button><button onClick={() => updateAttributes({ align: 'center' })}><AlignCenter size={14} /></button><button onClick={() => updateAttributes({ align: 'right' })}><AlignRight size={14} /></button><label>宽度<input type="range" min="30" max="100" value={node.attrs.width ?? 72} onChange={(event) => updateAttributes({ width: Number(event.target.value) })} /></label><input aria-label="图片说明" placeholder="图片说明" value={node.attrs.caption ?? ''} onChange={(event) => updateAttributes({ caption: event.target.value })} /><input aria-label="替代文本" placeholder="替代文本" value={node.attrs.alt ?? ''} onChange={(event) => updateAttributes({ alt: event.target.value })} /><button onClick={deleteNode}><Trash2 size={14} /></button></div>}
  </NodeViewWrapper>
}

export const ImageAssetNode = Node.create({
  name: 'imageAsset', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() { return { assetId: { default: '' }, alt: { default: '' }, caption: { default: '' }, width: { default: 72 }, align: { default: 'center' } } },
  parseHTML() { return [{ tag: 'figure[data-asset-id]' }] },
  renderHTML({ HTMLAttributes }) { return ['figure', mergeAttributes(HTMLAttributes, { 'data-asset-id': HTMLAttributes.assetId }), ['figcaption', {}, HTMLAttributes.caption ?? '']] },
  addNodeView() { return ReactNodeViewRenderer(ImageAssetView) },
})
