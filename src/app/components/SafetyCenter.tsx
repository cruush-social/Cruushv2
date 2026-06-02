import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, AlertTriangle, Clock, Phone } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { CruushIcon } from './CruushIconImage';

export default function SafetyCenter() {
  const navigate = useNavigate();
  const [panicEnabled, setPanicEnabled] = useState(false);
  const [checkInActive, setCheckInActive] = useState(false);
  const [checkInMinutes, setCheckInMinutes] = useState(60);
  const [emergencyContacts, setEmergencyContacts] = useState([
    { name: '', phone: '', email: '' },
  ]);

  const handlePanicButton = () => {
    if (window.confirm('Activate panic mode? This will clear your session and redirect to google.com')) {
      window.location.href = 'https://www.google.com';
    }
  };

  const startCheckIn = () => {
    setCheckInActive(true);
  };

  const stopCheckIn = () => {
    setCheckInActive(false);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 bg-card/80 backdrop-blur-sm border-b border-border p-4 flex items-center gap-4 z-10">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h2 className="text-xl">Safety Center</h2>
          <p className="text-xs text-muted-foreground">Your safety is our priority</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        <Tabs defaultValue="panic" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="panic">Panic</TabsTrigger>
            <TabsTrigger value="checkin">Check-in</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
          </TabsList>

          <TabsContent value="panic" className="space-y-6 mt-6">
            <div className="bg-destructive/10 border border-destructive rounded-lg p-6 space-y-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-1" />
                <div className="space-y-2">
                  <h3 className="text-lg">Panic Button</h3>
                  <p className="text-sm text-muted-foreground">
                    In case of emergency, this will immediately clear your app session and redirect to Google.
                    This helps protect your privacy in uncomfortable situations.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-card rounded-lg">
                <div>
                  <Label htmlFor="panic-switch">Enable Quick Access</Label>
                  <p className="text-xs text-muted-foreground">Show panic button on all screens</p>
                </div>
                <Switch
                  id="panic-switch"
                  checked={panicEnabled}
                  onCheckedChange={setPanicEnabled}
                />
              </div>

              <Button
                onClick={handlePanicButton}
                className="w-full bg-destructive hover:bg-destructive/90"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Activate Panic Button
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="checkin" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Clock className="w-6 h-6 text-primary flex-shrink-0 mt-1" />
                <div className="space-y-2">
                  <h3 className="text-lg">Hookup Check-in Timer</h3>
                  <p className="text-sm text-muted-foreground">
                    Start a timer before meeting someone. If you don't check in by the time it expires,
                    your emergency contacts will be notified.
                  </p>
                </div>
              </div>

              {!checkInActive ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Check-in Duration (minutes)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={checkInMinutes}
                      onChange={(e) => setCheckInMinutes(Number(e.target.value))}
                      className="bg-input-background"
                    />
                  </div>

                  <Button
                    onClick={startCheckIn}
                    className="w-full"
                    style={{
                      background: 'var(--cruush-gradient)',
                    }}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Start Check-in Timer
                  </Button>
                </>
              ) : (
                <div className="bg-card border border-border rounded-lg p-6 space-y-4">
                  <div className="text-center space-y-2">
                    <div className="text-4xl" style={{ fontFamily: 'Cormorant Garamond, serif' }}>
                      {checkInMinutes}:00
                    </div>
                    <p className="text-sm text-muted-foreground">Time remaining</p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={stopCheckIn}>
                      Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={stopCheckIn}
                      style={{
                        background: 'var(--cruush-gradient)',
                      }}
                    >
                      I'm Safe
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="contacts" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <CruushIcon name="profile" className="mt-1 h-6 w-6 flex-shrink-0" variant="colored" />
                <div className="space-y-2">
                  <h3 className="text-lg">Emergency Contacts</h3>
                  <p className="text-sm text-muted-foreground">
                    Add trusted contacts who will be notified if you miss a check-in.
                  </p>
                </div>
              </div>

              {emergencyContacts.map((contact, index) => (
                <div key={index} className="bg-card border border-border rounded-lg p-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`name-${index}`}>Name</Label>
                    <Input
                      id={`name-${index}`}
                      value={contact.name}
                      onChange={(e) => {
                        const newContacts = [...emergencyContacts];
                        newContacts[index].name = e.target.value;
                        setEmergencyContacts(newContacts);
                      }}
                      placeholder="Contact name"
                      className="bg-input-background"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`phone-${index}`}>Phone</Label>
                    <div className="flex gap-2">
                      <Phone className="w-5 h-5 text-muted-foreground mt-2" />
                      <Input
                        id={`phone-${index}`}
                        type="tel"
                        value={contact.phone}
                        onChange={(e) => {
                          const newContacts = [...emergencyContacts];
                          newContacts[index].phone = e.target.value;
                          setEmergencyContacts(newContacts);
                        }}
                        placeholder="+1 (555) 123-4567"
                        className="bg-input-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`email-${index}`}>Email</Label>
                    <div className="flex gap-2">
                      <CruushIcon name="notifications" className="mt-2 h-5 w-5 opacity-65" />
                      <Input
                        id={`email-${index}`}
                        type="email"
                        value={contact.email}
                        onChange={(e) => {
                          const newContacts = [...emergencyContacts];
                          newContacts[index].email = e.target.value;
                          setEmergencyContacts(newContacts);
                        }}
                        placeholder="contact@example.com"
                        className="bg-input-background"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setEmergencyContacts([...emergencyContacts, { name: '', phone: '', email: '' }])}
              >
                Add Contact
              </Button>

              <Button
                className="w-full"
                style={{
                  background: 'var(--cruush-gradient)',
                }}
              >
                Save Contacts
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
