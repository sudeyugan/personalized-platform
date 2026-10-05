import { useEffect, useRef, useState, type RefObject } from 'react'
import type { CompanionPetStyle } from '../../../domain/models'
import { normalizeCompanionPetStyle } from '../../../domain/companionPetStyle'
import { FREE_ART_PROFILES } from './art/freeArtProfiles'
import { createPetPersonality } from './personality'
import { createPetMotion } from './motion'
import { isPetHead } from './headHit'
import { createPetRest } from './rest'
import { BOTTOM_ART_PROFILES } from './art/bottomArtProfiles'
import { createPetConversation, type PetConversationState } from './conversation'
import { createPetAttention } from './attention'
import { applyPoseTransform, posePointer } from './pose'
import { createPixelPetAnimator } from './animation'
import { drawPixelPet } from './drawPixelPet'
import { ART_PROFILES, artEyeCenter } from './art/artProfiles'
import { drawArtPet } from './art/drawArtPet'
import { loadPreparedArt, type PreparedArt } from './art/prepareArt'
import { PIXEL_PET_SIZE, type PixelPoint, type PixelPetPose } from './types'
import './pixelPet.css'

interface Props {
  name?: string
  engaged?: boolean
  dragging?: boolean
  dragMotion?: RefObject<PixelPoint>
  restPreview?: boolean
  conversation?: PetConversationState
  response?: RefObject<number>
  headPat?: RefObject<number>
  pointer?: RefObject<PixelPoint | null>
  pose?: PixelPetPose
  style?: CompanionPetStyle
  scale?: number
  pixelRatio?: number
  active?: boolean
}
export function PixelPetRenderer({ name = '小鱼', engaged = false, dragging = false, dragMotion, restPreview = false, conversation = 'idle', response, headPat, pointer, pose = 'right-edge', style = 'chibi', scale = 1, pixelRatio = 1, active = true }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const painted = useRef(false)
  const previewResponse = useRef(0)
  const previewPat = useRef(0)
  const [error, setError] = useState('')
  const selected = normalizeCompanionPetStyle(style)
  const conversationRef = useRef(conversation)
  conversationRef.current = conversation
  const interactionRef = useRef({ engaged, dragging, dragMotion, restPreview })
  interactionRef.current = { engaged, dragging, dragMotion, restPreview }
  useEffect(() => {
    const element = canvas.current, ctx = element?.getContext('2d')
    if (!element || !ctx) return
    const side = pose === 'bottom-edge' ? 'bottom-edge' : pose === 'left-edge' ? 'left-edge' : 'right-edge'
    const attention = createPetAttention(pose === 'bottom-edge' || pose === 'float')
    const rest = createPetRest()
    const motion = createPetMotion()
    let lastPat = headPat?.current ?? previewPat.current
    let lastResponse = response?.current ?? previewResponse.current
    let ready = false
    const eyeCenter = artEyeCenter(pose === 'float' ? FREE_ART_PROFILES[selected] : pose === 'bottom-edge' ? BOTTOM_ART_PROFILES[selected] : ART_PROFILES[selected])
    const animator = createPixelPetAnimator(Math.random, eyeCenter)
    const behavior = createPetConversation(eyeCenter)
    const personality = createPetPersonality(Math.random, eyeCenter)
    let art: PreparedArt | undefined
    let browserPointer: PixelPoint | null = null
    let frameId = 0, disposed = false, lastDraw = -Infinity
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const draw = (now: number) => {
      const patRequest = headPat?.current ?? previewPat.current
      if (patRequest !== lastPat) { lastPat = patRequest; rest.wake(now); personality.pat(now) }
      const request = response?.current ?? previewResponse.current
      if (request !== lastResponse) { lastResponse = request; rest.wake(now); animator.respond(now) }
      const focus = attention.update(now, posePointer(pointer ? pointer.current : browserPointer, side))
      const interaction = interactionRef.current
      const rawPointer = posePointer(pointer ? pointer.current : browserPointer, side)
      const sleep = interaction.restPreview ? 1 : rest.update(now, conversationRef.current, rawPointer, interaction.engaged || interaction.dragging)
      const engaged = behavior.update(conversationRef.current, focus)
      if (engaged.respond) animator.respond(now)
      const reduced = reducedMotion?.matches ?? false
      const gesture = personality.update(now, sleep > .1 || interaction.engaged || interaction.dragging || conversationRef.current !== 'idle', reduced, Boolean(focus.pointer))
      const target = sleep > .1 || interaction.dragging ? null : engaged.pointer ?? gesture.pointer
      const raw = animator.update(now, target, reduced, engaged.settling || sleep > .1)
      const next = motion.update(now, raw, {
        pose, motion: engaged.motion, sleep, reduced,
        dragging: interaction.dragging, movement: interaction.dragMotion?.current, gesture,
      })
      applyPoseTransform(ctx, side)
      if (art && (pose === 'right-edge' || pose === 'left-edge' || pose === 'bottom-edge' || pose === 'float')) drawArtPet(ctx, art, next)
      else drawPixelPet(ctx, next, 'right-edge')
      painted.current = true
    }
    const mouse = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      browserPointer = {
        x: (event.clientX - rect.left) / rect.width * PIXEL_PET_SIZE.width,
        y: (event.clientY - rect.top) / rect.height * PIXEL_PET_SIZE.height,
      }
    }
    const tick = (now: number) => {
      if (disposed || document.hidden) return
      if (ready && now - lastDraw >= 1000 / 30) { lastDraw = now; draw(now) }
      frameId = window.requestAnimationFrame(tick)
    }
    const visibility = () => {
      window.cancelAnimationFrame(frameId)
      if (active && !document.hidden) frameId = window.requestAnimationFrame(tick)
    }
    setError('')
    // Keep the previous canvas visible until the selected style is decoded/prepared.
    void loadPreparedArt(selected, pose).then((prepared) => {
      if (disposed) return
      art = prepared; ready = true
      if (ready) draw(performance.now())
    }).catch((reason: unknown) => {
      if (disposed) return
      ready = !painted.current
      setError(reason instanceof Error ? reason.message : '造型加载失败')
      if (ready) draw(performance.now())
    })
    if (!pointer) document.addEventListener('pointermove', mouse)
    if (active && !document.hidden) frameId = window.requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true; window.cancelAnimationFrame(frameId)
      document.removeEventListener('pointermove', mouse)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [active, pointer, pose, response, headPat, selected])
  return <>
    <canvas ref={canvas} className={`pixel-pet-canvas ${ART_PROFILES[selected].pixelated ? '' : 'art-pet-smooth'}`}
      width={PIXEL_PET_SIZE.width * 3} height={PIXEL_PET_SIZE.height * 3}
      style={{ width: PIXEL_PET_SIZE.width * scale / pixelRatio, height: PIXEL_PET_SIZE.height * scale / pixelRatio }}
      onClick={event => {
        if (pointer) return
        const rect = event.currentTarget.getBoundingClientRect()
        const point = rect.width && rect.height ? { x: (event.clientX - rect.left) / rect.width * 192, y: (event.clientY - rect.top) / rect.height * 240 } : undefined
        if (isPetHead(point, selected, pose)) previewPat.current++
        else previewResponse.current++
      }}
      role="img" aria-label={pose === 'float' ? `${ART_PROFILES[selected].label}${name}，自然半身姿态` : `${ART_PROFILES[selected].label}${name}，双手搭在${pose === 'bottom-edge' ? '底部' : pose === 'left-edge' ? '左侧' : '右侧'}边缘`} data-pixel-pet-style={selected} data-pixel-pet-pose={pose} />
    {error && <small className="pixel-pet-error" role="status">造型加载失败，保留上一画面或使用代码原型：{error}</small>}
  </>
}
