import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Calendar, MapPin, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

export default function EventDetail() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const mockEvent = {
    id: eventId,
    name: 'Queer Dance Party',
    date: 'Saturday, April 20, 2026',
    time: '10:00 PM - 3:00 AM',
    location: 'The Rainbow Club',
    distance: '2.1 mi',
    description: 'Join us for a night of dancing, celebration, and community. All are welcome!',
    attendees: 47,
    vibes: ['Dance', 'Party', 'Community'],
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Event</h2>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div
          className="h-64 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--cruush-gradient)' }}
        >
          <Calendar className="w-32 h-32 text-white/20" />
        </div>

        <div>
          <h1 className="text-3xl mb-2">{mockEvent.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Calendar className="w-4 h-4" />
            <span>{mockEvent.date} • {mockEvent.time}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{mockEvent.location} ({mockEvent.distance})</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Users className="w-4 h-4" />
          <span>{mockEvent.attendees} attending</span>
        </div>

        <div className="space-y-2">
          <h3>About</h3>
          <p className="text-muted-foreground">{mockEvent.description}</p>
        </div>

        <div className="space-y-2">
          <h3>Vibes</h3>
          <div className="flex flex-wrap gap-2">
            {mockEvent.vibes.map((vibe) => (
              <Badge key={vibe} variant="secondary">{vibe}</Badge>
            ))}
          </div>
        </div>

        <Button
          className="w-full"
          style={{
            background: 'var(--cruush-gradient)',
          }}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Attend Event
        </Button>
      </div>
    </div>
  );
}
