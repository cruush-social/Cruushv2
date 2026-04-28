export type ConversationThread = {
  id: string;
  kind: 'dm' | 'group';
  user: {
    id: string;
    name: string;
    pronouns: string;
    photo: string | null;
  };
  distance: string;
  updatedAt: string;
  lastMessage: string;
  unreadCount: number;
  pinned: boolean;
  muted?: boolean;
  mutual?: boolean;
  membersLabel?: string;
  tags: string[];
};

export type ChatMessageRecord = {
  id: string;
  author: 'self' | 'other' | 'system';
  content: string;
  timestamp: string;
};

function minutesAgo(value: number) {
  return new Date(Date.now() - value * 60 * 1000).toISOString();
}

function hoursAgo(value: number) {
  return new Date(Date.now() - value * 60 * 60 * 1000).toISOString();
}

export const fallbackConversations: ConversationThread[] = [
  {
    id: 'conv-alex',
    kind: 'dm',
    user: {
      id: '1f1b46bf-67ae-466f-b37f-6f5cb2bb2c11',
      name: 'Alex',
      pronouns: 'they/them',
      photo: null,
    },
    distance: '0.3 mi',
    updatedAt: minutesAgo(8),
    lastMessage: 'hosting for another hour if you still want to swing by',
    unreadCount: 2,
    pinned: true,
    mutual: true,
    tags: ['Hosting', 'Now'],
  },
  {
    id: 'conv-river',
    kind: 'dm',
    user: {
      id: 'f4b5afee-2dcb-4b0d-85f0-cd83afb8ec71',
      name: 'River',
      pronouns: 'she/they',
      photo: null,
    },
    distance: '0.7 mi',
    updatedAt: minutesAgo(32),
    lastMessage: 'works for me. send cross streets when you are close.',
    unreadCount: 0,
    pinned: true,
    mutual: true,
    tags: ['Travel', 'Verified'],
  },
  {
    id: 'conv-warehouse',
    kind: 'group',
    user: {
      id: '5a0d9c5d-1544-4e6f-a4e4-6bf0e77f500a',
      name: 'Warehouse afters',
      pronouns: '',
      photo: null,
    },
    distance: '1.1 mi',
    updatedAt: minutesAgo(12),
    lastMessage: 'door code will drop once everyone confirms',
    unreadCount: 3,
    pinned: false,
    membersLabel: '4 people',
    tags: ['Invite only', 'Group'],
  },
  {
    id: 'conv-jordan',
    kind: 'dm',
    user: {
      id: '0b70c935-0841-4b2a-bd14-59cad53f6fec',
      name: 'Jordan',
      pronouns: 'he/they',
      photo: null,
    },
    distance: '0.5 mi',
    updatedAt: hoursAgo(3),
    lastMessage: 'let’s keep it chill tonight. maybe just a drink and a walk first.',
    unreadCount: 0,
    pinned: false,
    muted: true,
    tags: ['Low key'],
  },
];

export const fallbackMessagesByConversationId: Record<string, ChatMessageRecord[]> = {
  'conv-alex': [
    {
      id: 'conv-alex-1',
      author: 'system',
      content: 'It’s mutual. You and Alex have a cruush on each other.',
      timestamp: hoursAgo(6),
    },
    {
      id: 'conv-alex-2',
      author: 'other',
      content: 'you around bed-stuy tonight?',
      timestamp: minutesAgo(48),
    },
    {
      id: 'conv-alex-3',
      author: 'self',
      content: 'yeah. nearby now. what are you into tonight?',
      timestamp: minutesAgo(44),
    },
    {
      id: 'conv-alex-4',
      author: 'other',
      content: 'mostly oral and making out. hosting if the vibe is right.',
      timestamp: minutesAgo(10),
    },
    {
      id: 'conv-alex-5',
      author: 'other',
      content: 'hosting for another hour if you still want to swing by',
      timestamp: minutesAgo(8),
    },
  ],
  'conv-river': [
    {
      id: 'conv-river-1',
      author: 'other',
      content: 'i can travel. are you closer to the station or deeper in?',
      timestamp: hoursAgo(5),
    },
    {
      id: 'conv-river-2',
      author: 'self',
      content: 'closer to the station. i’ll send cross streets when i head out.',
      timestamp: hoursAgo(4),
    },
    {
      id: 'conv-river-3',
      author: 'other',
      content: 'works for me. send cross streets when you are close.',
      timestamp: minutesAgo(32),
    },
  ],
  'conv-warehouse': [
    {
      id: 'conv-warehouse-1',
      author: 'system',
      content: 'Invite-only planning chat. Screenshots are discouraged.',
      timestamp: hoursAgo(9),
    },
    {
      id: 'conv-warehouse-2',
      author: 'other',
      content: 'roll call: who is still in for afters?',
      timestamp: minutesAgo(35),
    },
    {
      id: 'conv-warehouse-3',
      author: 'self',
      content: 'i’m still in. can host for pregame but not after.',
      timestamp: minutesAgo(27),
    },
    {
      id: 'conv-warehouse-4',
      author: 'other',
      content: 'door code will drop once everyone confirms',
      timestamp: minutesAgo(12),
    },
  ],
  'conv-jordan': [
    {
      id: 'conv-jordan-1',
      author: 'other',
      content: 'you seem cute. i am not rushing tonight though.',
      timestamp: hoursAgo(6),
    },
    {
      id: 'conv-jordan-2',
      author: 'self',
      content: 'that works. what kind of vibe are you looking for?',
      timestamp: hoursAgo(5),
    },
    {
      id: 'conv-jordan-3',
      author: 'other',
      content: 'let’s keep it chill tonight. maybe just a drink and a walk first.',
      timestamp: hoursAgo(3),
    },
  ],
};
