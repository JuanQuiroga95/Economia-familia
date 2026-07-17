'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { registerAccount } from '@/actions/register';

export default function RegisterPage() {
  const router = useRouter();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form data
  const [label, setLabel] = useState('');
  const [numPeople, setNumPeople] = useState(1);
  const [profileNames, setProfileNames] = useState<string[]>(['']);
  
  // Gastos Compartidos (solo si son 2 personas)
  const [splitMode, setSplitMode] = useState<'FONDO_COMUN' | 'PORCENTAJE'>('FONDO_COMUN');
  const [splitPercentA, setSplitPercentA] = useState('50');
  const [splitPercentB, setSplitPercentB] = useState('50');

  // Presupuestos
  const [budgets, setBudgets] = useState<{budgetType: string; firstHalf: string; secondHalf: string; monthly: string}[]>([
    {budgetType: 'QUINCENAL', firstHalf: '', secondHalf: '', monthly: ''}
  ]);
  
  // Auth
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const nextStep = () => {
    setError('');
    if (step === 1 && !label.trim()) {
      setError('Por favor, ingresá un nombre para tu cuenta');
      return;
    }
    if (step === 2) {
      const emptyNames = profileNames.filter(n => !n.trim());
      if (emptyNames.length > 0) {
        setError('Por favor, completá los nombres de todas las personas');
        return;
      }
    }
    
    // Skip step 3 if not 2 people
    if (step === 2 && numPeople !== 2) {
      setStep(4);
      return;
    }

    setStep(s => s + 1);
  };

  const prevStep = () => {
    if (step === 4 && numPeople !== 2) {
      setStep(2);
      return;
    }
    setStep(s => s - 1);
  };

  const handleNumPeopleChange = (num: number) => {
    setNumPeople(num);
    const newNames = [...profileNames];
    const newBudgets = [...budgets];
    if (num > newNames.length) {
      for (let i = newNames.length; i < num; i++) {
        newNames.push('');
        newBudgets.push({budgetType: 'QUINCENAL', firstHalf: '', secondHalf: '', monthly: ''});
      }
    } else {
      newNames.splice(num);
      newBudgets.splice(num);
    }
    setProfileNames(newNames);
    setBudgets(newBudgets);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== 5) return;
    
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Por favor, completá tu usuario y contraseña');
      return;
    }

    setLoading(true);

    const parsedBudgets = budgets.map(b => ({
      budgetType: b.budgetType,
      firstHalf: parseFloat(b.firstHalf) || 0,
      secondHalf: parseFloat(b.secondHalf) || 0,
      monthlyBudget: parseFloat(b.monthly) || 0,
    }));

    try {
      const res = await registerAccount({
        label,
        username,
        password,
        profileNames,
        budgets: parsedBudgets,
        splitMode: numPeople === 2 ? splitMode : undefined,
        splitPercentA: numPeople === 2 ? parseFloat(splitPercentA) || 50 : undefined,
        splitPercentB: numPeople === 2 ? parseFloat(splitPercentB) || 50 : undefined,
      });

      if (!res.success) {
        setError(res.error || 'Error al crear la cuenta');
        setLoading(false);
        return;
      }

      // Automatically log in
      const signInResult = await signIn('credentials', {
        username,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError('Cuenta creada, pero hubo un error al iniciar sesión. Por favor, andá al login.');
        setLoading(false);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      console.error(err);
      setError('Error inesperado al crear la cuenta');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="absolute top-20 right-10 w-72 h-72 bg-accent/10 rounded-full blur-[100px]" />
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-purple-600/10 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8 animate-slide-up">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-accent to-purple-600 mb-4 shadow-xl shadow-accent/30">
            <span className="text-4xl">🚀</span>
          </div>
          <h1 className="text-3xl font-bold gradient-text">Crear Cuenta</h1>
          <p className="text-text-muted mt-2">Paso {step === 5 ? 4 : (step > 3 && numPeople !== 2 ? step - 1 : step)} de {numPeople === 2 ? 5 : 4}</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-xl font-semibold text-text-primary">¿Cómo llamamos a esta cuenta?</h2>
              <p className="text-sm text-text-muted">Puede ser el nombre de tu familia, el tuyo propio o como prefieras (ej: &quot;Familia Gómez&quot;, &quot;Finanzas de Ana&quot;).</p>
              
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Nombre de la cuenta</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="input-field"
                  placeholder="Ej: Familia Gómez"
                  autoFocus
                />
              </div>

              {error && <div className="text-danger text-sm">{error}</div>}

              <button type="button" onClick={nextStep} className="w-full gradient-btn py-3 mt-4">
                Siguiente
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-xl font-semibold text-text-primary">¿Quiénes van a usar la app?</h2>
              
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Cantidad de personas</label>
                <div className="flex gap-2 mb-4">
                  {[1, 2, 3, 4, 5].map(num => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleNumPeopleChange(num)}
                      className={`flex-1 py-2 rounded-xl border text-sm font-medium transition-colors ${
                        numPeople === num ? 'bg-accent/20 text-accent border-accent/30' : 'bg-bg-input text-text-secondary border-border hover:border-accent/20'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-text-secondary">Nombres o Apodos</label>
                {profileNames.map((name, index) => (
                  <input
                    key={index}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      const newNames = [...profileNames];
                      newNames[index] = e.target.value;
                      setProfileNames(newNames);
                    }}
                    className="input-field"
                    placeholder={`Persona ${index + 1}`}
                  />
                ))}
              </div>

              {error && <div className="text-danger text-sm">{error}</div>}

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={prevStep} className="flex-1 py-3 bg-bg-input rounded-xl text-text-secondary hover:text-text-primary transition-colors">
                  Atrás
                </button>
                <button type="button" onClick={nextStep} className="flex-1 gradient-btn py-3">
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {step === 3 && numPeople === 2 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-xl font-semibold text-text-primary">¿Cómo dividen los gastos?</h2>
              <p className="text-sm text-text-muted">Elegí la manera en que comparten los gastos comunes.</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setSplitMode('FONDO_COMUN')}
                  className={`p-4 rounded-xl text-sm font-medium transition-all border ${
                    splitMode === 'FONDO_COMUN'
                      ? 'bg-accent/20 text-accent border-accent/30'
                      : 'bg-bg-input text-text-secondary border-border hover:border-accent/20'
                  }`}
                >
                  <span className="text-lg block mb-1">🏦</span>
                  Fondo Común
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode('PORCENTAJE')}
                  className={`p-4 rounded-xl text-sm font-medium transition-all border ${
                    splitMode === 'PORCENTAJE'
                      ? 'bg-accent/20 text-accent border-accent/30'
                      : 'bg-bg-input text-text-secondary border-border hover:border-accent/20'
                  }`}
                >
                  <span className="text-lg block mb-1">📊</span>
                  Porcentaje
                </button>
              </div>

              {splitMode === 'PORCENTAJE' && (
                <div className="p-3 bg-bg-input rounded-xl space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-text-muted mb-1">{profileNames[0] || 'Persona 1'} (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={splitPercentA}
                        onChange={(e) => {
                          setSplitPercentA(e.target.value);
                          setSplitPercentB((100 - parseFloat(e.target.value || '0')).toString());
                        }}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-text-muted mb-1">{profileNames[1] || 'Persona 2'} (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={splitPercentB}
                        onChange={(e) => {
                          setSplitPercentB(e.target.value);
                          setSplitPercentA((100 - parseFloat(e.target.value || '0')).toString());
                        }}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={prevStep} className="flex-1 py-3 bg-bg-input rounded-xl text-text-secondary hover:text-text-primary transition-colors">
                  Atrás
                </button>
                <button type="button" onClick={nextStep} className="flex-1 gradient-btn py-3">
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-xl font-semibold text-text-primary">¿Presupuesto?</h2>
              <p className="text-sm text-text-muted">Si tienen un límite fijo para gastar, indicalo (opcional). Podés elegir Quincenal o Mensual.</p>
              
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                {profileNames.map((name, index) => (
                  <div key={index} className="p-4 bg-bg-input rounded-xl border border-border/50">
                    <p className="text-sm font-medium text-text-primary mb-3">{name || `Persona ${index + 1}`}</p>
                    
                    <div className="flex bg-bg-secondary p-1 rounded-lg mb-3">
                      <button
                        type="button"
                        onClick={() => {
                          const newB = [...budgets];
                          newB[index].budgetType = 'QUINCENAL';
                          setBudgets(newB);
                        }}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${budgets[index].budgetType === 'QUINCENAL' ? 'bg-bg-input text-accent shadow-sm' : 'text-text-muted'}`}
                      >
                        Quincenal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const newB = [...budgets];
                          newB[index].budgetType = 'MENSUAL';
                          setBudgets(newB);
                        }}
                        className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${budgets[index].budgetType === 'MENSUAL' ? 'bg-bg-input text-accent shadow-sm' : 'text-text-muted'}`}
                      >
                        Mensual
                      </button>
                    </div>

                    {budgets[index].budgetType === 'QUINCENAL' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-text-secondary mb-1">1ra Quincena</label>
                          <input
                            type="number"
                            value={budgets[index].firstHalf}
                            onChange={(e) => {
                              const newB = [...budgets];
                              newB[index].firstHalf = e.target.value;
                              setBudgets(newB);
                            }}
                            className="input-field"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-secondary mb-1">2da Quincena</label>
                          <input
                            type="number"
                            value={budgets[index].secondHalf}
                            onChange={(e) => {
                              const newB = [...budgets];
                              newB[index].secondHalf = e.target.value;
                              setBudgets(newB);
                            }}
                            className="input-field"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs text-text-secondary mb-1">Presupuesto Mensual</label>
                        <input
                          type="number"
                          value={budgets[index].monthly}
                          onChange={(e) => {
                            const newB = [...budgets];
                            newB[index].monthly = e.target.value;
                            setBudgets(newB);
                          }}
                          className="input-field"
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={prevStep} className="flex-1 py-3 bg-bg-input rounded-xl text-text-secondary hover:text-text-primary transition-colors">
                  Atrás
                </button>
                <button type="button" onClick={nextStep} className="flex-1 gradient-btn py-3">
                  Siguiente
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-xl font-semibold text-text-primary">Datos de acceso</h2>
              <p className="text-sm text-text-muted">Creá un usuario y contraseña. Todos los integrantes usarán estos mismos datos para ingresar.</p>
              
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Usuario</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field"
                  placeholder="ej: familiagomez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field"
                  placeholder="••••••••"
                />
              </div>

              {error && <div className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-sm">
                {error}
              </div>}

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={prevStep} disabled={loading} className="flex-1 py-3 bg-bg-input rounded-xl text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50">
                  Atrás
                </button>
                <button type="submit" disabled={loading} className="flex-1 gradient-btn py-3 disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Finalizar
                </button>
              </div>
            </div>
          )}
        </form>

        <div className="mt-6 text-center space-y-4">
          <p className="text-text-muted text-sm">
            ¿Ya tenés una cuenta?{' '}
            <button
              onClick={() => router.push('/login')}
              className="text-accent hover:text-accent-hover font-medium transition-colors"
            >
              Iniciar sesión
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
