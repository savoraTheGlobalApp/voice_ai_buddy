"use client";
import React, { useEffect, useRef, useState } from 'react';
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { fetchTopMemories, addMemoriesWithLimit, UserMemory } from '@/lib/memories';
import { startConversationSession, appendConversationChunk } from '@/lib/conversations';

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
let currentSTTSession: {
  recognition: any;
  mediaRecorder: MediaRecorder | null;
  audioContext: AudioContext | null;
  conversationHistory: Array<{ role: string; content: string }>;
  processingAudio?: HTMLAudioElement | null;
  processingOscillator?: OscillatorNode | null;
  processingGain?: GainNode | null;
  isProcessingAudioPlaying?: () => boolean;
} | null = null;

// Callback to update chat UI when conversation history changes
let onConversationUpdate: ((messages: Array<{ role: string; content: string }>) => void) | null = null;

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

    // Initialize Web Speech API for STT
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('Speech Recognition API is not supported in this browser. Please use Chrome or Edge.');
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // Create audio context for playback
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Resume AudioContext if suspended (required for Android Chrome)
    // Android Chrome often starts with AudioContext in suspended state
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        console.log('[STT] AudioContext resumed');
      } catch (e) {
        console.warn('[STT] Could not resume AudioContext on init:', e);
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
      processingOscillator: null,
      processingGain: null,
      isProcessingAudioPlaying: () => isProcessingAudioPlaying,
    };

    // Get backend URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

    // Function to send text to chat API and get response with retry logic
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

    // Function to convert text to speech using OpenAI TTS
    const textToSpeech = async (text: string): Promise<void> => {
      // Stop processing audio completely before playing TTS (critical for Android)
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
        
        // Stop HTMLAudioElement processing audio
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
        
        // Wait for Android to release audio focus (prevents conflicts)
        await new Promise(resolve => setTimeout(resolve, 200));
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
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/api/tts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: 'nova', // Using 'nova' voice to match realtime mode
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
            // Remove event listeners to prevent beeps after audio ends
            if (audioEl) {
              audioEl.removeEventListener('pause', handlePause);
              audioEl.removeEventListener('play', handlePlay);
              audioEl.removeEventListener('ended', handleEnded);
            }
            // CRITICAL: Only revoke URL after a small delay to ensure audio is fully done
            // This prevents ERR_FILE_NOT_FOUND if browser is still processing
            setTimeout(() => {
              try {
                if (audioUrl && audioUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(audioUrl);
                }
              } catch (e) {
                console.warn('[TTS] Error revoking blob URL:', e);
              }
            }, 100); // Small delay to ensure browser is done with the blob
          };
          
          // Add event listeners for audio playback
          audioEl.addEventListener('pause', handlePause);
          audioEl.addEventListener('play', handlePlay);
          audioEl.addEventListener('ended', handleEnded);
          audioEl.addEventListener('error', (e) => {
            console.error('[TTS] Audio error:', {
              code: audioEl.error?.code,
              message: audioEl.error?.message,
              src: audioEl.src
            });
            
            // CRITICAL: Clean up on error to prevent memory leaks
            // Only revoke if it's a permanent error
            if (audioEl.error) {
              const errorCode = audioEl.error.code;
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

    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (!transcript) {
        return;
      }

      console.log('[STT] User said:', transcript);

      // Start playing processing audio to give user feedback that voice was detected
      if (currentSTTSession?.processingAudio) {
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

        // Convert to speech (this will stop the processing audio)
        await textToSpeech(response);
      } catch (e) {
        console.error('[STT/TTT/TTS] Error:', e);
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

    // Start recognition
    recognition.start();
    
    // Generate dynamic initial greeting using the AI
    // This makes the greeting personalized and varied each time
    try {
      // Send a prompt that will generate a dynamic greeting
      // The AI will use the instructions to greet with the child's name in the first message
      const greetingPrompt = "Please greet me and start our conversation in a warm and engaging way.";
      conversationHistory.push({ role: 'user', content: greetingPrompt });
      
      // Get the greeting from AI
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
      const greeting = data.response || data.message || '';
      
      // Remove the greeting prompt from history (it was just to trigger the greeting)
      // Keep only the system message and the assistant's greeting
      conversationHistory.pop(); // Remove the user greeting prompt
      conversationHistory.push({ role: 'assistant', content: greeting });
      
      await textToSpeech(greeting);
      // Update UI
      if (onConversationUpdate) {
        onConversationUpdate([...conversationHistory]);
      }
    } catch (e) {
      console.error('[STT/TTT/TTS] Error generating initial greeting:', e);
      // Fallback greeting if AI fails
      const fallbackGreeting = userName 
        ? `Hi ${userName}! I'm your learning buddy! What would you like to explore today?`
        : "Hi! I'm your learning buddy! What would you like to explore today?";
      conversationHistory.push({ role: 'assistant', content: fallbackGreeting });
      await textToSpeech(fallbackGreeting);
      if (onConversationUpdate) {
        onConversationUpdate([...conversationHistory]);
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
  const { currentUser, userData, logout } = useAuth();
  const router = useRouter();
  
  // Read toggle state from environment variable
  // "ON" = STT/TTT/TTS mode (cost-effective), "OFF" = Realtime mode (default)
  const envMode = process.env.NEXT_PUBLIC_USE_STT_MODE?.toUpperCase() || 'OFF';
  const [useSTTMode, setUseSTTMode] = useState(envMode === 'ON');

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
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

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
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                <div>{userData.name}</div>
          </div>
        <button
          type="button"
          onClick={handleLogout}
          style={{
                  padding: '6px 12px',
                  fontSize: '12px',
            fontWeight: 500,
                  color: 'white',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '6px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
          }}
        >
          Logout
        </button>
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
        </div>
      </div>

      {/* Controls Section */}
      <div style={{
        flex: isMobile ? 'none' : '0 0 400px',
        width: isMobile ? '100%' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
        gap: '12px',
        backgroundColor: '#f9fafb',
        height: isMobile ? 'auto' : '100vh',
        maxHeight: isMobile ? '50vh' : 'none',
        overflowY: 'auto',
      }}>
      {/* Toggle for mode selection */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, padding: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px' }}>
        <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
          {useSTTMode ? '💰 Cost-Effective Mode' : '🎙️ Realtime Mode'}
        </label>
        <button
          type="button"
          aria-label={useSTTMode ? "Switch to Realtime Mode" : "Switch to Cost-Effective Mode"}
          title={useSTTMode ? "Switch to Realtime Mode" : "Switch to Cost-Effective Mode"}
          onClick={() => {
            if (status === 'connected') {
              // Disconnect first if connected
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
                  if (currentSTTSession.audioContext) {
                    currentSTTSession.audioContext.close();
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
                  currentSTTSession = null;
                }
              } catch (e) {
                console.warn('Error disconnecting:', e);
              }
              setStatus('idle');
              setMessages([]); // Clear messages when disconnecting
            }
            setUseSTTMode(!useSTTMode);
          }}
          disabled={status === 'connecting...'}
          style={{
            position: 'relative',
            width: '52px',
            height: '28px',
            borderRadius: '14px',
            backgroundColor: useSTTMode ? '#10b981' : '#6b7280',
            border: 'none',
            cursor: status === 'connecting...' ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.3s',
            outline: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '2px',
              left: useSTTMode ? '26px' : '2px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              transition: 'left 0.3s',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
          />
        </button>
        <div style={{ fontSize: 11, color: '#6b7280', maxWidth: '200px' }}>
          {useSTTMode 
            ? 'Using STT → GPT-4o-mini → TTS (cheaper)' 
            : 'Using Realtime API (better UX, more expensive)'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>Mic:</label>
        <select
          value={selectedInput ?? ''}
          onChange={(e) => setSelectedInput(e.target.value)}
          style={{ fontSize: 12 }}
          title="Select microphone input device"
          aria-label="Microphone input device"
        >
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>
          ))}
        </select>
        <label style={{ fontSize: 12, marginLeft: 12 }}>Speaker:</label>
        <select
          value={selectedOutput ?? ''}
          onChange={(e) => setSelectedOutput(e.target.value)}
          style={{ fontSize: 12 }}
          title="Select speaker output device"
          aria-label="Speaker output device"
        >
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>
          ))}
        </select>
      </div>
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
        disabled={status === 'connecting...'}
        type="button"
        style={{
          padding: '14px 32px',
          fontSize: 16,
          fontWeight: 600,
          color: '#ffffff',
          backgroundColor: status === 'connected' ? '#10b981' : status === 'connecting...' ? '#6b7280' : status === 'error - see console' ? '#ef4444' : '#3b82f6',
          border: 'none',
          borderRadius: '8px',
          cursor: status === 'connecting...' ? 'not-allowed' : 'pointer',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)',
          transition: 'all 0.2s ease-in-out',
          minWidth: '180px',
        }}
        onMouseEnter={(e) => {
          if (status !== 'connecting...') {
            e.currentTarget.style.backgroundColor = status === 'connected' ? '#059669' : status === 'error - see console' ? '#dc2626' : '#2563eb';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1), 0 6px 12px rgba(0, 0, 0, 0.08)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseLeave={(e) => {
          if (status !== 'connecting...') {
            e.currentTarget.style.backgroundColor = status === 'connected' ? '#10b981' : status === 'error - see console' ? '#ef4444' : '#3b82f6';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1), 0 4px 8px rgba(0, 0, 0, 0.05)';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
        onMouseDown={(e) => {
          if (status !== 'connecting...') {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
          }
        }}
        onMouseUp={(e) => {
          if (status !== 'connecting...') {
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
                ? 'Connect (STT/TTT/TTS)' 
                : 'Connect Realtime'}
      </button>
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />
        <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>Status: {status}</div>
        <div style={{ fontSize: 12, color: '#666', textAlign: 'center' }}>
          {status === 'connected' ? 'Speak normally to chat!' : 'Click connect to start'}
        </div>
      </div>
    </main>
  );
}