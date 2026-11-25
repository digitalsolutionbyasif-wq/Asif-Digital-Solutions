import type { User } from 'firebase/auth';
import {
  BookmarkPlus,
  CheckCircle2,
  Compass,
  Download,
  Image as ImageIcon,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Upload,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  saveCreativeAssetLog,
  saveProjectBrief,
  saveVoiceSessionDoc,
} from '../lib/firebase';
import type { StrategyBriefOutput } from '../types';

interface AICommandStudioProps {
  firebaseUser: User | null;
  onRequireGoogleSignIn: () => Promise<User | null>;
  onPrefillConsult: (service: string, summary: string, budget?: string) => void;
  onTrackClick: (section: 'hero' | 'services' | 'academy' | 'fyp' | 'contact', label: string, e: React.MouseEvent<HTMLElement>) => void;
}

type StudioTab = 'voice' | 'image' | 'planner';
type VoiceMode = 'agency' | 'academy' | 'fyp';
type VoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Fenrir' | 'Charon';

const MODE_LABELS: Record<VoiceMode, 'Agency Scoping' | 'Academy Advisor' | 'FYP Architecture'> = {
  agency: 'Agency Scoping',
  academy: 'Academy Advisor',
  fyp: 'FYP Architecture',
};

function floatToInt16Base64(float32: Float32Array): string {
  const bytes = new Uint8Array(float32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

function base64Int16ToFloat32(base64: string): Float32Array {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 32768;
  }
  return samples;
}

export function AICommandStudio({
  firebaseUser,
  onRequireGoogleSignIn,
  onPrefillConsult,
  onTrackClick,
}: AICommandStudioProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>('voice');

  // --- Tab 1: Live Voice Consultant (gemini-3.8-live) ---
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('agency');
  const [voiceName, setVoiceName] = useState<VoiceName>('Zephyr');
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantTranscript, setAssistantTranscript] = useState('');
  const [textFollowUp, setTextFollowUp] = useState('');
  const [audioLevel, setAudioLevel] = useState(0.08);
  const [voiceSavedMsg, setVoiceSavedMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const isLiveRef = useRef(false);

  const stopScheduledPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped
      }
    }
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;
  }, []);

  const stopVoiceSession = useCallback(() => {
    isLiveRef.current = false;
    setVoiceStatus('idle');
    setAudioLevel(0.08);
    stopScheduledPlayback();

    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }, [stopScheduledPlayback]);

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, [stopVoiceSession]);

  const scheduleOutputAudio = useCallback((base64Pcm: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const samples = base64Int16ToFloat32(base64Pcm);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.copyToChannel(new Float32Array(samples), 0);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.02, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(src);

    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
    };
  }, []);

  const startVoiceSession = async () => {
    setVoiceError(null);
    setVoiceSavedMsg(null);
    setUserTranscript('');
    setAssistantTranscript('');
    setVoiceStatus('connecting');

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Microphone capture is not supported in this browser context.');
      setVoiceStatus('idle');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = 0;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${proto}//${window.location.host}/ws/live?voice=${encodeURIComponent(voiceName)}&mode=${encodeURIComponent(voiceMode)}`
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ready') {
            isLiveRef.current = true;
            setVoiceStatus('live');

            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              if (!isLiveRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                return;
              }
              const channel = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for (let i = 0; i < channel.length; i += 16) {
                sum += Math.abs(channel[i]);
              }
              const level = Math.min(1, Math.max(0.08, (sum / (channel.length / 16)) * 5.5));
              setAudioLevel(level);
              wsRef.current.send(JSON.stringify({ type: 'audio', data: floatToInt16Base64(channel) }));
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          } else if (msg.type === 'audio' && msg.data) {
            scheduleOutputAudio(msg.data);
          } else if (msg.type === 'inputTranscript' && msg.text) {
            setUserTranscript((prev) => `${prev}${prev ? ' ' : ''}${msg.text}`.trim());
          } else if (msg.type === 'outputTranscript' && msg.text) {
            setAssistantTranscript((prev) => `${prev}${prev ? ' ' : ''}${msg.text}`.trim());
          } else if (msg.type === 'interrupted') {
            stopScheduledPlayback();
          } else if (msg.type === 'error') {
            setVoiceError(msg.error || 'Voice stream interrupted.');
            stopVoiceSession();
          } else if (msg.type === 'closed') {
            stopVoiceSession();
          }
        } catch {
          // Ignore invalid JSON
        }
      };

      ws.onerror = () => {
        setVoiceError('Unable to establish live voice WebSocket connection.');
        stopVoiceSession();
      };

      ws.onclose = () => {
        if (isLiveRef.current) {
          stopVoiceSession();
        }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone permission denied.';
      setVoiceError(msg);
      stopVoiceSession();
    }
  };

  const handleSendVoiceText = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = textFollowUp.trim();
    if (!clean || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'text', text: clean }));
    setUserTranscript((prev) => `${prev}${prev ? '\n' : ''}${clean}`);
    setTextFollowUp('');
  };

  const handleSaveVoiceTranscript = async () => {
    setVoiceError(null);
    setVoiceSavedMsg(null);
    let user = firebaseUser;
    if (!user) {
      user = await onRequireGoogleSignIn();
    }
    if (!user) return;

    await saveVoiceSessionDoc(user.uid, {
      mode: MODE_LABELS[voiceMode],
      voiceName,
      userTranscript: userTranscript || 'Voice consultation started.',
      assistantTranscript: assistantTranscript || 'Live response session.',
    });
    setVoiceSavedMsg('Transcript saved to your Cloud Workspace.');
  };

  // --- Tab 2: Brand & Visual Asset Studio (gemini-nano-banana-2.1) ---
  const [imgPrompt, setImgPrompt] = useState(
    'Minimalist luxury Pakistani fashion brand e-commerce hero visual, crisp studio lighting, warm alabaster backdrop, architectural framing'
  );
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '4:3' | '3:4' | '16:9' | '9:16'>('16:9');
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [useSearchGrounding, setUseSearchGrounding] = useState(false);
  const [sourceImageBase64, setSourceImageBase64] = useState<string>('');
  const [sourceMimeType, setSourceMimeType] = useState<string>('image/png');
  const [sourcePreviewUrl, setSourcePreviewUrl] = useState<string>('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [imageCommentary, setImageCommentary] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [assetSavedMsg, setAssetSavedMsg] = useState<string | null>(null);

  const handleUploadReferenceImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setImageError('Please select a PNG, JPEG, or WebP image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const comma = dataUrl.indexOf(',');
      if (comma > 0) {
        setSourceImageBase64(dataUrl.slice(comma + 1));
        setSourceMimeType(file.type);
        setSourcePreviewUrl(dataUrl);
        setImageError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    setImageError(null);
    setAssetSavedMsg(null);
    setImageLoading(true);

    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          aspectRatio,
          imageSize,
          sourceImageBase64: sourceImageBase64 || undefined,
          sourceMimeType: sourceImageBase64 ? sourceMimeType : undefined,
          useSearchGrounding,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setImageError(json.error || 'Could not generate image.');
        return;
      }
      setGeneratedImageUrl(json.imageUrl);
      setImageCommentary(json.commentary || null);

      if (firebaseUser) {
        await saveCreativeAssetLog(firebaseUser.uid, {
          prompt: imgPrompt,
          aspectRatio,
          imageSize,
          operation: sourceImageBase64 ? 'edit' : 'generate',
        });
        setAssetSavedMsg('Prompt spec logged to your Cloud Workspace.');
      }
    } catch {
      setImageError('Network error reaching Brand Visual Studio.');
    } finally {
      setImageLoading(false);
    }
  };

  // --- Tab 3: AI Architecture & Strategy Brief (gemini-4-hydrogen) ---
  const [plannerTrack, setPlannerTrack] = useState('Agency Build');
  const [plannerIndustry, setPlannerIndustry] = useState('E-Commerce & Retail');
  const [plannerBudget, setPlannerBudget] = useState('PKR 100,000 - 250,000');
  const [plannerGoal, setPlannerGoal] = useState('');
  const [plannerLoading, setPlannerLoading] = useState(false);
  const [plannerError, setPlannerError] = useState<string | null>(null);
  const [briefResult, setBriefResult] = useState<StrategyBriefOutput | null>(null);
  const [briefSavedMsg, setBriefSavedMsg] = useState<string | null>(null);

  const handleGenerateBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlannerError(null);
    setBriefSavedMsg(null);
    setPlannerLoading(true);
    try {
      const res = await fetch('/api/ai/strategy-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track: plannerTrack,
          industry: plannerIndustry,
          budgetRange: plannerBudget,
          goal: plannerGoal,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPlannerError(json.error || 'Could not generate roadmap.');
        return;
      }
      setBriefResult(json.brief);
    } catch {
      setPlannerError('Network unavailable. Please verify connection.');
    } finally {
      setPlannerLoading(false);
    }
  };

  const handleSaveBriefToCloud = async () => {
    if (!briefResult) return;
    setBriefSavedMsg(null);
    let user = firebaseUser;
    if (!user) {
      user = await onRequireGoogleSignIn();
    }
    if (!user) return;

    const summary = `${briefResult.headline} (${briefResult.timeline})\nStack: ${briefResult.techStack.join(', ')}\nMilestones: ${briefResult.roadmapSteps.join(' | ')}\nImpact: ${briefResult.estimatedImpact}`;
    await saveProjectBrief(user.uid, {
      title: briefResult.headline,
      serviceTrack: briefResult.recommendedService,
      budgetEstimate: plannerBudget,
      notes: plannerGoal,
      aiSummary: summary,
    });
    setBriefSavedMsg('Saved to your Google Cloud Workspace.');
  };

  return (
    <section
      id="ai-studio"
      onClick={(e) => onTrackClick('services', 'AI Command Studio', e)}
      className="border-t border-slate-200 bg-theme-surface py-20 dark:border-slate-800"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-theme-accent">
              Interactive AI Studio
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Live Voice Consultant, Brand Asset Studio &amp; Roadmap AI
            </h2>
          </div>

          <div
            role="tablist"
            aria-label="AI Command Studio Tools"
            className="inline-flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-theme-subtle p-1 dark:border-slate-700"
          >
            {(
              [
                { id: 'voice', label: 'Live Voice Call', icon: Mic },
                { id: 'image', label: 'Create & Edit Images', icon: ImageIcon },
                { id: 'planner', label: 'AI Strategy Brief', icon: Compass },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-theme-accent text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab 1: Real-Time Voice Conversation (gemini-3.8-live) */}
        {activeTab === 'voice' && (
          <motion.div
            key="studio-voice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="mt-8 grid gap-6 lg:grid-cols-12"
          >
            <div className="rounded-2xl border border-slate-200 bg-theme-subtle p-6 dark:border-slate-800 lg:col-span-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-theme-accent" />
                  <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                    Real-Time Voice Advisor
                  </h3>
                </div>
                <span className="font-mono-tabular text-[11px] font-semibold uppercase text-theme-accent">
                  {voiceStatus === 'live' ? 'Live Audio' : voiceStatus === 'connecting' ? 'Connecting' : 'Ready'}
                </span>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Speak naturally with Asif Digital&apos;s real-time Gemini Live voice consultant for instant project scoping, Academy guidance, or FYP architecture advice.
              </p>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">Advisor Mode</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['agency', 'academy', 'fyp'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        disabled={voiceStatus !== 'idle'}
                        onClick={() => setVoiceMode(m)}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors disabled:opacity-60 cursor-pointer ${
                          voiceMode === m
                            ? 'border-theme-accent bg-theme-accent text-white'
                            : 'border-slate-200 bg-theme-surface text-slate-700 dark:border-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {m === 'agency' ? 'Agency' : m === 'academy' ? 'Academy' : 'FYP Mentor'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="live-voice-select" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Voice Persona
                  </label>
                  <select
                    id="live-voice-select"
                    disabled={voiceStatus !== 'idle'}
                    value={voiceName}
                    onChange={(e) => setVoiceName(e.target.value as VoiceName)}
                    className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3 py-2 text-xs text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:text-white"
                  >
                    <option value="Zephyr">Zephyr · Clear Strategist</option>
                    <option value="Kore">Kore · Warm Studio Lead</option>
                    <option value="Puck">Puck · Energetic Coach</option>
                    <option value="Fenrir">Fenrir · Executive Architect</option>
                    <option value="Charon">Charon · Technical Mentor</option>
                  </select>
                </div>

                {/* Live Audio Spectrum Visualizer */}
                <div className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-theme-surface px-4 dark:border-slate-800">
                  {[0.45, 0.75, 1, 0.85, 0.6, 0.95, 0.7, 0.5].map((mult, idx) => (
                    <span
                      key={idx}
                      aria-hidden="true"
                      className="h-7 w-1.5 origin-center rounded-full bg-theme-accent transition-transform duration-100"
                      style={{
                        transform: `scaleY(${voiceStatus === 'live' ? Math.max(0.18, audioLevel * mult) : 0.16})`,
                      }}
                    />
                  ))}
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {voiceStatus === 'idle' ? (
                    <button
                      type="button"
                      onClick={startVoiceSession}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-theme-accent px-4 py-3 text-sm font-semibold text-white transition-colors cursor-pointer"
                    >
                      <Mic className="h-4 w-4" />
                      <span>Start Live Voice Call</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopVoiceSession}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 cursor-pointer"
                    >
                      <MicOff className="h-4 w-4" />
                      <span>End Voice Session</span>
                    </button>
                  )}
                </div>

                {voiceError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                    {voiceError}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-theme-subtle p-6 dark:border-slate-800 lg:col-span-7">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Live Captions &amp; Conversation Log
                  </span>
                  <button
                    type="button"
                    disabled={!userTranscript && !assistantTranscript}
                    onClick={handleSaveVoiceTranscript}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-accent hover:underline disabled:opacity-40 cursor-pointer"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    <span>Save to My Workspace</span>
                  </button>
                </div>

                <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1 text-xs leading-relaxed">
                  {!userTranscript && !assistantTranscript ? (
                    <p className="py-10 text-center text-slate-500 dark:text-slate-400">
                      Click &ldquo;Start Live Voice Call&rdquo; and allow microphone access to talk with our AI advisor in real time.
                    </p>
                  ) : (
                    <>
                      {userTranscript && (
                        <div className="rounded-xl border border-slate-200 bg-theme-surface p-3.5 dark:border-slate-800">
                          <p className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">You</p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-900 dark:text-slate-100">{userTranscript}</p>
                        </div>
                      )}
                      {assistantTranscript && (
                        <div className="rounded-xl border border-theme-accent-soft bg-theme-surface p-3.5">
                          <p className="text-[11px] font-semibold uppercase text-theme-accent">
                            Asif Digital AI ({voiceName})
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-slate-900 dark:text-slate-100">{assistantTranscript}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <form onSubmit={handleSendVoiceText} className="flex gap-2">
                  <input
                    type="text"
                    disabled={voiceStatus !== 'live'}
                    value={textFollowUp}
                    onChange={(e) => setTextFollowUp(e.target.value)}
                    placeholder={voiceStatus === 'live' ? 'Type a quick note or URL during your voice call...' : 'Start voice call to send live text nudges'}
                    className="flex-1 rounded-lg border border-slate-300 bg-theme-surface px-3.5 py-2 text-xs text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={voiceStatus !== 'live' || !textFollowUp.trim()}
                    aria-label="Send message to live voice session"
                    className="inline-flex items-center gap-1 rounded-lg bg-theme-accent px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send</span>
                  </button>
                </form>
                {voiceSavedMsg && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{voiceSavedMsg}</span>
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Tab 2: Brand & Visual Asset Studio (gemini-nano-banana-2.1) */}
        {activeTab === 'image' && (
          <motion.div
            key="studio-image"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="mt-8 grid gap-6 lg:grid-cols-12"
          >
            <form
              onSubmit={handleGenerateImage}
              className="space-y-4 rounded-2xl border border-slate-200 bg-theme-subtle p-6 dark:border-slate-800 lg:col-span-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-theme-accent" />
                  <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                    Brand &amp; Visual Studio
                  </h3>
                </div>
                <span className="font-mono-tabular text-[11px] font-semibold text-theme-accent">
                  Nano Banana 2.1
                </span>
              </div>

              <div>
                <label htmlFor="img-prompt" className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Visual Creation or Edit Prompt
                </label>
                <textarea
                  id="img-prompt"
                  rows={3}
                  required
                  value={imgPrompt}
                  onChange={(e) => setImgPrompt(e.target.value)}
                  placeholder="Describe the brand visual, product scene, or edit instruction..."
                  className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3.5 py-2.5 text-xs leading-relaxed text-slate-900 dark:border-slate-700 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="img-ratio" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Aspect Ratio
                  </label>
                  <select
                    id="img-ratio"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as '1:1' | '4:3' | '3:4' | '16:9' | '9:16')}
                    className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:text-white"
                  >
                    <option value="16:9">16:9 · Hero Banner</option>
                    <option value="1:1">1:1 · Social Square</option>
                    <option value="4:3">4:3 · Case Study</option>
                    <option value="3:4">3:4 · Portrait Card</option>
                    <option value="9:16">9:16 · Story / Reel</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="img-size" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Resolution
                  </label>
                  <select
                    id="img-size"
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as '1K' | '2K' | '4K')}
                    className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:text-white"
                  >
                    <option value="1K">1K · Fast Draft</option>
                    <option value="2K">2K · Studio Crisp</option>
                    <option value="4K">4K · Print Master</option>
                  </select>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Optional Source Image (for Image Editing)
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-theme-surface px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{sourcePreviewUrl ? 'Replace Image' : 'Upload Reference'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleUploadReferenceImage}
                      className="hidden"
                    />
                  </label>
                  {sourcePreviewUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setSourceImageBase64('');
                        setSourcePreviewUrl('');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useSearchGrounding}
                  onChange={(e) => setUseSearchGrounding(e.target.checked)}
                  className="h-4 w-4 accent-theme"
                />
                <span>Use Google Web &amp; Image Search grounding</span>
              </label>

              <button
                type="submit"
                disabled={imageLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-theme-accent px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                <span>
                  {imageLoading
                    ? 'Rendering with Nano Banana 2.1...'
                    : sourceImageBase64
                    ? 'Edit Uploaded Image'
                    : 'Generate Brand Artwork'}
                </span>
              </button>

              {imageError && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                  {imageError}
                </div>
              )}
              {assetSavedMsg && (
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{assetSavedMsg}</p>
              )}
            </form>

            <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-theme-subtle p-6 dark:border-slate-800 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Rendered Canvas
                </span>
                {generatedImageUrl && (
                  <a
                    href={generatedImageUrl}
                    download="asif-digital-asset.png"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-theme-accent hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download PNG</span>
                  </a>
                )}
              </div>

              <div className="mt-4 flex min-h-[280px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-theme-surface p-3 dark:border-slate-800">
                {generatedImageUrl ? (
                  <img
                    src={generatedImageUrl}
                    alt={imgPrompt}
                    className="max-h-[420px] w-auto rounded-lg object-contain"
                  />
                ) : sourcePreviewUrl ? (
                  <div className="text-center">
                    <img
                      src={sourcePreviewUrl}
                      alt="Uploaded reference"
                      className="mx-auto max-h-[280px] w-auto rounded-lg object-contain"
                    />
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      Reference image ready — enter an edit prompt and click &ldquo;Edit Uploaded Image&rdquo;.
                    </p>
                  </div>
                ) : (
                  <p className="max-w-sm text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Generate bespoke hero visuals, e-commerce banners, or upload an image to edit with <span className="font-semibold">gemini-nano-banana-2.1</span>.
                  </p>
                )}
              </div>

              {imageCommentary && (
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{imageCommentary}</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Tab 3: AI Architecture & Strategy Brief (gemini-4-hydrogen) */}
        {activeTab === 'planner' && (
          <motion.div
            key="studio-planner"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="mt-8 grid gap-6 lg:grid-cols-12"
          >
            <form
              onSubmit={handleGenerateBrief}
              className="space-y-4 rounded-2xl border border-slate-200 bg-theme-subtle p-6 dark:border-slate-800 lg:col-span-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="h-5 w-5 text-theme-accent" />
                  <h3 className="font-display text-lg font-bold text-slate-950 dark:text-white">
                    AI Execution Roadmap
                  </h3>
                </div>
                <span className="font-mono-tabular text-[11px] font-semibold text-theme-accent">
                  Gemini 4 Hydrogen
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="plan-track" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Track
                  </label>
                  <select
                    id="plan-track"
                    value={plannerTrack}
                    onChange={(e) => setPlannerTrack(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:text-white"
                  >
                    <option value="Agency Build">Agency Build</option>
                    <option value="Career Academy">Career Academy</option>
                    <option value="University FYP">University FYP</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="plan-budget" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Budget / Fee Tier
                  </label>
                  <select
                    id="plan-budget"
                    value={plannerBudget}
                    onChange={(e) => setPlannerBudget(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:text-white"
                  >
                    <option value="PKR 25,000 - 60,000">PKR 25k - 60k</option>
                    <option value="PKR 100,000 - 250,000">PKR 100k - 250k</option>
                    <option value="PKR 250,000+">PKR 250k+</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="plan-industry" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Industry or University Domain
                </label>
                <input
                  id="plan-industry"
                  type="text"
                  value={plannerIndustry}
                  onChange={(e) => setPlannerIndustry(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:text-white"
                />
              </div>

              <div>
                <label htmlFor="plan-goal" className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  What are you building or learning?
                </label>
                <textarea
                  id="plan-goal"
                  rows={3}
                  required
                  value={plannerGoal}
                  onChange={(e) => setPlannerGoal(e.target.value)}
                  placeholder="e.g. Launch a bilingual Shopify brand in Lahore with COD verification and Meta retargeting..."
                  className="w-full rounded-lg border border-slate-300 bg-theme-surface px-3.5 py-2.5 text-xs text-slate-900 dark:border-slate-700 dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={plannerLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-theme-accent px-4 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60 cursor-pointer"
              >
                <Sparkles className="h-4 w-4" />
                <span>{plannerLoading ? 'Architecting Roadmap...' : 'Generate AI Execution Brief'}</span>
              </button>

              {plannerError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                  {plannerError}
                </div>
              )}
            </form>

            <div className="rounded-2xl border border-slate-200 bg-theme-subtle p-6 dark:border-slate-800 lg:col-span-7">
              {!briefResult ? (
                <div className="flex h-full min-h-[280px] items-center justify-center text-center">
                  <p className="max-w-md text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    Describe your business objective or Final Year Project idea to receive a structured 4-step milestone plan, recommended stack, and timeline — ready to save to your Cloud Workspace.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                    <div>
                      <p className="text-xs font-semibold text-theme-accent">{briefResult.recommendedService}</p>
                      <h4 className="mt-1 font-display text-xl font-bold text-slate-950 dark:text-white">
                        {briefResult.headline}
                      </h4>
                    </div>
                    <span className="font-mono-tabular text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {briefResult.timeline}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      4-Step Milestones
                    </p>
                    <ol className="mt-2 space-y-2 text-xs text-slate-700 dark:text-slate-200">
                      {briefResult.roadmapSteps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-theme-surface p-2.5 dark:border-slate-800">
                          <span className="font-mono-tabular font-bold text-theme-accent">0{idx + 1}</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Recommended Stack
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                        {briefResult.techStack.join(' · ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Expected Outcome
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {briefResult.estimatedImpact}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={handleSaveBriefToCloud}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-theme-accent px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                    >
                      <BookmarkPlus className="h-3.5 w-3.5" />
                      <span>Save Brief to Workspace</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onPrefillConsult(
                          briefResult.recommendedService,
                          `AI Roadmap: ${briefResult.headline} (${briefResult.timeline}) — ${briefResult.roadmapSteps.join('; ')}`,
                          plannerBudget
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-theme-surface px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <span>Attach to Consultation Form</span>
                    </button>
                    {briefSavedMsg && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>{briefSavedMsg}</span>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
