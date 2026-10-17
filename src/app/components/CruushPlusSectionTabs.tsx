import { useNavigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import CruushPlusWord from './CruushPlusWord';

export default function CruushPlusSectionTabs({ active }: { active: 'checkout' | 'rewards' }) {
  const navigate = useNavigate();

  return (
    <Tabs
      aria-label="cruush+"
      className={active === 'rewards' ? 'relative -top-2 w-full' : 'w-full'}
      value={active}
      onValueChange={(value) => navigate(value === 'rewards' ? '/rewards' : '/store')}
    >
      <TabsList className="!h-9 min-h-9 max-h-9 grid w-full grid-cols-2">
        <TabsTrigger className="!h-[26px] min-h-[26px] max-h-[26px]" value="checkout"><CruushPlusWord /></TabsTrigger>
        <TabsTrigger className="!h-[26px] min-h-[26px] max-h-[26px]" value="rewards">Rewards</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
