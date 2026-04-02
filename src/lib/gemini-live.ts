import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { float32ToInt16, arrayBufferToBase64, base64ToArrayBuffer, int16ToFloat32 } from './audio-utils';

const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 2048;

export function useGeminiLive() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const playNextInQueue = useCallback(() => {
    if (!audioContextRef.current || audioQueueRef.current.length === 0 || isPlayingRef.current) {
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift()!;
    const buffer = audioContextRef.current.createBuffer(1, chunk.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(chunk);

    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => {
      isPlayingRef.current = false;
      playNextInQueue();
    };
    source.start();
  }, []);

  const stopLive = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }
    setIsConnected(false);
    setIsScreenSharing(false);
  }, []);

  const startLive = useCallback(async (apiKey: string) => {
    if (isConnecting) return;
    setIsConnecting(true);
    setLiveError(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: SAMPLE_RATE,
      });

      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          systemInstruction: "คุณคือผู้ช่วย AI ที่เป็นมิตร สุภาพ และมีบุคลิกที่น่ารัก อบอุ่น เหมือนมนุษย์จริงๆ คุณสามารถมองเห็นหน้าจอของผู้ใช้ได้หากพวกเขาแชร์หน้าจอ ให้ตอบโต้ด้วยน้ำเสียงที่นุ่มนวล เป็นกันเอง และใช้คำลงท้ายที่ดูสุภาพและน่ารัก (เช่น ค่ะ, นะคะ) ตอบอย่างเป็นธรรมชาติและกระชับ",
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts) {
              for (const part of message.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const audioData = base64ToArrayBuffer(part.inlineData.data);
                  const floatData = int16ToFloat32(new Int16Array(audioData));
                  audioQueueRef.current.push(floatData);
                  playNextInQueue();
                }
                
                // Handle Transcription (AI)
                if (part.text) {
                  setTranscript(prev => [...prev, `AI: ${part.text}`]);
                }
              }
            }

            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              setIsInterrupted(true);
              setTimeout(() => setIsInterrupted(false), 1000);
            }
          },
          onclose: () => {
            stopLive();
          },
          onerror: (error) => {
            console.error("Live API Error:", error);
            stopLive();
          }
        }
      });

      sessionRef.current = session;

      // Start Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = micStream;
      const source = audioContextRef.current.createMediaStreamSource(micStream);
      const processor = audioContextRef.current.createScriptProcessor(CHUNK_SIZE, 1, 1);
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const int16Data = float32ToInt16(inputData);
        const base64Data = arrayBufferToBase64(int16Data.buffer);
        
        session.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      processorRef.current = processor;

    } catch (error: any) {
      console.error("Failed to start Live session:", error);
      setLiveError(error.message || "Failed to start Live session");
      setIsConnecting(false);
      stopLive();
    }
  }, [isConnecting, playNextInQueue, stopLive]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
      return;
    }

    setLiveError(null);

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      videoRef.current = video;

      const canvas = document.createElement('canvas');
      canvasRef.current = canvas;

      const sendFrame = () => {
        if (!isScreenSharing || !sessionRef.current || !screenStreamRef.current) return;
        
        const ctx = canvas.getContext('2d');
        if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = 640; // Resize for efficiency
          canvas.height = (video.videoHeight / video.videoWidth) * 640;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
          sessionRef.current.sendRealtimeInput({
            video: { data: base64Data, mimeType: 'image/jpeg' }
          });
        }
        
        if (setIsScreenSharing) {
           setTimeout(sendFrame, 500); // Send frame every 500ms
        }
      };

      sendFrame();

      stream.getTracks()[0].onended = () => {
        setIsScreenSharing(false);
      };

    } catch (error: any) {
      console.error("Failed to share screen:", error);
      setLiveError(`Failed to share screen: ${error.message || String(error)}`);
      setIsScreenSharing(false);
    }
  }, [isScreenSharing]);

  return {
    isConnected,
    isConnecting,
    isScreenSharing,
    startLive,
    stopLive,
    toggleScreenShare,
    transcript,
    liveError
  };
}
