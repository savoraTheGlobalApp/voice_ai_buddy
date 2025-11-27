'use client';

import React from 'react';

type AvatarState = 'idle' | 'listening' | 'processing' | 'speaking' | 'success' | 'error';

interface RoboticCatAvatarProps {
  eyeColor: AvatarState;
  isTTSPlaying: boolean;
  size?: number;
}

const RoboticCatAvatar: React.FC<RoboticCatAvatarProps> = ({
  eyeColor,
  isTTSPlaying,
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

  // Mouth animation: open when TTS is playing
  const mouthHeight = isTTSPlaying ? 12 : 4;
  const mouthWidth = isTTSPlaying ? 40 : 20;
  const mouthY = isTTSPlaying ? 142 : 148;

  return (
    <div
      className="robotic-cat-avatar"
      data-state={eyeColor}
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
          90%, 92% { transform: scaleY(0.15); }
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

        {/* Head - Rounded cat face */}
        <circle
          className="avatar-head"
          cx="100"
          cy="100"
          r="60"
          fill="url(#headGradient)"
          stroke="#1a202c"
          strokeWidth="2"
        />

        {/* Robotic details - Side panels */}
        <rect x="35" y="80" width="18" height="28" fill="#e5e7eb" opacity="0.8" rx="3" />
        <rect x="147" y="80" width="18" height="28" fill="#e5e7eb" opacity="0.8" rx="3" />

        {/* Left Eye */}
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
        <circle
          cx="80"
          cy="85"
          r="8"
          fill="#ffffff"
          opacity="0.3"
        />
        <circle
          cx="82"
          cy="83"
          r="4"
          fill="#ffffff"
        />

        {/* Right Eye */}
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
        <circle
          cx="120"
          cy="85"
          r="8"
          fill="#ffffff"
          opacity="0.3"
        />
        <circle
          cx="122"
          cy="83"
          r="4"
          fill="#ffffff"
        />

        {/* Nose - Triangular cat nose */}
        <polygon
          points="100,105 95,115 105,115"
          fill="#1a202c"
        />

        {/* Mouth - Animated ellipse */}
        <ellipse
          cx="100"
          cy={mouthY}
          rx={mouthWidth}
          ry={mouthHeight}
          fill="#1a202c"
          style={{
            transition: 'cy 0.3s ease-in-out, ry 0.3s ease-in-out, rx 0.3s ease-in-out',
          }}
        />

        {/* Robotic details - Cheek panels */}
        <rect x="50" y="112" width="22" height="16" fill="#e5e7eb" opacity="0.8" rx="3" />
        <rect x="128" y="112" width="22" height="16" fill="#e5e7eb" opacity="0.8" rx="3" />

        {/* Robotic details - Chin panel */}
        <rect x="80" y="152" width="40" height="10" fill="#e5e7eb" opacity="0.9" rx="3" />

        {/* Decorative lines - Robotic aesthetic */}
        <line x1="100" y1="52" x2="100" y2="64" stroke="#60a5fa" strokeWidth="1" opacity="0.5" />
        <line x1="100" y1="136" x2="100" y2="148" stroke="#60a5fa" strokeWidth="1" opacity="0.5" />
      </svg>
    </div>
  );
};

export default RoboticCatAvatar;

