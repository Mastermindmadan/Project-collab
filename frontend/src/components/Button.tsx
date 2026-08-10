import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
}

export default function Button({ children, className = '', ...rest }: Props) {
  return (
    <button {...rest} className={`btn-ripple ${className}`.trim()}>
      {children}
    </button>
  );
}
