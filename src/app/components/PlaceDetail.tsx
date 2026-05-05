import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, MapPin, Users, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Avatar, AvatarFallback } from './ui/avatar';

export default function PlaceDetail() {
  const { placeId } = useParams();
  const navigate = useNavigate();

  const mockPlace = {
    id: placeId,
    name: 'Dolores Park',
    distance: '0.8 mi',
    description: 'Popular cruising spot with great views and lots of activity.',
    currentlyHere: 8,
    recentlyHere: 15,
  };

  const mockPosts = [
    { id: 1, user: 'Alex', content: 'Heading here in 10 min if anyone wants to meet up', time: '5m' },
    { id: 2, user: 'Jordan', content: 'Great weather today, lots of people around', time: '15m' },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Place</h2>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div
          className="h-48 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--cruush-gradient)' }}
        >
          <MapPin className="w-24 h-24 text-white/20" />
        </div>

        <div>
          <h1 className="text-3xl mb-2">{mockPlace.name}</h1>
          <p className="text-sm text-muted-foreground">{mockPlace.distance} away</p>
        </div>

        <p className="text-muted-foreground">{mockPlace.description}</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl">{mockPlace.currentlyHere}</p>
            <p className="text-sm text-muted-foreground">Currently Here</p>
          </div>
          <div className="bg-card border border-border rounded-lg p-4 text-center">
            <Clock className="w-6 h-6 mx-auto mb-2 text-primary" />
            <p className="text-2xl">{mockPlace.recentlyHere}</p>
            <p className="text-sm text-muted-foreground">Recently Here</p>
          </div>
        </div>

        <Button
          className="w-full"
          style={{
            background: 'var(--cruush-gradient)',
          }}
        >
          <MapPin className="w-4 h-4 mr-2" />
          Check In Here
        </Button>

        <Tabs defaultValue="feed" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="here">Who's Here</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-4 mt-4">
            {mockPosts.map((post) => (
              <div key={post.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Avatar>
                    <AvatarFallback>{post.user[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm">{post.user}</p>
                      <span className="text-xs text-muted-foreground">{post.time}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{post.content}</p>
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="here" className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground text-center py-8">
              {mockPlace.currentlyHere} people checked in here
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
