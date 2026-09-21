/* Vendored from @elevenlabs/client 1.25.0 (MIT). */
class ScribeAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = []
    this.bufferSize = 4096
    this.inputSampleRate = null
    this.outputSampleRate = null
    this.resampleRatio = 1
    this.lastSample = 0
    this.resampleAccumulator = 0
    this.port.onmessage = ({ data }) => {
      if (data.type !== 'configure') return
      this.inputSampleRate = data.inputSampleRate
      this.outputSampleRate = data.outputSampleRate
      if (this.inputSampleRate && this.outputSampleRate) this.resampleRatio = this.inputSampleRate / this.outputSampleRate
    }
  }
  resample(inputData) {
    if (this.resampleRatio === 1 || !this.inputSampleRate) return inputData
    const outputSamples = []
    for (let i = 0; i < inputData.length; i += 1) {
      const currentSample = inputData[i]
      while (this.resampleAccumulator < 1) {
        outputSamples.push(this.lastSample + (currentSample - this.lastSample) * this.resampleAccumulator)
        this.resampleAccumulator += this.resampleRatio
      }
      this.resampleAccumulator -= 1
      this.lastSample = currentSample
    }
    return new Float32Array(outputSamples)
  }
  process(inputs) {
    const input = inputs[0]
    if (input.length > 0) {
      let channelData = input[0]
      if (this.resampleRatio !== 1) channelData = this.resample(channelData)
      for (let i = 0; i < channelData.length; i += 1) this.buffer.push(channelData[i])
      if (this.buffer.length >= this.bufferSize) {
        const float32Array = new Float32Array(this.buffer)
        const int16Array = new Int16Array(float32Array.length)
        for (let i = 0; i < float32Array.length; i += 1) {
          const sample = Math.max(-1, Math.min(1, float32Array[i]))
          int16Array[i] = sample < 0 ? sample * 32768 : sample * 32767
        }
        this.port.postMessage({ audioData: int16Array.buffer }, [int16Array.buffer])
        this.buffer = []
      }
    }
    return true
  }
}
registerProcessor('scribeAudioProcessor', ScribeAudioProcessor)
