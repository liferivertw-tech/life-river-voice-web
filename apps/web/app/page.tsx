"use client";

import type { ChatMessage, ConversationMessagesResponse, TextMessageResponse } from "@life-river/shared-types";
import { FormEvent, useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface SpeechRecognitionResultEventLike {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export default function Home() {
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updatedAt: string; messageCount: number }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceProvider, setVoiceProvider] = useState<"openai" | "browser">("openai");
  const [openAiVoice, setOpenAiVoice] = useState("marin");
  const [browserVoice, setBrowserVoice] = useState("");
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [wakeMode, setWakeMode] = useState(false);
  const [wakeHeard, setWakeHeard] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string>();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeSubmittedRef = useRef(false);
  const wakeQuestionRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speechRequestRef = useRef(0);

  useEffect(() => {
    const savedProvider = window.localStorage.getItem("life-river-voice-provider");
    const savedOpenAiVoice = window.localStorage.getItem("life-river-openai-voice");
    const savedBrowserVoice = window.localStorage.getItem("life-river-browser-voice");
    if (savedProvider === "openai" || savedProvider === "browser") setVoiceProvider(savedProvider);
    if (savedOpenAiVoice) setOpenAiVoice(savedOpenAiVoice);
    if (savedBrowserVoice) setBrowserVoice(savedBrowserVoice);

    if (!("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const chineseVoices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith("zh"));
      setBrowserVoices(chineseVoices);
      setBrowserVoice((current) => current || chineseVoices.find((voice) => /google/i.test(voice.name))?.name || chineseVoices[0]?.name || "");
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("life-river-voice-provider", voiceProvider);
    window.localStorage.setItem("life-river-openai-voice", openAiVoice);
    window.localStorage.setItem("life-river-browser-voice", browserVoice);
  }, [voiceProvider, openAiVoice, browserVoice]);

  useEffect(() => {
    void refreshConversations();
  }, [messages]);

  async function refreshConversations() {
    try {
      const response = await fetch(`${API_URL}/api/v1/conversations`);
      if (!response.ok) return;
      const data = await response.json() as { conversations: Array<{ id: string; title: string; updatedAt: string; messageCount: number }> };
      setConversations(data.conversations.filter((conversation) => conversation.messageCount > 0));
    } catch {
      // The chat remains usable if history is temporarily unavailable.
    }
  }

  async function openConversation(id: string) {
    stopSpeech();
    setPending(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/v1/conversations/${id}/messages`);
      if (!response.ok) throw new Error("Unable to load conversation");
      const data = await response.json() as { conversationId: string; messages: ChatMessage[] };
      setConversationId(data.conversationId);
      setMessages(data.messages);
      window.localStorage.setItem("life-river-conversation-id", data.conversationId);
      setHistoryOpen(false);
    } catch {
      setError("無法載入這段對話，請稍後再試。");
    } finally {
      setPending(false);
    }
  }

  function startNewConversation() {
    stopSpeech();
    setConversationId(undefined);
    setMessages([]);
    setText("");
    setError("");
    window.localStorage.removeItem("life-river-conversation-id");
    setHistoryOpen(false);
  }

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    setSpeechSupported(Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition));
    setTtsSupported("speechSynthesis" in window);
    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const savedId = window.localStorage.getItem("life-river-conversation-id");
    if (!savedId) return;
    fetch(`${API_URL}/api/v1/conversations/${encodeURIComponent(savedId)}/messages`)
      .then(async (response) => {
        if (!response.ok) throw new Error("無法載入先前對話");
        return response.json() as Promise<ConversationMessagesResponse>;
      })
      .then((data) => { setConversationId(data.conversationId); setMessages(data.messages); })
      .catch(() => window.localStorage.removeItem("life-river-conversation-id"));
  }, []);

  function startListening() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("目前瀏覽器不支援語音輸入，請使用最新版 Chrome 或 Edge。");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (wakeSubmittedRef.current) return;
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join("");
      setText(transcript);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => recognition.stop(), 2000);
    };
    recognition.onerror = () => {
      setError("語音辨識失敗，請確認已允許麥克風權限後再試一次。");
      setListening(false);
    };
    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current = null;
      setListening(false);
    };
    setError("");
    setListening(true);
    recognition.start();
  }

  function stopListening() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.stop();
  }

  function startWakeListening() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("目前瀏覽器不支援喚醒詞，請使用最新版 Chrome 或 Edge。");
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join("");
      setText(transcript);
      const normalized = transcript.replace(/[，,。！？!?\s]/g, "");
      const wakeWords = ["小河", "小何", "小和", "小盒"];
      const matchedWakeWord = wakeWords.find((word) => normalized.includes(word));
      if (!matchedWakeWord) return;
      const wakeIndex = normalized.indexOf(matchedWakeWord);
      setWakeHeard(true);
      const question = normalized.slice(wakeIndex + matchedWakeWord.length).trim();
      if (!question) return;
      wakeQuestionRef.current = question;
      setText(question);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        const completeQuestion = wakeQuestionRef.current.trim();
        if (!completeQuestion || wakeSubmittedRef.current) return;
        wakeSubmittedRef.current = true;
        recognition.stop();
        void sendText(completeQuestion);
      }, 2000);
    };
    recognition.onerror = () => {
      setError("喚醒詞辨識失敗，請確認麥克風權限後再試一次。");
      setWakeMode(false);
      setWakeHeard(false);
    };
    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current = null;
      setWakeMode(false);
      setWakeHeard(false);
    };
    setError("");
    wakeSubmittedRef.current = false;
    wakeQuestionRef.current = "";
    setWakeHeard(false);
    setWakeMode(true);
    recognition.start();
  }

  function stopWakeListening() {
    recognitionRef.current?.stop();
    setWakeMode(false);
    setWakeHeard(false);
  }

  function speakWithBrowser(textToSpeak: string, messageId: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      textToSpeak.replace(/[*_`#>-]/g, " ").replace(/\s+/g, " ").trim()
    );
    utterance.lang = "zh-TW";
    utterance.rate = 1;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.name === browserVoice)
      ?? voices.find((voice) => /google/i.test(voice.name) && voice.lang.toLowerCase().startsWith("zh"))
      ?? voices.find((voice) => voice.lang.toLowerCase() === "zh-tw")
      ?? voices.find((voice) => voice.lang.toLowerCase().startsWith("zh"))
      ?? null;
    utterance.onend = () => setPlayingMessageId((current) => current === messageId ? undefined : current);
    utterance.onerror = () => setPlayingMessageId((current) => current === messageId ? undefined : current);
    window.speechSynthesis.speak(utterance);
  }

  async function speak(textToSpeak: string, messageId: string) {
    if (!voiceEnabled) return;
    const requestId = ++speechRequestRef.current;
    setPlayingMessageId(messageId);
    if (voiceProvider === "browser") {
      speakWithBrowser(textToSpeak, messageId);
      return;
    }
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioRef.current = null;
      audioUrlRef.current = null;
      const response = await fetch(`${API_URL}/api/v1/speech`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: textToSpeak, voice: openAiVoice })
      });
      if (!response.ok) throw new Error("Natural voice unavailable");
      if (requestId !== speechRequestRef.current || !voiceEnabled) return;
      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;
      const cleanupAudio = () => {
        if (audioRef.current === audio) audioRef.current = null;
        if (audioUrlRef.current === audioUrl) audioUrlRef.current = null;
        URL.revokeObjectURL(audioUrl);
        setPlayingMessageId((current) => current === messageId ? undefined : current);
      };
      audio.onended = cleanupAudio;
      audio.onerror = cleanupAudio;
      await audio.play();
    } catch {
      if (requestId === speechRequestRef.current && voiceEnabled) speakWithBrowser(textToSpeak, messageId);
    }
  }

  function stopSpeech() {
    speechRequestRef.current += 1;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setPlayingMessageId(undefined);
  }

  function toggleVoice() {
    setVoiceEnabled((current) => {
      if (current) {
        speechRequestRef.current += 1;
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        audioRef.current?.pause();
        audioRef.current = null;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      return !current;
    });
  }

  async function sendText(value: string) {
    if (!value || pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`${API_URL}/api/v1/messages/text`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: value, conversationId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "訊息傳送失敗");
      const data = result as TextMessageResponse;
      setConversationId(data.conversationId);
      window.localStorage.setItem("life-river-conversation-id", data.conversationId);
      setMessages((current) => [...current, data.userMessage, data.assistantMessage]);
      setText("");
      void speak(data.assistantMessage.content, data.assistantMessage.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "訊息傳送失敗");
    } finally { setPending(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void sendText(text.trim());
  }

  return <main>
    <button className="history-toggle" type="button" onClick={() => setHistoryOpen((open) => !open)} aria-label="開啟對話紀錄">☰ 對話紀錄</button>
    <aside className={`history-panel ${historyOpen ? "open" : ""}`} aria-label="對話紀錄">
      <div className="history-heading"><strong>對話紀錄</strong><button type="button" onClick={() => setHistoryOpen(false)} aria-label="關閉對話紀錄">×</button></div>
      <button className="new-conversation" type="button" onClick={startNewConversation}>＋ 新對話</button>
      <div className="conversation-list">
        {conversations.length === 0 ? <p className="history-empty">還沒有對話紀錄</p> : conversations.map((conversation) => <button className={`conversation-item ${conversation.id === conversationId ? "active" : ""}`} type="button" key={conversation.id} onClick={() => void openConversation(conversation.id)}><strong>{conversation.title}</strong><span>{conversation.messageCount} 則訊息 · {new Date(conversation.updatedAt).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></button>)}
      </div>
    </aside>
    {historyOpen && <button className="history-backdrop" type="button" onClick={() => setHistoryOpen(false)} aria-label="關閉對話紀錄" />}
    <section className="chat">
      <header><span className="river">〰</span><div><h1>小河</h1><p>Life River Voice · 可選人物語音</p></div><div className="header-actions"><label className="voice-select"><span>語音來源</span><select value={voiceProvider} onChange={(event) => setVoiceProvider(event.target.value as "openai" | "browser")}><option value="openai">OpenAI 自然語音</option><option value="browser">Google／瀏覽器語音</option></select></label><label className="voice-select"><span>人物聲音</span>{voiceProvider === "openai" ? <select value={openAiVoice} onChange={(event) => setOpenAiVoice(event.target.value)}><option value="marin">Marin・溫暖自然</option><option value="cedar">Cedar・沉穩柔和</option><option value="coral">Coral・清亮親切</option><option value="nova">Nova・活潑明亮</option><option value="onyx">Onyx・低沉穩重</option><option value="sage">Sage・從容中性</option><option value="shimmer">Shimmer・柔和清晰</option><option value="alloy">Alloy・自然中性</option></select> : <select value={browserVoice} onChange={(event) => setBrowserVoice(event.target.value)}>{browserVoices.length === 0 ? <option value="">系統中文預設</option> : browserVoices.map((voice) => <option value={voice.name} key={`${voice.name}-${voice.lang}`}>{voice.name}（{voice.lang}）</option>)}</select>}</label>{speechSupported && <button className={`wake-toggle ${wakeMode ? "active" : ""}`} type="button" onClick={wakeMode ? stopWakeListening : startWakeListening} disabled={pending || listening} aria-label={wakeMode ? "停止喚醒模式" : "啟動小河喚醒詞"} title={wakeMode ? "停止喚醒模式" : "啟動小河喚醒詞"}>{wakeMode ? (wakeHeard ? "請說問題…" : "等待小河…") : "小河喚醒"}</button>}{ttsSupported && <button className={`voice-toggle ${voiceEnabled ? "enabled" : ""}`} type="button" onClick={toggleVoice} aria-label={voiceEnabled ? "關閉語音回覆" : "開啟語音回覆"} title={voiceEnabled ? "關閉語音回覆" : "開啟語音回覆"}>{voiceEnabled ? "🔊" : "🔇"}</button>}</div></header>
      <div className="messages" aria-live="polite">
        {messages.length === 0 && <div className="welcome"><h2>嗨，我是小河。</h2><p>先從文字開始聊聊吧。語音、工具與記憶會沿著這條河逐步加入。</p></div>}
        {messages.map((message) => <div className={`message ${message.role}`} key={message.id}><span>{message.role === "user" ? "你" : "小河"}</span><div className="message-row"><p>{message.content}</p>{message.role === "assistant" && <button className={`stop-speech ${playingMessageId === message.id ? "playing" : ""}`} type="button" onClick={() => playingMessageId === message.id ? stopSpeech() : void speak(message.content, message.id)} aria-label={playingMessageId === message.id ? "停止播放這段回答" : "播放這段回答"} title={playingMessageId === message.id ? "停止播放" : "播放這段回答"}>{playingMessageId === message.id ? "■" : "▶"}</button>}</div></div>)}
        {pending && <div className="message assistant"><span>小河</span><p className="thinking">正在想…</p></div>}
      </div>
      <form onSubmit={submit}>
        <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} placeholder="和小河說點什麼…" rows={2} maxLength={10000} disabled={pending} />
        {speechSupported && <button className={`mic ${listening ? "listening" : ""}`} type="button" onClick={listening ? stopListening : startListening} disabled={pending || wakeMode} aria-label={listening ? "停止聆聽" : "使用語音輸入"} title={listening ? "停止聆聽" : "語音輸入"}>{listening ? "■" : "🎙"}</button>}
        <button className="send" type="submit" disabled={!text.trim() || pending} aria-label="傳送">↑</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </main>;
}
