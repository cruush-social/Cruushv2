import type { PlaceTransitDetails as TransitDetails } from '../../../server/src/place-transit';
import { transitScheduleUrl, transitSmsLink } from '../../../server/src/place-transit';

export default function PlaceTransitDetails({ details }: { details: TransitDetails | null | undefined }) {
  if (!details) return null;
  const appleMobile = typeof navigator !== 'undefined'
    && (/iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const smsHref = transitSmsLink(details.sms, appleMobile);
  return (
    <div className="mt-2 space-y-2 text-sm text-muted-foreground">
      {details.services.map((service, index) => (
        <p key={`${service.operator}:${service.route}:${service.direction ?? ''}:${index}`}>
          <span className="text-foreground">{service.route}</span>
          {service.direction ? ` · ${service.direction}` : ''}
          {service.destinations.length ? ` · ${service.destinations.join(' / ')}` : ''}
        </p>
      ))}
      {smsHref ? <p>Text {details.sms!.stopCode} to 511123 for arrivals.{' '}
        <a className="text-primary" href={smsHref}>Text for arrivals</a>
      </p> : null}
      {details.scheduleLinks.map((link) => {
        const href = transitScheduleUrl(link.url);
        return href ? <p key={href}><a className="text-primary" href={href} target="_blank" rel="noreferrer">{link.label}</a></p> : null;
      })}
      {details.entrances.length ? <div>
        <p className="text-xs uppercase tracking-[0.14em] text-white/55">Entrances</p>
        {details.entrances.map((entrance, index) => <p key={`${entrance.name}:${index}`}>
          {[entrance.name, entrance.side, entrance.direction].filter(Boolean).join(' · ')}
        </p>)}
      </div> : null}
    </div>
  );
}
