import { emitTo } from '@tauri-apps/api/event'
import { getAllWindows, getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef, useState } from 'react'
import type { AgentTask, AgentTaskArtifact, AgentTaskStep } from '../../../domain/models'
import { createComputerService } from '../../../infrastructure/computerService'
import { createTextToSpeechProvider } from '../../../infrastructure/companionVoiceProvider'
import { useLibraryStore } from '../../../state/useLibraryStore'
import { PrivacySession } from '../../privacy'
import { assertExternalAiAllowed } from '../../trust/trustPolicy'
import { viewForAgentDestination } from '../agent/featureContract'
import { AgentPermissionEngine } from '../agent/permission'
import { buildAgentAccess } from '../agent/context'
import { TaskActionConfirmationRequired, TaskActionRegistry } from '../agent/taskActionRegistry'
import { createCompanionToolRegistry } from '../agent/tools'
import { createLiveCompanionApplicationServices } from '../companionConversation'

interface PreparedSpeech {
  blob: Blob
  path?: string
}

interface RecordingContext {
  id: string
  path: string
  startedAt: number
  narration: Array<{ path: string; startMs: number }>
}

const isTauri = () => '__TAURI_INTERNALS__' in window

function abortError() {
  return new DOMException('任务已暂停或停止', 'AbortError')
}

function waitFor(durationMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const timer = window.setTimeout(resolve, durationMs)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(abortError())
    }, { once: true })
  })
}

function playAudio(blob: Blob, signal: AbortSignal, audioRef: { current?: HTMLAudioElement }) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', cancel)
      if (audioRef.current === audio) audioRef.current = undefined
      URL.revokeObjectURL(url)
      if (error) reject(error)
      else resolve()
    }
    const cancel = () => {
      audio.pause()
      finish(abortError())
    }
    audio.onended = () => finish()
    audio.onerror = () => finish(new Error('VOICE_PLAYBACK_FAILED:旁白播放失败'))
    signal.addEventListener('abort', cancel, { once: true })
    void audio.play().catch(finish)
  })
}

function taskById(id: string) {
  return useLibraryStore.getState().data.companion.tasks.find((task) => task.id === id)
}

function updateStep(taskId: string, index: number, changes: Partial<AgentTaskStep>) {
  const store = useLibraryStore.getState()
  const task = taskById(taskId)
  if (!task) return
  const steps = task.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...changes } : step)
  store.updateAgentTask(taskId, { steps, currentStep: index })
}

function addArtifact(taskId: string, artifact: Omit<AgentTaskArtifact, 'id' | 'createdAt'>) {
  const store = useLibraryStore.getState()
  const task = taskById(taskId)
  if (!task) return
  store.updateAgentTask(taskId, {
    artifacts: [...task.artifacts, { ...artifact, id: `task-artifact-${crypto.randomUUID()}`, createdAt: new Date().toISOString() }],
  })
}

function resultRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('任务动作没有返回有效结果')
  return value as Record<string, unknown>
}

async function prepareSpeech(task: AgentTask, signal: AbortSignal) {
  const speechSteps = task.steps.filter((step) => step.action === 'speech.say')
  if (!speechSteps.length) return new Map<string, PreparedSpeech>()
  const data = useLibraryStore.getState().data
  const voice = data.companion.voice
  if (voice.tts.providerId === 'none' || !voice.tts.voice) throw new Error('请先在 AI 伙伴设置中配置小鱼的语音合成')
  assertExternalAiAllowed(voice.tts.providerId, data.settings.trust, 'voice')
  const provider = createTextToSpeechProvider(voice.tts)
  const privacy = new PrivacySession(data.settings.trust.privateDictionary)
  const needsFiles = task.steps.some((step) => step.action === 'screen.record_start')
  if (needsFiles && !data.companion.computer.enabled) throw new Error('请先在 AI 伙伴设置中开启电脑能力')
  const computer = createComputerService(data.companion.computer)
  const prepared = new Map<string, PreparedSpeech>()
  try {
    for (const step of speechSteps) {
      if (signal.aborted) throw abortError()
      const spoken = data.settings.trust.outboundProtection ? privacy.sanitize(step.text ?? '').text : step.text ?? ''
      const blob = await provider.synthesize(spoken)
      let path: string | undefined
      if (needsFiles) {
        const bytes = [...new Uint8Array(await blob.arrayBuffer())]
        const saved = resultRecord(await computer.execute({ action: 'media_narration_save', params: { bytes } }, false))
        path = typeof saved.path === 'string' ? saved.path : undefined
        if (!path) throw new Error('旁白音频没有返回保存路径')
      }
      prepared.set(step.id, { blob, path })
    }
    return prepared
  } catch (error) {
    const paths = [...prepared.values()].flatMap((item) => item.path ? [item.path] : [])
    if (paths.length) await computer.execute({ action: 'media_narration_cleanup', params: { paths } }, false).catch(() => undefined)
    throw error
  }
}

