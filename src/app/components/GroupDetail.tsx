import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Users, Heart } from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';

export default function GroupDetail() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const mockGroup = {
    id: groupId,
    name: 'Looking for a Third',
    members: [
      { name: 'Alex', pronouns: 'they/them' },
      { name: 'Jordan', pronouns: 'she/her' },
    ],
    lookingFor: 'Third person for ongoing fun',
    distance: '1.2 mi',
    vibes: ['Open', 'Poly', 'Friendly'],
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h2 className="text-xl">Group</h2>
      </header>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div className="bg-gradient-to-br from-crimson-dark to-crimson-bright h-48 rounded-2xl flex items-center justify-center">
          <Heart className="w-24 h-24 text-white/20" />
        </div>

        <div>
          <h1 className="text-3xl mb-2">{mockGroup.name}</h1>
          <p className="text-sm text-muted-foreground">{mockGroup.distance} away</p>
        </div>

        <div className="space-y-2">
          <h3>Members</h3>
          <div className="flex gap-3">
            {mockGroup.members.map((member, i) => (
              <div key={i} className="flex items-center gap-2">
                <Avatar>
                  <AvatarFallback
                    style={{
                      background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
                    }}
                  >
                    {member.name[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.pronouns}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3>Looking For</h3>
          <p className="text-muted-foreground">{mockGroup.lookingFor}</p>
        </div>

        <div className="space-y-2">
          <h3>Vibes</h3>
          <div className="flex flex-wrap gap-2">
            {mockGroup.vibes.map((vibe) => (
              <Badge key={vibe} variant="secondary">{vibe}</Badge>
            ))}
          </div>
        </div>

        <Button
          className="w-full"
          style={{
            background: 'linear-gradient(135deg, #ff2f72 0%, #7a2bff 42%, #22b8ff 100%)',
          }}
        >
          <Users className="w-4 h-4 mr-2" />
          Request to Join
        </Button>
      </div>
    </div>
  );
}
