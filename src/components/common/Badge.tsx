import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'navy' | 'success' | 'warning' | 'info';
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-1.5 py-0.5 leading-none',
    md: 'text-xs px-2 py-0.5 leading-tight',
  };

  const variantStyles = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    navy: 'bg-[#0f2a4a]/10 text-[#0f2a4a] border-[#0f2a4a]/20',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    info: 'bg-sky-50 text-sky-800 border-sky-200',
  };

  return (
    <span
      className={`inline-flex items-center font-medium border rounded ${sizeStyles[size]} ${variantStyles[variant]}`}
    >
      {children}
    </span>
  );
};

