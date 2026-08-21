'use client';

import { useProfile } from '@/hooks/useProfile';

export default function ProfileSelector() {
  const { profiles, activeProfile, setActiveProfile } = useProfile();

  if (!profiles.length) return null;

  // Esto NO filtra lo que se ve: elige a nombre de quién se cargan los
  // movimientos nuevos. El título lo deja claro al pasar el mouse.
  return (
    <div className="flex items-center gap-2" title="Cargando movimientos como…">
      {profiles.map((profile) => {
        const isActive = activeProfile?.id === profile.id;
        return (
          <button
            key={profile.id}
            onClick={() => setActiveProfile(profile)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              isActive
                ? 'bg-gradient-to-r from-accent to-[#8b5cf6] text-white shadow-lg shadow-accent/25'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover border border-border'
            }`}
          >
            {/* Las cuentas nuevas se crean sin avatar: sin este fallback el
                botón salía sin ícono. */}
            <span className="text-lg">
              {profile.avatar || profile.name.charAt(0).toUpperCase()}
            </span>
            <span>{profile.name}</span>
          </button>
        );
      })}
    </div>
  );
}
