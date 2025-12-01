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
        padding: 0, // No padding to fill the entire circle
      }}
    >
      <Image
        src="/kitty.webp"
        alt="Kitty Logo"
        width={size}
        height={size}
        style={{
          objectFit: 'cover',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};

export default CatLogo;