async function executeTask(task: AgentTask, signal: AbortSignal, audioRef: { current?: HTMLAudioElement }) {
  const store = useLibraryStore.getState()
  store.updateAgentTask(task.id, { status: 'preparing', error: undefined })
  const prepared = await prepareSpeech(task, signal)
  const current = taskById(task.id)
  if (!current || current.status === 'paused' || current.status === 'cancelled') return
  store.updateAgentTask(task.id, { status: 'running', error: undefined })
  const computer = createComputerService(useLibraryStore.getState().data.companion.computer)
  const createTaskActions = () => {
    const liveStore = useLibraryStore.getState()
    const liveData = liveStore.data
    const access = buildAgentAccess(liveData, liveStore.temporaryCompanionWorkIds)
    return new TaskActionRegistry(
      createCompanionToolRegistry(),
      new AgentPermissionEngine({
        policy: { autoAllow: ['read', 'presentation'] },
        resourcePermissions: liveData.companion.permissions,
        computer: liveData.companion.computer,
        access,
      }),
      createLiveCompanionApplicationServices(liveData, access),
      task.id,
      (entry) => useLibraryStore.getState().addCompanionAudit([entry]),
    )
  }
  let recording: RecordingContext | undefined

  const runStep = async (step: AgentTaskStep, index: number) => {
    if (step.action === 'app.open') {
      useLibraryStore.getState().openAgentDestination({ destination: step.destination! })
      await waitFor(900, signal)
      const expected = viewForAgentDestination(step.destination!)
      if (!expected || useLibraryStore.getState().data.session.activeView !== expected) throw new Error('页面没有切换到计划目标')
      return
    }
    if (step.action === 'wait') {
      await waitFor(step.durationMs ?? 1000, signal)
      return
    }
    if (step.action === 'tool.call') {
      const latest = taskById(task.id)
      if (!latest) throw new Error('任务已不存在')
      const result = await createTaskActions().execute(step, latest, index)
      updateStep(task.id, index, { result, confirmationRequired: false })
      if (result && typeof result === 'object' && !Array.isArray(result) && 'path' in result) {
        const path = (result as { path?: unknown }).path
        if (typeof path === 'string') addArtifact(task.id, { type: /\.(?:mp3|wav|m4a)$/i.test(path) ? 'audio' : 'file', label: step.title, path })
      }
      return
    }
    if (step.action === 'speech.say') {
      const speech = prepared.get(step.id)
      if (!speech) throw new Error('没有准备好这一步的旁白')
      if (recording && speech.path) recording.narration.push({ path: speech.path, startMs: Math.max(0, Math.round(performance.now() - recording.startedAt)) })
      await emitTo('main', 'companion:task-speech-state', { active: true }).catch(() => undefined)
      await emitTo('companion-chat', 'companion:speech-state', { active: true, paused: false, text: step.text }).catch(() => undefined)
      try {
        await playAudio(speech.blob, signal, audioRef)
      } finally {
        await emitTo('main', 'companion:task-speech-state', { active: false }).catch(() => undefined)
        await emitTo('companion-chat', 'companion:speech-state', { active: false, paused: false }).catch(() => undefined)
      }
      return
    }
    if (step.action === 'screen.record_start') {
      if (!isTauri()) throw new Error('录屏任务只能在 Windows 桌面版运行')
      const main = getCurrentWindow()
      await main.show()
      await main.setFocus()
      const windows = await getAllWindows()
      await windows.find((item) => item.label === 'companion-chat')?.hide()
      await waitFor(500, signal)
      const result = resultRecord(await computer.execute({ action: 'screen_record_start', params: { source: step.source || 'desktop', fps: 30 } }, false))
      if (typeof result.recordingId !== 'string' || typeof result.path !== 'string') throw new Error('录屏没有返回任务编号或文件路径')
      recording = { id: result.recordingId, path: result.path, startedAt: performance.now(), narration: [] }
      return
    }
    if (!recording) throw new Error('当前没有由这个任务启动的录屏')
    const recordingForStep = recording
    const stopped = resultRecord(await computer.execute({ action: 'screen_record_stop', params: { recordingId: recording.id } }, false))
    const rawPath = typeof stopped.path === 'string' ? stopped.path : recording.path
    if (recording.narration.length) {
      const composed = resultRecord(await computer.execute({
        action: 'media_narration_compose',
        params: { sourcePath: rawPath, segments: recordingForStep.narration },
      }, false))
      const path = typeof composed.path === 'string' ? composed.path : undefined
      if (!path) throw new Error('音画合成没有返回文件路径')
      addArtifact(task.id, { type: 'video', label: '带小鱼旁白的视频', path })
    } else {
      addArtifact(task.id, { type: 'video', label: '任务录屏', path: rawPath })
    }
    recording = undefined
  }

  const preparedPaths = [...prepared.values()].flatMap((item) => item.path ? [item.path] : [])
  try {
    const first = Math.max(0, taskById(task.id)?.currentStep ?? 0)
    for (let index = first; index < task.steps.length; index += 1) {
      if (signal.aborted) throw abortError()
      const latest = taskById(task.id)
      if (!latest || latest.status === 'paused' || latest.status === 'cancelled') throw abortError()
      const step = latest.steps[index]
      if (step.status === 'completed' || step.status === 'skipped') continue
      updateStep(task.id, index, { status: 'running', startedAt: new Date().toISOString(), error: undefined })
      let attempts = step.failurePolicy === 'retry' ? 2 : 1
      while (attempts > 0) {
        try {
          await runStep(step, index)
          attempts = 0
        } catch (error) {
          if (error instanceof TaskActionConfirmationRequired) throw error
          attempts -= 1
          if (attempts > 0 && !signal.aborted) {
            await waitFor(700, signal)
            continue
          }
          throw error
        }
      }
      updateStep(task.id, index, { status: 'completed', completedAt: new Date().toISOString(), confirmed: undefined, confirmationRequired: undefined })
    }
    const completed = taskById(task.id)
    useLibraryStore.getState().updateAgentTask(task.id, {
      status: 'completed',
      currentStep: Math.max(0, task.steps.length - 1),
      completedAt: new Date().toISOString(),
      error: undefined,
      artifacts: completed?.artifacts ?? [],
    })
    await emitTo('companion-chat', 'companion:transient-message', { role: 'companion', content: `任务“${task.title}”已经完成。` }).catch(() => undefined)
  } catch (error) {
    const latest = taskById(task.id)
    if (error instanceof DOMException && error.name === 'AbortError') return
    const message = error instanceof Error ? error.message : '任务执行失败'
    const index = latest?.currentStep ?? 0
    const step = latest?.steps[index]
    if (error instanceof TaskActionConfirmationRequired) {
      updateStep(task.id, index, { status: 'pending', startedAt: undefined, confirmationRequired: true, error: message })
      useLibraryStore.getState().updateAgentTask(task.id, { status: 'paused', error: `等待确认：${message}` })
      return
    }
    if (step?.failurePolicy === 'ask' || step?.failurePolicy === 'replan') {
      updateStep(task.id, index, { status: 'pending', startedAt: undefined, confirmed: undefined, confirmationRequired: undefined, error: message })
      useLibraryStore.getState().updateAgentTask(task.id, { status: 'paused', error: step.failurePolicy === 'replan' ? `需要调整计划：${message}` : `需要你的处理：${message}` })
    } else {
      updateStep(task.id, index, { status: 'failed', completedAt: new Date().toISOString(), confirmed: undefined, confirmationRequired: undefined, error: message })
      useLibraryStore.getState().updateAgentTask(task.id, { status: 'failed', error: message })
    }
  } finally {
    if (recording) {
      const stopped = await computer.execute({ action: 'screen_record_stop', params: { recordingId: recording.id } }, false).catch(() => undefined)
      const path = stopped && typeof stopped === 'object' && 'path' in stopped && typeof stopped.path === 'string' ? stopped.path : recording.path
      if (path) addArtifact(task.id, { type: 'video', label: '未完成的录屏片段', path })
    }
    if (preparedPaths.length) {
      await computer.execute({ action: 'media_narration_cleanup', params: { paths: preparedPaths } }, false).catch(() => undefined)
    }
    audioRef.current?.pause()
    await emitTo('main', 'companion:task-speech-state', { active: false }).catch(() => undefined)
  }
}

