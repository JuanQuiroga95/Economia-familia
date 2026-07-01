'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import type { ProfileData } from '@/types';

interface ProfileContextType {
  profiles: ProfileData[];
  activeProfile: ProfileData | null;
  setActiveProfile: (profile: ProfileData) => void;
  loading: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profiles: [],
  activeProfile: null,
  setActiveProfile: () => {},
  loading: true,
});

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [activeProfile, setActiveProfileState] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const { status } = useSession();

  useEffect(() => {
    async function fetchProfiles() {
      try {
        setLoading(true);
        const res = await fetch('/api/profiles');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setProfiles(data);

        // Recuperar perfil activo del localStorage
        const savedProfileId = localStorage.getItem('activeProfileId');
        if (savedProfileId) {
          const saved = data.find((p: ProfileData) => p.id === savedProfileId);
          if (saved) {
            setActiveProfileState(saved);
          } else if (data.length > 0) {
            setActiveProfileState(data[0]);
          }
        } else if (data.length > 0) {
          setActiveProfileState(data[0]);
        }
      } catch (error) {
        console.error('Error fetching profiles:', error);
      } finally {
        setLoading(false);
      }
    }

    if (status === 'authenticated') {
      fetchProfiles();
    } else if (status === 'unauthenticated') {
      setProfiles([]);
      setActiveProfileState(null);
      setLoading(false);
    }
  }, [status]);

  const setActiveProfile = (profile: ProfileData) => {
    setActiveProfileState(profile);
    localStorage.setItem('activeProfileId', profile.id);
  };

  return (
    <ProfileContext.Provider value={{ profiles, activeProfile, setActiveProfile, loading }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
