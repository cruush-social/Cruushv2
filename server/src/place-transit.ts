/** Official stop-sign information; route itineraries do not belong in this model. */
export type PlaceTransitDetails = {
  services: Array<{
    route: string;
    operator: string;
    direction?: string;
    destinations: string[];
  }>;
  scheduleLinks: Array<{ label: string; url: string }>;
  entrances: Array<{
    name: string;
    side?: string;
    direction?: string;
    latitude?: number;
    longitude?: number;
    sourceUrl: string;
  }>;
  sms?: { operator: 'mta-bus'; locality: 'nyc'; stopCode: string };
};

// Only operator, agency, and government pages that back the current 100-mile
// transit import may be presented as passenger schedule links.
const OFFICIAL_TRANSIT_SCHEDULE_HOSTS = new Set([
  'academybus.com',
  'bustime.mta.info',
  'carbontransit.com',
  'coltsbus.com',
  'content.njtransit.com',
  'downtownny.com',
  'dutchessny.gov',
  'glencoveny.gov',
  'gogbt.com',
  'hartfordline.com',
  'lantabus.com',
  'leprechaunlines.com',
  'new.mta.info',
  'norwalktransit.com',
  'portal.ct.gov',
  'pottstownarearapidtransit.com',
  'publictransportation.columbiacountyny.com',
  'putnamcountyny.gov',
  'ridephillyphlash.com',
  'rivervalleytransit.com',
  'sctbus.org',
  'shorelineeast.com',
  'tmacc.org',
  'trailways.com',
  'transbridgelines.com',
  'transportation.westchestercountyny.gov',
  'ucat.ulstercountyny.gov',
  'web.coachusa.com',
  'www.amtrak.com',
  'www.bartabus.com',
  'www.clarkstown.gov',
  'www.co.somerset.nj.us',
  'www.coachusa.com',
  'www.cttransit.com',
  'www.dartfirststate.com',
  'www.driveless.com',
  'www.dutchessny.gov',
  'www.fullingtontours.com',
  'www.gomcta.com',
  'www.gvftma.com',
  'www.hartransit.com',
  'www.huntingtonny.gov',
  'www.jitneyac.com',
  'www.lakelandbus.com',
  'www.lctabus.com',
  'www.longbeachny.gov',
  'www.mercy.edu',
  'www.milfordtransit.com',
  'www.mta.info',
  'www.newarkairportexpress.com',
  'www.nicebus.com',
  'www.njtransit.com',
  'www.panynj.gov',
  'www.putnamcountyny.com',
  'www.ridehpt.com',
  'www.ridehudsonlink.com',
  'www.ridepatco.org',
  'www.rioc.ny.gov',
  'www.rocklandcountyny.gov',
  'www.septa.org',
  'www.sullivanny.gov',
  'www.sussexcountyclerk.org',
  'www.warrencountynj.gov',
]);

export function transitScheduleUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && OFFICIAL_TRANSIT_SCHEDULE_HOSTS.has(url.hostname.toLowerCase())
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Opens a composer only. MTA's six-digit stop code is the entire message. */
export function transitSmsLink(sms: PlaceTransitDetails['sms'], appleMobile = false): string | null {
  if (sms?.operator !== 'mta-bus' || sms.locality !== 'nyc' || !/^\d{6}$/.test(sms.stopCode)) return null;
  return `sms:511123${appleMobile ? '&' : '?'}body=${sms.stopCode}`;
}
