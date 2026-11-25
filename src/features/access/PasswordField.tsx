import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';

export function PasswordField({
  fresh = false,
  disabled = false,
  clean = false,
  id = 'password',
}: {
  fresh?: boolean;
  disabled?: boolean;
  clean?: boolean;
  id?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`input-wrap ${clean ? 'input-wrap-clean' : ''}`}>
      {!clean && <LockKeyhole size={18} aria-hidden="true" />}
      <input
        id={id}
        name="password"
        type={visible ? 'text' : 'password'}
        autoComplete={fresh ? 'new-password' : 'current-password'}
        minLength={fresh ? 8 : undefined}
        maxLength={128}
        required
        disabled={disabled}
        placeholder={fresh ? 'Pelo menos 8 caracteres' : 'Digite sua senha'}
      />
      <button
        className="password-toggle"
        type="button"
        disabled={disabled}
        onClick={() => setVisible(!visible)}
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}
