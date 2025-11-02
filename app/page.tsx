'use client';

import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AccessCodePage from "./components/AccessCodePage";

export default function Home() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && currentUser) {
      // User is already signed in, redirect to app
      router.push('/app');
    }
  }, [currentUser, loading, router]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p>Loading...</p>
      </div>
    );
  }

  // Show access code page for unauthenticated users
  return <AccessCodePage />;
}