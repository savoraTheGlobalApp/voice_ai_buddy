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

  // Mouth animation: cycle through shapes when TTS is playing, default is smile
  const [mouthShape, setMouthShape] = useState<'closed' | 'mid' | 'wide'>('closed');

  useEffect(() => {
    if (!isTTSPlaying) {
      // Default to subtle smile when idle
      setMouthShape('closed');
      return;
    }

    // Cycle through mouth shapes during TTS playback
    const interval = setInterval(() => {
      setMouthShape((prev) => {
        if (prev === 'closed') return 'mid';
        if (prev === 'mid') return 'wide';
        return 'closed';
      });
    }, 150); // Cycle every 150ms for natural talking motion

    return () => clearInterval(interval);
  }, [isTTSPlaying]);

  // Mouth dimensions based on shape - all are smiles, varying in width
  const mouthConfig = {
    closed: { 
      // Subtle smile (default/idle)
      path: 'M 85,140 Q 100,145 115,140',
    },
    mid: { 
      // Happy smile (mid = talking)
      path: 'M 80,138 Q 100,148 120,138',
    },
    wide: { 
      // Big happy smile (wide = talking)
      path: 'M 75,136 Q 100,150 125,136',
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
          transform-origin: 100px 100px;
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
        
        /* Cat eye blink - preserve almond shape */
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
          transform-origin: 100px 100px;
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
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* Cat ears */}
        <polygon
          className="avatar-ear-left"
          points="55,55 80,25 90,65"
          fill="url(#headGradient)"
          stroke="#1a202c"
          strokeWidth="2"
        />
        <polygon
          className="avatar-ear-right"
          points="145,55 120,25 110,65"
          fill="url(#headGradient)"
          stroke="#1a202c"
          strokeWidth="2"
        />

        {/* Head - Round cat face */}
        <circle
          className="avatar-head"
          cx="100"
          cy="100"
          r="60"
          fill="url(#headGradient)"
          stroke="#1a202c"
          strokeWidth="2"
        />

        {/* Left Eye - Cat-like almond shape */}
        <ellipse
          className="eye-iris eye-iris-left"
          cx="80"
          cy="85"
          rx="16"
          ry="12"
          fill="#1a202c"
          transform="rotate(-5 80 85)"
        />
        <ellipse
          cx="80"
          cy="85"
          rx="12"
          ry="9"
          fill={currentEyeColor}
          transform="rotate(-5 80 85)"
          style={{
            transition: 'fill 0.3s ease-in-out',
            filter: 'url(#glow)',
          }}
        />
        <ellipse
          cx="80"
          cy="85"
          rx="6"
          ry="5"
          fill="#ffffff"
          opacity="0.4"
          transform="rotate(-5 80 85)"
        />
        <circle
          cx="81"
          cy="83"
          r="3"
          fill="#ffffff"
        />

        {/* Right Eye - Cat-like almond shape */}
        <ellipse
          className="eye-iris eye-iris-right"
          cx="120"
          cy="85"
          rx="16"
          ry="12"
          fill="#1a202c"
          transform="rotate(5 120 85)"
        />
        <ellipse
          cx="120"
          cy="85"
          rx="12"
          ry="9"
          fill={currentEyeColor}
          transform="rotate(5 120 85)"
          style={{
            transition: 'fill 0.3s ease-in-out',
            filter: 'url(#glow)',
          }}
        />
        <ellipse
          cx="120"
          cy="85"
          rx="6"
          ry="5"
          fill="#ffffff"
          opacity="0.4"
          transform="rotate(5 120 85)"
        />
        <circle
          cx="121"
          cy="83"
          r="3"
          fill="#ffffff"
        />

        {/* Nose - Triangular cat nose (pink-ish) */}
        <polygon
          points="100,105 95,115 105,115"
          fill="#f472b6"
          stroke="#1a202c"
          strokeWidth="1"
        />

        {/* Mouth - Animated smile curve */}
        <path
          d={mouth.path}
          stroke="#1a202c"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          style={{
            transition: 'd 0.3s ease-in-out',
          }}
        />
        
        {/* Whiskers - Left side */}
        <line x1="40" y1="95" x2="60" y2="100" stroke="#1a202c" strokeWidth="2" strokeLinecap="round" />
        <line x1="40" y1="105" x2="60" y2="105" stroke="#1a202c" strokeWidth="2" strokeLinecap="round" />
        <line x1="40" y1="115" x2="60" y2="110" stroke="#1a202c" strokeWidth="2" strokeLinecap="round" />
        
        {/* Whiskers - Right side */}
        <line x1="140" y1="100" x2="160" y2="95" stroke="#1a202c" strokeWidth="2" strokeLinecap="round" />
        <line x1="140" y1="105" x2="160" y2="105" stroke="#1a202c" strokeWidth="2" strokeLinecap="round" />
        <line x1="140" y1="110" x2="160" y2="115" stroke="#1a202c" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export default RoboticCatAvatar;

