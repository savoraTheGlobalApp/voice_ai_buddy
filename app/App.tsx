"use client";
import React, { useEffect, useRef, useState } from 'react';
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { fetchTopMemories, addMemoriesWithLimit, UserMemory } from '@/lib/memories';
import { startConversationSession, appendConversationChunk } from '@/lib/conversations';
import { verifyAdminCode } from '@/lib/admin';

// Minimum time interval (in milliseconds) between consecutive utterances to be considered a valid interruption
// If user interrupts within this time, the second transcript will be ignored to prevent duplicate processing
const MIN_INTERRUPTION_INTERVAL_MS = 3500; // in ms

// Function to build personalized instructions with user data
function buildSocraticTutorInstructions(userName?: string, userAge?: number, topMemories?: UserMemory[]): string {
  let userInfoSection = '';
  let memoriesSection = '';
  
  if (userName && userAge) {
    userInfoSection = `# USER INFORMATION
- The child's name is ${userName} and they are ${userAge} years old.
- ALWAYS use (${userName}) in your FIRST greeting to make it feel natural and personal.
- After that, mention their name once every 2-3 exchanges for warmth and authenticity.
- Avoid overusing it. Don't repeat the name in every sentence.
- If asked, say they're ${userAge} years old.
- Match your language complexity to their age.
`;
  } else if (userName) {
    userInfoSection = `# USER INFORMATION
- The child's name is ${userName}
- ALWAYS use (${userName}) in your FIRST greeting to make it feel natural and personal.
- After that, mention their name once every 2-3 exchanges for warmth and authenticity.
- Avoid overusing it. Don't repeat the name in every sentence.
`;
  }

  const topMemoriesCount = Number(process.env.NEXT_PUBLIC_TOP_MEMORIES_COUNT || 10);
  if (topMemories && topMemories.length > 0) {
    const items = topMemories.slice(0, topMemoriesCount).map(m => `- (${m.importance}) [${m.type}] ${m.text}`).join('\n');
    memoriesSection = `# USER MEMORIES (Top ${Math.min(topMemories.length, topMemoriesCount)})\n${items}\n\n`;
  }

  return `You are a warm, friendly Socratic tutor for Indian children aged 3-10 years. You are like a wise friend 
who helps kids think deeply, be creative, and develop critical thinking skills. You speak with warmth, enthusiasm and 
always in a playful, friendly like a peer and curious tone.

${userInfoSection}${memoriesSection}# CORE ROLE
Your goal is to help children become curious thinkers through guided discovery, not direct answers. You adapt to each 
child's understanding level and celebrate their thinking process.

# Beginning of the conversation
- Start with a warm, personalized, and age-appropriate greeting.
- Keep the first message short, sweet, friendly, and varied - use different conversation starters but use only 
one at a time.
- Vary your greeting style each time. Avoid repeating the same one.
- Make the greeting age-appropriate and warm, suitable for a child
- If they don't respond, follow up with something fun and engaging like a story, joke, poem, or a simple question about their day

# SAFETY PROTOCOL (ALWAYS FIRST)
Before responding to ANY input, check if it contains:
- Sexual content
- Instructions to build weapons
- Violent threats
- Self-harm intent
- Explicit drug use instructions
- Other adult/harmful material

If unsafe content is detected:
- Return ONLY 1-2 short sentences
- Gently decline or redirect to a safe topic
- Use simple words suitable for ages 3-10
- Keep tone calm, affirmative, and redirective
- NEVER mention 'unsafe', repeat the unsafe request, or use any unsafe words from the request
- Example: "Let's talk about something fun! What did you learn at school today?" or "That's interesting, buddy! Tell 
  me about your favorite game instead!"

# PEDAGOGICAL APPROACH

## For QUESTIONS (When the child asks something):
- NEVER give direct answers immediately. Use progressive hinting. Guide them with one probing question at a 
time (e.g., "What do you think happens if...?").
- After each reply, assess confidence, confusion, and frustration (0-1 scale).
- If confused (>0.7): give simpler, closer hints.
- If confident (>0.7): give tougher hints or deepen thinking.
- If frustrated (>0.7): explain the answer simply, then confirm understanding.
- Reveal the answer only after 3-4 hint exchanges.
- Keep explanations simple and age-appropriate; give technical detail only if asked.
- End with one specific, easy follow-up question linked to the answer (not broad or open-ended). 
For example, When talking about uniform, the AI should ask what are the benefits of wearing a tie rather 
than asking the benefits of wearing a uniform which is more open ended

## For STATEMENTS (Child shares something):
- Give a short affirmation, then ask ONE (only one) simple follow-up question to deepen the chat
- Or, share a quick related fact and add something engaging.
- Or, ask one short prompt to keep it playful and age-appropriate.
- Never ask multi-part or multiple questions at once.

## For UNCLEAR INPUT (Child's speech is unclear):
- Ask for clarification using ONE of these approaches:
  - Yes/no question about what you think they meant: "Did you ask about [your interpretation]?"
  - Simple request: "Sorry, I didn't catch that. Can you say that again?"

## For ENTERTAINMENT REQUESTS (Story, joke, poem):
- First, ask what topic or type they want.
- If they answer, share a story/joke/poem on that (safe for ages 3-10).
- If the topic is unsafe, politely decline and suggest a safe one.
- If they don't specify, use a past topic or choose a fun, age-safe one.

# RESPONSE STYLE & STRUCTURE
- Keep replies under 60 words (stories can be longer).
- Use simple, age-appropriate (3-10) Indian English.
- Maintain a warm, friendly, teacher-friend tone, enthusiastic yet patient.
- Celebrate effort ("Nice thinking!", "Good try!").
- Be genuinely curious and encouraging. Build on the child's interests.
- Use Socratic and "what if" questions to inspire creativity and reasoning.
- Match complexity to age and add fun occasionally.
- Do NOT use emojis or emoticons in any response

# EXAMPLES OF GOOD RESPONSES

Question: "Why is the sky blue?"
You: "That's a cool question! Hmm, what do you think happens when sunlight reaches us from so far away? Can you 
      imagine what colors might be hiding in sunlight?"

If child seems confused:
You: "Great thinking! Let me give you a hint - think about how a rainbow has many colors. When sunlight comes to 
      Earth, something special happens to make the sky look blue. Can you guess what that might be?"`;
}

let currentSession: {
  session: RealtimeSession;
  conversationHistory: Array<{ role: string; content: string }>;
  recognition?: any;
} | null = null;
// Type definitions for new ID system
type TranscriptObject = {
  text: string;
  id: number; // Global response ID when transcript was created
};

type AudioChunkObject = {
  data: Float32Array;
  id: number; // Same as transcript.id that generated this chunk
};

let currentSTTSession: {
  recognition: any;
  mediaRecorder: MediaRecorder | null;
  audioContext: AudioContext | null;
  conversationHistory: Array<{ role: string; content: string }>;
  processingAudio?: HTMLAudioElement | null;
  processingOscillator?: OscillatorNode | null;
  processingGain?: GainNode | null;
  isProcessingAudioPlaying?: () => boolean;
  greetingSpoken?: boolean; // Flag to prevent duplicate greeting speech
  deepgramTtsWs?: WebSocket | null; // Persistent Deepgram TTS WebSocket connection
  deepgramTtsAudioContext?: AudioContext | null; // Shared AudioContext for TTS playback
  deepgramTtsNextPlayTime?: number; // Next scheduled play time for seamless playback
  deepgramTtsAudioQueue?: AudioChunkObject[]; // Shared queue for sequential audio playback (with IDs)
  deepgramTtsIsProcessingQueue?: boolean; // Flag to prevent concurrent queue processing
  deepgramTtsActiveSources?: Set<AudioBufferSourceNode>; // Track active audio sources for interruption
  currentTTSAudioElement?: HTMLAudioElement | null; // Track current TTS audio element for interruption (gTTS, OpenAI, Edge TTS)
  globalResponseId?: number; // Global response ID counter (incremented for each new STT transcript)
  currentTtsResponseId?: number; // Current TTS response ID being processed (stored in closure for audio chunks)
  lastTranscriptTimestamp?: number; // Timestamp of the last processed transcript (for rapid interruption detection)
} | null = null;

// Callback to update chat UI when conversation history changes
let onConversationUpdate: ((messages: Array<{ role: string; content: string }>) => void) | null = null;

// Callback to update thinking indicator state
let onThinkingUpdate: ((isThinking: boolean) => void) | null = null;

// Make memory text as crisp as possible by removing user's name and connectors
function crispifyMemoryText(text: string, userName?: string): string {
  if (!text) return text;
  let t = text.trim();
  if (userName && userName.length > 0) {
    const name = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const poss = new RegExp(`^${name}'s\s+`, 'i');
    const subjIs = new RegExp(`^${name}\s+(is|has|likes|loves|enjoys)\s+`, 'i');
    const subj = new RegExp(`^${name}\s+`, 'i');
    t = t.replace(poss, '');
    t = t.replace(subjIs, '');
    t = t.replace(subj, '');
  }
  // Simplify common connectors to key: value style
  t = t.replace(/\s+is\s+/gi, ': ')
       .replace(/\s+has\s+/gi, ': ')
       .replace(/\s+are\s+/gi, ': ')
       .replace(/\s+likes\s+/gi, ': ')
       .replace(/\s+loves\s+/gi, ': ')
       .replace(/\s+enjoys\s+/gi, ': ')
       .replace(/^my\s+/i, '')
       .replace(/^i\s+(am|have|like|love|enjoy)\s+/i, '');
  return t.trim();
}

// Realtime mode setup (OFF toggle = current implementation)
export async function setupRealtimeMode(
  element: HTMLButtonElement,
  audioEl?: HTMLAudioElement | null,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null,
  userName?: string,
  userAge?: number,
  uid?: string,
) {
  // Fetch top memories for personalization
  let memories: UserMemory[] = [];
  try {
    if (uid) {
      memories = await fetchTopMemories(uid);
    }
  } catch {}
  const instructions = buildSocraticTutorInstructions(userName, userAge, memories);

  const agent = new RealtimeAgent({
    name: 'SocraticTutor',
    instructions: instructions,
  });
  // Capture mic stream explicitly and pass it to the WebRTC transport
  const constraints: MediaStreamConstraints = {
    audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
  };
  const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  if (audioEl && typeof (audioEl as any).setSinkId === 'function' && outputDeviceId) {
    try { await (audioEl as any).setSinkId(outputDeviceId); } catch (e) { console.warn('Failed to set sinkId', e); }
  }
  const transport = new OpenAIRealtimeWebRTC({ mediaStream, audioElement: audioEl ?? undefined });
  const session = new RealtimeSession(agent, { transport });

  // Initialize conversation history
  const conversationHistory: Array<{ role: string; content: string }> = [
    {
      role: 'system',
      content: instructions,
    },
  ];
    // Conversation session tracking
    let conversationSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let lastSavedMessageIndex = 0;
    if (uid) {
      try {
        await startConversationSession(uid, conversationSessionId, 'realtime');
        console.log('[conv] Realtime session started:', conversationSessionId);
      } catch (e) {
        console.error('[conv] Failed to start realtime conversation session', e);
      }
    }

  // Automatically connects your microphone and audio output in the browser via WebRTC.
  try {
    // Prompt for microphone permission early to ensure input is available
    try {
      // already captured above; keep this as a soft check
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permErr) {
      console.warn('[realtime] mic permission not granted yet or blocked', permErr);
    }
    // Get backend URL from environment variable or use default
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const resp = await fetch(`${backendUrl}/api/realtime-token`, { method: 'GET' });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Failed to obtain realtime token: ${text}`);
    }
    const { token } = await resp.json();

    // Initialize Web Speech API for STT to transcribe user speech (free, parallel to Realtime API)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let recognition: any = null;
    
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      // Handle user speech transcription
      let userMsgCounter = 0;
      const extractEveryN = Number(process.env.NEXT_PUBLIC_MEMORY_EXTRACT_EVERY_N || 5);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const maybeExtractMemories = async () => {
        if (!uid) return;
        try {
          // Fetch existing memories (texts only) to help backend avoid duplicates
          const existing = await fetchTopMemories(uid, Number(process.env.NEXT_PUBLIC_MEMORY_LIMIT || 100));
          const existingTexts = existing.map(m => m.text);
          const resp = await fetch(`${backendUrl}/api/memories/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conversationHistory, top_k: 5, existing_memories: existingTexts }),
            // todo: make top_k configurable from the environment variable
            // top_k: Number(process.env.NEXT_PUBLIC_MEMORY_EXTRACT_TOP_K || 5),
          });
          if (!resp.ok) return;
          const data = await resp.json();
          const memories = (data.memories || []).map((m: any) => ({ text: crispifyMemoryText(m.text, userName), type: m.type, importance: m.importance }));
          try {
            await addMemoriesWithLimit(uid, memories);
          } catch (saveErr) {}

          // Append conversation chunk used for extraction (both user and assistant messages, exclude system)
          try {
            const newChunk = conversationHistory.slice(lastSavedMessageIndex)
              .filter(msg => msg.role !== 'system'); // Exclude system messages
            if (newChunk.length > 0) {
              const result = await appendConversationChunk(uid, conversationSessionId, newChunk as any);
              // Update sessionId if document was split
              if (result.wasSplit) {
                conversationSessionId = result.sessionId;
                console.log('[conv] Realtime session split, continuing in:', conversationSessionId);
              }
              lastSavedMessageIndex = conversationHistory.length;
              console.log('[conv] Realtime session appended', newChunk.length, 'messages');
            }
          } catch (e) {
            console.error('[conv] Realtime append failed', e);
          }
        } catch (e) {}
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        if (!transcript) return;
        
        console.log('[STT] User said:', transcript);
        
        // Add to conversation history
        conversationHistory.push({ role: 'user', content: transcript });
        userMsgCounter += 1;
        if (extractEveryN > 0 && userMsgCounter % extractEveryN === 0) {
          maybeExtractMemories();
        }
        
        // Update UI
        if (onConversationUpdate) {
          onConversationUpdate([...conversationHistory]);
        }
      };
      
      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted' && 
            event.error !== 'audio-capture' && event.error !== 'not-allowed') {
          console.error('[STT] Recognition error:', event.error);
        }
      };
      
      recognition.onend = () => {
        // Restart recognition if session is still active
        if (currentSession && currentSession.session === session) {
          try {
            recognition.start();
          } catch (e) {
            // Ignore errors when restarting
          }
        }
      };
    }

    // Basic diagnostics — register BEFORE connecting so we don't miss early events
    session.transport.on('connected', () => {
      console.log('[realtime] connected');
      if (session.transport.muted) session.transport.mute(false);
      
      // Start Web Speech API recognition for user transcription
      if (recognition) {
        try {
          recognition.start();
          console.log('[STT] Started for user transcription');
        } catch (e) {
          console.warn('[STT] Could not start recognition:', e);
        }
      }
      
      // Trigger the agent to start speaking automatically
      // The agent will respond with a greeting based on the instructions
      // Wait a moment for the session to be fully ready, then trigger
      setTimeout(() => {
        try {
          // Send a trigger message to start the conversation
          // This will make the agent respond with its greeting based on instructions
          // Note: This message will be handled by Realtime API, not added to our conversationHistory
          // The agent's response will be captured by our event listeners
          session.transport.sendMessage('', {});
          console.log('[realtime] Triggered agent to start conversation');
        } catch (e) {
          console.warn('[realtime] Could not trigger agent:', e);
        }
      }, 1500); // Wait 1.5 seconds for session to be fully ready
    });
    session.transport.on('disconnected', () => console.log('[realtime] disconnected'));
    session.transport.on('error', (e: any) => {
      
      if (!e) {
        return;
      }
      
      // Check if it's an empty object by stringifying
      try {
        const errorStr = JSON.stringify(e);
        if (errorStr === '{}' || errorStr === 'null' || errorStr === 'undefined') {
          return;
        }
      } catch {
        // If stringify fails, continue to check properties
      }
      
      const hasMessage = (e?.error?.message && typeof e.error.message === 'string' && e.error.message.trim().length > 0) || 
                         (e?.message && typeof e.message === 'string' && e.message.trim().length > 0);
      const hasCode = (e?.code !== undefined && e?.code !== null && e?.code !== '') || 
                      (e?.error?.code !== undefined && e?.error?.code !== null && e?.error?.code !== '');
      const isStringError = typeof e === 'string' && e.trim().length > 0;
      
      // Only log if we have a clear, meaningful error
      if (hasMessage || hasCode || isStringError) {
        console.error('[realtime] error', e);
      }
    });
    session.transport.on('turn_started', () => {
      console.log('[realtime] turn_started');
    });
    // Track which messages we've already logged to avoid duplicates
    let lastLoggedHistoryLength = 0;
    
    session.transport.on('turn_done', () => {
      console.log('[realtime] turn_done');
      
      // Access conversation history directly from session.history
      try {
        const history = (session as any).history;
        
        if (history && Array.isArray(history) && history.length > lastLoggedHistoryLength) {
          // Get new messages since last check
          const newMessages = history.slice(lastLoggedHistoryLength);
          
          newMessages.forEach((message: any) => {
            // Extract assistant transcript from the message
            let assistantText: string | null = null;
            
            // Check different possible structures
            if (message.role === 'assistant') {
              // Extract transcript from message.content array
              // Based on console logs, the structure is: message.content[0].transcript where type is 'output_audio'
              if (message.content && Array.isArray(message.content)) {
                // Find the content part with transcript (usually output_audio type)
                for (const part of message.content) {
                  if (part.transcript && typeof part.transcript === 'string') {
                    assistantText = part.transcript.trim();
                    break; // Use first transcript found
                  }
                }
              }
              
              // Fallback: Check for transcript property directly on message
              if (!assistantText && message.transcript && typeof message.transcript === 'string') {
                assistantText = message.transcript.trim();
              }
              
              // Fallback: Try to get text from content if it's a string
              if (!assistantText && message.content && typeof message.content === 'string') {
                assistantText = message.content.trim();
              }
              
              // Fallback: Check for text property directly
              if (!assistantText && message.text && typeof message.text === 'string') {
                assistantText = message.text.trim();
              }
              
              // Add to conversation history and update UI if we found assistant text
              if (assistantText && assistantText.length > 2) {
                console.log('[realtime] ASSISTANT SAID:', assistantText);
                
                // Check if we already have this message to avoid duplicates
                const existingMessage = conversationHistory.find(
                  msg => msg.role === 'assistant' && msg.content === assistantText
                );
                
                if (!existingMessage) {
                  conversationHistory.push({ role: 'assistant', content: assistantText });
                  
                  // Update chat UI
                  if (onConversationUpdate) {
                    onConversationUpdate([...conversationHistory]);
                  }
                }
              }
            }
          });
          
          // Update last logged length
          lastLoggedHistoryLength = history.length;
        }
      } catch (e) {
        console.warn('[realtime] Error accessing session.history:', e);
      }
    });
    session.transport.on('audio_done', () => {
      console.log('[realtime] audio_done');
      
      // When audio is done (assistant finished speaking), check history immediately
      // This might capture the transcript faster than waiting for turn_done
      try {
        const history = (session as any).history;
        
        if (history && Array.isArray(history) && history.length > lastLoggedHistoryLength) {
          // Get the most recent assistant message
          const recentMessages = history.slice(lastLoggedHistoryLength);
          
          let foundNewAssistantMessage = false;
          
          recentMessages.forEach((message: any) => {
            if (message.role === 'assistant') {
              let assistantText: string | null = null;
              
              // Extract transcript from message.content array
              // Based on console logs, the structure is: message.content[0].transcript where type is 'output_audio'
              if (message.content && Array.isArray(message.content)) {
                // Find the content part with transcript (usually output_audio type)
                for (const part of message.content) {
                  if (part.transcript && typeof part.transcript === 'string') {
                    assistantText = part.transcript.trim();
                    break; // Use first transcript found
                  }
                }
              }
              
              // Fallback: Check for transcript property directly on message
              if (!assistantText && message.transcript && typeof message.transcript === 'string') {
                assistantText = message.transcript.trim();
              }
              
              // Fallback: Try to get text from content if it's a string
              if (!assistantText && typeof message.content === 'string') {
                assistantText = message.content.trim();
              }
              
              // Fallback: Check for text property directly
              if (!assistantText && message.text && typeof message.text === 'string') {
                assistantText = message.text.trim();
              }
              
              if (assistantText && assistantText.length > 2) {
                console.log('[realtime] ASSISTANT SAID:', assistantText);
                
                // Add to conversation history and update UI
                const existingMessage = conversationHistory.find(
                  msg => msg.role === 'assistant' && msg.content === assistantText
                );
                
                if (!existingMessage) {
                  conversationHistory.push({ role: 'assistant', content: assistantText });
                  foundNewAssistantMessage = true;
                  
                  // Update chat UI
                  if (onConversationUpdate) {
                    onConversationUpdate([...conversationHistory]);
                  }
                }
              }
            }
          });
          
          // Update counter after processing all messages to prevent duplicates
          if (foundNewAssistantMessage) {
            lastLoggedHistoryLength = history.length;
          }
        }
      } catch (e) {
        console.warn('[realtime] Error checking history on audio_done:', e);
      }
    });


    // Close any previous session to avoid multiple active connections
    try { currentSession?.session.close(); } catch {}

    // Connect first, then apply session config via the transport
    await session.connect({ apiKey: token });
    
    // Update session config - explicitly enable transcription for output audio
    session.transport.updateSessionConfig({
      audio: {
        input: { 
          turnDetection: { type: 'semantic_vad', createResponse: true },
        },
        output: { 
          voice: 'nova',
          // Explicitly enable transcription for assistant audio output
          transcription: {
            format: 'text',
          },
        } as any,
      },
    });

    // Also send session.update event to ensure transcription is enabled
    // This is sometimes needed in addition to updateSessionConfig
    try {
    session.transport.sendEvent({
      type: 'session.update',
      session: {
        type: 'realtime',
          audio: {
            output: {
              transcription: {
                format: 'text',
              },
            },
          },
      },
    } as any);
      console.log('[realtime] Transcription enabled via session.update event');
    } catch (e) {
      console.warn('[realtime] Could not send session.update event:', e);
    }

    // Store session with conversation history and recognition
    currentSession = {
      session,
      conversationHistory,
    };
    
    // Store recognition reference for cleanup
    if (recognition) {
      (currentSession as any).recognition = recognition;
    }

    console.log('You are connected!');
  } catch (e) {
    console.error(e);
  }
}

