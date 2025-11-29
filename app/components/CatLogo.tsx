'use client';

import React from 'react';
import Image from 'next/image';

interface CatLogoProps {
  size?: number;
  backgroundColor?: string;
}

const CatLogo: React.FC<CatLogoProps> = ({ 
  size = 40,
  backgroundColor = '#fef08a' // bright yellow
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        padding: size * 0.1, // Add some padding so the image fits nicely
      }}
    >
      <Image
        src="/kitty.webp"
        alt="Kitty Logo"
        width={size * 0.8}
        height={size * 0.8}
        style={{
          objectFit: 'contain',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

export default CatLogo;

