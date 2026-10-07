import styled from "styled-components";
import { useTranslation } from "react-i18next";

const ENERGIES: Record<number, { name: string; icon: string }> = {
  1: { name: "Grass", icon: "/energy/grass.webp" },
  2: { name: "Fire", icon: "/energy/fire.webp" },
  3: { name: "Water", icon: "/energy/water.webp" },
  4: { name: "Lightning", icon: "/energy/lightning.webp" },
  5: { name: "Psychic", icon: "/energy/psychic.webp" },
  6: { name: "Fighting", icon: "/energy/fighting.webp" },
  7: { name: "Darkness", icon: "/energy/dark.webp" },
  8: { name: "Metal", icon: "/energy/steel.webp" },
};

const List = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1.4rem;
  list-style: none;
  font-size: 1.8rem;
  font-weight: 600;
`;

const Item = styled.li`
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
`;

const Icon = styled.img`
  width: 2.2rem;
  height: 2.2rem;
  object-fit: contain;
`;

const EnergyList = ({ energyIds }: { energyIds: number[] }) => {
  const { t } = useTranslation();
  const energies = [...new Set(energyIds)]
    .map((id) => ENERGIES[id])
    .filter((energy): energy is { name: string; icon: string } => !!energy);

  return (
    <List>
      {energies.map((energy) => (
        <Item key={energy.name}>
          <Icon src={energy.icon} alt="" width={22} height={22} />
          {t(`energyDropdown.${energy.name}`)}
        </Item>
      ))}
    </List>
  );
};

export default EnergyList;
