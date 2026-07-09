// Icône iOS (ajout à l'écran d'accueil) — même logo M sur dégradé bleu.
import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const pulse = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80"><path d="M12 46 H120 L150 46 L172 18 L200 66 L222 46 H308" fill="none" stroke="#e8f5ff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const pulseUri = `data:image/svg+xml;base64,${Buffer.from(pulse).toString('base64')}`

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #57baf1 0%, #1585d8 100%)',
        }}
      >
        <div style={{ fontSize: 108, fontWeight: 800, color: 'white', lineHeight: 1, marginTop: -10, display: 'flex' }}>M</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pulseUri} width={108} height={27} alt="" style={{ marginTop: -2 }} />
      </div>
    ),
    { ...size },
  )
}