export function AgentTaskRuntime() {
  const tasks = useLibraryStore((state) => state.data.companion.tasks)
  const [completedRuns, setCompletedRuns] = useState(0)
  const active = useRef<{ id: string; controller: AbortController } | undefined>(undefined)
  const audio = useRef<HTMLAudioElement | undefined>(undefined)

  useEffect(() => {
    if (active.current) {
      const running = tasks.find((task) => task.id === active.current?.id)
      if (!running || running.status === 'paused' || running.status === 'cancelled') active.current.controller.abort()
      return
    }
    const queued = tasks.find((task) => task.status === 'queued')
    if (!queued) return
    const controller = new AbortController()
    active.current = { id: queued.id, controller }
    void executeTask(queued, controller.signal, audio).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const latest = taskById(queued.id)
      if (!latest || latest.status === 'paused' || latest.status === 'cancelled') return
      const message = error instanceof Error ? error.message : '任务准备失败'
      useLibraryStore.getState().updateAgentTask(queued.id, {
        status: 'failed',
        error: message,
      })
    }).finally(() => {
      if (active.current?.id === queued.id) active.current = undefined
      setCompletedRuns((value) => value + 1)
    })
  }, [completedRuns, tasks])

  useEffect(() => () => {
    active.current?.controller.abort()
    audio.current?.pause()
  }, [])
  return null
}
