'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email o contraseña incorrectos');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Background decorations */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-accent/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8 animate-slide-up">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-purple-600 mb-4 shadow-xl shadow-accent/30">
            <span className="text-4xl">💰</span>
          </div>
          <h1 className="text-3xl font-bold gradient-text">EconoApp</h1>
          <p className="text-text-muted mt-2">Gestión Financiera Personal</p>
        </div>

        {/* Login form */}
        <form
          onSubmit={handleSubmit}
          className="glass-card p-8 space-y-6 animate-slide-up"
          style={{ animationDelay: '0.1s' }}
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="tu@email.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full gradient-btn py-3 px-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Ingresando...</span>
              </div>
            ) : (
              'Ingresar'
            )}
          </button>
        </form>

        <p className="text-center text-text-muted text-xs mt-6">
          Juan & Tania • {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