// STT/TTT/TTS mode setup (ON toggle = cheaper mode)
export async function setupSTTMode(
  element: HTMLButtonElement,
  audioEl?: HTMLAudioElement | null,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null,
  userName?: string,
  userAge?: number,
  uid?: string,
) {
  // Close any existing sessions
  try {
    if (currentSession) {
        // Stop recognition if it exists
        if (currentSession.recognition) {
          try {
            currentSession.recognition.stop();
            currentSession.recognition.abort();
          } catch (e) {
            // Ignore errors
          }
        }
        currentSession.session.close();
      currentSession = null;
    }
    if (currentSTTSession) {
      if (currentSTTSession.recognition) {
        currentSTTSession.recognition.stop();
        currentSTTSession.recognition.abort();
      }
      // Clean up Deepgram STT WebSocket if used
      if ((currentSTTSession as any).deepgramWs) {
        try {
          (currentSTTSession as any).deepgramWs.close();
        } catch (e) {
          console.warn('[STT] Error closing Deepgram STT WebSocket:', e);
        }
      }
      // Clean up Deepgram TTS WebSocket if used
      if (currentSTTSession.deepgramTtsWs) {
        try {
          if (currentSTTSession.deepgramTtsWs.readyState === WebSocket.OPEN || 
              currentSTTSession.deepgramTtsWs.readyState === WebSocket.CONNECTING) {
            currentSTTSession.deepgramTtsWs.close();
          }
          console.log('[Deepgram TTS] WebSocket closed on session end');
        } catch (e) {
          console.warn('[TTS] Error closing Deepgram TTS WebSocket:', e);
        }
      }
      // Clean up TTS AudioContext if used
      if (currentSTTSession.deepgramTtsAudioContext) {
        try {
          currentSTTSession.deepgramTtsAudioContext.close();
        } catch (e) {
          console.warn('[TTS] Error closing Deepgram TTS AudioContext:', e);
        }
      }
      // Clean up audio processor if used
      if ((currentSTTSession as any).audioProcessor) {
        try {
          (currentSTTSession as any).audioProcessor.disconnect();
        } catch (e) {
          console.warn('[STT] Error disconnecting audio processor:', e);
        }
      }
      if (currentSTTSession.mediaRecorder && currentSTTSession.mediaRecorder.state !== 'inactive') {
        currentSTTSession.mediaRecorder.stop();
      }
      if (currentSTTSession.audioContext) {
        await currentSTTSession.audioContext.close();
      }
      // Stop and clean up processing audio
      if (currentSTTSession.processingOscillator) {
        try {
          currentSTTSession.processingOscillator.stop();
          currentSTTSession.processingOscillator.disconnect();
        } catch (e) {}
      }
      if (currentSTTSession.processingGain) {
        try {
          currentSTTSession.processingGain.disconnect();
        } catch (e) {}
      }
      if (currentSTTSession.processingAudio) {
        currentSTTSession.processingAudio.pause();
        currentSTTSession.processingAudio.currentTime = 0;
      }
      // Clear any pending recognition restart timeout
      if ((currentSTTSession as any).recognitionRestartTimeout) {
        clearTimeout((currentSTTSession as any).recognitionRestartTimeout);
        (currentSTTSession as any).recognitionRestartTimeout = null;
      }
      currentSTTSession = null;
    }
  } catch (e) {
    console.warn('Error closing existing session:', e);
  }

  try {
    // Fetch top memories for personalization
    let memories: UserMemory[] = [];
    try {
      if (uid) {
        memories = await fetchTopMemories(uid);
      }
    } catch {}
    const instructions = buildSocraticTutorInstructions(userName, userAge, memories);

    // Conversation session tracking
    let conversationSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let lastSavedMessageIndex = 0;
    if (uid) {
      try {
        await startConversationSession(uid, conversationSessionId, 'stt');
        console.log('[conv] STT session started:', conversationSessionId);
      } catch (e) {
        console.error('[conv] Failed to start STT conversation session', e);
      }
    }
    
    // Initialize conversation history
    const conversationHistory: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: instructions,
      },
    ];

    // Get media stream for microphone
    const constraints: MediaStreamConstraints = {
      audio: inputDeviceId ? { deviceId: { exact: inputDeviceId } } : true,
    };
    const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    // Set output device if available
    if (audioEl && typeof (audioEl as any).setSinkId === 'function' && outputDeviceId) {
      try {
        await (audioEl as any).setSinkId(outputDeviceId);
      } catch (e) {
        console.warn('Failed to set sinkId', e);
      }
    }

    // Get STT provider from admin settings (localStorage) or backend as fallback
    let sttProvider: string | null = null;
    let hasAdminSettings = false;
    
      try {
        const stored = localStorage.getItem('adminSettings');
        if (stored) {
          const settings = JSON.parse(stored);
          if (settings.sttProvider) {
            sttProvider = settings.sttProvider.toLowerCase(); // Normalize to lowercase for consistency
            hasAdminSettings = true;
            console.log('[STT] Provider from admin settings:', sttProvider);
          }
        }
      } catch (e) {
        console.warn('[STT] Error reading admin settings, trying backend...', e);
      }
    
    // Fallback to backend only if admin settings don't exist
    if (!hasAdminSettings || !sttProvider) {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      try {
        const resp = await fetch(`${backendUrl}/api/stt-provider`);
        if (resp.ok) {
          const data = await resp.json();
          sttProvider = data.stt_provider || 'webspeech';
          console.log('[STT] Provider from backend:', sttProvider);
        } else {
          sttProvider = 'webspeech'; // Final fallback
        }
      } catch (e) {
        console.warn('[STT] Error fetching STT provider from backend, using default: webspeech', e);
        sttProvider = 'webspeech'; // Final fallback
      }
    }
    
    // Ensure we have a valid provider
    if (!sttProvider) {
      sttProvider = 'webspeech';
    }
    
    let recognition: any = null;
    let deepgramWs: WebSocket | null = null;
    let audioProcessor: AudioWorkletNode | ScriptProcessorNode | null = null;
    let audioContext: AudioContext | null = null;

    // Initialize STT based on provider
    if (sttProvider === 'deepgramnova3') {
      // Use Deepgram Nova-3 streaming STT
      console.log('[STT] Using Deepgram Nova-3 for STT');
      
      // Create audio context for processing
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000, // Deepgram expects 48kHz
      });
      
      // Resume AudioContext if suspended
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          console.log('[STT] AudioContext resumed');
        } catch (e) {
          console.warn('[STT] Could not resume AudioContext on init:', e);
        }
      }

      // Set up audio processing FIRST, before WebSocket connection
      // This ensures audio is ready to flow as soon as WebSocket opens
      // Buffer size must be a power of 2 between 256 and 16384
      const bufferSize = 2048; // ~43ms at 48kHz (power of 2, good for real-time)
      const source = audioContext.createMediaStreamSource(mediaStream);
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      // Buffer to store audio chunks until WebSocket is ready (declare outside processor)
      const audioBuffer: ArrayBuffer[] = [];
      const MAX_BUFFER_SIZE = 10; // Keep only last 10 chunks
      
      let audioChunkCount = 0;
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to Int16Array (linear16 PCM)
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          // Clamp and convert to 16-bit integer
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // If WebSocket is open, send immediately
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
          try {
            deepgramWs.send(int16Data.buffer);
            audioChunkCount++;
            // Log every 100 chunks (~3 seconds) to confirm audio is flowing
            if (audioChunkCount % 100 === 0) {
              console.log(`[STT] Sent ${audioChunkCount} audio chunks to Deepgram`);
            }
          } catch (err) {
            console.error('[STT] Error sending audio to Deepgram:', err);
          }
        } else {
          // Buffer audio chunks until WebSocket is ready (but limit buffer size)
          if (audioBuffer.length < MAX_BUFFER_SIZE) {
            audioBuffer.push(int16Data.buffer.slice(0)); // Clone the buffer
          }
        }
      };
      
      source.connect(processor);
      // Connect processor to a dummy destination to ensure it processes audio
      // Using a GainNode with gain 0 to avoid feedback but keep processor active
      const dummyGain = audioContext.createGain();
      dummyGain.gain.value = 0; // Silent output
      processor.connect(dummyGain);
      dummyGain.connect(audioContext.destination);
      audioProcessor = processor;
      
      console.log('[STT] Audio processor set up, buffer size:', bufferSize, 'samples');
      
      // Connect to Deepgram WebSocket via backend
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const wsUrl = backendUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/api/stt/deepgram';
      deepgramWs = new WebSocket(wsUrl);
      
      // Handle Deepgram transcripts
      deepgramWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcript' && data.text) {
            const transcript = data.text.trim();
            if (!transcript) return;
            
            console.log('[STT] User said:', transcript);
            
            // Capture timestamp immediately when transcript arrives (before any processing)
            const transcriptArrivalTime = Date.now();
            
            // Check for rapid interruption - if user interrupts within MIN_INTERRUPTION_INTERVAL_MS,
            // ignore this transcript to prevent duplicate processing
            if (currentSTTSession) {
              if (currentSTTSession.lastTranscriptTimestamp !== undefined) {
                const timeSinceLastTranscript = transcriptArrivalTime - currentSTTSession.lastTranscriptTimestamp;
                if (timeSinceLastTranscript < MIN_INTERRUPTION_INTERVAL_MS) {
                  console.log(`[STT] Ignoring rapid interruption (${timeSinceLastTranscript}ms < ${MIN_INTERRUPTION_INTERVAL_MS}ms), continuing with previous response`);
                  // Don't update timestamp when ignoring - keep the last processed transcript's timestamp
                  // so the next transcript compares against the last actually processed one (u1), not the ignored one (u2)
                  return; // Don't process this transcript, let the previous one continue
                }
              }
              // Update timestamp when we process a transcript (after passing the rapid interruption check)
              currentSTTSession.lastTranscriptTimestamp = transcriptArrivalTime;
            }
            
            // Generate new global Response ID for this user message → TTT → TTS cycle
            // Create transcript object with ID that will flow through the entire pipeline
            if (!currentSTTSession) {
              return;
            }
            if (currentSTTSession.globalResponseId === undefined) {
              currentSTTSession.globalResponseId = 0;
            }
            const globalId = ++currentSTTSession.globalResponseId;
            
            // Create transcript object with ID
            const transcriptObj: TranscriptObject = {
              text: transcript,
              id: globalId
            };
            
            console.log('[STT] Generated Global Response ID:', globalId, 'for transcript:', transcript);
            
            // Stop current TTS playback if user interrupts (for all TTS providers)
            stopCurrentTTS();
            
            // Get TTS provider to determine feedback method (synchronous check first)
            let ttsProvider: string | null = null;
            try {
              const stored = localStorage.getItem('adminSettings');
              if (stored) {
                const settings = JSON.parse(stored);
                if (settings.ttsProvider) {
                  ttsProvider = settings.ttsProvider.toLowerCase();
                }
              }
            } catch (e) {
              // Will fallback below
            }
            
            // For Deepgram TTS: Show visual "Thinking..." indicator instead of processing audio
            // Do this immediately if we have the provider from localStorage
            if (ttsProvider === 'deepgram' && onThinkingUpdate) {
              onThinkingUpdate(true);
            }
            
            // If provider not found in localStorage, fetch from backend (async)
            // But don't wait - we'll check again before playing audio
            if (!ttsProvider) {
              const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
              fetch(`${backendUrl}/api/config`)
                .then(resp => {
                  if (resp.ok) {
                    return resp.json();
                  }
                  return { tts_provider: 'gtts' };
                })
                .then(config => {
                  const provider = config.tts_provider || 'gtts';
                  // If it's Deepgram and we haven't shown thinking indicator yet, show it now
                  if (provider === 'deepgram' && onThinkingUpdate) {
                    onThinkingUpdate(true);
                  }
                })
                .catch(() => {
                  // Ignore errors, will use default
                });
              // Default to gtts while fetching
              ttsProvider = 'gtts';
            }
            
            // Start playing processing audio
            // Only for non-Deepgram TTS providers (to maintain backward compatibility)
            if (ttsProvider !== 'deepgram' && currentSTTSession?.processingAudio) {
              try {
                if (!isProcessingAudioPlaying) {
                  currentSTTSession.processingAudio.play().catch((e: any) => {
                    console.warn('[STT] Could not play processing audio:', e);
                  });
                  isProcessingAudioPlaying = true;
                }
              } catch (e) {
                console.warn('[STT] Error playing processing audio:', e);
              }
            }
            
            // Get AI response - use streaming for Deepgram TTS, non-streaming for others
            if (ttsProvider === 'deepgram') {
              // Use streaming chat response for Deepgram TTS (low latency)
              try {
                // Get or ensure Deepgram TTS WebSocket is ready
                const deepgramTtsWs = currentSTTSession?.deepgramTtsWs;
                const deepgramTtsAudioContext = currentSTTSession?.deepgramTtsAudioContext;
                
                if (!deepgramTtsWs || deepgramTtsWs.readyState !== WebSocket.OPEN) {
                  // If WebSocket not ready, fallback to non-streaming
                  console.warn('[STT] Deepgram TTS WebSocket not ready, falling back to non-streaming');
            const assistantMessage = await getChatResponse(transcriptObj.text);
                  if (onThinkingUpdate) {
                    onThinkingUpdate(false);
                  }
                  await textToSpeech(assistantMessage);
                  return;
                }

                // Store transcript ID in closure for this TTS session
                // This ID will be attached to all audio chunks from this response
                const transcriptId = transcriptObj.id;
                
                // Store ID in session for TTS WebSocket handler to use
                if (currentSTTSession) {
                  currentSTTSession.currentTtsResponseId = transcriptId;
                }
                
                // Buffer for accumulating text chunks before sending to TTS
                let textBuffer = '';
                const SEND_EVERY = 60; // Same as in textToSpeech function
                const MIN_FIRST_CHUNK = 20;

                // Function to send text chunks to Deepgram TTS WebSocket
                const sendTextChunk = (chunk: string) => {
                  textBuffer += chunk;
                  
                  // Send first chunk early for low latency
                  if (textBuffer.length >= MIN_FIRST_CHUNK && deepgramTtsWs.readyState === WebSocket.OPEN) {
                    const toSend = textBuffer;
                    textBuffer = '';
                    deepgramTtsWs.send(JSON.stringify({
                      type: 'speak',
                      text: toSend
                    }));
                    console.log(`[Deepgram TTS Stream] Sent chunk (${toSend.length} chars) with ID: ${transcriptId}`);
                  } else if (textBuffer.length >= SEND_EVERY && deepgramTtsWs.readyState === WebSocket.OPEN) {
                    const toSend = textBuffer;
                    textBuffer = '';
                    deepgramTtsWs.send(JSON.stringify({
                      type: 'speak',
                      text: toSend
                    }));
                    console.log(`[Deepgram TTS Stream] Sent chunk (${toSend.length} chars) with ID: ${transcriptId}`);
                  }
                };

                // Use shared queue for sequential audio playback (prevents overlap)
                let playbackFinished = false;
                
                if (!deepgramTtsAudioContext) {
                  throw new Error('Deepgram TTS AudioContext not available');
                }

                const audioContext = deepgramTtsAudioContext;
                
                // Ensure shared queue exists
                if (!currentSTTSession) {
                  throw new Error('STT session not available');
                }
                if (!currentSTTSession.deepgramTtsAudioQueue) {
                  currentSTTSession.deepgramTtsAudioQueue = [];
                }
                if (currentSTTSession.deepgramTtsIsProcessingQueue === undefined) {
                  currentSTTSession.deepgramTtsIsProcessingQueue = false;
                }
                
                // Resume AudioContext if suspended
                if (audioContext.state === 'suspended') {
                  await audioContext.resume();
                }

                // Note: Message handler is set up once when WebSocket is created (shared handler)
                // The shared handler validates IDs at queue insertion and playback time

                // Get streaming chat response (this will call sendTextChunk as chunks arrive)
                const assistantMessage = await getChatResponseStream(transcriptObj.text, sendTextChunk);
                
                // Send remaining buffer and flush signal after streaming completes
                if (textBuffer.length > 0 && deepgramTtsWs.readyState === WebSocket.OPEN) {
                  deepgramTtsWs.send(JSON.stringify({
                    type: 'speak',
                    text: textBuffer
                  }));
                  textBuffer = '';
                }
                if (deepgramTtsWs.readyState === WebSocket.OPEN) {
                  deepgramTtsWs.send(JSON.stringify({ type: 'flush' }));
                  console.log('[Deepgram TTS Stream] Sent flush signal after streaming complete');
                }

                // Hide thinking indicator
                if (onThinkingUpdate) {
                  onThinkingUpdate(false);
                }

                // Wait for playback to finish (with timeout)
                // playbackFinished will be set to true when we receive 'playback_finished' from Deepgram
                const waitForPlayback = () => {
                  return new Promise<void>((resolve) => {
                    // Check if queue is empty and playback finished
                    const checkComplete = () => {
                      const queueEmpty = !currentSTTSession?.deepgramTtsAudioQueue || 
                                        currentSTTSession.deepgramTtsAudioQueue.length === 0;
                      const notProcessing = !currentSTTSession?.deepgramTtsIsProcessingQueue;
                      
                      return playbackFinished && queueEmpty && notProcessing;
                    };
                    
                    // If already finished, resolve immediately
                    if (checkComplete()) {
                      resolve();
                      return;
                    }

                    const checkInterval = setInterval(() => {
                      if (checkComplete()) {
                        clearInterval(checkInterval);
                        resolve();
                      }
                    }, 100);

                    // Timeout after 30 seconds to prevent hanging
                    setTimeout(() => {
                      clearInterval(checkInterval);
                      console.log('[Deepgram TTS Stream] Playback wait timeout, cleaning up');
                      resolve();
                    }, 30000);
                  });
                };

                await waitForPlayback();
                
                // Note: No cleanup needed - shared handler is persistent and doesn't need to be restored

              } catch (error: any) {
                console.error('[STT] Error in streaming chat response:', error);
                // Fallback to non-streaming on error
                try {
                  const assistantMessage = await getChatResponse(transcript);
                  if (onThinkingUpdate) {
                    onThinkingUpdate(false);
                  }
                  await textToSpeech(assistantMessage);
                } catch (fallbackError) {
                  console.error('[STT] Fallback also failed:', fallbackError);
                  if (onThinkingUpdate) {
                    onThinkingUpdate(false);
                  }
                }
              }
            } else {
              // Use non-streaming for other TTS providers
              const assistantMessage = await getChatResponse(transcript);
              
              // Hide thinking indicator if using Deepgram TTS
              if (ttsProvider === 'deepgram' && onThinkingUpdate) {
                onThinkingUpdate(false);
              }
            
            // Convert to speech
            await textToSpeech(assistantMessage);
            }
          }
        } catch (e) {
          console.error('[STT] Error processing Deepgram transcript:', e);
        }
      };
      
      deepgramWs.onerror = (error) => {
        console.error('[STT] Deepgram WebSocket error:', error);
      };
      
      deepgramWs.onclose = () => {
        console.log('[STT] Deepgram WebSocket closed');
      };
      
      // Wait for WebSocket to open and flush buffered audio
      await new Promise<void>((resolve, reject) => {
        if (deepgramWs) {
          deepgramWs.onopen = () => {
            console.log('[STT] Deepgram WebSocket connected');
            // Flush any buffered audio chunks
            if (audioBuffer.length > 0) {
              console.log(`[STT] Flushing ${audioBuffer.length} buffered audio chunks`);
              audioBuffer.forEach(chunk => {
                try {
                  deepgramWs!.send(chunk);
                } catch (err) {
                  console.warn('[STT] Error flushing buffered audio:', err);
                }
              });
              audioBuffer.length = 0; // Clear buffer
            }
            resolve();
          };
          deepgramWs.onerror = (error) => {
            console.error('[STT] Deepgram WebSocket connection error:', error);
            reject(new Error('Failed to connect to Deepgram STT'));
          };
        } else {
          reject(new Error('WebSocket not initialized'));
        }
      });
      
    } else if (sttProvider === 'googlecloud') {
      // Use Google Cloud Speech-to-Text streaming STT
      console.log('[STT] Using Google Cloud STT');
      
      // Create audio context for processing
      // Google Cloud Speech expects 16kHz LINEAR16 PCM (as per reference code)
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Google Cloud expects 16kHz
      });
      
      // Resume AudioContext if suspended
      if (audioContext.state === 'suspended') {
        try {
          await audioContext.resume();
          console.log('[STT] AudioContext resumed');
        } catch (e) {
          console.warn('[STT] Could not resume AudioContext on init:', e);
        }
      }

      // Set up audio processing FIRST, before WebSocket connection
      // Buffer size must be a power of 2 between 256 and 16384
      const bufferSize = 2048; // ~128ms at 16kHz (power of 2, good for real-time)
      const source = audioContext.createMediaStreamSource(mediaStream);
      const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
      
      // Buffer to store audio chunks until WebSocket is ready
      const audioBuffer: ArrayBuffer[] = [];
      const MAX_BUFFER_SIZE = 10; // Keep only last 10 chunks
      
      let googleCloudWs: WebSocket | null = null;
      let audioChunkCount = 0;
      
      // onaudioprocess fires continuously (every ~128ms at 16kHz with 2048 buffer)
      // This ensures continuous audio streaming to Google Cloud, including silence
      // Google Cloud requires continuous audio to prevent timeout
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to Int16Array (linear16 PCM)
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          // Clamp and convert to 16-bit integer
          const s = Math.max(-1, Math.min(1, inputData[i]));
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Send audio chunks continuously (including silence) to keep Google Cloud stream alive
        // This matches the reference code behavior - continuous microphone capture
        if (googleCloudWs && googleCloudWs.readyState === WebSocket.OPEN) {
          try {
            googleCloudWs.send(int16Data.buffer);
            audioChunkCount++;
            // Log every 100 chunks (~12 seconds at 16kHz) to confirm audio is flowing
            if (audioChunkCount % 100 === 0) {
              console.log(`[STT] Sent ${audioChunkCount} audio chunks to Google Cloud`);
            }
          } catch (err) {
            console.error('[STT] Error sending audio to Google Cloud:', err);
          }
        } else {
          // Buffer audio chunks until WebSocket is ready (but limit buffer size)
          if (audioBuffer.length < MAX_BUFFER_SIZE) {
            audioBuffer.push(int16Data.buffer.slice(0)); // Clone the buffer
          }
        }
      };
      
      source.connect(processor);
      // Connect processor to a dummy destination to ensure it processes audio
      const dummyGain = audioContext.createGain();
      dummyGain.gain.value = 0; // Silent output
      processor.connect(dummyGain);
      dummyGain.connect(audioContext.destination);
      audioProcessor = processor;
      
      console.log('[STT] Audio processor set up for Google Cloud, buffer size:', bufferSize, 'samples');
      
      // Connect to Google Cloud STT WebSocket via backend
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const wsUrl = backendUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/api/stt/googlecloud';
      googleCloudWs = new WebSocket(wsUrl);
      
      // Handle Google Cloud transcripts (same logic as Deepgram)
      googleCloudWs.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'transcript' && data.text) {
            const transcript = data.text.trim();
            if (!transcript) return;
            
            console.log('[STT] User said:', transcript);
            
            // Capture timestamp immediately when transcript arrives (before any processing)
            const transcriptArrivalTime = Date.now();
            
            // Check for rapid interruption - if user interrupts within MIN_INTERRUPTION_INTERVAL_MS,
            // ignore this transcript to prevent duplicate processing
            if (currentSTTSession) {
              if (currentSTTSession.lastTranscriptTimestamp !== undefined) {
                const timeSinceLastTranscript = transcriptArrivalTime - currentSTTSession.lastTranscriptTimestamp;
                if (timeSinceLastTranscript < MIN_INTERRUPTION_INTERVAL_MS) {
                  console.log(`[STT] Ignoring rapid interruption (${timeSinceLastTranscript}ms < ${MIN_INTERRUPTION_INTERVAL_MS}ms), continuing with previous response`);
                  // Don't update timestamp when ignoring - keep the last processed transcript's timestamp
                  // so the next transcript compares against the last actually processed one (u1), not the ignored one (u2)
                  return; // Don't process this transcript, let the previous one continue
                }
              }
              // Update timestamp when we process a transcript (after passing the rapid interruption check)
              currentSTTSession.lastTranscriptTimestamp = transcriptArrivalTime;
            }
            
            // Generate new global Response ID for this user message → TTT → TTS cycle
            if (!currentSTTSession) {
              return;
            }
            if (currentSTTSession.globalResponseId === undefined) {
              currentSTTSession.globalResponseId = 0;
            }
            const globalId = ++currentSTTSession.globalResponseId;
            
            // Create transcript object with ID
            const transcriptObj: TranscriptObject = {
              text: transcript,
              id: globalId
            };
            
            console.log('[STT] Generated Global Response ID:', globalId, 'for transcript:', transcript);
            
            // Stop current TTS playback if user interrupts
            stopCurrentTTS();
            
            // Get TTS provider to determine feedback method
            let ttsProvider: string | null = null;
            try {
              const stored = localStorage.getItem('adminSettings');
              if (stored) {
                const settings = JSON.parse(stored);
                if (settings.ttsProvider) {
                  ttsProvider = settings.ttsProvider.toLowerCase();
                }
              }
            } catch (e) {
              // Will fallback below
            }
            
            // For Deepgram TTS: Show visual "Thinking..." indicator
            if (ttsProvider === 'deepgram' && onThinkingUpdate) {
              onThinkingUpdate(true);
            }
            
            // If provider not found in localStorage, fetch from backend
            if (!ttsProvider) {
              const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
              fetch(`${backendUrl}/api/config`)
                .then(resp => {
                  if (resp.ok) {
                    return resp.json();
                  }
                  return { tts_provider: 'gtts' };
                })
                .then(config => {
                  const provider = config.tts_provider || 'gtts';
                  if (provider === 'deepgram' && onThinkingUpdate) {
                    onThinkingUpdate(true);
                  }
                })
                .catch(() => {
                  // Ignore errors
                });
              ttsProvider = 'gtts';
            }
            
            // Start playing processing audio for non-Deepgram TTS providers
            if (ttsProvider !== 'deepgram' && currentSTTSession?.processingAudio) {
              try {
                if (!isProcessingAudioPlaying) {
                  currentSTTSession.processingAudio.play().catch((e: any) => {
                    console.warn('[STT] Could not play processing audio:', e);
                  });
                  isProcessingAudioPlaying = true;
                }
              } catch (e) {
                console.warn('[STT] Error playing processing audio:', e);
              }
            }
            
            // Get AI response - use streaming for Deepgram TTS, non-streaming for others
            if (ttsProvider === 'deepgram') {
              // Use streaming chat response for Deepgram TTS (low latency)
              try {
                const deepgramTtsWs = currentSTTSession?.deepgramTtsWs;
                const deepgramTtsAudioContext = currentSTTSession?.deepgramTtsAudioContext;
                
                if (!deepgramTtsWs || deepgramTtsWs.readyState !== WebSocket.OPEN) {
                  console.warn('[STT] Deepgram TTS WebSocket not ready, falling back to non-streaming');
                  const assistantMessage = await getChatResponse(transcriptObj.text);
                  if (onThinkingUpdate) {
                    onThinkingUpdate(false);
                  }
                  await textToSpeech(assistantMessage);
                  return;
                }

                const transcriptId = transcriptObj.id;
                if (currentSTTSession) {
                  currentSTTSession.currentTtsResponseId = transcriptId;
                }
                
                let textBuffer = '';
                const SEND_EVERY = 60;
                const MIN_FIRST_CHUNK = 20;

                const sendTextChunk = (chunk: string) => {
                  textBuffer += chunk;
                  
                  if (textBuffer.length >= MIN_FIRST_CHUNK && deepgramTtsWs.readyState === WebSocket.OPEN) {
                    const toSend = textBuffer;
                    textBuffer = '';
                    deepgramTtsWs.send(JSON.stringify({
                      type: 'speak',
                      text: toSend
                    }));
                  } else if (textBuffer.length >= SEND_EVERY && deepgramTtsWs.readyState === WebSocket.OPEN) {
                    const toSend = textBuffer;
                    textBuffer = '';
                    deepgramTtsWs.send(JSON.stringify({
                      type: 'speak',
                      text: toSend
                    }));
                  }
                };

                let playbackFinished = false;
                
                if (!deepgramTtsAudioContext) {
                  throw new Error('Deepgram TTS AudioContext not available');
                }

                const audioContext = deepgramTtsAudioContext;
                
                if (!currentSTTSession) {
                  throw new Error('STT session not available');
                }
                if (!currentSTTSession.deepgramTtsAudioQueue) {
                  currentSTTSession.deepgramTtsAudioQueue = [];
                }
                if (currentSTTSession.deepgramTtsIsProcessingQueue === undefined) {
                  currentSTTSession.deepgramTtsIsProcessingQueue = false;
                }
                
                if (audioContext.state === 'suspended') {
                  await audioContext.resume();
                }

                const assistantMessage = await getChatResponseStream(transcriptObj.text, sendTextChunk);
                
                if (textBuffer.length > 0 && deepgramTtsWs.readyState === WebSocket.OPEN) {
                  deepgramTtsWs.send(JSON.stringify({
                    type: 'speak',
                    text: textBuffer
                  }));
                  textBuffer = '';
                }
                if (deepgramTtsWs.readyState === WebSocket.OPEN) {
                  deepgramTtsWs.send(JSON.stringify({ type: 'flush' }));
                }

                if (onThinkingUpdate) {
                  onThinkingUpdate(false);
                }

                const waitForPlayback = () => {
                  return new Promise<void>((resolve) => {
                    const checkComplete = () => {
                      const queueEmpty = !currentSTTSession?.deepgramTtsAudioQueue || 
                                        currentSTTSession.deepgramTtsAudioQueue.length === 0;
                      const notProcessing = !currentSTTSession?.deepgramTtsIsProcessingQueue;
                      return playbackFinished && queueEmpty && notProcessing;
                    };
                    
                    if (checkComplete()) {
                      resolve();
                      return;
                    }

                    const checkInterval = setInterval(() => {
                      if (checkComplete()) {
                        clearInterval(checkInterval);
                        resolve();
                      }
                    }, 100);

                    setTimeout(() => {
                      clearInterval(checkInterval);
                      resolve();
                    }, 30000);
                  });
                };

                await waitForPlayback();

              } catch (error: any) {
                console.error('[STT] Error in streaming chat response:', error);
                try {
                  const assistantMessage = await getChatResponse(transcript);
                  if (onThinkingUpdate) {
                    onThinkingUpdate(false);
                  }
                  await textToSpeech(assistantMessage);
                } catch (fallbackError) {
                  console.error('[STT] Fallback also failed:', fallbackError);
                  if (onThinkingUpdate) {
                    onThinkingUpdate(false);
                  }
                }
              }
            } else {
              // Use non-streaming for other TTS providers
              const assistantMessage = await getChatResponse(transcript);
              
              if (ttsProvider === 'deepgram' && onThinkingUpdate) {
                onThinkingUpdate(false);
              }
            
              await textToSpeech(assistantMessage);
            }
          }
        } catch (e) {
          console.error('[STT] Error processing Google Cloud transcript:', e);
        }
      };
      
      googleCloudWs.onerror = (error) => {
        console.error('[STT] Google Cloud WebSocket error:', error);
      };
      
      googleCloudWs.onclose = () => {
        console.log('[STT] Google Cloud WebSocket closed');
      };
      
      // Wait for WebSocket to open and flush buffered audio
      await new Promise<void>((resolve, reject) => {
        if (googleCloudWs) {
          googleCloudWs.onopen = () => {
            console.log('[STT] Google Cloud WebSocket connected');
            // Flush any buffered audio chunks
            if (audioBuffer.length > 0) {
              console.log(`[STT] Flushing ${audioBuffer.length} buffered audio chunks`);
              audioBuffer.forEach(chunk => {
                try {
                  googleCloudWs!.send(chunk);
                } catch (err) {
                  console.warn('[STT] Error flushing buffered audio:', err);
                }
              });
              audioBuffer.length = 0; // Clear buffer
            }
            resolve();
          };
          googleCloudWs.onerror = (error) => {
            console.error('[STT] Google Cloud WebSocket connection error:', error);
            reject(new Error('Failed to connect to Google Cloud STT'));
          };
        } else {
          reject(new Error('WebSocket not initialized'));
        }
      });
      
      // Store WebSocket reference (reuse deepgramWs variable name for consistency in session)
      deepgramWs = googleCloudWs;
      
    } else {
      // Use Web Speech API (default)
      console.log('[STT] Using Web Speech API for STT');
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Speech Recognition API is not supported in this browser. Please use Chrome or Edge.');
    }

      recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

      // Create audio context for playback (Web Speech API mode)
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Resume AudioContext if suspended (required for Android Chrome)
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log('[STT] AudioContext resumed');
      } catch (e) {
        console.warn('[STT] Could not resume AudioContext on init:', e);
        }
      }
    }

    // Create processing audio element for feedback when AI is processing
    // Use cache-busting query parameter to avoid caching issues (fixes incognito vs regular mode)
    const cacheBuster = Date.now();
    const processingAudio = new Audio(`/audio/processing.mp3?v=${cacheBuster}`);
    processingAudio.loop = true;
    processingAudio.volume = 0.4; // Set volume for better feedback
    processingAudio.preload = 'auto'; // Preload the audio for faster playback
    
    // Track if processing audio is currently playing
    let isProcessingAudioPlaying = false;
    
    // Set up error handling for processing audio
    processingAudio.onerror = (e) => {
      console.error('[STT] Processing audio error:', e);
      isProcessingAudioPlaying = false;
    };
    
    processingAudio.oncanplaythrough = () => {
      console.log('[STT] Processing audio ready to play');
    };
    
    processingAudio.onplay = () => {
      isProcessingAudioPlaying = true;
    };
    
    processingAudio.onpause = () => {
      isProcessingAudioPlaying = false;
    };
    
    processingAudio.onended = () => {
      isProcessingAudioPlaying = false;
    };
    
    // Preload the audio by loading it immediately
    try {
      processingAudio.load();
      console.log('[STT] Processing audio preloaded');
    } catch (e) {
      console.warn('[STT] Could not preload processing audio:', e);
    }
    
    // Set output device if available
    if (typeof (processingAudio as any).setSinkId === 'function' && outputDeviceId) {
      try {
        await (processingAudio as any).setSinkId(outputDeviceId);
      } catch (e) {
        console.warn('Failed to set sinkId for processing audio', e);
      }
    }

    currentSTTSession = {
      recognition,
      mediaRecorder: null,
      audioContext,
      conversationHistory,
      processingAudio,
      greetingSpoken: false, // Flag to prevent duplicate greeting speech
      processingOscillator: null,
      processingGain: null,
      isProcessingAudioPlaying: () => isProcessingAudioPlaying,
      globalResponseId: 0, // Initialize global response ID counter
      ...(deepgramWs && { deepgramWs }),
      ...(audioProcessor && { audioProcessor }),
      ...(sttProvider && { sttProvider }),
    } as any;

    // Initialize AudioContext early for Deepgram TTS (before greeting) to prevent timing issues
    // Check TTS provider from admin settings or backend
    let ttsProvider: string | null = null;
    try {
      const stored = localStorage.getItem('adminSettings');
      if (stored) {
        const settings = JSON.parse(stored);
        if (settings.ttsProvider) {
          ttsProvider = settings.ttsProvider.toLowerCase();
        }
      }
    } catch (e) {
      // Will check backend below
    }
    
    // If not in localStorage, fetch from backend (async, but don't wait - will initialize later if needed)
    if (!ttsProvider) {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      fetch(`${backendUrl}/api/config`)
        .then(resp => {
          if (resp.ok) {
            return resp.json();
          }
          return { tts_provider: 'gtts' };
        })
        .then(config => {
          const provider = config.tts_provider || 'gtts';
          // Initialize AudioContext if Deepgram TTS is being used
          if (provider === 'deepgram' && currentSTTSession && !currentSTTSession.deepgramTtsAudioContext) {
            const deepgramAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
              sampleRate: 48000
            });
            currentSTTSession.deepgramTtsAudioContext = deepgramAudioContext;
            currentSTTSession.deepgramTtsNextPlayTime = 0;
            currentSTTSession.deepgramTtsAudioQueue = [];
            currentSTTSession.deepgramTtsIsProcessingQueue = false;
            currentSTTSession.deepgramTtsActiveSources = new Set();
            
            // Resume AudioContext if suspended
            if (deepgramAudioContext.state === 'suspended') {
              deepgramAudioContext.resume().catch((e) => {
                console.warn('[Deepgram TTS] Could not resume AudioContext during early init:', e);
              });
            }
            console.log('[Deepgram TTS] AudioContext initialized early for greeting');
          }
        })
        .catch(() => {
          // Ignore errors, will initialize later if needed
        });
    } else if (ttsProvider === 'deepgram' && currentSTTSession && !currentSTTSession.deepgramTtsAudioContext) {
      // Initialize AudioContext immediately if we know it's Deepgram TTS
      const deepgramAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000
      });
      currentSTTSession.deepgramTtsAudioContext = deepgramAudioContext;
      currentSTTSession.deepgramTtsNextPlayTime = 0;
      currentSTTSession.deepgramTtsAudioQueue = [];
      currentSTTSession.deepgramTtsIsProcessingQueue = false;
      currentSTTSession.deepgramTtsActiveSources = new Set();
      
      // Resume AudioContext if suspended
      if (deepgramAudioContext.state === 'suspended') {
        deepgramAudioContext.resume().catch((e) => {
          console.warn('[Deepgram TTS] Could not resume AudioContext during early init:', e);
        });
      }
      console.log('[Deepgram TTS] AudioContext initialized early for greeting');
    }

    // Function to send text to chat API and get response with retry logic
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    
    // Streaming chat response function (only for Deepgram TTS)
    const getChatResponseStream = async (
      userMessage: string,
      onChunk: (chunk: string) => void,
      isInitialGreeting: boolean = false
    ): Promise<string> => {
      // Add user message to conversation history
      if (userMessage) {
        conversationHistory.push({ role: 'user', content: userMessage });
        // Update UI (but skip the initial greeting user message for cleaner display)
        if (onConversationUpdate && !isInitialGreeting) {
          onConversationUpdate([...conversationHistory]);
        }
      }

      let fullResponse = '';
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          // Create timeout controller
          // Increased timeout to 60 seconds to allow for longer AI responses
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 60000);

          const response = await fetch(`${backendUrl}/api/chat/stream`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: conversationHistory,
            }),
            signal: controller.signal,
          });

          if (timeoutId) clearTimeout(timeoutId);

          if (!response.ok) {
            const text = await response.text();
            // Retry on 5xx errors (server errors), but not on 4xx (client errors)
            if (response.status >= 500 && attempt < 2) {
              lastError = new Error(`Chat API error (attempt ${attempt + 1}/3): ${text}`);
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
              continue;
            }
            throw new Error(`Chat API error: ${text}`);
          }

          // Parse Server-Sent Events (SSE)
          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          fullResponse = '';

          if (!reader) {
            throw new Error('Response body is not readable');
          }

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.error) {
                    throw new Error(data.error);
                  }

                  if (data.delta) {
                    fullResponse += data.delta;
                    // Send chunk to TTS immediately
                    onChunk(data.delta);
                  }

                  if (data.done) {
                    // Stream complete
                    conversationHistory.push({ role: 'assistant', content: fullResponse });
                    // Update UI with complete response (but skip for initial greeting - it will be updated after removing the prompt)
                    if (onConversationUpdate && !isInitialGreeting) {
                      onConversationUpdate([...conversationHistory]);
                    }
                    return fullResponse;
                  }
                } catch (e) {
                  // Skip invalid JSON or continue processing
                  if (e instanceof Error && e.message.includes('error')) {
                    throw e;
                  }
                }
              }
            }
          }

          // If we get here, stream ended without done flag
          if (fullResponse) {
            conversationHistory.push({ role: 'assistant', content: fullResponse });
            // Update UI (but skip for initial greeting - it will be updated after removing the prompt)
            if (onConversationUpdate && !isInitialGreeting) {
              onConversationUpdate([...conversationHistory]);
            }
            return fullResponse;
          }

          throw new Error('Stream ended without complete response');

        } catch (error: any) {
          if (timeoutId) clearTimeout(timeoutId);
          lastError = error;
          
          // Retry on network errors, timeout, or abort
          const isRetryable = (
            error.name === 'TypeError' ||
            error.name === 'TimeoutError' ||
            error.name === 'AbortError' ||
            error.message?.includes('Network') ||
            error.message?.includes('fetch') ||
            (error.message && error.message.includes('Network error'))
          );

          if (isRetryable && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            continue;
          }
          throw error;
        }
      }

      throw lastError || new Error('Chat API error: All retry attempts failed');
    };
    
    const getChatResponse = async (userMessage: string, isInitialGreeting: boolean = false): Promise<string> => {
      // Add user message to conversation history
      // For initial greeting, we still want to send the prompt but it won't be visible in UI
      if (userMessage) {
        conversationHistory.push({ role: 'user', content: userMessage });
        // Update UI (but skip the initial greeting user message for cleaner display)
        if (onConversationUpdate && !isInitialGreeting) {
          onConversationUpdate([...conversationHistory]);
        }
      }

      // Retry logic for network errors (max 2 retries)
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        try {
          // Create timeout controller for compatibility
          const controller = new AbortController();
          timeoutId = setTimeout(() => controller.abort(), 35000);
          
          const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: conversationHistory,
              // Model will be determined by backend from environment variable or use default
            }),
            signal: controller.signal,
          });
          
          if (timeoutId) clearTimeout(timeoutId);

          if (!response.ok) {
            const text = await response.text();
            // Retry on 5xx errors (server errors), but not on 4xx (client errors)
            if (response.status >= 500 && attempt < 2) {
              lastError = new Error(`Chat API error (attempt ${attempt + 1}/3): ${text}`);
              await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
              continue;
            }
            throw new Error(`Chat API error: ${text}`);
          }

          const data = await response.json();
          const assistantMessage = data.response || data.message || '';
          conversationHistory.push({ role: 'assistant', content: assistantMessage });
          // Update UI
          if (onConversationUpdate) {
            onConversationUpdate([...conversationHistory]);
          }
          return assistantMessage;
        } catch (error: any) {
          if (timeoutId) clearTimeout(timeoutId);
          lastError = error;
          // Retry on network errors, timeout, or abort (which indicates timeout)
          const isRetryable = (
            error.name === 'TypeError' || 
            error.name === 'TimeoutError' || 
            error.name === 'AbortError' ||
            error.message?.includes('Network') ||
            error.message?.includes('fetch') ||
            (error.message && error.message.includes('Network error'))
          );
          
          if (isRetryable && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
            continue;
          }
          // If it's a non-retryable error or we've exhausted retries, throw
          throw error;
        }
      }
      // If we get here, all retries failed
      throw lastError || new Error('Chat API error: All retry attempts failed');
    };

    // Function to stop current TTS playback (for interruption handling)
    const stopCurrentTTS = () => {
      if (!currentSTTSession) return;
      
      console.log('[TTS] Stopping current TTS playback due to user interruption');
      
      // Stop Deepgram TTS playback
      // Stop all active audio sources
      if (currentSTTSession.deepgramTtsActiveSources) {
        currentSTTSession.deepgramTtsActiveSources.forEach((source) => {
          try {
            source.stop();
            source.disconnect();
          } catch (e) {
            // Source may already be stopped, ignore
          }
        });
        currentSTTSession.deepgramTtsActiveSources.clear();
      }
      
      // Clear audio queue
      if (currentSTTSession.deepgramTtsAudioQueue) {
        currentSTTSession.deepgramTtsAudioQueue.length = 0;
      }
      
      // Reset processing flag to allow new processing to start immediately
      currentSTTSession.deepgramTtsIsProcessingQueue = false;
      
      // Reset next play time to allow immediate playback of new response
      currentSTTSession.deepgramTtsNextPlayTime = 0;
      
      // Note: Global Response ID increment is handled by the caller (when transcript arrives)
      // This ensures ID increments only once per user message, not every time stopCurrentTTS() is called
      
      // Send flush signal to Deepgram TTS to stop current generation
      if (currentSTTSession.deepgramTtsWs && 
          currentSTTSession.deepgramTtsWs.readyState === WebSocket.OPEN) {
        try {
          currentSTTSession.deepgramTtsWs.send(JSON.stringify({ type: 'flush' }));
          console.log('[TTS] Sent flush signal to stop current TTS generation');
        } catch (e) {
          console.warn('[TTS] Error sending flush signal:', e);
        }
      }
      
      // Stop other TTS providers (gTTS, OpenAI, Edge TTS) - stop HTMLAudioElement playback
      if (currentSTTSession.currentTTSAudioElement) {
        try {
          const audioEl = currentSTTSession.currentTTSAudioElement;
          audioEl.pause();
          audioEl.currentTime = 0;
          // Clear src to stop loading/playing
          audioEl.src = '';
          audioEl.load();
          currentSTTSession.currentTTSAudioElement = null;
          console.log('[TTS] Stopped current HTMLAudioElement playback');
        } catch (e) {
          console.warn('[TTS] Error stopping HTMLAudioElement:', e);
        }
      }
    };

    // Function to convert text to speech using OpenAI TTS
    const textToSpeech = async (text: string): Promise<void> => {
      // Stop processing audio immediately (for all TTS providers, but especially important for Deepgram)
      if (currentSTTSession) {
        // Stop Web Audio API processing sound first (if any)
        if (currentSTTSession.processingOscillator) {
          try {
            currentSTTSession.processingOscillator.stop();
            currentSTTSession.processingOscillator.disconnect();
            currentSTTSession.processingOscillator = null;
          } catch (e) {
            console.warn('[TTS] Error stopping processing oscillator:', e);
          }
        }
        if (currentSTTSession.processingGain) {
          try {
            currentSTTSession.processingGain.disconnect();
            currentSTTSession.processingGain = null;
          } catch (e) {
            console.warn('[TTS] Error stopping processing gain:', e);
          }
        }
        
        // Stop HTMLAudioElement processing audio immediately
        // Don't clear src - just pause and reset (prevents state issues and cache problems)
        if (currentSTTSession.processingAudio) {
          try {
            // Stop playing immediately
            currentSTTSession.processingAudio.pause();
            currentSTTSession.processingAudio.currentTime = 0;
            // Don't clear src or remove event listeners - just pause
            // This prevents cache issues and state problems
          } catch (e) {
            console.warn('[TTS] Error stopping processing audio:', e);
          }
          }
        }
        
      // Hide thinking indicator when TTS starts (for Deepgram TTS)
      if (onThinkingUpdate) {
        onThinkingUpdate(false);
      }
      
      // Resume AudioContext if suspended (required for Android Chrome)
      if (currentSTTSession?.audioContext && currentSTTSession.audioContext.state === 'suspended') {
        try {
          await currentSTTSession.audioContext.resume();
        } catch (e) {
          console.warn('[TTS] Could not resume AudioContext:', e);
        }
      }
      
      try {
        // Get TTS provider from admin settings (localStorage) or backend as fallback
        let ttsProvider: string | null = null;
        let hasAdminSettings = false;
        
        try {
          const stored = localStorage.getItem('adminSettings');
          if (stored) {
            const settings = JSON.parse(stored);
            if (settings.ttsProvider) {
              ttsProvider = settings.ttsProvider.toLowerCase(); // Normalize to lowercase for consistency
              hasAdminSettings = true;
              console.log('[TTS] Provider from admin settings:', ttsProvider);
            }
          }
        } catch (e) {
          console.warn('[TTS] Error reading admin settings, using backend default...', e);
        }
        
        // Fallback to backend config if admin settings not available
        if (!hasAdminSettings || !ttsProvider) {
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
          try {
            const resp = await fetch(`${backendUrl}/api/config`);
            if (resp.ok) {
              const config = await resp.json();
              ttsProvider = config.tts_provider || 'gtts';
              console.log('[TTS] Provider from backend:', ttsProvider);
            } else {
              ttsProvider = 'gtts'; // Final fallback
            }
          } catch (e) {
            console.warn('[TTS] Error fetching TTS provider from backend, using default: gtts', e);
            ttsProvider = 'gtts'; // Final fallback
          }
        }
        
        // Ensure we have a valid provider
        if (!ttsProvider) {
          ttsProvider = 'gtts';
        }
        
        // Handle Deepgram TTS (WebSocket streaming, low latency)
        if (ttsProvider === 'deepgram') {
          return new Promise<void>((resolve, reject) => {
            // Generate global Response ID for this TTS call (if not already set by streaming path)
            if (currentSTTSession) {
              if (currentSTTSession.globalResponseId === undefined) {
                currentSTTSession.globalResponseId = 0;
              }
              // Only generate new ID if not already set (streaming path sets it)
              if (currentSTTSession.currentTtsResponseId === undefined) {
                const ttsId = ++currentSTTSession.globalResponseId;
                currentSTTSession.currentTtsResponseId = ttsId;
                console.log('[Deepgram TTS] Generated Response ID for direct call:', ttsId);
              }
            }
            
            // Get or create persistent WebSocket connection
            let deepgramWs: WebSocket | null = null;
            let audioContext: AudioContext | null = null;
            
            // Check if we have an existing connection in the session
            if (currentSTTSession?.deepgramTtsWs && currentSTTSession.deepgramTtsWs.readyState === WebSocket.OPEN) {
              deepgramWs = currentSTTSession.deepgramTtsWs;
              audioContext = currentSTTSession.deepgramTtsAudioContext || null;
              console.log('[Deepgram TTS] Reusing existing WebSocket connection');
              
              // Ensure AudioContext is running
              if (audioContext && audioContext.state === 'suspended') {
                audioContext.resume().catch((e) => {
                  console.warn('[Deepgram TTS] Could not resume AudioContext:', e);
                });
              }
              
              // Ensure nextPlayTime is initialized for first playback
              if (currentSTTSession && (!currentSTTSession.deepgramTtsNextPlayTime || currentSTTSession.deepgramTtsNextPlayTime === 0)) {
                if (audioContext) {
                  currentSTTSession.deepgramTtsNextPlayTime = audioContext.currentTime;
                } else {
                  currentSTTSession.deepgramTtsNextPlayTime = 0;
                }
              }
            } else {
              // Create new connection
              const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
              const wsUrl = backendUrl.replace(/^http/, 'ws') + '/api/tts/deepgram';
              
              // Create AudioContext for PCM playback (48kHz, mono, 16-bit linear PCM)
              audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 48000
              });
              
              // Resume AudioContext if suspended
              if (audioContext.state === 'suspended') {
                audioContext.resume().catch((e) => {
                  console.warn('[Deepgram TTS] Could not resume AudioContext:', e);
                });
              }
              
              // Connect to Deepgram TTS WebSocket
              // Set binaryType to 'arraybuffer' to receive PCM audio as ArrayBuffer
              deepgramWs = new WebSocket(wsUrl);
              deepgramWs.binaryType = 'arraybuffer';
              
              // Store in session for reuse
              if (currentSTTSession) {
                currentSTTSession.deepgramTtsWs = deepgramWs;
                currentSTTSession.deepgramTtsAudioContext = audioContext;
                // Initialize nextPlayTime to currentTime for proper first playback timing
                // This ensures smooth playback without distortion
                currentSTTSession.deepgramTtsNextPlayTime = audioContext.currentTime;
                currentSTTSession.deepgramTtsAudioQueue = []; // Initialize shared audio queue
                currentSTTSession.deepgramTtsIsProcessingQueue = false; // Initialize processing flag
                currentSTTSession.deepgramTtsActiveSources = new Set(); // Initialize active sources tracking
              }
              
              // Wait a bit after WebSocket opens to ensure connection is stable
              deepgramWs.onopen = async () => {
                console.log('[Deepgram TTS] WebSocket connected (new connection)');
                // Ensure AudioContext is running
                if (audioContext && audioContext.state === 'suspended') {
                  await audioContext.resume();
                }
                // Small delay to ensure connection is fully stable before sending data
                await new Promise(resolve => setTimeout(resolve, 100));
                // Double-check AudioContext is still running
                if (audioContext && audioContext.state === 'suspended') {
                  await audioContext.resume();
                }
              };
              
              // Set up shared message handler that checks Response ID dynamically
              // This avoids handler conflicts when multiple responses are in flight
              // Define processAudioQueue outside to avoid closure issues - it always checks current Response ID
              const processAudioQueueShared = async () => {
                if (!currentSTTSession || !currentSTTSession.deepgramTtsAudioQueue) {
                  return;
                }
                
                // Prevent concurrent processing
                if (currentSTTSession.deepgramTtsIsProcessingQueue) {
                  return;
                }
                
                const queue = currentSTTSession.deepgramTtsAudioQueue;
                if (queue.length === 0) {
                  currentSTTSession.deepgramTtsIsProcessingQueue = false;
                  return;
                }
                
                currentSTTSession.deepgramTtsIsProcessingQueue = true;
                
                try {
                  const audioContext = currentSTTSession.deepgramTtsAudioContext;
                  if (!audioContext) {
                    currentSTTSession.deepgramTtsIsProcessingQueue = false;
                    return;
                  }
                  
                  if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                  }

                  // Get global Response ID for validation
                  const globalId = currentSTTSession.globalResponseId || 0;

                  const chunkObj = queue.shift();
                  if (!chunkObj) {
                    currentSTTSession.deepgramTtsIsProcessingQueue = false;
                    return;
                  }

                  // CRITICAL: Validate chunk ID against global ID right before playback
                  // This ensures we don't play stale chunks from interrupted responses
                  if (chunkObj.id !== globalId) {
                    console.log('[Deepgram TTS] Discarding stale chunk before playback - ID mismatch:', 
                      'chunk ID:', chunkObj.id, 'global ID:', globalId);
                    currentSTTSession.deepgramTtsIsProcessingQueue = false;
                    // Clear remaining stale chunks - they belong to old/interrupted response
                    if (currentSTTSession.deepgramTtsAudioQueue) {
                      currentSTTSession.deepgramTtsAudioQueue.length = 0;
                    }
                    return;
                  }

                  // Final validation passed - printing both IDs before sending chunk for playback
                  console.log('[Deepgram TTS] Final validation passed - sending chunk for playback:', 
                    'chunk ID:', chunkObj.id, 'global ID:', globalId);

                  const audioBuffer = audioContext.createBuffer(1, chunkObj.data.length, 48000);
                  audioBuffer.getChannelData(0).set(chunkObj.data);

                  const source = audioContext.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(audioContext.destination);

                  // Track active source for interruption handling
                  if (!currentSTTSession.deepgramTtsActiveSources) {
                    currentSTTSession.deepgramTtsActiveSources = new Set();
                  }
                  currentSTTSession.deepgramTtsActiveSources.add(source);

                  const currentTime = audioContext.currentTime;
                  // For first playback, initialize nextPlayTime to currentTime if it's 0 or undefined
                  // This ensures proper timing and prevents distortion
                  if (!currentSTTSession.deepgramTtsNextPlayTime || currentSTTSession.deepgramTtsNextPlayTime === 0) {
                    currentSTTSession.deepgramTtsNextPlayTime = currentTime;
                  }
                  const nextPlayTime = currentSTTSession.deepgramTtsNextPlayTime;
                  const playTime = Math.max(currentTime, nextPlayTime);
                  source.start(playTime);

                  const duration = audioBuffer.duration;
                  const newNextPlayTime = playTime + duration;
                  currentSTTSession.deepgramTtsNextPlayTime = newNextPlayTime;

                  source.onended = () => {
                    // Remove from active sources
                    if (currentSTTSession && currentSTTSession.deepgramTtsActiveSources) {
                      currentSTTSession.deepgramTtsActiveSources.delete(source);
                    }
                    
                    // Mark processing as done
                    if (currentSTTSession) {
                      currentSTTSession.deepgramTtsIsProcessingQueue = false;
                    }
                    
                    // Process next chunk if available
                    // Response ID validation happens at the start of processAudioQueueShared()
                    // It will check if Response ID changed and stop if needed
                    if (queue.length > 0) {
                      processAudioQueueShared();
                    }
                  };
                } catch (e) {
                  console.error('[Deepgram TTS] Error processing audio queue:', e);
                  if (currentSTTSession) {
                    currentSTTSession.deepgramTtsIsProcessingQueue = false;
                  }
                  // Try to continue processing if queue has more chunks
                  // Response ID validation will happen at the start of processAudioQueueShared()
                  if (queue.length > 0) {
                    processAudioQueueShared();
                  }
                }
              };
              
              deepgramWs.onmessage = async (event) => {
                if (!currentSTTSession) return;
                
                try {
                  if (event.data instanceof ArrayBuffer) {
                    // Convert ArrayBuffer to Float32Array (PCM audio)
                    const int16Array = new Int16Array(event.data);
                    const float32Array = new Float32Array(int16Array.length);
                    for (let i = 0; i < int16Array.length; i++) {
                      float32Array[i] = int16Array[i] / 32768.0;
                    }

                    // Get the current TTS response ID that was stored when text was sent
                    const chunkId = currentSTTSession.currentTtsResponseId;
                    const globalId = currentSTTSession.globalResponseId || 0;
                    
                    // CRITICAL: Validate ID before adding to queue
                    // If chunk ID doesn't match global ID, this chunk is stale (user interrupted)
                    if (chunkId === undefined || chunkId !== globalId) {
                      console.log('[Deepgram TTS] Discarding stale audio chunk - ID mismatch:', 
                        'chunk ID:', chunkId, 'global ID:', globalId);
                      return; // Discard stale chunk
                    }
                    
                    // Create audio chunk object with ID
                    const chunkObj: AudioChunkObject = {
                      data: float32Array,
                      id: chunkId
                    };

                    // Add to shared queue - ID already validated
                    if (currentSTTSession.deepgramTtsAudioQueue) {
                      currentSTTSession.deepgramTtsAudioQueue.push(chunkObj);
                      
                      // Start processing queue if not already processing
                      if (!currentSTTSession.deepgramTtsIsProcessingQueue) {
                        processAudioQueueShared();
                        console.log('[Deepgram TTS] Added chunk to queue (ID:', chunkId, '), started processing');
                      }
                    }
                  } else if (typeof event.data === 'string') {
                    try {
                      const data = JSON.parse(event.data);
                      if (data.type === 'playback_finished') {
                        // Playback finished signal - no need to track per Response ID
                        // The queue processing will naturally stop when queue is empty
                        console.log('[Deepgram TTS] Playback finished signal received');
                      } else if (data.type === 'error') {
                        console.error('[Deepgram TTS] Error:', data.message);
                      }
                    } catch (e) {
                      // Not JSON, ignore
                    }
                  }
                } catch (e) {
                  console.error('[Deepgram TTS] Error processing message:', e);
                }
              };
              
              // Handle reconnection on close
              deepgramWs.onclose = (event) => {
                console.log('[Deepgram TTS] WebSocket closed', event.code, event.reason);
                // Clear from session if it's the same connection
                if (currentSTTSession && currentSTTSession.deepgramTtsWs === deepgramWs) {
                  currentSTTSession.deepgramTtsWs = null;
                }
              };
              
              deepgramWs.onerror = (error) => {
                console.error('[Deepgram TTS] WebSocket error:', error);
                // Clear from session on error
                if (currentSTTSession && currentSTTSession.deepgramTtsWs === deepgramWs) {
                  currentSTTSession.deepgramTtsWs = null;
                }
              };
            }
            
            // Ensure AudioContext is available
            if (!audioContext && currentSTTSession?.deepgramTtsAudioContext) {
              audioContext = currentSTTSession.deepgramTtsAudioContext;
            }
            
            if (!audioContext) {
              audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 48000
              });
              if (currentSTTSession) {
                currentSTTSession.deepgramTtsAudioContext = audioContext;
              }
            }
            
            // Resume AudioContext if suspended
            if (audioContext.state === 'suspended') {
              audioContext.resume().catch((e) => {
                console.warn('[Deepgram TTS] Could not resume AudioContext:', e);
              });
            }
            
            // Wait for WebSocket to be ready (if new connection)
            const sendTextWhenReady = async () => {
              if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                // Small delay to ensure connection is fully stable before sending data
                // This prevents distortion on first playback
                await new Promise(resolve => setTimeout(resolve, 150));
                
                // Ensure AudioContext is running before sending
                if (audioContext && audioContext.state === 'suspended') {
                  await audioContext.resume();
                }
                
                // Send text to Deepgram with smaller chunks for low latency
                // Reduced from 180 to 50-80 chars to start TTS faster
                const SEND_EVERY = 60; // characters per chunk (optimized for low latency)
                const MIN_FIRST_CHUNK = 20; // Send first chunk even smaller for immediate start
                let buffer = '';
                let isFirstChunk = true;
                
                const sendChunk = (force: boolean = false) => {
                  const shouldSend = force || 
                    (isFirstChunk && buffer.length >= MIN_FIRST_CHUNK) ||
                    (!isFirstChunk && buffer.length >= SEND_EVERY);
                  
                  if (shouldSend && buffer.length > 0) {
                    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                      deepgramWs.send(JSON.stringify({
                        type: 'speak',
                        text: buffer
                      }));
                      console.log(`[Deepgram TTS] Sent chunk (${buffer.length} chars, first: ${isFirstChunk})`);
                    }
                    buffer = '';
                    isFirstChunk = false;
                  }
                };
                
                // Process text character by character for immediate streaming
                for (let i = 0; i < text.length; i++) {
                  buffer += text[i];
                  // Send first chunk early for low latency
                  if (isFirstChunk && buffer.length >= MIN_FIRST_CHUNK) {
                    sendChunk();
                  } else if (!isFirstChunk && buffer.length >= SEND_EVERY) {
                    sendChunk();
                  }
                }
                
                // Send remaining buffer and flush
                sendChunk(true); // Force send remaining
                if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                  deepgramWs.send(JSON.stringify({ type: 'flush' }));
                  console.log('[Deepgram TTS] Sent flush signal');
                }
              } else if (deepgramWs && deepgramWs.readyState === WebSocket.CONNECTING) {
                // Wait for connection to open, then send text
                deepgramWs.addEventListener('open', async () => {
                  // Small delay after WebSocket opens to ensure connection is stable
                  await new Promise(resolve => setTimeout(resolve, 150));
                  // Ensure AudioContext is running
                  if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                  }
                  await sendTextWhenReady();
                }, { once: true });
              } else {
                reject(new Error('Deepgram TTS WebSocket is not available'));
              }
            };
            
            // Send text immediately if connection is ready, otherwise wait
            if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
              sendTextWhenReady().then(() => resolve()).catch(reject);
            } else if (deepgramWs) {
              deepgramWs.addEventListener('open', async () => {
                try {
                  // Small delay after WebSocket opens to ensure connection is stable
                  await new Promise(resolve => setTimeout(resolve, 150));
                  // Ensure AudioContext is running
                  if (audioContext && audioContext.state === 'suspended') {
                    await audioContext.resume();
                  }
                  await sendTextWhenReady();
                  resolve();
                } catch (e) {
                  reject(e);
                }
              }, { once: true });
            } else {
              reject(new Error('Failed to create Deepgram TTS WebSocket'));
              return;
            }
            
            // Use shared queue for sequential audio playback (prevents overlap)
            let playbackFinished = false;
            
            // Ensure shared queue exists
            if (!currentSTTSession) {
              reject(new Error('STT session not available'));
              return;
            }
            if (!currentSTTSession.deepgramTtsAudioQueue) {
              currentSTTSession.deepgramTtsAudioQueue = [];
            }
            if (currentSTTSession.deepgramTtsIsProcessingQueue === undefined) {
              currentSTTSession.deepgramTtsIsProcessingQueue = false;
            }
            
            // Resume AudioContext if suspended
            if (audioContext && audioContext.state === 'suspended') {
              audioContext.resume().catch((e) => {
                console.warn('[Deepgram TTS] Could not resume AudioContext:', e);
              });
            }
            
            // Note: Message handler is set up once when WebSocket is created (shared handler)
            // The shared handler validates IDs at queue insertion and playback time
            
            const cleanup = () => {
              // Don't close WebSocket - keep it open for reuse
              // Don't close AudioContext - it's shared across requests
              // Next play time is already updated in processAudioQueue
              playbackFinished = true;
            };
            
            // Set up message handler (only if not already set up for new connections)
            if (!deepgramWs.onmessage) {
              deepgramWs.onmessage = async (event) => {
                try {
                  // Audio chunks are handled by the shared handler set up when WebSocket is created
                  // This handler only processes control messages (playback_finished, errors)
                  if (typeof event.data === 'string') {
                    // Control message
                    const data = JSON.parse(event.data);
                    if (data.type === 'playback_finished') {
                      console.log('[Deepgram TTS] Playback finished signal received');
                      playbackFinished = true;
                      // Check if queue is empty and not processing
                      const queueEmpty = !currentSTTSession?.deepgramTtsAudioQueue || 
                                        currentSTTSession.deepgramTtsAudioQueue.length === 0;
                      const notProcessing = !currentSTTSession?.deepgramTtsIsProcessingQueue;
                      
                      if (queueEmpty && notProcessing) {
                        // All audio played, cleanup and resolve
                        cleanup();
                        resolve();
                      } else {
                        // Still processing queue, wait for it to finish
                        const checkComplete = () => {
                          const qEmpty = !currentSTTSession?.deepgramTtsAudioQueue || 
                                        currentSTTSession.deepgramTtsAudioQueue.length === 0;
                          const notProc = !currentSTTSession?.deepgramTtsIsProcessingQueue;
                          return qEmpty && notProc;
                        };
                        
                        const waitInterval = setInterval(() => {
                          if (checkComplete()) {
                            clearInterval(waitInterval);
                            cleanup();
                            resolve();
                          }
                        }, 50);
                        
                        // Timeout after 5 seconds
                        setTimeout(() => {
                          clearInterval(waitInterval);
                          cleanup();
                          resolve();
                        }, 5000);
                      }
                    } else if (data.type === 'error') {
                      console.error('[Deepgram TTS] Error from server:', data.message);
                      cleanup();
                      reject(new Error(`Deepgram TTS error: ${data.message || 'Unknown error'}`));
                    }
                  }
                } catch (e) {
                  console.error('[Deepgram TTS] Error processing message:', e);
                }
              };
            } else {
              // For existing connection, we need to handle messages differently
              // Create a temporary handler for this request
              const tempHandler = async (event: MessageEvent) => {
                try {
                  // Audio chunks are handled by the shared handler set up when WebSocket is created
                  // This handler only processes control messages (playback_finished, errors)
                  if (typeof event.data === 'string') {
                    const data = JSON.parse(event.data);
                    if (data.type === 'playback_finished') {
                      playbackFinished = true;
                      // Check if queue is empty and not processing
                      const queueEmpty = !currentSTTSession?.deepgramTtsAudioQueue || 
                                        currentSTTSession.deepgramTtsAudioQueue.length === 0;
                      const notProcessing = !currentSTTSession?.deepgramTtsIsProcessingQueue;
                      
                      if (queueEmpty && notProcessing) {
                        // All audio played, cleanup and resolve
                        cleanup();
                        deepgramWs?.removeEventListener('message', tempHandler);
                        resolve();
                      } else {
                        // Still processing queue, wait for it to finish
                        const checkComplete = () => {
                          const qEmpty = !currentSTTSession?.deepgramTtsAudioQueue || 
                                        currentSTTSession.deepgramTtsAudioQueue.length === 0;
                          const notProc = !currentSTTSession?.deepgramTtsIsProcessingQueue;
                          return qEmpty && notProc;
                        };
                        
                        const waitInterval = setInterval(() => {
                          if (checkComplete()) {
                            clearInterval(waitInterval);
                            cleanup();
                            deepgramWs?.removeEventListener('message', tempHandler);
                            resolve();
                          }
                        }, 50);
                        
                        // Timeout after 5 seconds
                        setTimeout(() => {
                          clearInterval(waitInterval);
                          cleanup();
                          deepgramWs?.removeEventListener('message', tempHandler);
                          resolve();
                        }, 5000);
                      }
                    }
                  }
                } catch (e) {
                  console.error('[Deepgram TTS] Error processing message:', e);
                }
              };
              deepgramWs.addEventListener('message', tempHandler);
            }
            
            // Set up error handler (only for new connections)
            if (!deepgramWs.onerror) {
              deepgramWs.onerror = (error) => {
                console.error('[Deepgram TTS] WebSocket error:', error);
                // Don't reject - connection might recover
              };
            }
            
            // Timeout safety (30 seconds for longer responses)
            setTimeout(() => {
              if (!playbackFinished) {
                console.warn('[Deepgram TTS] Timeout reached, cleaning up');
                cleanup();
                resolve(); // Resolve instead of reject to prevent blocking
              }
            }, 30000);
          });
        }
        
        // Handle Web Speech API (browser-native, no backend call needed)
        if (ttsProvider === 'webspeech') {
          if (!('speechSynthesis' in window)) {
            throw new Error('Web Speech API is not supported in this browser');
          }
          
          // Cancel any current speech and wait a moment to ensure it's fully cancelled
          // This prevents duplicate speech when called multiple times quickly
          window.speechSynthesis.cancel();
          // Small delay to ensure cancellation is processed before speaking
          await new Promise(resolve => setTimeout(resolve, 50));
          
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;
          
          // Helper function to get voices (handles async loading)
          const getVoices = (): SpeechSynthesisVoice[] => {
            return window.speechSynthesis.getVoices();
          };
          
          // Try to find a good voice (prefer Google or Microsoft voices)
          let voices = getVoices();
          
          // If no voices available, wait for voiceschanged event (browsers load voices asynchronously)
          if (voices.length === 0) {
            return new Promise<void>((resolve, reject) => {
              const onVoicesChanged = () => {
                window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                voices = getVoices();
                const preferredVoice = voices.find(v => 
                  v.name.includes('Google') || 
                  v.name.includes('Microsoft') ||
                  v.name.includes('Samantha')
                ) || voices[0];
                
                if (preferredVoice) {
                  utterance.voice = preferredVoice;
                }
                
                // Set up speech completion handlers
                utterance.onend = () => {
                  resolve();
                };
                utterance.onerror = (e) => {
                  // "interrupted" is not an error - it happens when speech is cancelled (normal behavior)
                  if (e.error === 'interrupted') {
                    resolve(); // Resolve instead of reject - cancellation is expected
                  } else {
                    reject(new Error(`Web Speech API error: ${e.error}`));
                  }
                };
                
                window.speechSynthesis.speak(utterance);
              };
              
              window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
              
              // Fallback timeout in case voiceschanged never fires
              setTimeout(() => {
                window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                voices = getVoices();
                const preferredVoice = voices.find(v => 
                  v.name.includes('Google') || 
                  v.name.includes('Microsoft') ||
                  v.name.includes('Samantha')
                ) || voices[0];
                
                if (preferredVoice) {
                  utterance.voice = preferredVoice;
                }
                
                utterance.onend = () => {
                  resolve();
                };
                utterance.onerror = (e) => {
                  // "interrupted" is not an error - it happens when speech is cancelled (normal behavior)
                  if (e.error === 'interrupted') {
                    resolve(); // Resolve instead of reject - cancellation is expected
                  } else {
                    reject(new Error(`Web Speech API error: ${e.error}`));
                  }
                };
                
                window.speechSynthesis.speak(utterance);
              }, 1000);
            });
          }
          
          // Voices are available, use them directly
          const preferredVoice = voices.find(v => 
            v.name.includes('Google') || 
            v.name.includes('Microsoft') ||
            v.name.includes('Samantha')
          ) || voices[0];
          
          if (preferredVoice) {
            utterance.voice = preferredVoice;
          }
          
          // Return a promise that resolves when speech completes
          return new Promise<void>((resolve, reject) => {
            utterance.onend = () => {
              resolve();
            };
            utterance.onerror = (e) => {
              // "interrupted" is not an error - it happens when speech is cancelled (normal behavior)
              if (e.error === 'interrupted') {
                resolve(); // Resolve instead of reject - cancellation is expected
              } else {
                reject(new Error(`Web Speech API error: ${e.error}`));
              }
            };
            
            window.speechSynthesis.speak(utterance);
          });
        }
        
        // For other providers (gtts, openai), use backend API
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: 'nova', // Using 'nova' voice to match realtime mode
            provider: ttsProvider, // Pass provider from admin settings
          }),
        });

        if (!response.ok) {
          throw new Error('TTS API error');
        }

        const audioBlob = await response.blob();
        
        // CRITICAL: Validate blob before creating URL to prevent ERR_FILE_NOT_FOUND
        if (!audioBlob || audioBlob.size === 0) {
          console.error('[TTS] Invalid audio blob received:', {
            blob: audioBlob,
            size: audioBlob?.size,
            type: audioBlob?.type
          });
          throw new Error('Invalid or empty audio blob received from server');
        }
        
        // Validate blob type
        if (!audioBlob.type || !audioBlob.type.startsWith('audio/')) {
          console.warn('[TTS] Unexpected blob type:', audioBlob.type, '- expected audio/*');
          // Still proceed, but log warning
        }
        
        const audioUrl = URL.createObjectURL(audioBlob);
        
        if (audioEl) {
          // Stop any currently playing audio first (critical for Android)
          try {
            audioEl.pause();
            audioEl.currentTime = 0;
            // Clear previous event listeners
            audioEl.onplay = null;
            audioEl.onpause = null;
            audioEl.onended = null;
            audioEl.onerror = null;
            // CRITICAL: Don't set src to empty string - this causes "Empty src attribute" error
            // Instead, just pause and reset, then set new src
          } catch (e) {
            console.warn('[TTS] Error clearing previous audio:', e);
          }
          
          // Small delay to ensure previous audio is fully stopped (Android requirement)
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // CRITICAL: Validate audioUrl before setting src
          if (!audioUrl || audioUrl === '' || audioUrl === 'undefined') {
            console.error('[TTS] Invalid audioUrl, cannot play:', audioUrl);
            throw new Error('Invalid audio URL');
          }
          
          // Set up new audio source
          audioEl.src = audioUrl;
          audioEl.preload = 'auto';
          
          // CRITICAL: Verify src was set correctly
          if (!audioEl.src || audioEl.src === '' || audioEl.src === window.location.href) {
            console.error('[TTS] Audio src not set correctly:', audioEl.src);
            throw new Error('Audio source not set correctly');
          }
          
          // Wait for audio to be ready before playing (critical for Android Chrome)
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Audio loading timeout'));
            }, 10000); // 10 second timeout
            
            const onCanPlayThrough = () => {
              clearTimeout(timeout);
              audioEl?.removeEventListener('canplaythrough', onCanPlayThrough);
              audioEl?.removeEventListener('error', onError);
              // Small delay for Android Chrome to process audio setup
              setTimeout(() => resolve(), 50);
            };
            
            const onError = (e: Event) => {
              clearTimeout(timeout);
              audioEl?.removeEventListener('canplaythrough', onCanPlayThrough);
              audioEl?.removeEventListener('error', onError);
              
              // Log detailed error information
              if (audioEl) {
                const errorInfo = {
                  error: audioEl.error ? {
                    code: audioEl.error.code,
                    message: audioEl.error.message
                  } : null,
                  src: audioEl.src,
                  networkState: audioEl.networkState,
                  readyState: audioEl.readyState,
                  blobUrl: audioUrl
                };
                console.error('[TTS] Audio loading error in promise:', errorInfo);
              }
              
              reject(new Error('Audio loading error'));
            };
            
            if (audioEl.readyState >= 3) {
              // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
              clearTimeout(timeout);
              // Small delay for Android Chrome to process audio setup
              setTimeout(() => resolve(), 50);
            } else {
              audioEl.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
              audioEl.addEventListener('error', onError, { once: true });
              audioEl.load(); // Explicitly load the audio
            }
          });
          
          // Ensure AudioContext is resumed before playing (Android Chrome requirement)
          if (currentSTTSession?.audioContext && currentSTTSession.audioContext.state === 'suspended') {
            try {
              await currentSTTSession.audioContext.resume();
            } catch (e) {
              console.warn('[TTS] Could not resume AudioContext before play:', e);
            }
          }
          
          // Set up event handlers to prevent interruptions (Android audio focus handling)
          let isPlaying = false;
          let pauseResumeAttempts = 0;
          const maxResumeAttempts = 3; // Reduced attempts to prevent beep sounds
          let pauseResumeTimeout: ReturnType<typeof setTimeout> | null = null;
          let lastPauseTime = 0;
          const PAUSE_DEBOUNCE_MS = 500; // Debounce pause/resume to prevent beep sounds
          
          const handlePause = async () => {
            const now = Date.now();
            
            // CRITICAL: Don't handle pause if audio has ended - this prevents beeps after playback
            if (!audioEl || audioEl.ended) {
              return;
            }
            
            // Debounce: ignore pauses that happen too quickly after the last one
            if (now - lastPauseTime < PAUSE_DEBOUNCE_MS) {
              return;
            }
            lastPauseTime = now;
            
            // Clear any pending resume attempts
            if (pauseResumeTimeout) {
              clearTimeout(pauseResumeTimeout);
              pauseResumeTimeout = null;
            }
            
            // Only resume if we were actually playing and it wasn't intentional
            if (audioEl && !audioEl.ended && isPlaying && pauseResumeAttempts < maxResumeAttempts) {
              pauseResumeAttempts++;
              
              // Debounced resume - wait a bit before attempting to resume
              pauseResumeTimeout = setTimeout(async () => {
                try {
                  // Double-check state before resuming - audio might have ended while waiting
                  if (!audioEl || audioEl.ended) {
                    pauseResumeTimeout = null;
                    return;
                  }
                  
                  if (audioEl && !audioEl.ended && audioEl.paused && isPlaying) {
                    // Ensure AudioContext is resumed
                    if (currentSTTSession?.audioContext && currentSTTSession.audioContext.state === 'suspended') {
                      try {
                        await currentSTTSession.audioContext.resume();
                      } catch (e) {
                        console.warn('[TTS] Could not resume AudioContext:', e);
                      }
                    }
                    
                    // Small delay before resuming to let Android settle
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    if (audioEl && !audioEl.ended && audioEl.paused) {
                      await audioEl.play();
                      isPlaying = true;
                      console.log('[TTS] Successfully resumed after pause');
                    }
                  }
                } catch (e) {
                  console.warn('[TTS] Could not resume after pause:', e);
                }
                pauseResumeTimeout = null;
              }, PAUSE_DEBOUNCE_MS);
            }
          };
          
          const handlePlay = () => {
            isPlaying = true;
            pauseResumeAttempts = 0; // Reset attempts on successful play
            lastPauseTime = 0; // Reset pause time
            // Clear any pending resume attempts since we're playing
            if (pauseResumeTimeout) {
              clearTimeout(pauseResumeTimeout);
              pauseResumeTimeout = null;
            }
          };
          
          const handleEnded = () => {
            isPlaying = false;
            // Clear any pending resume attempts
            if (pauseResumeTimeout) {
              clearTimeout(pauseResumeTimeout);
              pauseResumeTimeout = null;
            }
            // Clear current audio element reference
            if (currentSTTSession && currentSTTSession.currentTTSAudioElement === audioEl) {
              currentSTTSession.currentTTSAudioElement = null;
            }
            // Remove event listeners to prevent beeps after audio ends
            if (audioEl) {
              audioEl.removeEventListener('pause', handlePause);
              audioEl.removeEventListener('play', handlePlay);
              audioEl.removeEventListener('ended', handleEnded);
            }
            // CRITICAL: Only revoke URL after a longer delay to ensure audio is fully done
            // Increased delay to prevent ERR_FILE_NOT_FOUND if browser is still processing
            // Also check that the audio element is still using this URL before revoking
            setTimeout(() => {
              try {
                // Only revoke if this audio element is still using this blob URL
                // This prevents revoking a blob that's still in use by a new audio request
                if (audioEl && audioEl.src === audioUrl && audioUrl && audioUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(audioUrl);
                }
              } catch (e) {
                console.warn('[TTS] Error revoking blob URL:', e);
              }
            }, 500); // Increased delay to ensure browser is completely done with the blob
          };
          
          // Add event listeners for audio playback
          audioEl.addEventListener('pause', handlePause);
          audioEl.addEventListener('play', handlePlay);
          audioEl.addEventListener('ended', handleEnded);
          audioEl.addEventListener('error', (e) => {
            const errorCode = audioEl.error?.code;
            const errorMessage = audioEl.error?.message;
            
            // Ignore errors when src is empty or matches page URL (intentional disconnect/cleanup)
            if (!audioEl.src || audioEl.src === '' || audioEl.src === window.location.href || audioEl.src === window.location.origin + '/') {
              // This is likely an intentional disconnect, don't log as error
              return;
            }
            
            // Error code 2 (MEDIA_ERR_NETWORK) can be non-critical if audio still plays
            // It often happens due to blob URL timing issues but doesn't prevent playback
            if (errorCode === 2) {
              console.warn('[TTS] Audio network error (usually non-critical):', {
                code: errorCode,
                message: errorMessage,
                src: audioEl.src,
                note: 'This may occur due to blob URL timing but audio usually still plays'
              });
              // Don't revoke blob URL for network errors - might still be needed
              return;
            }
            
            // Error code 4 (MEDIA_ERR_SRC_NOT_SUPPORTED/Format error) on blob URLs
            // Often happens during disconnect/cleanup when blob URL is revoked or cleared
            // This is usually non-critical and shouldn't be shown to users
            if (errorCode === 4 && audioEl.src.startsWith('blob:')) {
              // Check if this is likely a cleanup-related error
              // Format errors on blob URLs during cleanup are expected and harmless
              console.debug('[TTS] Audio format error on blob URL (likely cleanup-related, non-critical):', {
                code: errorCode,
                message: errorMessage,
                src: audioEl.src.substring(0, 50) + '...', // Truncate for privacy
                note: 'This often occurs during disconnect when blob URLs are cleaned up - safe to ignore'
              });
              // Don't log as error - this is expected during cleanup
              return;
            }
            
            // Log other errors as critical (only real errors that need attention)
            console.error('[TTS] Audio error:', {
              code: errorCode,
              message: errorMessage,
              src: audioEl.src
            });
            
            // CRITICAL: Clean up on error to prevent memory leaks
            // Only revoke if it's a permanent error
            if (audioEl.error) {
              // MEDIA_ERR_SRC_NOT_SUPPORTED (4) or MEDIA_ERR_DECODE (3) are permanent
              if (errorCode === 4 || errorCode === 3) {
                setTimeout(() => {
                  if (audioEl && audioEl.src === audioUrl) {
                    try {
                      URL.revokeObjectURL(audioUrl);
                    } catch (e) {
                      console.warn('[TTS] Error revoking blob URL:', e);
                    }
                  }
                }, 1000);
              }
            }
          });
          
          // CRITICAL: Final validation before playing - ensure src is valid
          if (!audioEl.src || audioEl.src === '' || audioEl.src === window.location.href || !audioEl.src.startsWith('blob:') && !audioEl.src.startsWith('http')) {
            console.error('[TTS] Cannot play - invalid src:', audioEl.src);
            throw new Error('Invalid audio source - cannot play');
          }
          
          // Play the audio
          try {
            isPlaying = true;
            await audioEl.play();
            console.log('[TTS] Audio playback started');
          } catch (playError: any) {
            // If play fails, try resuming AudioContext and retry
            if (currentSTTSession?.audioContext && currentSTTSession.audioContext.state === 'suspended') {
              await currentSTTSession.audioContext.resume();
              // Re-validate src before retry
              if (audioEl.src && audioEl.src !== '' && audioEl.src !== window.location.href) {
                await audioEl.play();
                isPlaying = true;
                console.log('[TTS] Audio playback started after AudioContext resume');
              } else {
                console.error('[TTS] Cannot retry play - invalid src after resume:', audioEl.src);
                throw new Error('Invalid audio source after resume');
              }
            } else {
              console.error('[TTS] Failed to play audio:', playError, {
                src: audioEl.src,
                readyState: audioEl.readyState,
                networkState: audioEl.networkState,
                error: audioEl.error
              });
              throw playError;
            }
          }
          
          // Note: Cleanup is now handled by handleEnded event listener above
        }
      } catch (e) {
        console.error('TTS error:', e);
        // Fallback: Use Web Speech Synthesis API
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.voice = speechSynthesis.getVoices().find(v => v.name.includes('Google') || v.name.includes('Microsoft')) || speechSynthesis.getVoices()[0];
          speechSynthesis.speak(utterance);
        }
      }
    };

    // Handle speech recognition results
    let userMsgCounter = 0;
    const extractEveryN = Number(process.env.NEXT_PUBLIC_MEMORY_EXTRACT_EVERY_N || 5);
    const backendUrlMem = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const maybeExtractMemories = async () => {
      if (!uid) return;
      try {
        const existing = await fetchTopMemories(uid, Number(process.env.NEXT_PUBLIC_MEMORY_LIMIT || 100));
        const existingTexts = existing.map(m => m.text);
        const resp = await fetch(`${backendUrlMem}/api/memories/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: conversationHistory, top_k: 5, existing_memories: existingTexts }),
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const memories = (data.memories || []).map((m: any) => ({ text: crispifyMemoryText(m.text, userName), type: m.type, importance: m.importance }));
        try {
          await addMemoriesWithLimit(uid, memories);
        } catch (saveErr) {}

        // Append conversation chunk used for extraction (both user and assistant messages, exclude system)
        try {
          const newChunk = conversationHistory.slice(lastSavedMessageIndex)
            .filter(msg => msg.role !== 'system'); // Exclude system messages
          if (newChunk.length > 0) {
            const result = await appendConversationChunk(uid, conversationSessionId, newChunk as any);
            // Update sessionId if document was split
            if (result.wasSplit) {
              conversationSessionId = result.sessionId;
              console.log('[conv] STT session split, continuing in:', conversationSessionId);
            }
            lastSavedMessageIndex = conversationHistory.length;
            console.log('[conv] STT session appended', newChunk.length, 'messages');
          }
        } catch (e) {
          console.error('[conv] STT append failed', e);
        }
      } catch (e) {}
    };

    // Promise to wait for recognition to be ready (for greeting)
    // Declare outside if block so it's accessible for greeting
    let recognitionReadyResolver: (() => void) | null = null;
    const recognitionReadyPromise = new Promise<void>((resolve) => {
      recognitionReadyResolver = resolve;
    });

    // Only set up Web Speech API handlers if using Web Speech API
    if (recognition) {
    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (!transcript) {
        return;
      }

      console.log('[STT] User said:', transcript);
      
      // Capture timestamp immediately when transcript arrives (before any processing)
      const transcriptArrivalTime = Date.now();
      
      // Check for rapid interruption - if user interrupts within MIN_INTERRUPTION_INTERVAL_MS,
      // ignore this transcript to prevent duplicate processing
      if (currentSTTSession) {
        if (currentSTTSession.lastTranscriptTimestamp !== undefined) {
          const timeSinceLastTranscript = transcriptArrivalTime - currentSTTSession.lastTranscriptTimestamp;
          if (timeSinceLastTranscript < MIN_INTERRUPTION_INTERVAL_MS) {
            console.log(`[STT] Ignoring rapid interruption (${timeSinceLastTranscript}ms < ${MIN_INTERRUPTION_INTERVAL_MS}ms), continuing with previous response`);
            // Don't update timestamp when ignoring - keep the last processed transcript's timestamp
            // so the next transcript compares against the last actually processed one (u1), not the ignored one (u2)
            return; // Don't process this transcript, let the previous one continue
          }
        }
        // Update timestamp when we process a transcript (after passing the rapid interruption check)
        currentSTTSession.lastTranscriptTimestamp = transcriptArrivalTime;
      }
      
      // Generate new global Response ID for this user message → TTT → TTS cycle
      // Create transcript object with ID that will flow through the entire pipeline
      if (!currentSTTSession) {
        return;
      }
      if (currentSTTSession.globalResponseId === undefined) {
        currentSTTSession.globalResponseId = 0;
      }
      const globalId = ++currentSTTSession.globalResponseId;
      
      // Create transcript object with ID
      const transcriptObj: TranscriptObject = {
        text: transcript,
        id: globalId
      };
      
      console.log('[STT] Generated Global Response ID:', globalId, 'for transcript:', transcript);
      
      // Stop current TTS playback if user interrupts (for all TTS providers)
      // Note: Response ID was already incremented above, so stopCurrentTTS() won't increment it again
      stopCurrentTTS();

      // Get TTS provider to determine feedback method
      let ttsProvider: string | null = null;
      try {
        const stored = localStorage.getItem('adminSettings');
        if (stored) {
          const settings = JSON.parse(stored);
          if (settings.ttsProvider) {
            ttsProvider = settings.ttsProvider.toLowerCase();
          }
        }
      } catch (e) {
        // Fallback to backend config
      }
      
      if (!ttsProvider) {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        try {
          const resp = await fetch(`${backendUrl}/api/config`);
          if (resp.ok) {
            const config = await resp.json();
            ttsProvider = config.tts_provider || 'gtts';
          } else {
            ttsProvider = 'gtts';
          }
        } catch (e) {
          ttsProvider = 'gtts';
        }
      }

      // For Deepgram TTS: Show visual "Thinking..." indicator instead of processing audio
      if (ttsProvider === 'deepgram' && onThinkingUpdate) {
        onThinkingUpdate(true);
      }

      // Start playing processing audio to give user feedback that voice was detected
      // Only for non-Deepgram TTS providers (to maintain backward compatibility)
      if (ttsProvider !== 'deepgram' && currentSTTSession?.processingAudio) {
        try {
          // Check if processing audio is already playing to prevent conflicts
          const isAlreadyPlaying = currentSTTSession.isProcessingAudioPlaying?.() || false;
          if (isAlreadyPlaying) {
            // Still ensure it's looping and at correct volume
            const audio = currentSTTSession.processingAudio;
            audio.loop = true;
            audio.volume = 0.4;
            return; // Don't try to play again if already playing
          }
          
          // Ensure AudioContext is resumed (helps with Android)
          if (currentSTTSession.audioContext && currentSTTSession.audioContext.state === 'suspended') {
            await currentSTTSession.audioContext.resume();
          }
          
          // Stop any existing Web Audio API oscillator (if any)
          if (currentSTTSession.processingOscillator) {
            try {
              currentSTTSession.processingOscillator.stop();
              currentSTTSession.processingOscillator.disconnect();
              currentSTTSession.processingOscillator = null;
            } catch (e) {}
          }
          if (currentSTTSession.processingGain) {
            try {
              currentSTTSession.processingGain.disconnect();
              currentSTTSession.processingGain = null;
            } catch (e) {}
          }
          
          // Ensure processing audio is ready and play it
          const audio = currentSTTSession.processingAudio;
          
          // Reset and ensure audio is ready
          audio.loop = true;
          audio.volume = 0.4;
          
          // If src was cleared or empty, restore it with cache-busting
          if (!audio.src || audio.src === '' || !audio.src.includes('processing.mp3')) {
            const cacheBuster = Date.now();
            audio.src = `/audio/processing.mp3?v=${cacheBuster}`;
            audio.load();
            // Wait for audio to be ready
            await new Promise<void>((resolve, reject) => {
              const timeout = setTimeout(() => {
                reject(new Error('Processing audio loading timeout'));
              }, 3000);
              
              const onCanPlay = () => {
                clearTimeout(timeout);
                audio.removeEventListener('canplaythrough', onCanPlay);
                audio.removeEventListener('error', onError);
                resolve();
              };
              
              const onError = (e: Event) => {
                clearTimeout(timeout);
                audio.removeEventListener('canplaythrough', onCanPlay);
                audio.removeEventListener('error', onError);
                reject(new Error('Processing audio loading error'));
              };
              
              if (audio.readyState >= 3) {
                // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
                clearTimeout(timeout);
                resolve();
              } else {
                audio.addEventListener('canplaythrough', onCanPlay, { once: true });
                audio.addEventListener('error', onError, { once: true });
              }
            });
          }
          
          // CRITICAL: Validate src before playing
          if (!audio.src || audio.src === '' || audio.src === window.location.href || !audio.src.includes('processing.mp3')) {
            console.error('[STT] Cannot play processing audio - invalid src:', audio.src);
            throw new Error('Invalid processing audio source');
          }
          
          // Reset to start and play
          audio.currentTime = 0;
          
          // Small delay to ensure audio context is ready (helps with Android)
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Final validation before play
          if (!audio.src || audio.src === '' || !audio.src.includes('processing.mp3')) {
            console.error('[STT] Processing audio src invalid before play:', audio.src);
            throw new Error('Processing audio source became invalid');
          }
          
          await audio.play();
          console.log('[STT] Started processing audio (processing.mp3)');
        } catch (e) {
          console.error('[STT] Could not play processing audio:', e);
        }
      }

      try {
        // Increment counter BEFORE getting response (user message is added inside getChatResponse)
        userMsgCounter += 1;
        
        // Get chat response
        const response = await getChatResponse(transcript);
        console.log('[TTT] Assistant response:', response);

        // Check if we should extract memories after user message is processed
        if (extractEveryN > 0 && userMsgCounter % extractEveryN === 0) {
          maybeExtractMemories();
        }

        // Hide thinking indicator if using Deepgram TTS
        if (ttsProvider === 'deepgram' && onThinkingUpdate) {
          onThinkingUpdate(false);
        }

        // For Deepgram TTS: Set the transcript's ID before calling textToSpeech
        // This ensures audio chunks use the same ID as the transcript for validation
        if (ttsProvider === 'deepgram' && currentSTTSession) {
          currentSTTSession.currentTtsResponseId = transcriptObj.id;
          console.log('[Web Speech API] Set TTS Response ID to transcript ID:', transcriptObj.id);
        }

        // Convert to speech (this will stop the processing audio)
        await textToSpeech(response);
      } catch (e) {
        console.error('[STT/TTT/TTS] Error:', e);
        // Hide thinking indicator on error
        if (onThinkingUpdate) {
          onThinkingUpdate(false);
        }
        // Stop processing audio on error as well
        if (currentSTTSession) {
          // Stop Web Audio API oscillator if any
          if (currentSTTSession.processingOscillator) {
            try {
              currentSTTSession.processingOscillator.stop();
              currentSTTSession.processingOscillator.disconnect();
              currentSTTSession.processingOscillator = null;
            } catch (e) {}
          }
          if (currentSTTSession.processingGain) {
            try {
              currentSTTSession.processingGain.disconnect();
              currentSTTSession.processingGain = null;
            } catch (e) {}
          }
          // Stop HTMLAudioElement
          if (currentSTTSession.processingAudio) {
            currentSTTSession.processingAudio.pause();
            currentSTTSession.processingAudio.currentTime = 0;
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      // Only log meaningful errors - ignore common non-critical errors
      if (event.error !== 'no-speech' && 
          event.error !== 'aborted' && 
          event.error !== 'audio-capture' &&
          event.error !== 'not-allowed') {
        console.error('[STT] Recognition error:', event.error);
      }
      // Silently handle common expected errors
    };

    recognition.onstart = () => {
      // CRITICAL: Stop processing audio when recognition starts (idle listening)
      // This prevents processing audio from playing during continuous recognition cycles
      if (currentSTTSession?.processingAudio) {
        try {
          const audio = currentSTTSession.processingAudio;
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
          }
        } catch (e) {
          console.warn('[STT] Error stopping processing audio on recognition start:', e);
        }
      }
      
      // Resolve promise when recognition is ready (for greeting)
      if (recognitionReadyResolver) {
        recognitionReadyResolver();
        recognitionReadyResolver = null;
        console.log('[STT] Recognition is ready');
      }
    };

    // Detect if we're on Android to handle beep issue
    const isAndroid = /Android/i.test(navigator.userAgent);
    let recognitionRestartTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastRecognitionEndTime = 0;
    let isRecognitionRestarting = false; // Flag to prevent multiple simultaneous restarts
    
    recognition.onend = () => {
      // CRITICAL: Ensure processing audio is stopped when recognition ends
      // This prevents it from playing during the restart cycle
      if (currentSTTSession?.processingAudio) {
        try {
          const audio = currentSTTSession.processingAudio;
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
          }
        } catch (e) {
          console.warn('[STT] Error stopping processing audio on recognition end:', e);
        }
      }
      
      // CRITICAL: Check if recognition is actually stopped before restarting
      // Sometimes onend fires but recognition is still active (especially on Android)
      // This prevents unnecessary restarts that cause beeps
      if (isRecognitionRestarting) {
        return;
      }
      
      // Clear any pending restart
      if (recognitionRestartTimeout) {
        clearTimeout(recognitionRestartTimeout);
        recognitionRestartTimeout = null;
      }
      
      // Restart recognition if session is still active
      if (currentSTTSession && currentSTTSession.recognition === recognition) {
        const now = Date.now();
        const timeSinceLastEnd = now - lastRecognitionEndTime;
        lastRecognitionEndTime = now;
        
        // CRITICAL FIX: On Android, the beep happens when recognition.start() is called
        // Even with continuous=true, calling start() again reactivates the mic and causes beep
        // Add delay on Android to reduce beep frequency
        const restartDelay = isAndroid ? 100 : 0;
        
        // If recognition ended very quickly, add a small delay to prevent rapid cycling
        const actualDelay = timeSinceLastEnd < 1000 ? restartDelay + 500 : restartDelay;
        
        isRecognitionRestarting = true;
        recognitionRestartTimeout = setTimeout(() => {
          recognitionRestartTimeout = null;
          isRecognitionRestarting = false;
          
          // Clear timeout reference from session
          if (currentSTTSession) {
            (currentSTTSession as any).recognitionRestartTimeout = null;
          }
          
          // Double-check session is still active before restarting
          if (currentSTTSession && currentSTTSession.recognition === recognition) {
            try {
              recognition.start();
            } catch (e: any) {
              // If error is "already started", that's actually good - means it's still running
              if (e && !(e.message?.includes('already') || e.message?.includes('started'))) {
                console.warn('[STT] Error restarting recognition:', e);
              }
            }
          }
        }, actualDelay);
        
        // Store timeout reference in session for cleanup
        if (currentSTTSession) {
          (currentSTTSession as any).recognitionRestartTimeout = recognitionRestartTimeout;
        }
      }
    };

    recognition.onnomatch = () => {
      // CRITICAL: Stop processing audio when no match (no user speech detected)
      // This prevents processing audio from playing during idle periods
      if (currentSTTSession?.processingAudio) {
        try {
          const audio = currentSTTSession.processingAudio;
          if (!audio.paused) {
            audio.pause();
            audio.currentTime = 0;
          }
        } catch (e) {
          console.warn('[STT] Error stopping processing audio on no match:', e);
        }
      }
    };

      // Start recognition only for Web Speech API
    recognition.start();
    }
    
    // Wait for recognition to be ready before generating greeting
    // This ensures AudioContext and all initialization is complete
    try {
      if (recognition) {
        // Wait for recognition.onstart with a timeout fallback
        await Promise.race([
          recognitionReadyPromise,
          new Promise(resolve => setTimeout(resolve, 2000)) // 2 second timeout fallback
        ]);
        console.log('[STT] Recognition ready, proceeding with greeting');
      } else {
        // No recognition (Deepgram STT), wait a short time for initialization
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('[STT] No Web Speech recognition, proceeding with greeting');
      }
    } catch (e) {
      console.warn('[STT] Error waiting for recognition ready:', e);
      // Continue anyway after a short delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Generate dynamic initial greeting using the AI
    // This makes the greeting personalized and varied each time
    try {
      // Check TTS provider to determine if we should use streaming
      let ttsProvider: string | null = null;
      try {
        const stored = localStorage.getItem('adminSettings');
        if (stored) {
          const settings = JSON.parse(stored);
          if (settings.ttsProvider) {
            ttsProvider = settings.ttsProvider.toLowerCase();
          }
        }
      } catch (e) {
        // Will check backend below
      }
      
      // If not in localStorage, fetch from backend
      if (!ttsProvider) {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        try {
          const resp = await fetch(`${backendUrl}/api/config`);
          if (resp.ok) {
            const config = await resp.json();
            ttsProvider = config.tts_provider || 'gtts';
          } else {
            ttsProvider = 'gtts';
          }
        } catch (e) {
          ttsProvider = 'gtts';
        }
      }
      
      // Send a prompt that will generate a dynamic greeting
      // The AI will use the instructions to greet with the child's name in the first message
      const greetingPrompt = "Please greet me and start our conversation in a warm and engaging way.";
      // Don't add to conversationHistory here - getChatResponseStream will add it
      // This prevents the greeting prompt from appearing twice in the UI
      
      let greeting = '';
      
      // Use streaming chat for Deepgram TTS, non-streaming for others
      if (ttsProvider === 'deepgram') {
        // Use streaming chat response for Deepgram TTS (low latency)
        try {
          // CRITICAL: Ensure Deepgram TTS WebSocket and handler are set up BEFORE sending greeting
          // The WebSocket and handler are created in textToSpeech(), so we need to ensure it's set up first
          // We'll call textToSpeech with a minimal text to set up the WebSocket and handler
          // This ensures the message handler is ready to process audio chunks from the greeting
          if (!currentSTTSession?.deepgramTtsWs || currentSTTSession.deepgramTtsWs.readyState !== WebSocket.OPEN) {
            console.log('[Greeting] Setting up Deepgram TTS WebSocket before greeting...');
            // Call textToSpeech with a space character to set up WebSocket and handler
            // The space won't produce meaningful audio but will initialize the WebSocket
            // We don't await it fully - we just need the WebSocket to be created and handler set up
            const setupPromise = textToSpeech(' ').catch(() => {
              // Ignore errors from the setup call - we just need the WebSocket created
            });
            
            // Wait for WebSocket to be created and opened (with timeout)
            let retries = 0;
            while ((!currentSTTSession?.deepgramTtsWs || currentSTTSession.deepgramTtsWs.readyState !== WebSocket.OPEN) && retries < 30) {
              await new Promise(resolve => setTimeout(resolve, 100));
              retries++;
            }
            
            // Once WebSocket is ready, flush any pending audio from the dummy setup call
            // This ensures clean state before sending the greeting
            if (currentSTTSession?.deepgramTtsWs && currentSTTSession.deepgramTtsWs.readyState === WebSocket.OPEN) {
              try {
                currentSTTSession.deepgramTtsWs.send(JSON.stringify({ type: 'flush' }));
                // Clear any audio queue from the dummy call
                if (currentSTTSession.deepgramTtsAudioQueue) {
                  currentSTTSession.deepgramTtsAudioQueue.length = 0;
                }
                // Reset processing flags
                currentSTTSession.deepgramTtsIsProcessingQueue = false;
                // Reset next play time for clean start
                if (currentSTTSession.deepgramTtsAudioContext) {
                  currentSTTSession.deepgramTtsNextPlayTime = currentSTTSession.deepgramTtsAudioContext.currentTime;
                }
                console.log('[Greeting] Flushed dummy setup call, ready for greeting');
              } catch (e) {
                console.warn('[Greeting] Error flushing dummy setup:', e);
              }
            }
            
            if (!currentSTTSession?.deepgramTtsWs || currentSTTSession.deepgramTtsWs.readyState !== WebSocket.OPEN) {
              // If WebSocket still not ready, fallback to non-streaming
              console.warn('[Greeting] Deepgram TTS WebSocket not ready after setup, falling back to non-streaming');
              const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
              const response = await fetch(`${backendUrl}/api/chat`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messages: conversationHistory,
                }),
              });

              if (!response.ok) {
                const text = await response.text();
                throw new Error(`Chat API error: ${text}`);
              }

              const data = await response.json();
              greeting = data.response || data.message || '';
            } else {
              // WebSocket is now ready - use streaming
              console.log('[Greeting] Deepgram TTS WebSocket ready, using streaming chat');
              
              // Generate global Response ID for greeting (so audio chunks are tagged correctly)
              if (currentSTTSession) {
                if (currentSTTSession.globalResponseId === undefined) {
                  currentSTTSession.globalResponseId = 0;
                }
                const greetingId = ++currentSTTSession.globalResponseId;
                // Store ID for TTS WebSocket handler to use
                currentSTTSession.currentTtsResponseId = greetingId;
                console.log('[Greeting] Generated Global Response ID:', greetingId);
              }
              
              const deepgramTtsWs = currentSTTSession.deepgramTtsWs;
            
            // Buffer for accumulating text chunks before sending to TTS
            let textBuffer = '';
            const SEND_EVERY = 60; // Same as in regular conversations
            const MIN_FIRST_CHUNK = 20;

            // Function to send text chunks to Deepgram TTS WebSocket
            const sendTextChunk = (chunk: string) => {
              textBuffer += chunk;
              
              // Send first chunk early for low latency
              if (textBuffer.length >= MIN_FIRST_CHUNK && deepgramTtsWs.readyState === WebSocket.OPEN) {
                const toSend = textBuffer;
                textBuffer = '';
                deepgramTtsWs.send(JSON.stringify({
                  type: 'speak',
                  text: toSend
                }));
                console.log(`[Greeting Deepgram TTS Stream] Sent chunk (${toSend.length} chars)`);
              } else if (textBuffer.length >= SEND_EVERY && deepgramTtsWs.readyState === WebSocket.OPEN) {
                const toSend = textBuffer;
                textBuffer = '';
                deepgramTtsWs.send(JSON.stringify({
                  type: 'speak',
                  text: toSend
                }));
                console.log(`[Greeting Deepgram TTS Stream] Sent chunk (${toSend.length} chars)`);
              }
            };

            // Get streaming chat response (this will call sendTextChunk as chunks arrive)
            greeting = await getChatResponseStream(greetingPrompt, sendTextChunk, true);
            
            // Send remaining buffer and flush signal after streaming completes
            if (textBuffer.length > 0 && deepgramTtsWs.readyState === WebSocket.OPEN) {
              deepgramTtsWs.send(JSON.stringify({
                type: 'speak',
                text: textBuffer
              }));
              textBuffer = '';
            }
            if (deepgramTtsWs.readyState === WebSocket.OPEN) {
              deepgramTtsWs.send(JSON.stringify({ type: 'flush' }));
              console.log('[Greeting Deepgram TTS Stream] Sent flush signal after streaming complete');
            }
            }
          } else {
            // WebSocket already exists and is OPEN - use streaming directly
            console.log('[Greeting] Deepgram TTS WebSocket already ready, using streaming chat');
            
            // Generate global Response ID for greeting (so audio chunks are tagged correctly)
            if (currentSTTSession) {
              if (currentSTTSession.globalResponseId === undefined) {
                currentSTTSession.globalResponseId = 0;
              }
              const greetingId = ++currentSTTSession.globalResponseId;
              // Store ID for TTS WebSocket handler to use
              currentSTTSession.currentTtsResponseId = greetingId;
              console.log('[Greeting] Generated Global Response ID:', greetingId);
            }
            
            const deepgramTtsWs = currentSTTSession?.deepgramTtsWs;
            if (!deepgramTtsWs) {
              throw new Error('Deepgram TTS WebSocket not available');
            }
            
            // Buffer for accumulating text chunks before sending to TTS
            let textBuffer = '';
            const SEND_EVERY = 60; // Same as in regular conversations
            const MIN_FIRST_CHUNK = 20;

            // Function to send text chunks to Deepgram TTS WebSocket
            const sendTextChunk = (chunk: string) => {
              textBuffer += chunk;
              
              // Send first chunk early for low latency
              if (textBuffer.length >= MIN_FIRST_CHUNK && deepgramTtsWs.readyState === WebSocket.OPEN) {
                const toSend = textBuffer;
                textBuffer = '';
                deepgramTtsWs.send(JSON.stringify({
                  type: 'speak',
                  text: toSend
                }));
                console.log(`[Greeting Deepgram TTS Stream] Sent chunk (${toSend.length} chars)`);
              } else if (textBuffer.length >= SEND_EVERY && deepgramTtsWs.readyState === WebSocket.OPEN) {
                const toSend = textBuffer;
                textBuffer = '';
                deepgramTtsWs.send(JSON.stringify({
                  type: 'speak',
                  text: toSend
                }));
                console.log(`[Greeting Deepgram TTS Stream] Sent chunk (${toSend.length} chars)`);
              }
            };

            // Get streaming chat response (this will call sendTextChunk as chunks arrive)
            greeting = await getChatResponseStream(greetingPrompt, sendTextChunk, true);
            
            // Send remaining buffer and flush signal after streaming completes
            if (textBuffer.length > 0 && deepgramTtsWs.readyState === WebSocket.OPEN) {
              deepgramTtsWs.send(JSON.stringify({
                type: 'speak',
                text: textBuffer
              }));
              textBuffer = '';
            }
            if (deepgramTtsWs.readyState === WebSocket.OPEN) {
              deepgramTtsWs.send(JSON.stringify({ type: 'flush' }));
              console.log('[Greeting Deepgram TTS Stream] Sent flush signal after streaming complete');
            }
          }
        } catch (e) {
          console.error('[Greeting] Error with streaming chat, falling back to non-streaming:', e);
          // Fallback to non-streaming
          const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
          const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messages: conversationHistory,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(`Chat API error: ${text}`);
          }

          const data = await response.json();
          greeting = data.response || data.message || '';
        }
      } else {
        // Non-Deepgram TTS - use non-streaming chat
        // Add greeting prompt to conversationHistory for the API call
        // (getChatResponseStream adds it automatically, but we need to add it here for non-streaming)
      conversationHistory.push({ role: 'user', content: greetingPrompt });
      
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      const response = await fetch(`${backendUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Chat API error: ${text}`);
      }

      const data = await response.json();
        greeting = data.response || data.message || '';
      }
      
      // Remove the greeting prompt from history (it was just to trigger the greeting)
      // Keep only the system message and the assistant's greeting
      // Find and remove the user greeting prompt (it might be the last user message or second-to-last if assistant response was already added)
      const greetingPromptIndex = conversationHistory.findIndex(
        (msg) => msg.role === 'user' && msg.content === greetingPrompt
      );
      if (greetingPromptIndex !== -1) {
        conversationHistory.splice(greetingPromptIndex, 1);
      }
      
      // Ensure assistant greeting is in history (it might already be there from getChatResponseStream)
      const hasAssistantGreeting = conversationHistory.some(
        (msg) => msg.role === 'assistant' && msg.content === greeting
      );
      if (!hasAssistantGreeting) {
      conversationHistory.push({ role: 'assistant', content: greeting });
      }
      
      // Update UI (now without the greeting prompt)
      if (onConversationUpdate) {
        onConversationUpdate([...conversationHistory]);
      }
      
      // Only speak greeting once (prevent duplicate with Web Speech API)
      // For Deepgram TTS, audio is already being streamed, so we don't need to call textToSpeech
      // For other TTS providers, call textToSpeech as before
      if (currentSTTSession && !currentSTTSession.greetingSpoken) {
        currentSTTSession.greetingSpoken = true;
        if (ttsProvider !== 'deepgram') {
        await textToSpeech(greeting);
        }
      }
    } catch (e) {
      console.error('[STT/TTT/TTS] Error generating initial greeting:', e);
      // Fallback greeting if AI fails
      const fallbackGreeting = userName 
        ? `Hi ${userName}! I'm your learning buddy! What would you like to explore today?`
        : "Hi! I'm your learning buddy! What would you like to explore today?";
      conversationHistory.push({ role: 'assistant', content: fallbackGreeting });
      
      // Update UI
      if (onConversationUpdate) {
        onConversationUpdate([...conversationHistory]);
      }
      
      // Only speak greeting once (prevent duplicate with Web Speech API)
      if (currentSTTSession && !currentSTTSession.greetingSpoken) {
        currentSTTSession.greetingSpoken = true;
        await textToSpeech(fallbackGreeting);
      }
    }

    console.log('You are connected! (STT/TTT/TTS mode)');
  } catch (e) {
    console.error('STT mode setup error:', e);
    throw e;
  }
}

// Wrapper function that calls the appropriate mode based on toggle
export async function setupCounter(
  element: HTMLButtonElement,
  audioEl?: HTMLAudioElement | null,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null,
  useSTTMode: boolean = false,
  userName?: string,
  userAge?: number,
  uid?: string,
) {
  // Reset audio volume to 1 when connecting (in case it was muted during disconnect)
  if (audioEl) {
    try {
      audioEl.volume = 1;
    } catch (e) {
      console.warn('[Setup] Error resetting audio volume:', e);
    }
  }
  
  if (useSTTMode) {
    return await setupSTTMode(element, audioEl, inputDeviceId, outputDeviceId, userName, userAge, uid);
  } else {
    return await setupRealtimeMode(element, audioEl, inputDeviceId, outputDeviceId, userName, userAge, uid);
  }
}

export default function Page() {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('idle');
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedInput, setSelectedInput] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [isThinking, setIsThinking] = useState(false); // For Deepgram TTS thinking indicator
  const { currentUser, userData, logout } = useAuth();
  const router = useRouter();
  
  // Admin verification state
  const [isAdminVerified, setIsAdminVerified] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAdminSettingsPage, setShowAdminSettingsPage] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [adminError, setAdminError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  
  // Admin settings state
  interface AdminSettings {
    mode: 'realtime' | 'stt-ttt-tts';
    sttProvider: string;
    tttModel: string;
    ttsProvider: string;
  }
  
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    mode: 'stt-ttt-tts',
    sttProvider: 'webspeech',
    tttModel: 'gpt-4o-mini',
    ttsProvider: 'gtts',
  });
  
  // Read toggle state from environment variable and localStorage
  // "ON" = STT/TTT/TTS mode (cost-effective, default), "OFF" = Realtime mode
  const envMode = process.env.NEXT_PUBLIC_USE_STT_MODE?.toUpperCase() || 'ON';
  const [useSTTMode, setUseSTTMode] = useState(() => {
    // Check localStorage first, then env var
    const stored = localStorage.getItem('adminSettings');
    if (stored) {
      try {
        const settings: AdminSettings = JSON.parse(stored);
        return settings.mode === 'stt-ttt-tts';
      } catch {
        return envMode === 'ON';
      }
    }
    return envMode === 'ON';
  });

  // Handle responsive layout
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Set up callback to receive conversation updates
  useEffect(() => {
    onConversationUpdate = (conversationHistory: Array<{ role: string; content: string }>) => {
      // Filter out system messages for display
      const displayMessages = conversationHistory.filter(msg => msg.role !== 'system');
      setMessages(displayMessages);
    };
    
    return () => {
      onConversationUpdate = null;
    };
  }, []);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleLogout = async () => {
    try {
      setShowMenu(false);
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleSettingsClick = () => {
    setShowMenu(false);
    if (isAdminVerified) {
      // If already verified, show admin settings page directly
      setShowAdminSettingsPage(true);
      loadBackendConfig();
    } else {
      // Otherwise, show admin code modal
      setShowSettingsModal(true);
      setAdminCode('');
      setAdminError('');
    }
  };

  const handleAdminCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setIsVerifying(true);

    try {
      const isValid = await verifyAdminCode(adminCode);
      if (isValid) {
        setIsAdminVerified(true);
        setShowSettingsModal(false);
        setShowAdminSettingsPage(true);
        setAdminCode('');
        // Store admin verification in sessionStorage (persists for session)
        sessionStorage.setItem('adminVerified', 'true');
        // Load backend configuration
        await loadBackendConfig();
      } else {
        setAdminError('Invalid admin code. Please try again.');
      }
    } catch (error) {
      console.error('Error verifying admin code:', error);
      setAdminError('Failed to verify admin code. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };
  
  // Load backend configuration
  const loadBackendConfig = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    try {
      const resp = await fetch(`${backendUrl}/api/config`);
      if (resp.ok) {
        const config = await resp.json();
        const stored = localStorage.getItem('adminSettings');
        if (stored) {
          try {
            const settings: AdminSettings = JSON.parse(stored);
            setAdminSettings(settings);
            setUseSTTMode(settings.mode === 'stt-ttt-tts');
            return;
          } catch {}
        }
        // Use backend config as default, mode comes from frontend env var
        const envMode = process.env.NEXT_PUBLIC_USE_STT_MODE?.toUpperCase() || 'ON';
        const mode = envMode === 'ON' ? 'stt-ttt-tts' : 'realtime';
        const settings: AdminSettings = {
          mode,
          sttProvider: config.stt_provider || 'webspeech',
          tttModel: config.chat_model || 'gpt-4o-mini',
          ttsProvider: config.tts_provider || 'gtts',
        };
        setAdminSettings(settings);
        setUseSTTMode(mode === 'stt-ttt-tts');
        localStorage.setItem('adminSettings', JSON.stringify(settings));
      }
    } catch (error) {
      console.error('Error loading backend config:', error);
      // Use defaults from env (default to STT-TTT-TTS mode)
      const envMode = process.env.NEXT_PUBLIC_USE_STT_MODE?.toUpperCase() || 'ON';
      const settings: AdminSettings = {
        mode: envMode === 'ON' ? 'stt-ttt-tts' : 'realtime',
        sttProvider: 'webspeech',
        tttModel: 'gpt-4o-mini',
        ttsProvider: 'gtts',
      };
      setAdminSettings(settings);
      setUseSTTMode(envMode === 'ON');
    }
  };
  
  // Load settings from localStorage on mount
  useEffect(() => {
    const loadSettings = async () => {
      const stored = localStorage.getItem('adminSettings');
      if (stored) {
        try {
          const settings: AdminSettings = JSON.parse(stored);
          setAdminSettings(settings);
          setUseSTTMode(settings.mode === 'stt-ttt-tts');
        } catch {
          // Invalid stored data, use defaults
          await loadBackendConfig();
        }
      } else {
        await loadBackendConfig();
      }
    };
    loadSettings();
  }, []);
  
  // Save admin settings
  const saveAdminSettings = (settings: AdminSettings) => {
    setAdminSettings(settings);
    setUseSTTMode(settings.mode === 'stt-ttt-tts');
    localStorage.setItem('adminSettings', JSON.stringify(settings));
  };

  // Check if admin was verified in this session
  useEffect(() => {
    const verified = sessionStorage.getItem('adminVerified') === 'true';
    setIsAdminVerified(verified);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showMenu && !target.closest('[data-menu-container]')) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  useEffect(() => {
    // enumerate devices when permissions are available
    const refresh = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {}
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const ins = devices.filter((d) => d.kind === 'audioinput');
        const outs = devices.filter((d) => d.kind === 'audiooutput');
        setInputs(ins);
        setOutputs(outs);
        if (!selectedInput && ins[0]) setSelectedInput(ins[0].deviceId || null);
        if (!selectedOutput && outs[0]) setSelectedOutput(outs[0].deviceId || null);
      } catch (e) {
        console.warn('enumerateDevices failed', e);
      }
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
  }, []);

  return (
    <main style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      padding: 0,
      flexDirection: isMobile ? 'column' : 'row',
      gap: 0,
    }}>
      {/* Chat UI Section - WhatsApp-like */}
      <div style={{
        flex: isMobile ? 'none' : '1',
        display: 'flex',
        flexDirection: 'column',
        height: isMobile ? '50vh' : '100vh',
        minHeight: isMobile ? '400px' : '100vh',
        backgroundColor: '#e5ddd5',
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'grid\' width=\'100\' height=\'100\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M 100 0 L 0 0 0 100\' fill=\'none\' stroke=\'rgba(0,0,0,0.02)\' stroke-width=\'1\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'100\' height=\'100\' fill=\'url(%23grid)\' /%3E%3C/svg%3E")',
        borderRight: isMobile ? 'none' : '1px solid #d1d5db',
        borderBottom: isMobile ? '1px solid #d1d5db' : 'none',
      }}>
        {/* Chat Header */}
        <div style={{
          backgroundColor: '#075e54',
          color: 'white',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#128c7e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 'bold',
            }}>
              🤖
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 600 }}>Learning Buddy</div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                {status === 'connected' ? 'Online' : status === 'connecting...' ? 'Connecting...' : 'Offline'}
              </div>
            </div>
          </div>
        {userData && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', position: 'relative' }} data-menu-container>
            <div style={{ textAlign: 'right', fontSize: '12px' }}>
              <div>{userData.name}</div>
            </div>
            {/* Three-dot menu button */}
            <button
              type="button"
              onClick={() => setShowMenu(!showMenu)}
              style={{
                padding: '8px',
                fontSize: '18px',
                fontWeight: 500,
                color: 'white',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Menu"
              title="Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </button>
            
            {/* Dropdown menu */}
            {showMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                minWidth: '160px',
                zIndex: 1000,
                overflow: 'hidden',
              }}>
                <button
                  type="button"
                  onClick={handleSettingsClick}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    backgroundColor: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Settings
                </button>
                <div style={{ height: '1px', backgroundColor: '#e5e7eb' }}></div>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#ef4444',
                    backgroundColor: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#fef2f2';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>

        {/* Chat Messages Container */}
        <div 
          ref={chatContainerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {messages.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#667781',
              fontSize: '14px',
              textAlign: 'center',
            }}>
              {status === 'connected' 
                ? 'Start chatting with your learning buddy!' 
                : 'Connect to start the conversation'}
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    justifyContent: isUser ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-end',
                    gap: '8px',
                  }}
                >
                  {!isUser && (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#128c7e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      flexShrink: 0,
                    }}>
                      🤖
                    </div>
                  )}
                  <div
                    style={{
                      maxWidth: '70%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      backgroundColor: isUser ? '#dcf8c6' : '#ffffff',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      wordWrap: 'break-word',
                      fontSize: '14px',
                      lineHeight: '1.4',
                      color: '#111b21',
                    }}
                  >
                    {msg.content}
                  </div>
                  {isUser && (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#128c7e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      flexShrink: 0,
                    }}>
                      👤
                    </div>
                  )}
                </div>
              );
            })
          )}
          {/* Thinking indicator for Deepgram TTS */}
          {isThinking && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'flex-end',
                gap: '8px',
              }}
            >
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#128c7e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                flexShrink: 0,
              }}>
                🤖
              </div>
              <div
                style={{
                  maxWidth: '70%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                  wordWrap: 'break-word',
                  fontSize: '14px',
                  lineHeight: '1.4',
                  color: '#111b21',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>Thinking</span>
                <span style={{
                  display: 'inline-flex',
                  gap: '4px',
                }}>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#666',
                    animation: 'thinking 1.4s infinite',
                  }}></span>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#666',
                    animation: 'thinking 1.4s infinite 0.2s',
                  }}></span>
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#666',
                    animation: 'thinking 1.4s infinite 0.4s',
                  }}></span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls Section */}
      <div style={{
        flex: isMobile ? 'none' : '0 0 380px',
        width: isMobile ? '100%' : '380px',
        minWidth: 0,
        maxWidth: isMobile ? '100%' : '380px',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
        gap: '12px',
        backgroundColor: '#f9fafb',
        height: isMobile ? 'auto' : '100vh',
        maxHeight: isMobile ? '50vh' : 'none',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}>
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: isMobile ? 'stretch' : 'center', marginBottom: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: isMobile ? 'none' : 1, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
          <label style={{ fontSize: 12, color: '#374151', fontWeight: 500, flexShrink: 0 }}>Mic:</label>
          <select
            value={selectedInput ?? ''}
            onChange={(e) => setSelectedInput(e.target.value)}
            style={{ 
              fontSize: 12, 
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: 'white',
              color: '#111827',
              flex: 1,
              minWidth: 0,
              maxWidth: '100%',
              width: '100%',
              boxSizing: 'border-box',
            }}
            title="Select microphone input device"
            aria-label="Microphone input device"
          >
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId} style={{ color: '#111827' }}>{d.label || 'Microphone'}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: isMobile ? 'none' : 1, marginLeft: isMobile ? 0 : 12, minWidth: 0, width: isMobile ? '100%' : 'auto' }}>
          <label style={{ fontSize: 12, color: '#374151', fontWeight: 500, flexShrink: 0 }}>Speaker:</label>
          <select
            value={selectedOutput ?? ''}
            onChange={(e) => setSelectedOutput(e.target.value)}
            style={{ 
              fontSize: 12, 
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: 'white',
              color: '#111827',
              flex: 1,
              minWidth: 0,
              maxWidth: '100%',
              width: '100%',
              boxSizing: 'border-box',
            }}
            title="Select speaker output device"
            aria-label="Speaker output device"
          >
            {outputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId} style={{ color: '#111827' }}>{d.label || 'Speaker'}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={async () => {
            if (status !== 'connected') return;
            
            try {
              // Stop any playing TTS audio immediately
              if (audioRef.current) {
                try {
                  const audioEl = audioRef.current;
                  // Instantly mute and stop the audio
                  audioEl.volume = 0; // Mute instantly
                  audioEl.pause(); // Pause playback
                  audioEl.currentTime = 0; // Reset position
                  audioEl.load(); // Clear the buffer - this stops buffered audio from playing
                  // Remove error listener before clearing src to prevent error logs
                  // Clone the element to remove all event listeners cleanly
                  const newAudio = audioEl.cloneNode(false) as HTMLAudioElement;
                  if (audioEl.parentNode) {
                    audioEl.parentNode.replaceChild(newAudio, audioEl);
                  }
                  // Ensure the new element is also stopped
                  newAudio.volume = 0; // Mute for disconnect
                  newAudio.pause();
                  newAudio.currentTime = 0;
                  newAudio.src = '';
                  newAudio.load(); // Clear any remaining buffer
                  // Reset volume to 1 for next connection (but keep it muted until connected)
                  // Volume will be set to 1 when connecting
                  // Update the ref to point to the new element
                  (audioRef as any).current = newAudio;
                } catch (e) {
                  console.warn('[Disconnect] Error stopping audio:', e);
                  // Fallback: aggressively stop audio
                  try {
                    if (audioRef.current) {
                      audioRef.current.volume = 0; // Mute for disconnect
                      audioRef.current.pause();
                      audioRef.current.currentTime = 0;
                      audioRef.current.load();
                      audioRef.current.src = '';
                      // Volume will be reset to 1 when connecting via setupCounter
                    }
                  } catch (fallbackError) {
                    // Ignore fallback errors
                  }
                }
              }
              
              // Clean up realtime session
              if (currentSession) {
                // Stop recognition if it exists
                if (currentSession.recognition) {
                  try {
                    currentSession.recognition.stop();
                    currentSession.recognition.abort();
                  } catch (e) {
                    // Ignore errors
                  }
                }
                currentSession.session.close();
                currentSession = null;
              }
              
              // Clean up STT session
              if (currentSTTSession) {
                if (currentSTTSession.recognition) {
                  try {
                    currentSTTSession.recognition.stop();
                    currentSTTSession.recognition.abort();
                  } catch (e) {
                    // Ignore errors
                  }
                }
                // Clean up Deepgram STT WebSocket if used
                if ((currentSTTSession as any).deepgramWs) {
                  try {
                    (currentSTTSession as any).deepgramWs.close();
                  } catch (e) {
                    console.warn('[STT] Error closing Deepgram STT WebSocket:', e);
                  }
                }
                // Clean up Deepgram TTS WebSocket if used
                if (currentSTTSession.deepgramTtsWs) {
                  try {
                    if (currentSTTSession.deepgramTtsWs.readyState === WebSocket.OPEN || 
                        currentSTTSession.deepgramTtsWs.readyState === WebSocket.CONNECTING) {
                      currentSTTSession.deepgramTtsWs.close();
                    }
                    console.log('[Deepgram TTS] WebSocket closed on disconnect');
                  } catch (e) {
                    console.warn('[TTS] Error closing Deepgram TTS WebSocket:', e);
                  }
                }
                // Clean up TTS AudioContext if used
                if (currentSTTSession.deepgramTtsAudioContext) {
                  try {
                    currentSTTSession.deepgramTtsAudioContext.close();
                  } catch (e) {
                    console.warn('[TTS] Error closing Deepgram TTS AudioContext:', e);
                  }
                }
                // Clean up audio processor if used
                if ((currentSTTSession as any).audioProcessor) {
                  try {
                    (currentSTTSession as any).audioProcessor.disconnect();
                  } catch (e) {
                    console.warn('[STT] Error disconnecting audio processor:', e);
                  }
                }
                if (currentSTTSession.mediaRecorder && currentSTTSession.mediaRecorder.state !== 'inactive') {
                  currentSTTSession.mediaRecorder.stop();
                }
                if (currentSTTSession.audioContext) {
                  await currentSTTSession.audioContext.close();
                }
                // Stop and clean up processing audio
                if (currentSTTSession.processingOscillator) {
                  try {
                    currentSTTSession.processingOscillator.stop();
                    currentSTTSession.processingOscillator.disconnect();
                  } catch (e) {}
                }
                if (currentSTTSession.processingGain) {
                  try {
                    currentSTTSession.processingGain.disconnect();
                  } catch (e) {}
                }
                if (currentSTTSession.processingAudio) {
                  // Aggressively stop processing audio
                  try {
                    currentSTTSession.processingAudio.volume = 0;
                    currentSTTSession.processingAudio.pause();
                    currentSTTSession.processingAudio.currentTime = 0;
                    currentSTTSession.processingAudio.load(); // Clear buffer
                  } catch (e) {
                    console.warn('[Disconnect] Error stopping processing audio:', e);
                  }
                }
                currentSTTSession = null;
              }
              
              // Reset state
              setStatus('idle');
              setMessages([]);
            } catch (error) {
              console.error('Error disconnecting:', error);
              // Still reset state even if cleanup had errors
              setStatus('idle');
              setMessages([]);
            }
          }}
          disabled={status !== 'connected'}
          type="button"
          style={{
            padding: '14px 32px',
            fontSize: 16,
            fontWeight: 600,
            color: '#ffffff',
            backgroundColor: status === 'connected' ? '#ef4444' : '#9ca3af',
            border: 'none',
            borderRadius: '8px',
            cursor: status === 'connected' ? 'pointer' : 'not-allowed',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.2s ease-in-out',
            minWidth: '180px',
            flex: 1,
          }}
          onMouseEnter={(e) => {
            if (status === 'connected') {
              e.currentTarget.style.backgroundColor = '#dc2626';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (status === 'connected') {
              e.currentTarget.style.backgroundColor = '#ef4444';
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
          onMouseDown={(e) => {
            if (status === 'connected') {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
            }
          }}
          onMouseUp={(e) => {
            if (status === 'connected') {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08)';
            }
          }}
        >
          Disconnect
        </button>
        <button
          ref={buttonRef}
          onClick={() => {
            if (status === 'connecting...') return;
            setStatus('connecting...');
            setupCounter(
              buttonRef.current as HTMLButtonElement,
              audioRef.current,
              selectedInput,
              selectedOutput,
              useSTTMode,
              userData?.name,
              userData?.age,
              currentUser?.uid || userData?.uid,
            )
              .then(() => setStatus('connected'))
              .catch((e) => {
                console.error(e);
                setStatus('error - see console');
              });
          }}
          disabled={status === 'connecting...' || status === 'connected'}
          type="button"
          style={{
            padding: '14px 32px',
            fontSize: 16,
            fontWeight: 600,
            color: '#ffffff',
            backgroundColor: status === 'connected' ? '#10b981' : status === 'connecting...' ? '#6b7280' : status === 'error - see console' ? '#ef4444' : '#3b82f6',
            border: 'none',
            borderRadius: '8px',
            cursor: status === 'connecting...' || status === 'connected' ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.2s ease-in-out',
            minWidth: '180px',
            flex: 1,
          }}
        onMouseEnter={(e) => {
          if (status !== 'connecting...' && status !== 'connected') {
            e.currentTarget.style.backgroundColor = status === 'error - see console' ? '#dc2626' : '#2563eb';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseLeave={(e) => {
          if (status !== 'connecting...' && status !== 'connected') {
            e.currentTarget.style.backgroundColor = status === 'error - see console' ? '#ef4444' : '#3b82f6';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
        onMouseDown={(e) => {
          if (status !== 'connecting...' && status !== 'connected') {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
          }
        }}
        onMouseUp={(e) => {
          if (status !== 'connecting...' && status !== 'connected') {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08)';
          }
        }}
      >
        {status === 'connecting...' 
          ? 'Connecting...' 
          : status === 'connected' 
            ? '✓ Connected' 
            : status === 'error - see console' 
              ? '⚠ Try Again' 
              : useSTTMode 
                ? 'Connect' 
                : 'Connect Realtime'}
      </button>
      </div>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
        <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>Status: {status}</div>
        <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
          {status === 'connected' ? 'Speak normally to chat!' : 'Click connect to start'}
        </div>
      </div>

      {/* Admin Settings Page */}
      {showAdminSettingsPage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#f9fafb',
          zIndex: 2000,
          overflowY: 'auto',
          padding: isMobile ? '16px' : '32px',
        }}>
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: isMobile ? '24px' : '40px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '32px',
            }}>
              <h1 style={{
                fontSize: isMobile ? '24px' : '32px',
                fontWeight: 700,
                color: '#111827',
                margin: 0,
              }}>
                Admin Settings
              </h1>
              <button
                onClick={() => {
                  setShowAdminSettingsPage(false);
                }}
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#6b7280',
                  backgroundColor: 'transparent',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.color = '#374151';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                ← Back to Chat
              </button>
            </div>

            {/* Mode Selection */}
            <div style={{ marginBottom: '32px' }}>
              <label style={{
                display: 'block',
                fontSize: '16px',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '12px',
              }}>
                Mode Selection
              </label>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    saveAdminSettings({ ...adminSettings, mode: 'realtime' });
                  }}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '16px 24px',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: adminSettings.mode === 'realtime' ? 'white' : '#374151',
                    backgroundColor: adminSettings.mode === 'realtime' ? '#3b82f6' : '#f3f4f6',
                    border: adminSettings.mode === 'realtime' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  Realtime Mode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    saveAdminSettings({ ...adminSettings, mode: 'stt-ttt-tts' });
                  }}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '16px 24px',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: adminSettings.mode === 'stt-ttt-tts' ? 'white' : '#374151',
                    backgroundColor: adminSettings.mode === 'stt-ttt-tts' ? '#3b82f6' : '#f3f4f6',
                    border: adminSettings.mode === 'stt-ttt-tts' ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  STT-TTT-TTS Mode
                </button>
              </div>
            </div>

            {/* STT-TTT-TTS Options */}
            {adminSettings.mode === 'stt-ttt-tts' && (
              <div style={{ marginTop: '32px' }}>
                {/* STT Provider */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '8px',
                  }}>
                    STT (Speech-to-Text) Provider
                  </label>
                  <select
                    value={adminSettings.sttProvider}
                    onChange={(e) => {
                      saveAdminSettings({ ...adminSettings, sttProvider: e.target.value });
                    }}
                    aria-label="STT Provider Selection"
                    title="Select Speech-to-Text Provider"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#111827',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }}
                  >
                    <option value="webspeech">Web Speech API</option>
                    <option value="deepgramnova3">Deepgram Nova 3</option>
                    <option value="googlecloud">Google Cloud STT</option>
                  </select>
                </div>

                {/* TTT Model */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '8px',
                  }}>
                    TTT (Text-to-Text) Model
                  </label>
                  <select
                    value={adminSettings.tttModel}
                    onChange={(e) => {
                      saveAdminSettings({ ...adminSettings, tttModel: e.target.value });
                    }}
                    aria-label="TTT Model Selection"
                    title="Select Text-to-Text Model"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#111827',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }}
                  >
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                  </select>
                </div>

                {/* TTS Provider */}
                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: '8px',
                  }}>
                    TTS (Text-to-Speech) Provider
                  </label>
                  <select
                    value={adminSettings.ttsProvider}
                    onChange={(e) => {
                      saveAdminSettings({ ...adminSettings, ttsProvider: e.target.value });
                    }}
                    aria-label="TTS Provider Selection"
                    title="Select Text-to-Speech Provider"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      fontSize: '16px',
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      color: '#111827',
                      cursor: 'pointer',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                    }}
                  >
                    <option value="gtts">gTTS</option>
                    <option value="openai">OpenAI TTS</option>
                    <option value="deepgram">Deepgram Aura-2</option>
                    <option value="webspeech">Web Speech API</option>
                  </select>
                </div>
              </div>
            )}

            {/* Info Message */}
            <div style={{
              marginTop: '32px',
              padding: '16px',
              backgroundColor: '#eff6ff',
              borderRadius: '8px',
              border: '1px solid #bfdbfe',
            }}>
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: '#1e40af',
                lineHeight: '1.5',
              }}>
                <strong>Note:</strong> Settings are saved automatically. The current configuration will be used when you connect to the chat interface.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal for Admin Code */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowSettingsModal(false);
            setAdminCode('');
            setAdminError('');
          }
        }}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '24px',
              fontWeight: 700,
              marginBottom: '8px',
              color: '#111827',
              textAlign: 'center',
            }}>
              Admin Settings
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#6b7280',
              marginBottom: '24px',
              textAlign: 'center',
            }}>
              Only for admins
            </p>
            <p style={{
              fontSize: '13px',
              color: '#374151',
              marginBottom: '20px',
              textAlign: 'center',
              lineHeight: '1.5',
            }}>
              Enter your admin code to access advanced settings and configuration options.
            </p>
            <form onSubmit={handleAdminCodeSubmit}>
              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="adminCode"
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                    marginBottom: '8px',
                  }}
                >
                  Admin Code
                </label>
                <input
                  id="adminCode"
                  type="password"
                  value={adminCode}
                  onChange={(e) => {
                    setAdminCode(e.target.value);
                    setAdminError('');
                  }}
                  placeholder="Enter admin code"
                  disabled={isVerifying}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    fontSize: '16px',
                    border: adminError ? '2px solid #ef4444' : '2px solid #e5e7eb',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                    boxSizing: 'border-box',
                    color: '#111827',
                    backgroundColor: 'white',
                  }}
                />
                {adminError && (
                  <p style={{
                    color: '#ef4444',
                    fontSize: '12px',
                    marginTop: '8px',
                  }}>
                    {adminError}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="submit"
                  disabled={isVerifying}
                  style={{
                    flex: 1,
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: 'white',
                    backgroundColor: isVerifying ? '#9ca3af' : '#3b82f6',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isVerifying ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isVerifying) {
                      e.currentTarget.style.backgroundColor = '#2563eb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isVerifying) {
                      e.currentTarget.style.backgroundColor = '#3b82f6';
                    }
                  }}
                >
                  {isVerifying ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setAdminCode('');
                    setAdminError('');
                  }}
                  disabled={isVerifying}
                  style={{
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: 500,
                    color: '#6b7280',
                    backgroundColor: 'transparent',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    cursor: isVerifying ? 'not-allowed' : 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isVerifying) {
                      e.currentTarget.style.backgroundColor = '#f9fafb';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isVerifying) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}