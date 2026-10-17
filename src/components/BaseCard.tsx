import type { LucideIcon } from 'lucide-react';
interface BaseCardProps { title: string; description: string; icon: LucideIcon; }
export function BaseCard({ title, description, icon: Icon }: BaseCardProps) {
  return (
    <article className="module-card">
      <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
      <h3>{title}</h3><p>{description}</p><span className="coming-soon">Em breve</span>
    </article>
  );
}
