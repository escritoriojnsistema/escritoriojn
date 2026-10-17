import React from 'react';
import { LucideIcon } from 'lucide-react';

interface BaseCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}

export const BaseCard: React.FC<BaseCardProps> = ({
  title,
  description,
  icon: Icon,
  badge,
}) => {
  return (
    <div className="flex flex-col p-6 rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm backdrop-blur-sm transition-all hover:border-slate-700 hover:bg-slate-900/80">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
        {badge && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            {badge}
          </span>
        )}
      </div>
      <h2 className="text-lg font-semibold text-white tracking-tight mb-1">{title}</h2>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </div>
  );
};
