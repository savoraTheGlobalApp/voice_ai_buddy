'use client';

import React, { useState, useEffect } from 'react';

type AvatarState = 'idle' | 'listening' | 'processing' | 'speaking' | 'success' | 'error';
type AvatarMood = 'neutral' | 'encouraging' | 'concerned' | 'celebratory';

interface RoboticCatAvatarProps {
  eyeColor: AvatarState;
  isTTSPlaying: boolean;
  mood?: AvatarMood;
  size?: number;
}

const RoboticCatAvatar: React.FC<RoboticCatAvatarProps> = ({
  eyeColor,
  isTTSPlaying,
  mood = 'neutral',
  size = 200,
}) => {
  // Color mapping for eyes by avatar state (yellow/orange family)
  const eyeColors: Record<AvatarState, string> = {
    idle: '#facc15',        // yellow
    listening: '#fbbf24',   // warm yellow
    processing: '#f97316',  // orange
    speaking: '#8b5cf6',    // purple
    success: '#22c55e',     // green
    error: '#ef4444',       // red
  };

  const currentEyeColor = eyeColors[eyeColor];

  // Mouth animation: cycle through opening and closing when TTS is playing, default is smile
  const [mouthShape, setMouthShape] = useState<'closed' | 'open' | 'mid'>('closed');

  useEffect(() => {
    if (!isTTSPlaying) {
      // Default to subtle smile when idle
      setMouthShape('closed');
      return;
    }

    // Cycle through mouth shapes: closed -> open -> mid -> closed for natural talking motion
    const interval = setInterval(() => {
      setMouthShape((prev) => {
        if (prev === 'closed') return 'open';
        if (prev === 'open') return 'mid';
        return 'closed';
      });
    }, 120); // Cycle every 120ms for natural talking motion

    return () => clearInterval(interval);
  }, [isTTSPlaying]);

  // Mouth shapes: closed (smile), open (oval), mid (semi-open)
  const mouthConfig = {
    closed: { 
      // Subtle smile (default/idle)
      path: 'M 85,140 Q 100,145 115,140',
      fill: 'none',
    },
    open: { 
      // Open mouth (oval shape)
      path: 'M 90,135 Q 100,150 110,135 Q 100,155 90,135',
      fill: '#1a202c',
    },
    mid: { 
      // Semi-open (smaller oval)
      path: 'M 88,137 Q 100,148 112,137 Q 100,152 88,137',
      fill: '#1a202c',
    },
  };

  const mouth = mouthConfig[mouthShape];

  return (
    <div
      className="robotic-cat-avatar"
      data-state={eyeColor}
      data-mood={mood}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        padding: '20px',
      }}
    >
      {/* Inline styles for idle micro-animations (blink + subtle breathing) */}
      <style>{`
        .robotic-cat-avatar[data-state="idle"] .avatar-head {
          animation: avatarBreath 6s ease-in-out infinite;
          transform-origin: 100px 105px;
        }

        .robotic-cat-avatar[data-state="idle"] .eye-iris {
          animation: eyeBlink 2s infinite;
          transform-origin: center;
        }

        @keyframes avatarBreath {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }

        @keyframes eyeBlink {
          0%, 88%, 100% { transform: scaleY(1); }
          90%, 92% { transform: scaleY(0.1); }
        }
        
        /* Cat eye blink - preserve round shape */
        .robotic-cat-avatar[data-state="idle"] .eye-iris-left,
        .robotic-cat-avatar[data-state="idle"] .eye-iris-right {
          transform-origin: center;
        }

        /* SPEAKING: ear wiggle animation */
        .robotic-cat-avatar[data-state="speaking"] .avatar-ear-left {
          animation: earWiggleLeft 0.5s ease-in-out infinite;
          transform-origin: 80px 25px;
        }

        .robotic-cat-avatar[data-state="speaking"] .avatar-ear-right {
          animation: earWiggleRight 0.5s ease-in-out infinite;
          transform-origin: 120px 25px;
        }

        @keyframes earWiggleLeft {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(-8deg); }
        }

        @keyframes earWiggleRight {
          0%, 100% { transform: rotate(0deg); }
          50% { transform: rotate(8deg); }
        }

        /* MOOD-BASED SUBTLE CHANGES */
        /* Encouraging: slight upward tilt, warmer glow */
        .robotic-cat-avatar[data-mood="encouraging"] .avatar-head {
          transform: translateY(-2px);
        }
        .robotic-cat-avatar[data-mood="encouraging"] .eye-iris {
          filter: url(#glow) brightness(1.1);
        }

        /* Celebratory: slight scale up, more energetic */
        .robotic-cat-avatar[data-mood="celebratory"] .avatar-head {
          animation: avatarCelebrate 2s ease-in-out infinite;
          transform-origin: 100px 105px;
        }
        @keyframes avatarCelebrate {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }

        /* Concerned: slight downward tilt, dimmer */
        .robotic-cat-avatar[data-mood="concerned"] .avatar-head {
          transform: translateY(2px);
        }
        .robotic-cat-avatar[data-mood="concerned"] .eye-iris {
          filter: url(#glow) brightness(0.9);
        }

        /* Neutral: no special styling */
      `}</style>
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        {/* Robotic Cat Head - Round with Cat Ears */}
        <defs>
          <linearGradient id="headGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="1" />   {/* light yellow */}
            <stop offset="100%" stopColor="#eab308" stopOpacity="1" /> {/* golden yellow */}
          </linearGradient>
          {/* Inner ear color - light peach/salmon pink */}
          <linearGradient id="earInnerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fecdd3" stopOpacity="1" />   {/* light peach */}
            <stop offset="100%" stopColor="#fda4af" stopOpacity="1" /> {/* salmon pink */}
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Cat ears - outer edges match head color, inner part is peach/pink */}
        <polygon
          className="avatar-ear-left"
          points="55,55 80,25 90,65"
          fill="url(#headGradient)"
          stroke="#1a202c"
          strokeWidth="2"
        />
        {/* Inner ear left */}
        <polygon
          points="65,45 80,30 85,55"
          fill="url(#earInnerGradient)"
        />
        <polygon
          className="avatar-ear-right"
          points="145,55 120,25 110,65"
          fill="url(#headGradient)"
          stroke="#1a202c"
          strokeWidth="2"
        />
        {/* Inner ear right */}
        <polygon
          points="135,45 120,30 115,55"
          fill="url(#earInnerGradient)"
        />

        {/* Head - Rounded rectangular shape (wider at bottom, tapering at top) */}
        <path
          className="avatar-head"
          d="M 50,70 Q 50,50 60,45 L 140,45 Q 150,50 150,70 L 150,150 Q 150,160 140,165 L 60,165 Q 50,160 50,150 Z"
          fill="url(#headGradient)"
          stroke="#1a202c"
          strokeWidth="2"
        />

        {/* Left Eye - Large round eye */}
        <circle
          className="eye-iris eye-iris-left"
          cx="80"
          cy="85"
          r="18"
          fill="#1a202c"
        />
        <circle
          cx="80"
          cy="85"
          r="14"
          fill={currentEyeColor}
          style={{
            transition: 'fill 0.3s ease-in-out',
            filter: 'url(#glow)',
          }}
        />
        {/* Crescent-shaped pupil positioned towards inner corner */}
        <path
          d="M 75,85 A 6 6 0 0 1 82,80 A 6 6 0 0 1 82,90 Z"
          fill="#1a202c"
          transform="rotate(-15 80 85)"
        />

        {/* Right Eye - Large round eye */}
        <circle
          className="eye-iris eye-iris-right"
          cx="120"
          cy="85"
          r="18"
          fill="#1a202c"
        />
        <circle
          cx="120"
          cy="85"
          r="14"
          fill={currentEyeColor}
          style={{
            transition: 'fill 0.3s ease-in-out',
            filter: 'url(#glow)',
          }}
        />
        {/* Crescent-shaped pupil positioned towards inner corner */}
        <path
          d="M 115,85 A 6 6 0 0 1 122,80 A 6 6 0 0 1 122,90 Z"
          fill="#1a202c"
          transform="rotate(15 120 85)"
        />

        {/* Nose - Dark inverted triangular/heart-shaped nose */}
        <path
          d="M 100,105 L 95,115 Q 100,118 105,115 Z"
          fill="#1a202c"
          stroke="#1a202c"
          strokeWidth="1"
        />

        {/* Mouth - Animated opening and closing */}
        <path
          d={mouth.path}
          stroke={mouthShape === 'closed' ? '#1a202c' : 'none'}
          strokeWidth={mouthShape === 'closed' ? 3 : 0}
          strokeLinecap="round"
          fill={mouth.fill}
          style={{
            transition: 'd 0.12s ease-in-out, fill 0.12s ease-in-out, stroke 0.12s ease-in-out',
          }}
        />
        
        {/* Whiskers - Left side (evenly spaced, slightly curved) */}
        <path d="M 40,100 Q 50,98 60,100" stroke="#1a202c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M 40,108 Q 50,108 60,108" stroke="#1a202c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M 40,116 Q 50,118 60,116" stroke="#1a202c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        
        {/* Whiskers - Right side (evenly spaced, slightly curved) */}
        <path d="M 160,100 Q 150,98 140,100" stroke="#1a202c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M 160,108 Q 150,108 140,108" stroke="#1a202c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        <path d="M 160,116 Q 150,118 140,116" stroke="#1a202c" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
};

export default RoboticCatAvatar;

