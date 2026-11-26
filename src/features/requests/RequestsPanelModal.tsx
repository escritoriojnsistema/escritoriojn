import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Brand } from '../../ui/Brand';

export function RequestsPanelModal({
  open,
  title,
  locked = false,
  wide = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  locked?: boolean;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className={`requests-panel-dialog${wide ? ' is-wide' : ''}`}
      aria-label={title}
      onCancel={event => {
        if (locked) event.preventDefault();
      }}
      onClose={() => {
        if (!locked) onClose();
      }}
      onClick={event => {
        if (locked || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="requests-panel-dialog-bar">
        <div className="requests-panel-dialog-brand">
          <Brand light emblem="scale" decorative />
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          className="requests-panel-dialog-close"
          disabled={locked}
          onClick={() => dialogRef.current?.close()}
        >
          <X size={16} aria-hidden="true" />
          <span>Fechar</span>
        </button>
      </div>
      <div className="requests-panel-dialog-body">{children}</div>
    </dialog>
  );
}
