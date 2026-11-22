import { QrCode } from 'lucide-react';

const SAFE_RASTER_DATA_URI = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/;

type Props = {
  qrPayload: string | null;
  expiresAt?: string | null;
  protocol?: string;
};

/**
 * Safely renders a bank-issued Pix QR Code image when the provider returns a
 * raster data URI (`data:image/png;base64,...`), or displays a clear honest
 * instruction card when only the raw EMVCo Copia e Cola payload is available.
 * Never fabricates a non-scannable fake QR matrix.
 */
export function PixQrVisual({ qrPayload, expiresAt, protocol }: Props) {
  if (!qrPayload) return null;
  const trimmed = qrPayload.trim();
  const isSafeImage = SAFE_RASTER_DATA_URI.test(trimmed);

  return (
    <div className="jn-qr-frame" aria-label="QR Code Pix dinâmico">
      {isSafeImage ? (
        <img
          src={trimmed}
          alt={protocol ? `QR Code Pix da cobrança ${protocol}` : 'QR Code Pix para pagamento'}
          className="jn-qr-image"
          width={200}
          height={200}
        />
      ) : (
        <div className="jn-qr-fallback" role="note">
          <QrCode size={40} aria-hidden="true" className="jn-qr-fallback-icon" />
          <div>
            <strong>Cobrança Pix dinâmica ativa</strong>
            <p className="customer-note">
              Utilize o código <strong>Pix Copia e Cola</strong> abaixo no aplicativo do seu banco para efetuar o
              pagamento.
            </p>
          </div>
        </div>
      )}
      {expiresAt && (
        <p className="customer-note jn-qr-expiry">
          Válido até {new Date(expiresAt).toLocaleString('pt-BR')}
        </p>
      )}
    </div>
  );
}
