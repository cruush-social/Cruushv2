import { useNavigate } from 'react-router';
import { ArrowLeft, Users, Calendar, Check, X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';

export default function RequestsDashboard() {
  const navigate = useNavigate();

  const groupRequests = [
    { id: 1, user: { name: 'Riley', pronouns: 'ze/zir' }, group: 'Looking for a Third', time: '5m' },
    { id: 2, user: { name: 'Taylor', pronouns: 'she/her' }, group: 'Poly Pod', time: '1h' },
  ];

  const eventAttendees = [
    { id: 1, event: 'Queer Dance Party', confirmed: 12, pending: 3 },
    { id: 2, event: 'Pride Picnic', confirmed: 8, pending: 1 },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Requests & Attendance</h2>
      </header>

      <div className="max-w-2xl mx-auto">
        <Tabs defaultValue="groups" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="groups">Group Requests</TabsTrigger>
            <TabsTrigger value="events">Event Attendance</TabsTrigger>
          </TabsList>

          <TabsContent value="groups" className="mt-0">
            <div className="divide-y divide-border">
              {groupRequests.map((request) => (
                <div key={request.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback>{request.user.name[0]}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                      <p>
                        <span>{request.user.name}</span>{' '}
                        <span className="text-sm text-muted-foreground">{request.user.pronouns}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        wants to join <span className="text-foreground">{request.group}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">{request.time} ago</p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        style={{
                          background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                        }}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}

              {groupRequests.length === 0 && (
                <div className="p-12 text-center">
                  <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No pending group requests</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="mt-0">
            <div className="divide-y divide-border">
              {eventAttendees.map((event) => (
                <div key={event.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                      }}
                    >
                      <Calendar className="w-6 h-6" />
                    </div>

                    <div className="flex-1">
                      <p>{event.event}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>{event.confirmed} confirmed</span>
                        <span>{event.pending} pending</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/events/${event.id}`)}
                    >
                      View
                    </Button>
                  </div>
                </div>
              ))}

              {eventAttendees.length === 0 && (
                <div className="p-12 text-center">
                  <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No events created</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
