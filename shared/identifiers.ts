export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

export function formatCpf(value: string): string {
  const digits = digitsOnly(value).slice(0, 11);
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter(Boolean);
  return groups.join('.') + (digits.length > 9 ? `-${digits.slice(9)}` : '');
}

export function validCpf(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  if (value !== digits && value !== formatCpf(digits)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(digits[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    if (Number(digits[length]) !== (remainder === 10 ? 0 : remainder)) return false;
  }
  return true;
}

export function formatCnpj(value: string): string {
  const digits = digitsOnly(value).slice(0, 14);
  const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 8)].filter(Boolean);
  return groups.join('.') + (digits.length > 8 ? `/${digits.slice(8, 12)}` : '') + (digits.length > 12 ? `-${digits.slice(12)}` : '');
}

export function validCnpj(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  if (value !== digits && value !== formatCnpj(digits)) return false;
  for (const length of [12, 13]) {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(digits[index]) * ((length - index - 1) % 8 + 2);
    const remainder = sum % 11;
    if (Number(digits[length]) !== (remainder < 2 ? 0 : 11 - remainder)) return false;
  }
  return true;
}
