import { useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

export default function CruushPlusSectionTabs({ active }: { active: 'checkout' | 'rewards' }) {
  const navigate = useNavigate();

  return (
    <Tabs
      aria-label="cruush+"
      value={active}
      onValueChange={(value) => navigate(value === 'rewards' ? '/rewards' : '/store')}
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="checkout">Checkout</TabsTrigger>
        <TabsTrigger value="rewards">Rewards</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
