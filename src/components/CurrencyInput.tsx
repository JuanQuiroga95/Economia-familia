import React, { useState, useEffect } from 'react';

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string | number;
  onChange: (e: any) => void;
}

/** Formatea "1234.5" como "1.234,5" para mostrarlo. */
function aFormatoLocal(raw: string) {
  if (raw === '') return '';
  const [entera = '0', decimal] = raw.split('.');
  const soloDigitos = entera.replace(/\D/g, '');
  if (!soloDigitos) return raw.replace('.', ',');
  return (
    soloDigitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (decimal !== undefined ? ',' + decimal : '')
  );
}

export function CurrencyInput({ value, onChange, className, ...props }: CurrencyInputProps) {
  // Lo que se muestra se deriva del valor que llega por props. Se guarda en
  // state solo mientras se tipea, para no pisar comas intermedias; el efecto
  // sincroniza cuando el valor cambia desde afuera.
  const [displayValue, setDisplayValue] = useState(() => aFormatoLocal(value?.toString() || ''));

  useEffect(() => {
    const strVal = value?.toString() || '';
    if (strVal === '') {
      setDisplayValue('');
      return;
    }
    
    // Check if the current display value already represents the same numeric value
    // to avoid cursor jumping or overriding user's intermediate typing
    const currentNumeric = displayValue.replace(/\./g, '').replace(',', '.');
    if (currentNumeric === strVal) {
      return;
    }
    
    // Parse the incoming raw value (which uses dot for decimal)
    const parts = strVal.split('.');
    let integerPart = parts[0] || '0';
    const decimalPart = parts.length > 1 ? ',' + parts[1] : '';
    
    // Remove any non-digits from integer part (just in case)
    integerPart = integerPart.replace(/\D/g, '');
    
    if (integerPart) {
      // Add thousands separators (dots)
      integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      setDisplayValue(integerPart + decimalPart);
    } else {
      setDisplayValue(strVal.replace('.', ',')); // Edge case
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    
    // Allow empty string
    if (rawInput === '') {
      setDisplayValue('');
      onChange({ target: { value: '' } });
      return;
    }

    // Keep only digits and a single comma
    let cleaned = rawInput.replace(/[^\d,]/g, '');
    
    // Ensure only one comma
    const commaParts = cleaned.split(',');
    if (commaParts.length > 2) {
      cleaned = commaParts[0] + ',' + commaParts.slice(1).join('');
    }

    // Format for display
    let newDisplay = cleaned;
    const parts = cleaned.split(',');
    if (parts[0]) {
      const withDots = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      newDisplay = withDots + (parts.length > 1 ? ',' + parts[1] : '');
    }
    setDisplayValue(newDisplay);

    // Convert comma back to dot for the raw value
    const rawNumeric = cleaned.replace(',', '.');
    
    // Pass raw value to parent
    onChange({ target: { value: rawNumeric } });
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      onChange={handleChange}
      className={className || "input-field"}
      {...props}
    />
  );
}
