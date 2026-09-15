import { FolderOpen, Play, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useLibraryStore } from '../../state/useLibraryStore'
import { CharacterRuntime, type CharacterRuntimeHandle } from '../companion/character/CharacterRuntime'
import { characterPackagePaths, planCharacterPackage, resolveCharacterPackage, validateCharacterCanvas } from '../companion/character/CharacterLoader'
import { useCharacterAssetUrls } from '../companion/character/useCharacterAssetUrls'

export function CompanionCharacterPackageSection() {
  const { data, importAsset, setCompanionCharacterPackage } = useLibraryStore()
  const character = data.companion.desktop.characterPackage
  const urls = useCharacterAssetUrls(character, data.assets)
  const runtime = useRef<CharacterRuntimeHandle>(null)
  const [status, setStatus] = useState('选择包含 character.json 与透明 PNG 的完整角色文件夹。')
  const [busy, setBusy] = useState(false)
  const [debugSlots, setDebugSlots] = useState(false)

  const importPackage = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const plan = await planCharacterPackage([...files])
      const warnings = await validateCharacterCanvas(plan)
      const assetIdByPath = new Map<string, string>()
      for (const path of characterPackagePaths(plan)) {
        const file = plan.filesByPath.get(path)
        if (!file) throw new Error(`角色包缺少图片：${path}`)
        const asset = await importAsset(file)
        assetIdByPath.set(path, asset.id)
      }
      const resolved = resolveCharacterPackage(plan, assetIdByPath)
      setCompanionCharacterPackage(resolved)
      setStatus(`已导入 ${resolved.name}：${assetIdByPath.size} 张素材，${Object.keys(resolved.motions).length} 个动作。${warnings.length ? ` ${warnings.length} 个尺寸/Slot 提示已写入开发控制台。` : ''}`)
    } catch (error) { setStatus(error instanceof Error ? error.message : '角色包导入失败') }
    finally { setBusy(false) }
  }

  return <div className="character-package-settings">
    <div className="character-package-toolbar">
      <label className={busy ? 'ghost-button disabled' : 'ghost-button'}><FolderOpen size={14} />{busy ? '正在校验并导入…' : '选择角色文件夹'}<input type="file" multiple accept=".json,image/png" disabled={busy} {...{ webkitdirectory: '', directory: '' }} onChange={(event) => { void importPackage(event.target.files); event.target.value = '' }} /></label>
      {import.meta.env.DEV && character?.slots && Object.keys(character.slots).length > 0 ? <button className="ghost-button" onClick={() => setDebugSlots((visible) => !visible)}>{debugSlots ? '隐藏 Slot' : '显示 Slot'}</button> : null}
      {character && <button className="ghost-button" onClick={() => setCompanionCharacterPackage(undefined)}><Trash2 size={13} />停用角色包</button>}
    </div>
    <small className="character-package-status">{status}</small>
    {character && <div className="character-package-preview">
      <CharacterRuntime ref={runtime} character={character} urls={urls} label={`${character.name} 角色包预览`} debugSlots={debugSlots} />
      <div><strong>{character.name}</strong><small>{character.canvas.width} × {character.canvas.height} · {character.slots && Object.keys(character.slots).length ? `${Object.keys(character.slots).length} 个局部 Slot` : '旧版全画布差分'} · 差分立绘 {Object.keys(character.expressions).length} 种表情 · 固定动作 {Object.keys(character.motions).length} 个</small>
        <div className="character-test-actions">
          {['neutral', 'happy', 'angry', 'sad', 'shy'].filter((name) => character.expressions[name]).map((name) => <button key={name} onClick={() => runtime.current?.setExpression(name)}>{name}</button>)}
          <button onPointerDown={() => runtime.current?.startTalking()} onPointerUp={() => runtime.current?.stopTalking()}>按住说话</button>
          {Object.keys(character.motions).map((name) => <button key={name} onClick={() => void runtime.current?.playMotion(name)}><Play size={11} />{name}</button>)}
        </div>
      </div>
    </div>}
  </div>
}
