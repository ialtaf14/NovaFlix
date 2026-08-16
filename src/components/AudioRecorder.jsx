import React, { useState, useEffect, useRef } from 'react'
import './AudioRecorder.css'

export default function AudioRecorder({ onRecordingComplete, onCancel }) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [waveform, setWaveform] = useState(Array(30).fill(5))
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const analyzerRef = useRef(null)
  const animationFrameRef = useRef(null)

  useEffect(() => {
    startRecording()
    return () => {
      stopRecordingAndCleanup()
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      // Setup Web Audio API for waveform
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const source = audioContext.createMediaStreamSource(stream)
      const analyzer = audioContext.createAnalyser()
      analyzer.fftSize = 64
      source.connect(analyzer)
      analyzerRef.current = analyzer
      
      const bufferLength = analyzer.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateWaveform = () => {
        if (!analyzerRef.current) return
        analyzerRef.current.getByteFrequencyData(dataArray)
        // Take a subset of frequencies and map to heights 5-100
        const newWaveform = []
        for (let i = 0; i < 30; i++) {
          const val = dataArray[i] || 0
          newWaveform.push(Math.max(5, (val / 255) * 100))
        }
        setWaveform(newWaveform)
        animationFrameRef.current = requestAnimationFrame(updateWaveform)
      }
      
      updateWaveform()

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (onRecordingComplete) {
          onRecordingComplete(audioBlob)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
      
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error("Error accessing microphone", err)
      onCancel()
    }
  }

  const stopRecordingAndCleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }
    clearInterval(timerRef.current)
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }

  const handleSend = () => {
    stopRecordingAndCleanup()
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="audio-recorder-container animate-fade-in">
      <div className="audio-waveform-display">
        {waveform.map((height, i) => (
          <div key={i} className="waveform-bar" style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className="audio-recorder-controls">
        <button className="recorder-cancel-btn" onClick={() => {
          mediaRecorderRef.current = null // prevent onstop from sending
          stopRecordingAndCleanup()
          onCancel()
        }}>
          ❌
        </button>
        <span className="recorder-time">{formatTime(recordingTime)}</span>
        <button className="recorder-send-btn pulse" onClick={handleSend}>
          ⬆️
        </button>
      </div>
      <div className="slide-to-cancel-hint">
        Slide to cancel (or tap X)
      </div>
    </div>
  )
}
